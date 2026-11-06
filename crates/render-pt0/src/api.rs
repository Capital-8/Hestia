//! API pública do modo pt (path tracing) para o serviço de render.
//!
//! Uso: `Pt0::novo` uma vez, com o dispositivo do `Motor` (`device()` e `queue()`, sem segundo contexto
//! de GPU). Por cena, `Pt0::carregar_cena` (confere o orçamento antes de alocar). Por render,
//! `Pt0::iniciar` (confere o orçamento dos alvos), `Acumulacao::passe` por amostra, e `previa` ou
//! `imagem` para ler o acumulado. `Pt0::renderizar` faz o laço inteiro, com progresso e cancelamento.
//!
//! Watchdog: um passe é submetido de uma vez (imagem inteira). Se ele passar de
//! `orcamento::LIMITE_SUBMISSAO_MS`, os passes seguintes saem em tiles de `LADO_TILE_PT`; um tile que
//! ainda passar reduz o lado pela metade (ver `orcamento::decidir_lado_tile`).
//!
//! Cor: o acumulado é radiância linear. A saída aplica o fator de exposição e a curva do motor
//! (AgX e sRGB de `render_engine::cor`), a mesma que o modo raster usa. Não há balanço de branco
//! (o motor fica em 6500 K por padrão, que é neutro).
//!
//! Erros: `ErroPt`. Nunca há fallback para outro modo.

use std::mem::size_of;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;

use render_core::cena::{Cena, MAX_TEXTURAS};
use render_core::camera::Camera;
use wgpu::util::DeviceExt;

use crate::bvh::{Bvh, NoGpu, TrianguloGpu};
use crate::denoise::{DenoiseGpu, GBufferVistas, Parametros, Perfil};
use crate::erro::ErroPt;
use crate::gpu::{self, Configuracao, MaterialGpu, Quadro, PROFUNDIDADE_MAXIMA};
use crate::orcamento;
use crate::texturas::{self, MapasGpu, Plano};

/// Versão do modo pt (vai para `/health`).
pub const VERSAO: &str = env!("CARGO_PKG_VERSION");

const FORMATO: wgpu::TextureFormat = wgpu::TextureFormat::Rgba32Float;
const LADO_WORKGROUP: u32 = 8;
const LADO_MAXIMO_IMAGEM: u32 = 16_384;

/// Limites do perfil que o `Pt0` respeita.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Limites {
    /// Orçamento de memória do render, em bytes (cena mais alvos). É `PerfilQualidade::orcamento_mib`.
    pub orcamento_bytes: u64,
    /// Maior lado do tamanho comum das texturas de material (`PerfilQualidade::lado_maximo_textura`).
    /// Também limitado pelo dispositivo.
    pub lado_maximo_textura: u32,
}

/// Opções de um render.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Opcoes {
    /// Filtra o acumulado com o À-Trous (perfil padrão, 5 passos). Usa o G-buffer do primeiro passe.
    pub denoise: bool,
    /// Fator linear de exposição (2^EV), aplicado antes da curva de tom.
    pub exposicao: f64,
    /// Raio angular do disco do sol, em radianos. 0 é sol pontual. Padrão: 0,25 grau (o exemplo `casa`).
    pub raio_sol: f32,
    /// Semente do sorteio. Muda o ruído, não a média.
    pub semente: u32,
}

impl Default for Opcoes {
    fn default() -> Self {
        Self {
            denoise: false,
            exposicao: 1.0,
            raio_sol: 0.25f32.to_radians(),
            semente: 7,
        }
    }
}

/// Imagem final: RGBA8 sem padding, alfa 255, cor já em sRGB.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ImagemRgba8 {
    pub largura: u32,
    pub altura: u32,
    pub rgba: Vec<u8>,
}

/// Dispositivo, pipeline e limites. Criado uma vez e reusado por todas as cenas e renders.
pub struct Pt0 {
    dispositivo: wgpu::Device,
    fila: wgpu::Queue,
    layout: wgpu::BindGroupLayout,
    pipeline: wgpu::ComputePipeline,
    lado_maximo_textura: u32,
    orcamento_bytes: u64,
}

