//! Motor de renderização: um dispositivo wgpu, pipelines fixas e cenas carregadas.
//!
//! Fluxo: `Motor::nativo()` uma vez por processo, `carregar_cena` uma vez por cena e
//! `renderizar_regiao` por tile ou frame. As pipelines são criadas no construtor e nunca dentro
//! de um passe. A projeção usa a imagem inteira; o viewport desloca a origem para a região, então
//! cada tile é um recorte exato da imagem inteira, sem costura.

use std::mem::size_of;

use render_core::cena::{Cena, Textura};
use wgpu::util::DeviceExt;

use crate::ceu;
use crate::constantes::{
    ANISOTROPIA_TEXTURAS, CEU_PADRAO, FORMATO_COR, FORMATO_NORMAIS, FORMATO_OCLUSAO,
    FORMATO_PROFUNDIDADE, FORMATO_TEXTURA_MATERIAL, FRACAO_REFRACAO, LADO_SOMBRA, MARGEM_AO_PX,
    MARGEM_DESFOQUE_PX, TEXTURAS_POR_CENA,
};
use crate::cor;
use crate::erro::ErroRender;
use crate::geometria::{expandir as expandir_malha, Vertice};
use crate::gpu::{self, Gpu};
use crate::iluminacao::{aplicar_camera, matriz_da_luz, uniformes_fixos};
use crate::leitura::ler_textura;
use crate::matrizes::colunas_f32;
use crate::pipeline::{
    criar_layouts, criar_pipelines, criar_textura, criar_vertex_buffer, validar_limite_textura,
    Layouts, Pipelines,
};
use crate::ssao::{camera_extra, expandir, CameraExtra};
use crate::uniformes::Uniformes;

/// Maior lado aceito para a imagem final (o mesmo limite do CLI).
const LADO_MAXIMO: u32 = 16_384;

/// Retângulo em pixels da imagem final (origem no canto superior esquerdo).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Retangulo {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

/// Dados do adaptador usados por `Motor::com_device`.
#[derive(Clone, Debug)]
pub struct InfoAdaptador {
    pub backend: wgpu::Backend,
    pub nome: String,
    pub tipo: wgpu::DeviceType,
}

/// Dispositivo, pipelines e layouts. Criado uma vez e reusado por todas as cenas e regiões.
pub struct Motor {
    gpu: Gpu,
    layouts: Layouts,
    pipelines: Pipelines,
    comparador: wgpu::Sampler,
    /// Sampler das texturas de material (grupo 1, binding 0): mip linear e anisotropia 8 quando o
    /// adaptador aceita, senão 1.
    amostrador_textura: wgpu::Sampler,
    /// Textura 1x1 branca nos slots que a cena não usa (todos os bindings do grupo 1 precisam existir).
    textura_vazia: wgpu::Texture,
    /// Amostras por pixel do passe principal: 1 (sem MSAA) ou 4 (MSAA x4, com resolve).
    amostras: u32,
}

/// Cena já enviada à GPU: malha, uniformes fixos, mapa de sombra e texturas de material.
pub struct CenaGpu {
    vertex_buffer: wgpu::Buffer,
    /// Vértices totais (opacos e vidro). Pré-passe e sombra desenham todos.
    n_vertices: u32,
    /// Vértices opacos no início do buffer: o passe principal desenha `0..opacos`, e o passe de
    /// vidro desenha `opacos..n_vertices`.
    opacos: u32,
    vertices: usize,
    raio: f64,
    fundo: [f64; 3],
    fixos: Uniformes,
    /// Irradiância SH9 do céu (buffer separado de `Uniformes`, binding 3 do passe principal).
    sh_ceu: wgpu::Buffer,
    _sombra: wgpu::Texture,
    sombra_view: wgpu::TextureView,
    /// Texturas de material da cena (mantidas vivas enquanto o grupo 1 existir).
    _texturas: Vec<wgpu::Texture>,
    /// Grupo 1 do passe principal: sampler e uma textura por slot (ver pipeline.rs).
    grupo_texturas: wgpu::BindGroup,
}

