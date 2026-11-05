//! Orquestração do render: um passe de sombra, um passe PBR e leitura RGBA8.

use std::mem::size_of;
use std::time::Instant;

use render_core::cena::Cena;

use crate::constantes::{CEU_PADRAO, FORMATO_COR, FORMATO_PROFUNDIDADE, LADO_SOMBRA};
use crate::cor;
use crate::erro::ErroRender;
use crate::geometria::{expandir, Vertice};
use crate::gpu;
use crate::iluminacao::{matriz_da_luz, montar_uniformes};
use crate::leitura::ler_textura;
use crate::matrizes::colunas_f32;
use crate::pipeline::{criar_recursos, criar_textura, validar_limite_textura};

/// Imagem pronta em memória, no espaço sRGB (o mesmo que o PNG espera).
pub struct ImagemRenderizada {
    pub largura: u32,
    pub altura: u32,
    pub rgba: Vec<u8>,
    pub backend: String,
    pub adaptador: String,
    pub tipo_adaptador: String,
    pub vertices: usize,
    pub duracao_ms: u128,
}

fn view_padrao(textura: &wgpu::Texture) -> wgpu::TextureView {
    textura.create_view(&wgpu::TextureViewDescriptor::default())
}

/// Renderiza a cena inteira com a exposição padrão (1.0).
pub fn renderizar(cena: &Cena, largura: u32, altura: u32) -> Result<ImagemRenderizada, ErroRender> {
    renderizar_com_exposicao(cena, largura, altura, 1.0)
}

/// Renderiza a cena inteira e devolve os pixels já tonemapeados em sRGB.
/// `exposicao` é o multiplicador aplicado antes do ACES (2^EV no chamador).
pub fn renderizar_com_exposicao(
    cena: &Cena,
    largura: u32,
    altura: u32,
    exposicao: f64,
) -> Result<ImagemRenderizada, ErroRender> {
    renderizar_com_camera(cena, &cena.camera, largura, altura, exposicao)
}

/// Renderiza usando uma câmera explícita (cada frame de vídeo), sem clonar a cena.
pub fn renderizar_com_camera(
    cena: &Cena,
    camera: &render_core::camera::Camera,
    largura: u32,
    altura: u32,
    exposicao: f64,
) -> Result<ImagemRenderizada, ErroRender> {
    let inicio = Instant::now();
    if largura == 0 || altura == 0 || largura > 16_384 || altura > 16_384 {
        return Err(ErroRender::Argumentos(format!(
            "resolução {largura}x{altura} fora da faixa 1..=16384"
        )));
    }

    let malha = expandir(cena)?;
    let tamanho_vertices = malha.vertices.len() as u64 * size_of::<Vertice>() as u64;
    let gpu = gpu::iniciar()?;
    validar_limite_textura(&gpu, largura, altura)?;
    if tamanho_vertices > gpu.device.limits().max_buffer_size {
        return Err(ErroRender::Gpu(format!(
            "vertex buffer de {} MiB excede o limite de {} MiB da GPU; reduza a cena",
            tamanho_vertices / (1024 * 1024),
            gpu.device.limits().max_buffer_size / (1024 * 1024)
        )));
    }

    let raio = malha.caixa.raio();
    let luz_vp = matriz_da_luz(cena, malha.caixa.centro(), raio)?;
    let mut uniformes = montar_uniformes(cena, camera, largura, altura, raio, exposicao);
    uniformes.luz_vp = colunas_f32(&luz_vp);

    // Um único mapa de sombra: anexo do passe de sombra e textura do passe principal.
    let sombra = criar_textura(
        &gpu.device,
        "mapa de sombra",
        LADO_SOMBRA,
        LADO_SOMBRA,
        FORMATO_PROFUNDIDADE,
        wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
    );
    let sombra_view = view_padrao(&sombra);

    let recursos = criar_recursos(
        &gpu,
        cena,
        camera,
        &malha.vertices,
        largura,
        altura,
        raio,
        exposicao,
        &sombra_view,
    )?;
    gpu.queue
        .write_buffer(&recursos.uniformes, 0, bytemuck::bytes_of(&uniformes));

    let cor_textura = criar_textura(
        &gpu.device,
        "cor final",
        largura,
        altura,
        FORMATO_COR,
        wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
    );
    let cor_view = view_padrao(&cor_textura);
    let profundidade = criar_textura(
        &gpu.device,
        "profundidade principal",
        largura,
        altura,
        FORMATO_PROFUNDIDADE,
        wgpu::TextureUsages::RENDER_ATTACHMENT,
    );
    let profundidade_view = view_padrao(&profundidade);

    let mut codificador = gpu
        .device
        .create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("passe de sombra e principal"),
        });

    {
        let mut passe = codificador.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("passe de sombra"),
            color_attachments: &[],
            depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                view: &sombra_view,
                depth_ops: Some(wgpu::Operations {
                    load: wgpu::LoadOp::Clear(1.0),
                    store: wgpu::StoreOp::Store,
                }),
                stencil_ops: None,
            }),
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        passe.set_pipeline(&recursos.pipeline_sombra);
        passe.set_bind_group(0, &recursos.grupo_sombra, &[]);
        passe.set_vertex_buffer(0, recursos.vertex_buffer.slice(..));
        passe.draw(0..recursos.n_vertices, 0..1);
    }

    let fundo = cor::fundo_tonemapeado(cena.fundo.unwrap_or(CEU_PADRAO), exposicao);
    let limpeza = wgpu::Color {
        r: fundo[0],
        g: fundo[1],
        b: fundo[2],
        a: 1.0,
    };

    {
        let mut passe = codificador.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("passe principal"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: &cor_view,
                depth_slice: None,
                resolve_target: None,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Clear(limpeza),
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                view: &profundidade_view,
                depth_ops: Some(wgpu::Operations {
                    load: wgpu::LoadOp::Clear(1.0),
                    store: wgpu::StoreOp::Store,
                }),
                stencil_ops: None,
            }),
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        passe.set_pipeline(&recursos.pipeline_principal);
        passe.set_bind_group(0, &recursos.grupo_principal, &[]);
        passe.set_vertex_buffer(0, recursos.vertex_buffer.slice(..));
        passe.draw(0..recursos.n_vertices, 0..1);
    }

    gpu.queue.submit(Some(codificador.finish()));
    let rgba = ler_textura(&gpu, &cor_textura, largura, altura)?;

    Ok(ImagemRenderizada {
        largura,
        altura,
        rgba,
        backend: format!("{:?}", gpu.backend),
        adaptador: gpu.adaptador,
        tipo_adaptador: format!("{:?}", gpu.tipo),
        vertices: malha.vertices.len(),
        duracao_ms: inicio.elapsed().as_millis(),
    })
}