/// Cena do modo pt na GPU: BVH, materiais, texturas e a parte da cena do uniforme (sol, fundo,
/// irradiância do céu, configuração do caminho). A câmera entra em `Pt0::iniciar`.
pub struct CenaPt {
    nos: wgpu::Buffer,
    tris: wgpu::Buffer,
    materiais: wgpu::Buffer,
    mapas: MapasGpu,
    quadro: Quadro,
    bytes: u64,
    triangulos: usize,
}

/// Um render em andamento: acumulado em ping-pong, G-buffer e, se pedido, o denoise.
pub struct Acumulacao<'a> {
    pt: &'a Pt0,
    acumulados: [wgpu::Texture; 2],
    _gbuffer: [wgpu::Texture; 3],
    gbuffer_vistas: [wgpu::TextureView; 3],
    uniforme: wgpu::Buffer,
    grupos: [wgpu::BindGroup; 2],
    denoiser: Option<DenoiseGpu>,
    quadro: Quadro,
    largura: u32,
    altura: u32,
    /// Índice do acumulado que guarda a soma atual.
    atual: usize,
    amostras: u32,
    lado_tile: u32,
    opcoes: Opcoes,
}

impl Pt0 {
    /// Cria o modo pt sobre o dispositivo dado (o do `Motor`). Falha se o pipeline não validar.
    pub fn novo(dispositivo: wgpu::Device, fila: wgpu::Queue, limites: Limites) -> Result<Self, ErroPt> {
        let escopo = dispositivo.push_error_scope(wgpu::ErrorFilter::Validation);
        let (layout, pipeline) = gpu::criar_layout_e_pipeline(&dispositivo);
        if let Some(erro) = pollster::block_on(escopo.pop()) {
            return Err(ErroPt::Gpu(format!("pipeline do modo pt recusado: {erro}")));
        }
        let teto_dispositivo = dispositivo.limits().max_texture_dimension_2d;
        Ok(Self {
            dispositivo,
            fila,
            layout,
            pipeline,
            lado_maximo_textura: limites.lado_maximo_textura.min(teto_dispositivo),
            orcamento_bytes: limites.orcamento_bytes,
        })
    }