/// Envia uma textura de material à GPU com todos os seus níveis de mip (um `write_texture` por
/// nível, sem padding: o `bytes_per_row` é a largura do nível vezes 4).
fn criar_textura_material(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    textura: &Textura,
) -> wgpu::Texture {
    let textura_gpu = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("textura de material"),
        size: wgpu::Extent3d {
            width: textura.largura,
            height: textura.altura,
            depth_or_array_layers: 1,
        },
        mip_level_count: textura.niveis.len() as u32,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: FORMATO_TEXTURA_MATERIAL,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    for (nivel, pixels) in textura.niveis.iter().enumerate() {
        let (largura, altura) =
            Textura::dimensoes_do_nivel(textura.largura, textura.altura, nivel as u32);
        queue.write_texture(
            wgpu::TexelCopyTextureInfo {
                texture: &textura_gpu,
                mip_level: nivel as u32,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            pixels,
            wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(largura * 4),
                rows_per_image: Some(altura),
            },
            wgpu::Extent3d {
                width: largura,
                height: altura,
                depth_or_array_layers: 1,
            },
        );
    }
    textura_gpu
}

impl CenaGpu {
    /// Quantidade de vértices da malha expandida.
    pub fn vertices(&self) -> usize {
        self.vertices
    }
}

/// Valida o tamanho da imagem final (mesma regra do CLI).
pub(crate) fn validar_imagem(largura: u32, altura: u32) -> Result<(), ErroRender> {
    if largura == 0 || altura == 0 || largura > LADO_MAXIMO || altura > LADO_MAXIMO {
        return Err(ErroRender::Argumentos(format!(
            "resolução {largura}x{altura} fora da faixa 1..=16384"
        )));
    }
    Ok(())
}

/// Aceita só 1 (sem MSAA) ou 4 (MSAA x4). Outros valores são erro de argumento.
pub(crate) fn validar_amostras(amostras: u32) -> Result<(), ErroRender> {
    if amostras != 1 && amostras != 4 {
        return Err(ErroRender::Argumentos(format!(
            "amostras {amostras} não suportadas; use 1 (sem MSAA) ou 4 (MSAA x4)"
        )));
    }
    Ok(())
}

fn validar_regiao(largura: u32, altura: u32, regiao: Retangulo) -> Result<(), ErroRender> {
    validar_imagem(largura, altura)?;
    if regiao.w == 0 || regiao.h == 0 {
        return Err(ErroRender::Argumentos(format!(
            "região {regiao:?} tem dimensão zero"
        )));
    }
    let cabe_x = regiao.x.checked_add(regiao.w).is_some_and(|fim| fim <= largura);
    let cabe_y = regiao.y.checked_add(regiao.h).is_some_and(|fim| fim <= altura);
    if !cabe_x || !cabe_y {
        return Err(ErroRender::Argumentos(format!(
            "região {regiao:?} fora dos limites da imagem {largura}x{altura}"
        )));
    }
    Ok(())
}

/// Margem, em pixels, da janela do passe opaco quando a cena tem vidro. A normal de visão tem
/// módulo 1, então a refração desloca no máximo `FRACAO_REFRACAO * altura` pixels; a cópia de tela
/// precisa desses pixels para o resultado de um tile igualar o da imagem inteira.
fn margem_refracao_px(altura: u32) -> u32 {
    (FRACAO_REFRACAO * f64::from(altura)).ceil() as u32 + 1
}

/// Buffer uniforme com o `CameraExtra` de um passe de oclusão.
fn criar_buffer_extra(device: &wgpu::Device, rotulo: &str, extra: &CameraExtra) -> wgpu::Buffer {
    device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some(rotulo),
        contents: bytemuck::bytes_of(extra),
        usage: wgpu::BufferUsages::UNIFORM,
    })
}

impl Motor {
    /// Cria o dispositivo wgpu nativo (DX12/Vulkan/Metal). Sem fallback de CPU.
    pub fn nativo() -> Result<Motor, ErroRender> {
        Self::nativo_com_amostras(4)
    }