    /// Versão do modo pt.
    pub fn versao(&self) -> &'static str {
        VERSAO
    }

    /// Orçamento de memória configurado, em bytes.
    pub fn orcamento_bytes(&self) -> u64 {
        self.orcamento_bytes
    }

    /// Confere, sem tocar na GPU, se a cena e um render de `largura x altura` cabem no orçamento. Monta a
    /// BVH e o plano de texturas na CPU (o custo de `carregar_cena` sem o upload).
    pub fn conferir_memoria(&self, cena: &Cena, largura: u32, altura: u32, denoise: bool) -> Result<(), ErroPt> {
        let (_, _, bytes) = self.planejar(cena)?;
        self.conferir_memoria_render(bytes, largura, altura, denoise)
    }

    /// Como `conferir_memoria`, para uma cena que já está na GPU (`CenaPt::bytes`).
    pub fn conferir_memoria_render(
        &self,
        bytes_cena: u64,
        largura: u32,
        altura: u32,
        denoise: bool,
    ) -> Result<(), ErroPt> {
        validar_imagem(largura, altura)?;
        orcamento::verificar(
            bytes_cena + orcamento::bytes_alvos(largura, altura, denoise),
            self.orcamento_bytes,
        )
    }

    /// Limites do modo raster para a cena, a BVH e o plano de texturas (já com o teto do perfil), e os
    /// bytes que a cena ocupará na GPU. Nada é alocado na GPU.
    fn planejar(&self, cena: &Cena) -> Result<(Bvh, Plano, u64), ErroPt> {
        if cena.texturas.len() > MAX_TEXTURAS as usize {
            return Err(ErroPt::Cena(format!(
                "{} texturas; o formato aceita até {MAX_TEXTURAS} por cena",
                cena.texturas.len()
            )));
        }
        let limite_lado = self.dispositivo.limits().max_texture_dimension_2d;
        if cena.texturas.iter().any(|t| t.largura.max(t.altura) > limite_lado) {
            return Err(ErroPt::Cena(format!(
                "textura de material maior que o limite de {limite_lado} texels da GPU"
            )));
        }
        let bvh = Bvh::construir(cena).map_err(ErroPt::Cena)?;
        let camadas = self.dispositivo.limits().max_texture_array_layers;
        let mut plano = Plano::planejar(&cena.texturas, &cena.materiais, camadas).map_err(ErroPt::Cena)?;
        texturas::aplicar_teto(&mut plano, self.lado_maximo_textura);
        let bytes = orcamento::bytes_cena(
            (bvh.nos.len() * size_of::<NoGpu>()) as u64,
            (bvh.tris.len() * size_of::<TrianguloGpu>()) as u64,
            (cena.materiais.len() * size_of::<MaterialGpu>()) as u64,
            texturas::bytes_do_plano(&plano),
        );
        Ok((bvh, plano, bytes))
    }

    /// Sobe a cena para a GPU. Os limites são os do modo raster (quantidade de texturas, lado máximo
    /// e camadas do dispositivo). A conta da memória sai antes de qualquer alocação.
    pub fn carregar_cena(&self, cena: &Cena) -> Result<CenaPt, ErroPt> {
        let (bvh, plano, bytes) = self.planejar(cena)?;
        orcamento::verificar(bytes, self.orcamento_bytes)?;

        let mapas = MapasGpu::criar_com_plano(&self.dispositivo, &self.fila, cena, plano).map_err(ErroPt::Gpu)?;
        let materiais = gpu::materiais_da_cena(cena, &mapas);
        let storage = |rotulo: &str, dados: &[u8]| {
            self.dispositivo.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some(rotulo),
                contents: dados,
                usage: wgpu::BufferUsages::STORAGE,
            })
        };
        let nos = storage("pt-nos", bytemuck::cast_slice::<NoGpu, u8>(&bvh.nos));
        let tris = storage("pt-tris", bytemuck::cast_slice::<TrianguloGpu, u8>(&bvh.tris));
        let materiais_gpu = storage("pt-materiais", bytemuck::cast_slice::<MaterialGpu, u8>(&materiais));
        let mut quadro = gpu::quadro_da_camera(cena, &cena.camera, 1, 1, 0.0).map_err(ErroPt::Cena)?;
        aplicar_configuracao_do_modo(&mut quadro);
        Ok(CenaPt {
            nos,
            tris,
            materiais: materiais_gpu,
            mapas,
            quadro,
            bytes,
            triangulos: bvh.tris.len(),
        })
    }

    /// Começa um render: confere o orçamento (cena mais alvos), cria o acumulado zerado, o G-buffer e,
    /// com `opcoes.denoise`, o denoise. Nenhum passe é feito aqui.
    pub fn iniciar<'a>(
        &'a self,
        cena: &'a CenaPt,
        camera: &Camera,
        largura: u32,
        altura: u32,
        opcoes: Opcoes,
    ) -> Result<Acumulacao<'a>, ErroPt> {
        validar_imagem(largura, altura)?;
        if !opcoes.exposicao.is_finite() || opcoes.exposicao < 0.0 {
            return Err(ErroPt::Argumentos(format!("exposição {} inválida", opcoes.exposicao)));
        }
        let necessario = cena.bytes + orcamento::bytes_alvos(largura, altura, opcoes.denoise);
        orcamento::verificar(necessario, self.orcamento_bytes)?;

        let d = &self.dispositivo;
        let escopo = d.push_error_scope(wgpu::ErrorFilter::Validation);
        let acumulados = [
            criar_rgba32f(d, largura, altura, "pt-acumulado-a"),
            criar_rgba32f(d, largura, altura, "pt-acumulado-b"),
        ];
        let gbuffer = [
            criar_rgba32f(d, largura, altura, "pt-gbuffer-geo"),
            criar_rgba32f(d, largura, altura, "pt-gbuffer-normal"),
            criar_rgba32f(d, largura, altura, "pt-gbuffer-albedo"),
        ];
        let vistas_acumulados = [
            acumulados[0].create_view(&wgpu::TextureViewDescriptor::default()),
            acumulados[1].create_view(&wgpu::TextureViewDescriptor::default()),
        ];
        let gbuffer_vistas = [
            gbuffer[0].create_view(&wgpu::TextureViewDescriptor::default()),
            gbuffer[1].create_view(&wgpu::TextureViewDescriptor::default()),
            gbuffer[2].create_view(&wgpu::TextureViewDescriptor::default()),
        ];
        let uniforme = d.create_buffer(&wgpu::BufferDescriptor {
            label: Some("pt-quadro"),
            size: size_of::<Quadro>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let grupo = |i: usize| {
            d.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("pt-grupo"),
                layout: &self.layout,
                entries: &[
                    entrada(0, uniforme.as_entire_binding()),
                    entrada(1, cena.nos.as_entire_binding()),
                    entrada(2, cena.tris.as_entire_binding()),
                    entrada(3, cena.materiais.as_entire_binding()),
                    entrada(4, wgpu::BindingResource::TextureView(&vistas_acumulados[i])),
                    entrada(5, wgpu::BindingResource::TextureView(&vistas_acumulados[1 - i])),
                    entrada(6, wgpu::BindingResource::Sampler(&cena.mapas.amostrador)),
                    entrada(7, wgpu::BindingResource::TextureView(&cena.mapas.vistas[0])),
                    entrada(8, wgpu::BindingResource::TextureView(&cena.mapas.vistas[1])),
                    entrada(9, wgpu::BindingResource::TextureView(&cena.mapas.vistas[2])),
                    entrada(10, wgpu::BindingResource::TextureView(&cena.mapas.vistas[3])),
                    entrada(11, wgpu::BindingResource::TextureView(&gbuffer_vistas[0])),
                    entrada(12, wgpu::BindingResource::TextureView(&gbuffer_vistas[1])),
                    entrada(13, wgpu::BindingResource::TextureView(&gbuffer_vistas[2])),
                ],
            })
        };
        let grupos = [grupo(0), grupo(1)];
        let denoiser = opcoes.denoise.then(|| DenoiseGpu::criar(d, largura, altura));

        let mut quadro = cena.quadro;
        quadro.inv_vp = gpu::inversa_vp(camera).map_err(ErroPt::Cena)?;
        quadro.dimensao = [largura, altura, 0, 0];
        quadro.cor_sol[3] = opcoes.raio_sol;
        quadro.textura = [
            texturas::angulo_do_pixel_da_camera(camera, largura).map_err(ErroPt::Cena)?,
            cena.mapas.plano.largura.max(cena.mapas.plano.altura) as f32,
            cena.mapas.plano.niveis as f32,
            0.0,
        ];
        if let Some(erro) = pollster::block_on(escopo.pop()) {
            return Err(ErroPt::Gpu(format!("criação dos recursos do render: {erro}")));
        }
        Ok(Acumulacao {
            pt: self,
            acumulados,
            _gbuffer: gbuffer,
            gbuffer_vistas,
            uniforme,
            grupos,
            denoiser,
            quadro,
            largura,
            altura,
            atual: 0,
            amostras: 0,
            lado_tile: 0,
            opcoes,
        })
    }

    /// Render completo de `amostras` passes, com progresso `(feitas, total)` depois de cada passe e
    /// cancelamento entre passes. Devolve a imagem final.
    #[allow(clippy::too_many_arguments)]
    pub fn renderizar(
        &self,
        cena: &CenaPt,
        camera: &Camera,
        largura: u32,
        altura: u32,
        amostras: u32,
        opcoes: Opcoes,
        progresso: &mut dyn FnMut(u32, u32),
        cancelar: &AtomicBool,
    ) -> Result<ImagemRgba8, ErroPt> {
        if amostras == 0 {
            return Err(ErroPt::Argumentos("amostras deve ser pelo menos 1".into()));
        }
        let mut acumulacao = self.iniciar(cena, camera, largura, altura, opcoes)?;
        for _ in 0..amostras {
            if cancelar.load(Ordering::SeqCst) {
                return Err(ErroPt::Cancelado);
            }
            let feitas = acumulacao.passe()?;
            progresso(feitas, amostras);
        }
        acumulacao.imagem()
    }
}