    /// Cria o dispositivo nativo com `amostras` por pixel no passe principal: 1 (sem MSAA) ou 4
    /// (MSAA x4 com resolve). Outros valores são `Argumentos`. Se o adaptador não suportar 4
    /// amostras para a cor e a profundidade, devolve `Gpu` (sem fallback silencioso).
    pub fn nativo_com_amostras(amostras: u32) -> Result<Motor, ErroRender> {
        validar_amostras(amostras)?;
        let gpu = gpu::iniciar()?;
        if amostras == 4 && !gpu.suporta_msaa4 {
            return Err(ErroRender::Gpu(format!(
                "o adaptador '{}' ({:?}) não suporta MSAA x4 para a cor e a profundidade; \
                 use Motor::nativo_com_amostras(1) explicitamente",
                gpu.adaptador, gpu.backend
            )));
        }
        Ok(Self::montar(gpu, amostras))
    }

    /// Amostras por pixel do passe principal (1 ou 4).
    pub fn amostras(&self) -> u32 {
        self.amostras
    }

    /// Usa um dispositivo já existente (navegador/WebGPU, fase posterior).
    pub fn com_device(device: wgpu::Device, queue: wgpu::Queue, info: InfoAdaptador) -> Motor {
        // Sem consulta ao adaptador: o caminho externo fica com 1 amostra, como antes do MSAA.
        Self::montar(
            Gpu {
                device,
                queue,
                backend: info.backend,
                adaptador: info.nome,
                tipo: info.tipo,
                suporta_msaa4: false,
                // Sem consulta ao adaptador: o WebGPU exige cópia e leitura para rgba8unorm.
                suporta_copia_tela: true,
                // Sem consulta ao adaptador: anisotropia 1, como o caminho sem suporte.
                suporta_anisotropia: false,
            },
            1,
        )
    }

    fn montar(gpu: Gpu, amostras: u32) -> Motor {
        let layouts = criar_layouts(&gpu.device);
        let pipelines = criar_pipelines(&gpu, &layouts, amostras);
        let comparador = gpu.device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("comparador do mapa de sombra"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Nearest,
            compare: Some(wgpu::CompareFunction::LessEqual),
            ..Default::default()
        });
        // Anisotropia só com o suporte do adaptador: sem ele o sampler fica com 1 (sem erro).
        let amostrador_textura = gpu.device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("amostrador das texturas de material"),
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::Repeat,
            address_mode_w: wgpu::AddressMode::Repeat,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            anisotropy_clamp: if gpu.suporta_anisotropia {
                ANISOTROPIA_TEXTURAS
            } else {
                1
            },
            ..Default::default()
        });
        let textura_vazia = criar_textura_material(
            &gpu.device,
            &gpu.queue,
            &Textura {
                largura: 1,
                altura: 1,
                niveis: vec![vec![255, 255, 255, 255]],
            },
        );
        Motor {
            gpu,
            layouts,
            pipelines,
            comparador,
            amostrador_textura,
            textura_vazia,
            amostras,
        }
    }

    /// Backend escolhido (DX12, Vulkan, Metal...).
    pub fn backend(&self) -> wgpu::Backend {
        self.gpu.backend
    }

    /// Nome do adaptador.
    pub fn adaptador(&self) -> &str {
        &self.gpu.adaptador
    }

    /// Tipo do adaptador (discreto, integrado, CPU...).
    pub fn tipo(&self) -> wgpu::DeviceType {
        self.gpu.tipo
    }

    /// Envia a malha da cena à GPU e gera o mapa de sombra, uma vez. Reuse o `CenaGpu`.
    pub fn carregar_cena(&self, cena: &Cena) -> Result<CenaGpu, ErroRender> {
        // Limite explícito antes de qualquer alocação: o grupo 1 tem TEXTURAS_POR_CENA slots.
        if cena.texturas.len() > TEXTURAS_POR_CENA {
            return Err(ErroRender::Gpu(format!(
                "cena com {} texturas; o limite desta etapa é {TEXTURAS_POR_CENA} por cena",
                cena.texturas.len()
            )));
        }
        let limite_lado = self.gpu.device.limits().max_texture_dimension_2d;
        if cena
            .texturas
            .iter()
            .any(|t| t.largura.max(t.altura) > limite_lado)
        {
            return Err(ErroRender::Gpu(format!(
                "textura de material maior que o limite de {limite_lado} texels da GPU"
            )));
        }
        let malha = expandir_malha(cena)?;
        let device = &self.gpu.device;
        let tamanho_vertices = malha.vertices.len() as u64 * size_of::<Vertice>() as u64;
        if tamanho_vertices > device.limits().max_buffer_size {
            return Err(ErroRender::Gpu(format!(
                "vertex buffer de {} MiB excede o limite de {} MiB da GPU; reduza a cena",
                tamanho_vertices / (1024 * 1024),
                device.limits().max_buffer_size / (1024 * 1024)
            )));
        }

        let raio = malha.caixa.raio();
        let luz_vp = matriz_da_luz(cena, malha.caixa.centro(), raio)?;
        let mut fixos = uniformes_fixos(cena);
        fixos.luz_vp = colunas_f32(&luz_vp);

        // Irradiância do céu analítico, uma vez por cena. Usa o mesmo Sol que os uniformes.
        let sol_dir = [fixos.sol[0], fixos.sol[1], fixos.sol[2]];
        let sh = ceu::sh9_irradiancia(sol_dir, fixos.sol[3], fixos.sol[3] > 0.0);
        let sh_ceu = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("harmônicos do céu"),
            contents: bytemuck::bytes_of(&ceu::para_buffer(&sh)),
            usage: wgpu::BufferUsages::UNIFORM,
        });

        let vertex_buffer = criar_vertex_buffer(device, &malha.vertices);
        let opacos = malha.opacos as u32;
        // O mapa de sombra depende só da luz (da cena), não da câmera: gerado uma vez aqui.
        let buffer_sombra = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("uniformes da sombra"),
            contents: bytemuck::bytes_of(&fixos),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        let sombra = criar_textura(
            device,
            "mapa de sombra",
            LADO_SOMBRA,
            LADO_SOMBRA,
            FORMATO_PROFUNDIDADE,
            wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING,
            1,
        );
        let sombra_view = sombra.create_view(&wgpu::TextureViewDescriptor::default());
        let grupo_sombra = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("grupo da sombra"),
            layout: &self.layouts.uniforme,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: buffer_sombra.as_entire_binding(),
            }],
        });

        let mut codificador = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("passe de sombra da cena"),
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
            passe.set_pipeline(&self.pipelines.sombra);
            passe.set_bind_group(0, &grupo_sombra, &[]);
            passe.set_vertex_buffer(0, vertex_buffer.slice(..));
            passe.draw(0..malha.vertices.len() as u32, 0..1);
        }
        self.gpu.queue.submit(Some(codificador.finish()));

        // Texturas de material: uma `wgpu::Texture` por textura da cena, e o grupo 1 com o sampler
        // e um slot por binding. Slot sem textura recebe a 1x1 branca.
        let texturas: Vec<wgpu::Texture> = cena
            .texturas
            .iter()
            .map(|textura| criar_textura_material(device, &self.gpu.queue, textura))
            .collect();
        let vistas: Vec<wgpu::TextureView> = texturas
            .iter()
            .map(|textura| textura.create_view(&wgpu::TextureViewDescriptor::default()))
            .collect();
        let vista_vazia = self
            .textura_vazia
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut entradas = vec![wgpu::BindGroupEntry {
            binding: 0,
            resource: wgpu::BindingResource::Sampler(&self.amostrador_textura),
        }];
        for slot in 0..TEXTURAS_POR_CENA {
            entradas.push(wgpu::BindGroupEntry {
                binding: 1 + slot as u32,
                resource: wgpu::BindingResource::TextureView(vistas.get(slot).unwrap_or(&vista_vazia)),
            });
        }
        let grupo_texturas = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("texturas de material"),
            layout: &self.layouts.texturas,
            entries: &entradas,
        });

        Ok(CenaGpu {
            vertex_buffer,
            n_vertices: malha.vertices.len() as u32,
            opacos,
            vertices: malha.vertices.len(),
            raio,
            fundo: cena.fundo.unwrap_or(CEU_PADRAO),
            fixos,
            sh_ceu,
            _sombra: sombra,
            sombra_view,
            _texturas: texturas,
            grupo_texturas,
        })
    }

    /// Registra no codificador os passes de oclusão ambiente (SSAO) da região: pré-passe de
    /// normais e profundidade, SSAO e desfoque bilateral. Devolve a textura R8 de oclusão, com o
    /// tamanho da região (1 = sem oclusão). Os passes usam a janela da região com margem, e o
    /// alcance das amostras é limitado por ela (ver ssao.rs), para o resultado não depender do tile.
    fn registrar_oclusao(
        &self,
        codificador: &mut wgpu::CommandEncoder,
        cena: &CenaGpu,
        camera: &render_core::camera::Camera,
        buffer_uniformes: &wgpu::Buffer,
        (largura, altura): (u32, u32),
        regiao: Retangulo,
    ) -> Result<wgpu::TextureView, ErroRender> {
        let device = &self.gpu.device;
        let janela_g = expandir(regiao, MARGEM_AO_PX + MARGEM_DESFOQUE_PX, largura, altura);
        let janela_ao = expandir(regiao, MARGEM_DESFOQUE_PX, largura, altura);
        let uso_leitura = wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::TEXTURE_BINDING;

        let normais = criar_textura(
            device,
            "normais e profundidade",
            janela_g.w,
            janela_g.h,
            FORMATO_NORMAIS,
            uso_leitura,
            1,
        );
        let normais_view = normais.create_view(&wgpu::TextureViewDescriptor::default());
        let profundidade_pre = criar_textura(
            device,
            "profundidade do pré-passe",
            janela_g.w,
            janela_g.h,
            FORMATO_PROFUNDIDADE,
            wgpu::TextureUsages::RENDER_ATTACHMENT,
            1,
        );
        let profundidade_pre_view =
            profundidade_pre.create_view(&wgpu::TextureViewDescriptor::default());
        let bruta = criar_textura(
            device,
            "oclusão bruta",
            janela_ao.w,
            janela_ao.h,
            FORMATO_OCLUSAO,
            uso_leitura,
            1,
        );
        let bruta_view = bruta.create_view(&wgpu::TextureViewDescriptor::default());
        let ao = criar_textura(
            device,
            "oclusão da região",
            regiao.w,
            regiao.h,
            FORMATO_OCLUSAO,
            uso_leitura,
            1,
        );
        let ao_view = ao.create_view(&wgpu::TextureViewDescriptor::default());

        // Um uniforme extra por passe, porque a janela de cada um é diferente. Não está em
        // `Uniformes`, que continua com 240 bytes.
        let extra_pre = camera_extra(camera, largura, altura, janela_g, janela_g, janela_ao)?;
        let extra_ssao = camera_extra(camera, largura, altura, janela_ao, janela_g, janela_ao)?;
        let extra_desfoque = camera_extra(camera, largura, altura, regiao, janela_g, janela_ao)?;
        let buffer_pre = criar_buffer_extra(device, "câmera extra (pré-passe)", &extra_pre);
        let buffer_ssao = criar_buffer_extra(device, "câmera extra (SSAO)", &extra_ssao);
        let buffer_desfoque = criar_buffer_extra(device, "câmera extra (desfoque)", &extra_desfoque);

        let grupo_pre = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("grupo do pré-passe"),
            layout: &self.layouts.pre,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: buffer_uniformes.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 5,
                    resource: buffer_pre.as_entire_binding(),
                },
            ],
        });
        let grupo_ssao = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("grupo do SSAO"),
            layout: &self.layouts.ssao,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 5,
                    resource: buffer_ssao.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 6,
                    resource: wgpu::BindingResource::TextureView(&normais_view),
                },
            ],
        });
        let grupo_desfoque = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("grupo do desfoque"),
            layout: &self.layouts.desfoque,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 5,
                    resource: buffer_desfoque.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 6,
                    resource: wgpu::BindingResource::TextureView(&normais_view),
                },
                wgpu::BindGroupEntry {
                    binding: 7,
                    resource: wgpu::BindingResource::TextureView(&bruta_view),
                },
            ],
        });

        // Pré-passe: mesma geometria e viewport do principal, com 1 amostra e z-test próprio.
        {
            let mut passe = codificador.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("pré-passe de normais"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &normais_view,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &profundidade_pre_view,
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
            passe.set_viewport(
                -(janela_g.x as f32),
                -(janela_g.y as f32),
                largura as f32,
                altura as f32,
                0.0,
                1.0,
            );
            passe.set_pipeline(&self.pipelines.pre);
            passe.set_bind_group(0, &grupo_pre, &[]);
            passe.set_vertex_buffer(0, cena.vertex_buffer.slice(..));
            passe.draw(0..cena.n_vertices, 0..1);
        }
        // SSAO: triângulo de tela cheia sobre a janela com margem da oclusão bruta.
        {
            let mut passe = codificador.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("SSAO"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &bruta_view,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::WHITE),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            passe.set_viewport(
                -(janela_ao.x as f32),
                -(janela_ao.y as f32),
                largura as f32,
                altura as f32,
                0.0,
                1.0,
            );
            passe.set_pipeline(&self.pipelines.ssao);
            passe.set_bind_group(0, &grupo_ssao, &[]);
            passe.draw(0..3, 0..1);
        }
        // Desfoque: só a região (o pixel da região é o índice da textura final).
        {
            let mut passe = codificador.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("desfoque da oclusão"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &ao_view,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::WHITE),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            passe.set_viewport(
                -(regiao.x as f32),
                -(regiao.y as f32),
                largura as f32,
                altura as f32,
                0.0,
                1.0,
            );
            passe.set_pipeline(&self.pipelines.desfoque);
            passe.set_bind_group(0, &grupo_desfoque, &[]);
            passe.draw(0..3, 0..1);
        }
        Ok(ao_view)
    }

    /// Renderiza só `regiao` de uma imagem `largura x altura`. Devolve RGBA8 sRGB sem padding
    /// (`regiao.w * regiao.h * 4` bytes). A projeção é a da imagem inteira.
    pub fn renderizar_regiao(
        &self,
        cena: &CenaGpu,
        camera: &render_core::camera::Camera,
        largura: u32,
        altura: u32,
        regiao: Retangulo,
        exposicao: f64,
    ) -> Result<Vec<u8>, ErroRender> {
        validar_regiao(largura, altura, regiao)?;
        validar_limite_textura(&self.gpu, largura, altura, LADO_SOMBRA)?;
        let tem_vidro = cena.n_vertices > cena.opacos;
        if tem_vidro && !self.gpu.suporta_copia_tela {
            return Err(ErroRender::Gpu(format!(
                "o adaptador '{}' ({:?}) não aceita cópia e leitura de {FORMATO_COR:?}, \
                 necessárias para o vidro desta cena; não há fallback sem refração",
                self.gpu.adaptador, self.gpu.backend
            )));
        }

        let device = &self.gpu.device;
        let mut uniformes = cena.fixos;
        aplicar_camera(&mut uniformes, camera, largura, altura, cena.raio, exposicao);
        let buffer_uniformes = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("uniformes da região"),
            contents: bytemuck::bytes_of(&uniformes),
            usage: wgpu::BufferUsages::UNIFORM,
        });
        // Janela do passe opaco. Sem vidro é a própria região. Com vidro, é a região com a margem
        // da refração: a cópia de tela precisa dos pixels que a refração lê fora da região, senão o
        // resultado de um tile depende da borda dele (ver `margem_refracao_px`).
        let janela = if tem_vidro {
            expandir(regiao, margem_refracao_px(altura), largura, altura)
        } else {
            regiao
        };
        // Alvo final: o tamanho da região, com 1 amostra; é o que sai pela leitura. COPY_DST é
        // para o recorte da janela com vidro (o caminho sem vidro não o usa).
        let cor_textura = criar_textura(
            device,
            "cor da região",
            regiao.w,
            regiao.h,
            FORMATO_COR,
            wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::COPY_SRC
                | wgpu::TextureUsages::COPY_DST,
            1,
        );
        let cor_view = cor_textura.create_view(&wgpu::TextureViewDescriptor::default());
        // Com vidro, o opaco resolve numa textura da janela: é dela que sai a cópia de tela, e a
        // região final é recortada dali depois do passe de vidro. Sem vidro, resolve na final.
        let cor_janela = tem_vidro.then(|| {
            criar_textura(
                device,
                "cor opaca da janela",
                janela.w,
                janela.h,
                FORMATO_COR,
                wgpu::TextureUsages::RENDER_ATTACHMENT
                    | wgpu::TextureUsages::COPY_SRC
                    | wgpu::TextureUsages::TEXTURE_BINDING,
                1,
            )
        });
        let cor_janela_view = cor_janela
            .as_ref()
            .map(|textura| textura.create_view(&wgpu::TextureViewDescriptor::default()));
        let cor_resolvida = cor_janela_view.as_ref().unwrap_or(&cor_view);
        // Com MSAA, o passe desenha na cor multiamostra e o resolve grava a média em `cor_resolvida`.
        let cor_msaa = (self.amostras > 1).then(|| {
            criar_textura(
                device,
                "cor multiamostra da janela",
                janela.w,
                janela.h,
                FORMATO_COR,
                wgpu::TextureUsages::RENDER_ATTACHMENT,
                self.amostras,
            )
        });
        let cor_msaa_view = cor_msaa
            .as_ref()
            .map(|textura| textura.create_view(&wgpu::TextureViewDescriptor::default()));
        let profundidade = criar_textura(
            device,
            "profundidade da janela",
            janela.w,
            janela.h,
            FORMATO_PROFUNDIDADE,
            wgpu::TextureUsages::RENDER_ATTACHMENT,
            self.amostras,
        );
        let profundidade_view = profundidade.create_view(&wgpu::TextureViewDescriptor::default());
        // Sem MSAA: desenha direto na resolvida. Com MSAA: desenha na multiamostra e resolve nela.
        let (alvo_cor, resolve) = match &cor_msaa_view {
            Some(view) => (view, Some(cor_resolvida)),
            None => (cor_resolvida, None),
        };

        let fundo = cor::fundo_tonemapeado(cena.fundo, exposicao);
        let limpeza = wgpu::Color {
            r: fundo[0],
            g: fundo[1],
            b: fundo[2],
            a: 1.0,
        };

        let mut codificador = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("passe principal da região"),
        });
        // Oclusão ambiente (SSAO) da região, no mesmo codificador e antes do passe principal.
        let oclusao_view = self.registrar_oclusao(
            &mut codificador,
            cena,
            camera,
            &buffer_uniformes,
            (largura, altura),
            janela,
        )?;
        let grupo_principal = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("grupo principal"),
            layout: &self.layouts.principal,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: buffer_uniformes.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&cena.sombra_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::Sampler(&self.comparador),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: cena.sh_ceu.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 4,
                    resource: wgpu::BindingResource::TextureView(&oclusao_view),
                },
            ],
        });
        {
            let mut passe = codificador.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("passe principal"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: alvo_cor,
                    depth_slice: None,
                    resolve_target: resolve,
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
            // Viewport do tamanho da imagem inteira, deslocado para o canto da janela: a NDC é
            // a da imagem inteira e só os pixels dentro do alvo da janela são escritos.
            passe.set_viewport(
                -(janela.x as f32),
                -(janela.y as f32),
                largura as f32,
                altura as f32,
                0.0,
                1.0,
            );
            passe.set_pipeline(&self.pipelines.principal);
            passe.set_bind_group(0, &grupo_principal, &[]);
            passe.set_bind_group(1, &cena.grupo_texturas, &[]);
            passe.set_vertex_buffer(0, cena.vertex_buffer.slice(..));
            // Só o opaco: o vidro sai deste passe e é desenhado no passe de vidro abaixo.
            passe.draw(0..cena.opacos, 0..1);
        }
        if let Some(cor_opaca) = &cor_janela {
            self.registrar_vidro(
                &mut codificador,
                cena,
                camera,
                &buffer_uniformes,
                AlvosVidro {
                    cor_final: cor_opaca,
                    cor: alvo_cor,
                    resolve,
                    profundidade: &profundidade_view,
                    imagem: (largura, altura),
                    janela,
                },
            )?;
            // Da janela (opaco mais vidro) só a região sai: cópia do retângulo para a final.
            codificador.copy_texture_to_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: cor_opaca,
                    mip_level: 0,
                    origin: wgpu::Origin3d {
                        x: regiao.x - janela.x,
                        y: regiao.y - janela.y,
                        z: 0,
                    },
                    aspect: wgpu::TextureAspect::All,
                },
                wgpu::TexelCopyTextureInfo {
                    texture: &cor_textura,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                wgpu::Extent3d {
                    width: regiao.w,
                    height: regiao.h,
                    depth_or_array_layers: 1,
                },
            );
        }
        self.gpu.queue.submit(Some(codificador.finish()));

        ler_textura(&self.gpu, &cor_textura, regiao.w, regiao.h)
    }
}