impl CenaPt {
    /// Bytes na GPU da cena (BVH, materiais e texturas), a parte do orçamento que não depende da imagem.
    pub fn bytes(&self) -> u64 {
        self.bytes
    }

    /// Triângulos da BVH.
    pub fn triangulos(&self) -> usize {
        self.triangulos
    }

    /// Camadas usadas em cada mapa (albedo, normal, rugosidade, metálico).
    pub fn camadas_por_mapa(&self) -> [usize; 4] {
        self.mapas.camadas_por_mapa()
    }

    /// Tamanho comum das texturas (largura, altura, mips). Cena sem textura: 1 x 1 x 1.
    pub fn tamanho_texturas(&self) -> (u32, u32, u32) {
        let p = &self.mapas.plano;
        (p.largura, p.altura, p.niveis)
    }
}

impl Acumulacao<'_> {
    /// Passes feitos até agora (amostras por pixel do acumulado).
    pub fn amostras(&self) -> u32 {
        self.amostras
    }

    /// Opções deste render.
    pub fn opcoes(&self) -> Opcoes {
        self.opcoes
    }

    /// Lado de tile que o próximo passe usará (0 = imagem inteira).
    pub fn lado_tile(&self) -> u32 {
        self.lado_tile
    }

    /// Um passe: uma amostra por pixel. Devolve as amostras feitas, já com este passe. O primeiro passe
    /// grava o G-buffer (necessário para o denoise).
    pub fn passe(&mut self) -> Result<u32, ErroPt> {
        let d = &self.pt.dispositivo;
        let origem = self.atual;
        let destino = 1 - origem;
        let extensao = wgpu::Extent3d {
            width: self.largura,
            height: self.altura,
            depth_or_array_layers: 1,
        };
        let escopo = d.push_error_scope(wgpu::ErrorFilter::Validation);
        let mut copia = d.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("pt-copia"),
        });
        copia.copy_texture_to_texture(
            self.acumulados[origem].as_image_copy(),
            self.acumulados[destino].as_image_copy(),
            extensao,
        );
        self.pt.fila.submit(Some(copia.finish()));

        let amostra = self.amostras;
        let lado = if self.lado_tile == 0 {
            self.largura.max(self.altura)
        } else {
            self.lado_tile
        };
        let mut pior_ms = 0.0f64;
        let mut y0 = 0;
        while y0 < self.altura {
            let th = lado.min(self.altura - y0);
            let mut x0 = 0;
            while x0 < self.largura {
                let tw = lado.min(self.largura - x0);
                let inicio = Instant::now();
                let mut quadro = self.quadro;
                quadro.tile = [x0, y0, tw, th];
                quadro.dimensao[2] = amostra;
                quadro.dimensao[3] = self.opcoes.semente;
                self.pt.fila.write_buffer(&self.uniforme, 0, bytemuck::bytes_of(&quadro));
                let mut codificador = d.create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("pt-tile"),
                });
                {
                    let mut passe = codificador.begin_compute_pass(&wgpu::ComputePassDescriptor {
                        label: Some("pt-passe"),
                        timestamp_writes: None,
                    });
                    passe.set_pipeline(&self.pt.pipeline);
                    passe.set_bind_group(0, &self.grupos[origem], &[]);
                    passe.dispatch_workgroups(tw.div_ceil(LADO_WORKGROUP), th.div_ceil(LADO_WORKGROUP), 1);
                }
                self.pt.fila.submit(Some(codificador.finish()));
                d.poll(wgpu::PollType::wait_indefinitely())
                    .map_err(|erro| ErroPt::Gpu(format!("espera do passe {amostra}: {erro}")))?;
                pior_ms = pior_ms.max(inicio.elapsed().as_secs_f64() * 1000.0);
                x0 += tw;
            }
            y0 += th;
        }
        if let Some(erro) = pollster::block_on(escopo.pop()) {
            return Err(ErroPt::Gpu(format!("validação do passe {amostra}: {erro}")));
        }
        self.atual = destino;
        self.amostras += 1;
        self.lado_tile = orcamento::decidir_lado_tile(self.lado_tile, pior_ms);
        Ok(self.amostras)
    }

    /// Radiância média linear de cada pixel (`largura * altura`), com o denoise se pedido. Espera a GPU.
    pub fn radiancia(&mut self) -> Result<Vec<[f32; 3]>, ErroPt> {
        if self.amostras == 0 {
            return Err(ErroPt::Argumentos(
                "nenhum passe feito: a imagem precisa de pelo menos uma amostra".into(),
            ));
        }
        let d = &self.pt.dispositivo;
        if let Some(denoiser) = &self.denoiser {
            let acumulado = self.acumulados[self.atual].create_view(&wgpu::TextureViewDescriptor::default());
            let gbuffer = GBufferVistas {
                geo: &self.gbuffer_vistas[0],
                normal: &self.gbuffer_vistas[1],
                albedo: &self.gbuffer_vistas[2],
            };
            denoiser.executar(
                d,
                &self.pt.fila,
                &acumulado,
                gbuffer,
                &Parametros::perfil(Perfil::Padrao),
                self.quadro.textura[0],
            );
            // A saída do denoise já é a média (alfa 1).
            let saida = denoiser.ler(d, &self.pt.fila).map_err(ErroPt::Gpu)?;
            return Ok(saida.chunks_exact(4).map(|c| [c[0], c[1], c[2]]).collect());
        }
        let bruto = gpu::ler_rgba32f(d, &self.pt.fila, &self.acumulados[self.atual], self.largura, self.altura)
            .map_err(ErroPt::Gpu)?;
        Ok(bruto
            .chunks_exact(4)
            .map(|c| {
                let n = c[3].max(1.0);
                [c[0] / n, c[1] / n, c[2] / n]
            })
            .collect())
    }

    /// Imagem final no tamanho do render, com exposição, curva de tom e denoise (se pedido).
    pub fn imagem(&mut self) -> Result<ImagemRgba8, ErroPt> {
        let radiancia = self.radiancia()?;
        Ok(tonemapear(&radiancia, self.largura, self.altura, self.opcoes.exposicao))
    }

    /// Prévia do acumulado atual, `largura_previa` px de largura (altura pela proporção, no mínimo 1).
    /// A média é feita em linear, antes da curva de tom.
    pub fn previa(&mut self, largura_previa: u32) -> Result<ImagemRgba8, ErroPt> {
        let lp = largura_previa.clamp(1, self.largura);
        let ap = ((u64::from(self.altura) * u64::from(lp) + u64::from(self.largura) / 2)
            / u64::from(self.largura))
        .max(1) as u32;
        let radiancia = self.radiancia()?;
        let reduzida = reduzir_media(&radiancia, self.largura, self.altura, lp, ap);
        Ok(tonemapear(&reduzida, lp, ap, self.opcoes.exposicao))
    }
}