/// Alvos do passe de vidro: a cor opaca da janela (de onde sai a cópia de tela), o alvo de
/// desenho com o resolve (multiamostra ou a própria cor opaca), a profundidade do passe principal,
/// a imagem inteira e a janela do passe opaco.
struct AlvosVidro<'a> {
    cor_final: &'a wgpu::Texture,
    cor: &'a wgpu::TextureView,
    resolve: Option<&'a wgpu::TextureView>,
    profundidade: &'a wgpu::TextureView,
    imagem: (u32, u32),
    janela: Retangulo,
}

impl Motor {
    /// Passe de vidro, depois do opaco. Copia a cor opaca resolvida da janela para a textura de
    /// tela (`cor_tela`, binding 8) e desenha os triângulos de vidro (`opacos..n_vertices`) sobre
    /// ela, com carga dos alvos (não limpa) e profundidade só de leitura. Com MSAA, o desenho
    /// acontece na multiamostra e o resolve é refeito: as amostras sem vidro mantêm a cor opaca,
    /// então a borda do vidro sai suavizada como o resto. Sem SSAO e sem sombra própria no vidro
    /// (ver shader.wgsl, `fs_vidro`).
    fn registrar_vidro(
        &self,
        codificador: &mut wgpu::CommandEncoder,
        cena: &CenaGpu,
        camera: &render_core::camera::Camera,
        buffer_uniformes: &wgpu::Buffer,
        alvos: AlvosVidro<'_>,
    ) -> Result<(), ErroRender> {
        let device = &self.gpu.device;
        let AlvosVidro {
            cor_final,
            cor,
            resolve,
            profundidade,
            imagem: (largura, altura),
            janela,
        } = alvos;

        // Cópia de tela do tamanho da janela: a refração lê dentro dela (a margem cobre o deslocamento).
        let cor_tela = criar_textura(
            device,
            "cor de tela (refração do vidro)",
            janela.w,
            janela.h,
            FORMATO_COR,
            wgpu::TextureUsages::COPY_DST | wgpu::TextureUsages::TEXTURE_BINDING,
            1,
        );
        let cor_tela_view = cor_tela.create_view(&wgpu::TextureViewDescriptor::default());
        codificador.copy_texture_to_texture(
            wgpu::TexelCopyTextureInfo {
                texture: cor_final,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyTextureInfo {
                texture: &cor_tela,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::Extent3d {
                width: janela.w,
                height: janela.h,
                depth_or_array_layers: 1,
            },
        );

        // Visão da câmera (para a normal de visão da refração), no mesmo uniforme extra dos passes
        // de oclusão. A janela do passe é a da cópia; o vidro não lê o pré-passe nem a oclusão.
        let extra = camera_extra(camera, largura, altura, janela, janela, janela)?;
        let buffer_extra = criar_buffer_extra(device, "câmera extra (vidro)", &extra);
        let grupo_vidro = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("grupo do vidro"),
            layout: &self.layouts.vidro,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: buffer_uniformes.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 5,
                    resource: buffer_extra.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 8,
                    resource: wgpu::BindingResource::TextureView(&cor_tela_view),
                },
            ],
        });

        let mut passe = codificador.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("passe de vidro"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                view: cor,
                depth_slice: None,
                resolve_target: resolve,
                ops: wgpu::Operations {
                    load: wgpu::LoadOp::Load,
                    store: wgpu::StoreOp::Store,
                },
            })],
            depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                view: profundidade,
                depth_ops: Some(wgpu::Operations {
                    load: wgpu::LoadOp::Load,
                    store: wgpu::StoreOp::Store,
                }),
                stencil_ops: None,
            }),
            timestamp_writes: None,
            occlusion_query_set: None,
            multiview_mask: None,
        });
        // Mesmo viewport deslocado do passe principal: a NDC é a da imagem inteira.
        passe.set_viewport(
            -(janela.x as f32),
            -(janela.y as f32),
            largura as f32,
            altura as f32,
            0.0,
            1.0,
        );
        passe.set_pipeline(&self.pipelines.vidro);
        passe.set_bind_group(0, &grupo_vidro, &[]);
        passe.set_vertex_buffer(0, cena.vertex_buffer.slice(..));
        passe.draw(cena.opacos..cena.n_vertices, 0..1);
        Ok(())
    }
}