/// Aplica a configuração do modo pt sobre o uniforme: 4 vértices, ambiente e especular da referência
/// (`tracer.rs`), mapas e normal de mapa ligados. O céu é o do motor (`Ceu::Motor`, o padrão de
/// `quadro_da_camera`).
fn aplicar_configuracao_do_modo(quadro: &mut Quadro) {
    let c = Configuracao::referencia(PROFUNDIDADE_MAXIMA);
    quadro.modo[0] = c.profundidade;
    quadro.opcoes[0] = c.ambiente as u32;
    quadro.opcoes[1] = c.especular as u32;
    quadro.opcoes[2] = c.diagnostico;
    quadro.opcoes[3] = 3;
}

fn validar_imagem(largura: u32, altura: u32) -> Result<(), ErroPt> {
    if largura == 0 || altura == 0 || largura > LADO_MAXIMO_IMAGEM || altura > LADO_MAXIMO_IMAGEM {
        return Err(ErroPt::Argumentos(format!(
            "resolução {largura}x{altura} fora da faixa 1..=16384"
        )));
    }
    Ok(())
}

fn criar_rgba32f(d: &wgpu::Device, largura: u32, altura: u32, rotulo: &str) -> wgpu::Texture {
    d.create_texture(&wgpu::TextureDescriptor {
        label: Some(rotulo),
        size: wgpu::Extent3d {
            width: largura,
            height: altura,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: FORMATO,
        usage: wgpu::TextureUsages::TEXTURE_BINDING
            | wgpu::TextureUsages::STORAGE_BINDING
            | wgpu::TextureUsages::COPY_SRC
            | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    })
}

fn entrada(binding: u32, resource: wgpu::BindingResource<'_>) -> wgpu::BindGroupEntry<'_> {
    wgpu::BindGroupEntry { binding, resource }
}

/// Exposição, curva de tom do motor (AgX e sRGB, `render_engine::cor::fundo_tonemapeado`) e
/// quantização para RGBA8 com alfa 255.
pub fn tonemapear(radiancia: &[[f32; 3]], largura: u32, altura: u32, exposicao: f64) -> ImagemRgba8 {
    let mut rgba = Vec::with_capacity(radiancia.len() * 4);
    for c in radiancia {
        let cor = render_engine::cor::fundo_tonemapeado(
            [f64::from(c[0]), f64::from(c[1]), f64::from(c[2])],
            exposicao,
        );
        for valor in cor {
            rgba.push((valor.clamp(0.0, 1.0) * 255.0 + 0.5) as u8);
        }
        rgba.push(255);
    }
    ImagemRgba8 { largura, altura, rgba }
}

/// Média de caixa de `origem` (`lo x ao`) em `ld x ad` pixels. Cada pixel de saída cobre um retângulo
/// de entrada (sem sobreposição, nunca vazio).
pub fn reduzir_media(origem: &[[f32; 3]], lo: u32, ao: u32, ld: u32, ad: u32) -> Vec<[f32; 3]> {
    let (lo, ao, ld, ad) = (lo as usize, ao as usize, ld as usize, ad as usize);
    let mut saida = Vec::with_capacity(ld * ad);
    for oy in 0..ad {
        let y0 = oy * ao / ad;
        let y1 = ((oy + 1) * ao / ad).max(y0 + 1);
        for ox in 0..ld {
            let x0 = ox * lo / ld;
            let x1 = ((ox + 1) * lo / ld).max(x0 + 1);
            let mut soma = [0.0f64; 3];
            let mut n = 0.0f64;
            for y in y0..y1 {
                for x in x0..x1 {
                    let p = origem[y * lo + x];
                    soma[0] += f64::from(p[0]);
                    soma[1] += f64::from(p[1]);
                    soma[2] += f64::from(p[2]);
                    n += 1.0;
                }
            }
            saida.push([(soma[0] / n) as f32, (soma[1] / n) as f32, (soma[2] / n) as f32]);
        }
    }
    saida
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn preto_fica_preto_e_alfa_cheio() {
        let imagem = tonemapear(&[[0.0; 3]], 1, 1, 1.0);
        assert_eq!(imagem.rgba, vec![0, 0, 0, 255]);
    }

    #[test]
    fn exposicao_clareia_a_saida() {
        let escuro = tonemapear(&[[0.1; 3]], 1, 1, 1.0);
        let claro = tonemapear(&[[0.1; 3]], 1, 1, 4.0);
        assert!(claro.rgba[0] > escuro.rgba[0]);
    }

    #[test]
    fn reducao_faz_a_media_de_cada_bloco() {
        // 4x2 com valores 0..8 por linha; reduzindo a 2x1, o pixel da esquerda cobre x 0..2 e as duas linhas.
        let origem: Vec<[f32; 3]> = (0..8).map(|i| [i as f32, 0.0, 0.0]).collect();
        let reduzida = reduzir_media(&origem, 4, 2, 2, 1);
        assert_eq!(reduzida.len(), 2);
        // Média de {0,1,4,5} = 2.5; de {2,3,6,7} = 4.5.
        assert!((reduzida[0][0] - 2.5).abs() < 1e-6);
        assert!((reduzida[1][0] - 4.5).abs() < 1e-6);
    }

    #[test]
    fn reducao_nunca_produz_pixel_vazio() {
        let origem = vec![[1.0f32; 3]; 5 * 3];
        let reduzida = reduzir_media(&origem, 5, 3, 2, 2);
        assert_eq!(reduzida.len(), 4);
        assert!(reduzida.iter().all(|p| (p[0] - 1.0).abs() < 1e-6));
    }

    #[test]
    fn imagem_invalida_e_recusada() {
        assert!(validar_imagem(0, 10).is_err());
        assert!(validar_imagem(16_385, 10).is_err());
        assert!(validar_imagem(1280, 720).is_ok());
    }
}
