//! Protótipo na GPU: buffers, pipeline do `pt0.wgsl` e passes por tile.
//!
//! Acumulação: duas texturas RGBA32F em ping-pong. Cada passe copia a textura de origem para a
//! de destino e depois despacha os tiles, que leem a origem e escrevem a destino (tiles são
//! disjuntos, então a escrita não conflita). A alfa guarda a contagem de amostras.
//!
//! Limite do watchdog: cada tile é submetido sozinho e esperado (`poll`) antes do próximo, então
//! nenhuma submissão passa do tamanho do tile escolhido por quem chama.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc};

use render_core::cena::Cena;
use wgpu::util::DeviceExt;

use crate::bvh::{Bvh, NoGpu, TrianguloGpu};
use crate::texturas::{self, MapasGpu, SEM_CAMADA};
use crate::COR_SOL;

/// Uniforme do shader (336 bytes, mesmo layout de `struct Quadro` em `pt0.wgsl`).
#[repr(C)]
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct Quadro {
    pub inv_vp: [[f32; 4]; 4],
    pub sol: [f32; 4],
    pub cor_sol: [f32; 4],
    pub fundo: [f32; 4],
    pub tile: [u32; 4],
    pub dimensao: [u32; 4],
    pub modo: [u32; 4],
    pub irradiancia: [[f32; 4]; 9],
    pub opcoes: [u32; 4],
    /// Texturas (fase 5): x, abertura do pixel (rad); y, lado comum das texturas (texels); z, níveis de
    /// mip; w, não usado. Ver `texturas::lod_da_distancia`.
    pub textura: [f32; 4],
}

/// Vértices máximos do caminho, igual a `PROFUNDIDADE_MAXIMA` do `render-core` (tracer.rs).
pub const PROFUNDIDADE_MAXIMA: u32 = 4;

/// Diagnóstico: o raio de sombra do sol não é lançado (sol sempre visível). Só para medir custo.
pub const DIAG_SEM_SOMBRA: u32 = 1;
/// Diagnóstico: travessia por força bruta (todos os triângulos, sem BVH e sem pilha). Só para medir.
pub const DIAG_FORCA_BRUTA: u32 = 2;

/// Ambiente por vértice: a fonte de luz do céu que soma em cada ponto do caminho.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Ambiente {
    /// Nenhum termo de céu: o raio que sai da cena vê só o fundo (fase 1).
    Nenhum = 0,
    /// Irradiância SH9 do céu (sem o fator 0,3 da referência), só no último vértice do caminho.
    /// É o termo da fase 2: com um rebote, o céu do primário chega pelo rebote, não por SH.
    Sh = 1,
    /// Termo da referência (`tracer.rs`): `0,3 * cor * (1 - metálico) * céu(normal)`, por vértice.
    Referencia = 2,
}

/// Especular do sol em cada vértice difuso. `BlinnPhong` é o da referência (`tracer.rs`), o padrão
/// para comparar com o `render-core`. `Ggx` é a segunda opção medida (microfacetas GGX com Smith e
/// Fresnel de Schlick), só no termo direto do sol.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Especular {
    Nenhum = 0,
    BlinnPhong = 1,
    Ggx = 2,
}

/// Termos que o caminho soma. Um conjunto desses é uma linha da medição.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Configuracao {
    /// Vértices com iluminação direta: 1 = só o primário; 2 = um rebote; até `PROFUNDIDADE_MAXIMA`.
    /// Cada vértice de vidro acrescenta `VERTICES_EXTRAS_VIDRO` ao limite (ver `pt0.wgsl`).
    pub profundidade: u32,
    pub ambiente: Ambiente,
    pub especular: Especular,
    /// Bits de `DIAG_*`. Zero no resultado real.
    pub diagnostico: u32,
}

impl Configuracao {
    /// Conjunto da referência em cada vértice: sol, especular e ambiente (`tracer.rs`).
    pub fn referencia(profundidade: u32) -> Self {
        Self {
            profundidade,
            ambiente: Ambiente::Referencia,
            especular: Especular::BlinnPhong,
            diagnostico: 0,
        }
    }
}

/// O que o passe calcula. Cada modo é uma linha da medição: (a), (b) e (c) do relatório da fase 2.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Modo {
    /// (a) Só sol direto, com sombra por raio. Fundo como na fase 1 (preto ou explícito).
    SolDireto = 0,
    /// (b) Sol direto mais a irradiância do céu no ponto primário, sem oclusão e sem rebote.
    SolCeu = 1,
    /// (c) Sol direto, céu e um rebote difuso por cosseno (sombra e céu no ponto acertado).
    SolCeuRebote = 2,
}

impl From<Modo> for Configuracao {
    fn from(modo: Modo) -> Self {
        let (profundidade, ambiente) = match modo {
            Modo::SolDireto => (1, Ambiente::Nenhum),
            Modo::SolCeu => (1, Ambiente::Sh),
            Modo::SolCeuRebote => (2, Ambiente::Sh),
        };
        Self {
            profundidade,
            ambiente,
            especular: Especular::Nenhum,
            diagnostico: 0,
        }
    }
}

/// Fonte do céu que os modos 1 e 2 veem fora da cena e usam para a luz do céu.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Ceu {
    /// Gradiente do motor (`radiancia_ceu` de `shader.wgsl`), com disco e halo no raio primário.
    /// É o padrão: é o céu que o usuário vê no motor, mesmo que a cena tenha fundo explícito.
    Motor = 0,
    /// Cor uniforme do fundo explícito da cena, como o tracer do `render-core`. Só existe com
    /// fundo explícito. Serve para comparar com a referência do `render-core` sem diferença de céu.
    Uniforme = 1,
}

/// Código-fonte do shader: céu (`ceu.wgsl`) seguido do passe (`pt0.wgsl`).
const FONTE_SHADER: &str = concat!(include_str!("ceu.wgsl"), include_str!("pt0.wgsl"));

/// Cria o dispositivo wgpu (DX12, Vulkan ou Metal) e devolve o nome do adaptador.
///
/// Falha se não houver adaptador de hardware. Usado pelo protótipo e pelo teste do céu.
pub fn criar_dispositivo() -> Result<(String, wgpu::Device, wgpu::Queue), String> {
    let instancia = wgpu::Instance::new(wgpu::InstanceDescriptor {
        backends: wgpu::Backends::PRIMARY,
        ..wgpu::InstanceDescriptor::new_without_display_handle()
    });
    let adaptador = pollster::block_on(instancia.request_adapter(&wgpu::RequestAdapterOptions {
        power_preference: wgpu::PowerPreference::HighPerformance,
        force_fallback_adapter: false,
        compatible_surface: None,
        apply_limit_buckets: false,
    }))
    .map_err(|erro| format!("nenhum adaptador GPU: {erro:?}"))?;
    let info = adaptador.get_info();
    if info.device_type == wgpu::DeviceType::Cpu {
        return Err(format!("o único adaptador é de software ({})", info.name));
    }
    let (dispositivo, fila) = pollster::block_on(adaptador.request_device(&wgpu::DeviceDescriptor {
        label: Some("render-pt0"),
        required_features: wgpu::Features::empty(),
        required_limits: adaptador.limits(),
        ..Default::default()
    }))
    .map_err(|erro| format!("falha ao criar o dispositivo: {erro:?}"))?;
    Ok((info.name, dispositivo, fila))
}

/// Céu e halo (`[r, g, b, halo]`) e irradiância (`[r, g, b]`), uma entrada por direção.
pub type SaidaCeu = (Vec<[f32; 4]>, Vec<[f32; 3]>);

/// Avalia o céu e a irradiância do WGSL (`ceu.wgsl`) em cada direção, na GPU.
///
/// Só para o teste de sincronia com `ceu::radiancia` e `ceu::irradiancia_em`. `entradas` traz
/// (direção unitária, com disco?). `sol` é (direção para o sol, intensidade) e `coeficientes` são
/// os 9 coeficientes SH de `ceu::irradiancia_sh`. Devolve (céu e halo `[r, g, b, halo]`, irradiância).
pub fn avaliar_ceu(
    entradas: &[([f32; 3], bool)],
    sol: [f32; 3],
    intensidade: f32,
    coeficientes: &[[f32; 3]; 9],
) -> Result<SaidaCeu, String> {
    let (_, dispositivo, fila) = criar_dispositivo()?;
    let fonte = format!("{}\n{}", include_str!("ceu.wgsl"), include_str!("ceu_prova.wgsl"));
    let modulo = dispositivo.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("ceu-prova"),
        source: wgpu::ShaderSource::Wgsl(fonte.into()),
    });
    let dados_entrada: Vec<[f32; 4]> = entradas
        .iter()
        .map(|(d, disco)| [d[0], d[1], d[2], if *disco { 1.0 } else { 0.0 }])
        .collect();
    // Dois blocos de saída: céu (n) e irradiância (n).
    let tamanho_saida = (entradas.len() * 16 * 2) as u64;
    let mut uniforme = [[0.0f32; 4]; 10];
    uniforme[0] = [sol[0], sol[1], sol[2], intensidade];
    for (k, c) in coeficientes.iter().enumerate() {
        uniforme[k + 1] = [c[0], c[1], c[2], 0.0];
    }
    let buffer_sol = dispositivo.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("ceu-prova-sol"),
        contents: bytemuck::cast_slice(&uniforme),
        usage: wgpu::BufferUsages::UNIFORM,
    });
    let buffer_entrada = dispositivo.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("ceu-prova-entrada"),
        contents: bytemuck::cast_slice(&dados_entrada),
        usage: wgpu::BufferUsages::STORAGE,
    });
    let buffer_saida = dispositivo.create_buffer(&wgpu::BufferDescriptor {
        label: Some("ceu-prova-saida"),
        size: tamanho_saida,
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
        mapped_at_creation: false,
    });
    let leitura = dispositivo.create_buffer(&wgpu::BufferDescriptor {
        label: Some("ceu-prova-leitura"),
        size: tamanho_saida,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });
    let camada = |binding: u32, tipo: wgpu::BufferBindingType| wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::COMPUTE,
        ty: wgpu::BindingType::Buffer {
            ty: tipo,
            has_dynamic_offset: false,
            min_binding_size: None,
        },
        count: None,
    };
    let layout = dispositivo.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("ceu-prova-layout"),
        entries: &[
            camada(0, wgpu::BufferBindingType::Uniform),
            camada(1, wgpu::BufferBindingType::Storage { read_only: true }),
            camada(2, wgpu::BufferBindingType::Storage { read_only: false }),
        ],
    });
    let grupo = dispositivo.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("ceu-prova-grupo"),
        layout: &layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: buffer_sol.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: buffer_entrada.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 2,
                resource: buffer_saida.as_entire_binding(),
            },
        ],
    });
    let pl = dispositivo.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("ceu-prova-pipeline-layout"),
        bind_group_layouts: &[Some(&layout)],
        immediate_size: 0,
    });
    let pipeline = dispositivo.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: Some("ceu-prova"),
        layout: Some(&pl),
        module: &modulo,
        entry_point: Some("main"),
        compilation_options: Default::default(),
        cache: None,
    });
    let mut codificador = dispositivo.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("ceu-prova-cmd"),
    });
    {
        let mut passe = codificador.begin_compute_pass(&wgpu::ComputePassDescriptor {
            label: Some("ceu-prova-passe"),
            timestamp_writes: None,
        });
        passe.set_pipeline(&pipeline);
        passe.set_bind_group(0, &grupo, &[]);
        passe.dispatch_workgroups((entradas.len() as u32).div_ceil(64), 1, 1);
    }
    codificador.copy_buffer_to_buffer(&buffer_saida, 0, &leitura, 0, tamanho_saida);
    fila.submit(Some(codificador.finish()));

    let (envio, recebimento) = mpsc::channel();
    leitura.slice(..).map_async(wgpu::MapMode::Read, move |resultado| {
        let _ = envio.send(resultado);
    });
    dispositivo
        .poll(wgpu::PollType::wait_indefinitely())
        .map_err(|erro| format!("espera da prova do céu: {erro}"))?;
    recebimento
        .recv()
        .map_err(|erro| format!("canal da prova do céu: {erro}"))?
        .map_err(|erro| format!("mapeamento da prova do céu: {erro:?}"))?;
    let dados = leitura
        .slice(..)
        .get_mapped_range()
        .map_err(|erro| format!("leitura da prova do céu: {erro:?}"))?;
    let todos: Vec<[f32; 4]> = dados
        .chunks_exact(16)
        .map(|c| {
            [
                f32::from_le_bytes([c[0], c[1], c[2], c[3]]),
                f32::from_le_bytes([c[4], c[5], c[6], c[7]]),
                f32::from_le_bytes([c[8], c[9], c[10], c[11]]),
                f32::from_le_bytes([c[12], c[13], c[14], c[15]]),
            ]
        })
        .collect();
    drop(dados);
    leitura.unmap();
    let n = entradas.len();
    let irradiancias = todos[n..].iter().map(|v| [v[0], v[1], v[2]]).collect();
    let mut ceus = todos;
    ceus.truncate(n);
    Ok((ceus, irradiancias))
}

/// Material no formato da GPU (96 bytes, mesmo layout de `struct Material` em `pt0.wgsl`).
#[repr(C)]
#[derive(Clone, Copy, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct MaterialGpu {
    /// rgb: cor base linear; w: metálico.
    pub cor: [f32; 4],
    /// rgb: emissão linear.
    pub emissao: [f32; 4],
    /// x: rugosidade (o especular da referência usa `1 - rugosidade`).
    pub propriedades: [f32; 4],
    /// x: transmissão; y: IOR; z: opacidade; w: tipo procedural (6 = vidro).
    pub vidro: [f32; 4],
    /// Camada de cada mapa (albedo, normal, rugosidade, metálico) no array; `SEM_CAMADA` = sem mapa.
    pub texturas: [u32; 4],
    /// rgb: média linear do albedo da textura (divisor do albedo); w: escala do padrão (metros por
    /// repetição), como `Material::escala`.
    pub media_escala: [f32; 4],
}

/// Vidro segundo o material: transmissão > 0, opacidade < 1 ou tipo "vidro" (6). Mesmo critério do
/// `pt0.wgsl` (`e_vidro`).
pub fn e_vidro(m: &render_core::cena::Material) -> bool {
    m.transmissao > 0.0 || m.opacidade < 1.0 || m.tipo == 6
}

const LADO_WORKGROUP: u32 = 8;
const FORMATO_ACUMULADO: wgpu::TextureFormat = wgpu::TextureFormat::Rgba32Float;

/// Protótipo carregado: cena na GPU e acumulado em ping-pong.
pub struct Prototipo {
    dispositivo: wgpu::Device,
    fila: wgpu::Queue,
    pipeline: wgpu::ComputePipeline,
    /// `grupos[i]` lê `texturas[i]` e escreve `texturas[1 - i]`.
    grupos: [wgpu::BindGroup; 2],
    uniforme: wgpu::Buffer,
    texturas: [wgpu::Texture; 2],
    base: Quadro,
    largura: u32,
    altura: u32,
    /// Índice da textura que guarda o acumulado atual.
    atual: usize,
    adaptador: String,
    erro_de_validacao: Arc<AtomicBool>,
    /// Texturas de material da cena (fase 5): arrays por mapa, plano e amostrador.
    mapas: MapasGpu,
    /// Vistas do G-buffer do primeiro acerto (fase 6): geo, normal e albedo/R. Gravado no passe 0 de
    /// cada cadeia. As vistas mantêm as texturas vivas.
    gbuffer_vistas: [wgpu::TextureView; 3],
    /// Denoise À-Trous (fase 6, ver `denoise.rs`): pipeline e texturas intermediárias.
    denoiser: crate::denoise::DenoiseGpu,
}

impl Prototipo {
    /// Sobe a cena e a BVH para a GPU. Falha se não houver adaptador DX12/Vulkan/Metal.
    ///
    /// `raio_sol` em radianos: 0 para sol pontual (padrão desta fatia), > 0 para disco solar.
    pub fn iniciar(cena: &Cena, bvh: &Bvh, largura: u32, altura: u32, raio_sol: f32) -> Result<Self, String> {
        let (nome_adaptador, dispositivo, fila) = criar_dispositivo()?;

        let erro_de_validacao = Arc::new(AtomicBool::new(false));
        let sinal = Arc::clone(&erro_de_validacao);
        dispositivo.on_uncaptured_error(Arc::new(move |erro| {
            eprintln!("render-pt0: erro de validação da GPU: {erro}");
            sinal.store(true, Ordering::SeqCst);
        }));

        let nos = bvh.nos.clone();
        let tris: Vec<TrianguloGpu> = bvh.tris.clone();
        let limite_camadas = dispositivo.limits().max_texture_array_layers;
        let mapas = MapasGpu::criar(&dispositivo, &fila, cena, limite_camadas)?;
        let materiais: Vec<MaterialGpu> = cena
            .materiais
            .iter()
            .map(|m| {
                // Camada de cada mapa, e a média linear do albedo (1 quando o albedo não tem textura).
                let camada = |mapa: usize| match m.texturas[mapa] {
                    Some(i) => texturas::camada_do_mapa(&mapas.plano, mapa, i),
                    None => SEM_CAMADA,
                };
                let media = match m.texturas[0] {
                    Some(i) => texturas::media_do_albedo(&mapas.plano, i),
                    None => [1.0; 3],
                };
                MaterialGpu {
                    cor: [
                        m.cor_base[0] as f32,
                        m.cor_base[1] as f32,
                        m.cor_base[2] as f32,
                        m.metalico as f32,
                    ],
                    emissao: [
                        m.emissivo[0] as f32,
                        m.emissivo[1] as f32,
                        m.emissivo[2] as f32,
                        0.0,
                    ],
                    propriedades: [m.rugosidade as f32, 0.0, 0.0, 0.0],
                    vidro: [
                        m.transmissao as f32,
                        m.ior as f32,
                        m.opacidade as f32,
                        f32::from(m.tipo),
                    ],
                    texturas: [camada(0), camada(1), camada(2), camada(3)],
                    media_escala: [media[0], media[1], media[2], m.escala as f32],
                }
            })
            .collect();

        let buffer_storage = |rotulo: &str, dados: &[u8]| {
            dispositivo.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some(rotulo),
                contents: dados,
                usage: wgpu::BufferUsages::STORAGE,
            })
        };
        let buf_nos = buffer_storage("pt0-nos", bytemuck::cast_slice::<NoGpu, u8>(&nos));
        let buf_tris = buffer_storage("pt0-tris", bytemuck::cast_slice::<TrianguloGpu, u8>(&tris));
        let buf_materiais = buffer_storage("pt0-materiais", bytemuck::cast_slice::<MaterialGpu, u8>(&materiais));
        let uniforme = dispositivo.create_buffer(&wgpu::BufferDescriptor {
            label: Some("pt0-quadro"),
            size: std::mem::size_of::<Quadro>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let criar_textura = |rotulo: &str| {
            dispositivo.create_texture(&wgpu::TextureDescriptor {
                label: Some(rotulo),
                size: wgpu::Extent3d {
                    width: largura,
                    height: altura,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: FORMATO_ACUMULADO,
                usage: wgpu::TextureUsages::TEXTURE_BINDING
                    | wgpu::TextureUsages::STORAGE_BINDING
                    | wgpu::TextureUsages::COPY_SRC
                    | wgpu::TextureUsages::COPY_DST,
                view_formats: &[],
            })
        };
        let texturas = [criar_textura("pt0-acumulado-a"), criar_textura("pt0-acumulado-b")];
        let vistas = [
            texturas[0].create_view(&wgpu::TextureViewDescriptor::default()),
            texturas[1].create_view(&wgpu::TextureViewDescriptor::default()),
        ];
        // G-buffer (fase 6): três texturas RGBA32F por pixel, escritas no passe 0 e lidas pelo denoise.
        let criar_gbuffer = |rotulo: &str| {
            dispositivo.create_texture(&wgpu::TextureDescriptor {
                label: Some(rotulo),
                size: wgpu::Extent3d {
                    width: largura,
                    height: altura,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: FORMATO_ACUMULADO,
                usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::STORAGE_BINDING,
                view_formats: &[],
            })
        };
        let gbuffer = [
            criar_gbuffer("pt0-gbuffer-geo"),
            criar_gbuffer("pt0-gbuffer-normal"),
            criar_gbuffer("pt0-gbuffer-albedo"),
        ];
        let gbuffer_vistas = [
            gbuffer[0].create_view(&wgpu::TextureViewDescriptor::default()),
            gbuffer[1].create_view(&wgpu::TextureViewDescriptor::default()),
            gbuffer[2].create_view(&wgpu::TextureViewDescriptor::default()),
        ];

        let camada = |binding: u32, tipo: wgpu::BufferBindingType| wgpu::BindGroupLayoutEntry {
            binding,
            visibility: wgpu::ShaderStages::COMPUTE,
            ty: wgpu::BindingType::Buffer {
                ty: tipo,
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        };
        let layout = dispositivo.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("pt0-layout"),
            entries: &[
                camada(0, wgpu::BufferBindingType::Uniform),
                camada(1, wgpu::BufferBindingType::Storage { read_only: true }),
                camada(2, wgpu::BufferBindingType::Storage { read_only: true }),
                camada(3, wgpu::BufferBindingType::Storage { read_only: true }),
                wgpu::BindGroupLayoutEntry {
                    binding: 4,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 5,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::StorageTexture {
                        access: wgpu::StorageTextureAccess::WriteOnly,
                        format: FORMATO_ACUMULADO,
                        view_dimension: wgpu::TextureViewDimension::D2,
                    },
                    count: None,
                },
                // Texturas de material (fase 5): amostrador e um array por mapa (albedo, normal,
                // rugosidade, metálico). Ver `texturas.rs` e a seção de texturas do `pt0.wgsl`.
                wgpu::BindGroupLayoutEntry {
                    binding: 6,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 7,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2Array,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 8,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2Array,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 9,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2Array,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 10,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2Array,
                        multisampled: false,
                    },
                    count: None,
                },
                // G-buffer (fase 6): geo, normal e albedo/R, escritos pelo passe 0 (ver `gravar_gbuffer`).
                wgpu::BindGroupLayoutEntry {
                    binding: 11,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::StorageTexture {
                        access: wgpu::StorageTextureAccess::WriteOnly,
                        format: FORMATO_ACUMULADO,
                        view_dimension: wgpu::TextureViewDimension::D2,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 12,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::StorageTexture {
                        access: wgpu::StorageTextureAccess::WriteOnly,
                        format: FORMATO_ACUMULADO,
                        view_dimension: wgpu::TextureViewDimension::D2,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 13,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::StorageTexture {
                        access: wgpu::StorageTextureAccess::WriteOnly,
                        format: FORMATO_ACUMULADO,
                        view_dimension: wgpu::TextureViewDimension::D2,
                    },
                    count: None,
                },
            ],
        });

        let grupo = |i: usize| {
            dispositivo.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("pt0-grupo"),
                layout: &layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: uniforme.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: buf_nos.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: buf_tris.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 3,
                        resource: buf_materiais.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 4,
                        resource: wgpu::BindingResource::TextureView(&vistas[i]),
                    },
                    wgpu::BindGroupEntry {
                        binding: 5,
                        resource: wgpu::BindingResource::TextureView(&vistas[1 - i]),
                    },
                    wgpu::BindGroupEntry {
                        binding: 6,
                        resource: wgpu::BindingResource::Sampler(&mapas.amostrador),
                    },
                    wgpu::BindGroupEntry {
                        binding: 7,
                        resource: wgpu::BindingResource::TextureView(&mapas.vistas[0]),
                    },
                    wgpu::BindGroupEntry {
                        binding: 8,
                        resource: wgpu::BindingResource::TextureView(&mapas.vistas[1]),
                    },
                    wgpu::BindGroupEntry {
                        binding: 9,
                        resource: wgpu::BindingResource::TextureView(&mapas.vistas[2]),
                    },
                    wgpu::BindGroupEntry {
                        binding: 10,
                        resource: wgpu::BindingResource::TextureView(&mapas.vistas[3]),
                    },
                    wgpu::BindGroupEntry {
                        binding: 11,
                        resource: wgpu::BindingResource::TextureView(&gbuffer_vistas[0]),
                    },
                    wgpu::BindGroupEntry {
                        binding: 12,
                        resource: wgpu::BindingResource::TextureView(&gbuffer_vistas[1]),
                    },
                    wgpu::BindGroupEntry {
                        binding: 13,
                        resource: wgpu::BindingResource::TextureView(&gbuffer_vistas[2]),
                    },
                ],
            })
        };
        let grupos = [grupo(0), grupo(1)];

        let modulo = dispositivo.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("pt0.wgsl"),
            source: wgpu::ShaderSource::Wgsl(FONTE_SHADER.into()),
        });
        let pl = dispositivo.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("pt0-pipeline-layout"),
            bind_group_layouts: &[Some(&layout)],
            immediate_size: 0,
        });
        let pipeline = dispositivo.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("pt0-compute"),
            layout: Some(&pl),
            module: &modulo,
            entry_point: Some("main"),
            compilation_options: Default::default(),
            cache: None,
        });

        let mut base = quadro_da_cena(cena, largura, altura, raio_sol)?;
        // LOD das texturas (ver `texturas::lod_da_distancia`): abertura do pixel, lado comum e níveis.
        base.textura = [
            texturas::angulo_do_pixel(cena, largura)?,
            mapas.plano.largura.max(mapas.plano.altura) as f32,
            mapas.plano.niveis as f32,
            0.0,
        ];
        // Mapas (bit 0) e normal de mapa (bit 1) ligados por padrão; ver `definir_mapas`.
        base.opcoes[3] = 3;
        let denoiser = crate::denoise::DenoiseGpu::criar(&dispositivo, largura, altura);
        let mut protot = Self {
            dispositivo,
            fila,
            pipeline,
            grupos,
            uniforme,
            texturas,
            base,
            largura,
            altura,
            atual: 0,
            adaptador: nome_adaptador,
            erro_de_validacao,
            mapas,
            gbuffer_vistas,
            denoiser,
        };
        protot.limpar();
        Ok(protot)
    }

    pub fn adaptador(&self) -> &str {
        &self.adaptador
    }

    /// Escolhe o que o próximo passe calcula. Quem chama zera o acumulado (`limpar`) antes de
    /// trocar de modo, porque as amostras de modos diferentes não se misturam.
    pub fn definir_modo(&mut self, modo: Modo) {
        self.aplicar(modo.into());
    }

    /// Escolhe os termos do caminho (profundidade, ambiente, especular, diagnóstico). Quem chama
    /// zera o acumulado antes de trocar, pelo mesmo motivo de `definir_modo`.
    pub fn definir_configuracao(&mut self, configuracao: Configuracao) -> Result<(), String> {
        if !(1..=PROFUNDIDADE_MAXIMA).contains(&configuracao.profundidade) {
            return Err(format!(
                "profundidade {} fora de 1..={PROFUNDIDADE_MAXIMA}",
                configuracao.profundidade
            ));
        }
        self.aplicar(configuracao);
        Ok(())
    }

    fn aplicar(&mut self, configuracao: Configuracao) {
        self.base.modo[0] = configuracao.profundidade;
        // Só os três primeiros campos: `opcoes[3]` é dos mapas de material (`definir_mapas`).
        self.base.opcoes[0] = configuracao.ambiente as u32;
        self.base.opcoes[1] = configuracao.especular as u32;
        self.base.opcoes[2] = configuracao.diagnostico;
    }

    /// Liga ou desliga os mapas de material (albedo, rugosidade, metálico) e o mapa de normal. Com os
    /// dois desligados, o passe usa só os valores do material (o que a fase 4 media). Não zera o
    /// acumulado: quem chama zera antes de comparar.
    pub fn definir_mapas(&mut self, mapas: bool, normal: bool) {
        self.base.opcoes[3] = u32::from(mapas) | (u32::from(normal) << 1);
    }

    /// Bytes na GPU dos arrays de textura de material (todos os níveis de mip).
    pub fn memoria_texturas(&self) -> u64 {
        self.mapas.bytes
    }

    /// Camadas usadas em cada mapa (albedo, normal, rugosidade, metálico).
    pub fn camadas_por_mapa(&self) -> [usize; 4] {
        self.mapas.camadas_por_mapa()
    }

    /// Tamanho comum das texturas (largura, altura, níveis de mip). Cena sem textura: 1 x 1 x 1.
    pub fn tamanho_texturas(&self) -> (u32, u32, u32) {
        let p = &self.mapas.plano;
        (p.largura, p.altura, p.niveis)
    }

    /// Escolhe a fonte do céu (ver `Ceu`) e recalcula a irradiância SH9 que ela implica. `Uniforme`
    /// exige fundo explícito na cena. Quem chama zera o acumulado antes de trocar.
    pub fn definir_ceu(&mut self, ceu: Ceu) -> Result<(), String> {
        let uniforme = match ceu {
            Ceu::Motor => None,
            Ceu::Uniforme => {
                let f = self.base.fundo;
                if f[3] < 0.5 {
                    return Err("céu uniforme pede fundo explícito na cena".into());
                }
                Some([f[0], f[1], f[2]])
            }
        };
        self.base.modo[2] = ceu as u32;
        self.base.irradiancia = crate::ceu::para_buffer(&crate::ceu::irradiancia_sh(uniforme));
        Ok(())
    }

    /// Zera o acumulado (as duas texturas).
    pub fn limpar(&mut self) {
        let zeros = vec![0u8; (self.largura * self.altura * 16) as usize];
        for textura in &self.texturas {
            self.fila.write_texture(
                textura.as_image_copy(),
                &zeros,
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(self.largura * 16),
                    rows_per_image: Some(self.altura),
                },
                wgpu::Extent3d {
                    width: self.largura,
                    height: self.altura,
                    depth_or_array_layers: 1,
                },
            );
        }
        self.atual = 0;
    }

    /// Um passe: uma amostra por pixel, dividido em tiles de `lado_tile` (0 = imagem inteira).
    /// Cada tile é submetido e esperado antes do seguinte.
    pub fn passe(&mut self, amostra: u32, semente: u32, lado_tile: u32) -> Result<(), String> {
        let origem = self.atual;
        let destino = 1 - origem;
        let extensao = wgpu::Extent3d {
            width: self.largura,
            height: self.altura,
            depth_or_array_layers: 1,
        };
        let mut copia = self.dispositivo.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("pt0-copia"),
        });
        copia.copy_texture_to_texture(
            self.texturas[origem].as_image_copy(),
            self.texturas[destino].as_image_copy(),
            extensao,
        );
        self.fila.submit(Some(copia.finish()));

        let lado = if lado_tile == 0 {
            self.largura.max(self.altura)
        } else {
            lado_tile
        };
        let mut y0 = 0;
        while y0 < self.altura {
            let th = lado.min(self.altura - y0);
            let mut x0 = 0;
            while x0 < self.largura {
                let tw = lado.min(self.largura - x0);
                let mut quadro = self.base;
                quadro.tile = [x0, y0, tw, th];
                quadro.dimensao[2] = amostra;
                quadro.dimensao[3] = semente;
                self.fila.write_buffer(&self.uniforme, 0, bytemuck::bytes_of(&quadro));

                let mut codificador = self.dispositivo.create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("pt0-tile"),
                });
                {
                    let mut passe = codificador.begin_compute_pass(&wgpu::ComputePassDescriptor {
                        label: Some("pt0-passe"),
                        timestamp_writes: None,
                    });
                    passe.set_pipeline(&self.pipeline);
                    passe.set_bind_group(0, &self.grupos[origem], &[]);
                    passe.dispatch_workgroups(tw.div_ceil(LADO_WORKGROUP), th.div_ceil(LADO_WORKGROUP), 1);
                }
                self.fila.submit(Some(codificador.finish()));
                self.dispositivo
                    .poll(wgpu::PollType::wait_indefinitely())
                    .map_err(|erro| format!("espera do tile ({x0},{y0}): {erro}"))?;
                x0 += tw;
            }
            y0 += th;
        }
        self.atual = destino;
        self.checar_erros()
    }

    /// Acumulado atual: RGBA32F linear, `largura * altura * 4` floats (alfa = contagem).
    pub fn acumulado(&self) -> Result<Vec<f32>, String> {
        let saida = ler_rgba32f(&self.dispositivo, &self.fila, &self.texturas[self.atual], self.largura, self.altura)?;
        self.checar_erros()?;
        Ok(saida)
    }

    /// Denoise (fase 6): filtra o acumulado atual com o G-buffer do passe 0. Quem chama precisa de um
    /// passe 0 feito com a configuração atual (mapas, câmera). Não espera a GPU; `denoised` espera.
    pub fn denoise(&mut self, parametros: &crate::denoise::Parametros) -> Result<(), String> {
        let acumulado = self.texturas[self.atual].create_view(&wgpu::TextureViewDescriptor::default());
        let gbuffer = crate::denoise::GBufferVistas {
            geo: &self.gbuffer_vistas[0],
            normal: &self.gbuffer_vistas[1],
            albedo: &self.gbuffer_vistas[2],
        };
        self.denoiser
            .executar(&self.dispositivo, &self.fila, &acumulado, gbuffer, parametros, self.base.textura[0]);
        self.checar_erros()
    }

    /// Resultado do último `denoise`: RGBA32F com alfa 1 (`largura * altura * 4` floats). Espera a GPU.
    pub fn denoised(&self) -> Result<Vec<f32>, String> {
        let saida = self.denoiser.ler(&self.dispositivo, &self.fila)?;
        self.checar_erros()?;
        Ok(saida)
    }

    /// Espera a GPU terminar o que já foi submetido (para medir tempo).
    pub fn sincronizar(&self) -> Result<(), String> {
        self.dispositivo
            .poll(wgpu::PollType::wait_indefinitely())
            .map(|_| ())
            .map_err(|erro| format!("espera da GPU: {erro}"))
    }

    fn checar_erros(&self) -> Result<(), String> {
        if self.erro_de_validacao.load(Ordering::SeqCst) {
            Err("a GPU reportou erro de validação (ver stderr)".into())
        } else {
            Ok(())
        }
    }
}

/// Lê uma textura RGBA32F de `largura` x `altura` para a CPU (linhas alinhadas a 256 bytes, como exige
/// a cópia). Espera a GPU. Usado pelo acumulado e pela saída do denoise.
pub(crate) fn ler_rgba32f(
    dispositivo: &wgpu::Device,
    fila: &wgpu::Queue,
    textura: &wgpu::Texture,
    largura: u32,
    altura: u32,
) -> Result<Vec<f32>, String> {
    let bytes_linha = largura * 16;
    let alinhada = bytes_linha.div_ceil(256) * 256;
    let leitura = dispositivo.create_buffer(&wgpu::BufferDescriptor {
        label: Some("pt0-leitura"),
        size: u64::from(alinhada) * u64::from(altura),
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });
    let mut codificador = dispositivo.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("pt0-leitura-cmd"),
    });
    codificador.copy_texture_to_buffer(
        textura.as_image_copy(),
        wgpu::TexelCopyBufferInfo {
            buffer: &leitura,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(alinhada),
                rows_per_image: Some(altura),
            },
        },
        wgpu::Extent3d {
            width: largura,
            height: altura,
            depth_or_array_layers: 1,
        },
    );
    fila.submit(Some(codificador.finish()));

    let (envio, recebimento) = mpsc::channel();
    leitura.slice(..).map_async(wgpu::MapMode::Read, move |resultado| {
        let _ = envio.send(resultado);
    });
    dispositivo
        .poll(wgpu::PollType::wait_indefinitely())
        .map_err(|erro| format!("espera da leitura: {erro}"))?;
    recebimento
        .recv()
        .map_err(|erro| format!("canal de leitura: {erro}"))?
        .map_err(|erro| format!("mapeamento falhou: {erro:?}"))?;

    let dados = leitura
        .slice(..)
        .get_mapped_range()
        .map_err(|erro| format!("leitura mapeada indisponível: {erro:?}"))?;
    let mut saida = Vec::with_capacity((largura * altura * 4) as usize);
    for linha in 0..altura as usize {
        let inicio = linha * alinhada as usize;
        let trecho = &dados[inicio..inicio + bytes_linha as usize];
        saida.extend(trecho.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])));
    }
    drop(dados);
    leitura.unmap();
    Ok(saida)
}

/// Uniforme de câmera e sol a partir da cena. Os campos de passe (tile, amostra, semente) ficam
/// zerados e são preenchidos em cada passe.
fn quadro_da_cena(cena: &Cena, largura: u32, altura: u32, raio_sol: f32) -> Result<Quadro, String> {
    let inversa = render_core::matematica::inverter(&cena.camera.matriz_vp())
        .ok_or("matriz da câmera não inverte")?;
    let mut inv_vp = [[0.0f32; 4]; 4];
    for (c, coluna) in inv_vp.iter_mut().enumerate() {
        for (r, valor) in coluna.iter_mut().enumerate() {
            *valor = inversa[c * 4 + r] as f32;
        }
    }
    let s = cena.sol.direcao();
    let (fundo, tem_fundo) = match cena.fundo {
        Some(cor) => ([cor[0] as f32, cor[1] as f32, cor[2] as f32], 1.0),
        None => ([0.0; 3], 0.0),
    };
    // Sol acima do horizonte: liga o disco e o halo do céu (modos 1 e 2). Como em `iluminacao.rs`
    // do motor, a intensidade fica zero quando o sol está abaixo.
    let sol_ativo = cena.sol.elevacao > 0.0 && cena.sol.intensidade > 0.0;
    let irradiancia = crate::ceu::para_buffer(&crate::ceu::irradiancia_sh(None));
    Ok(Quadro {
        inv_vp,
        sol: [s.x as f32, s.y as f32, s.z as f32, cena.sol.intensidade as f32],
        cor_sol: [COR_SOL[0], COR_SOL[1], COR_SOL[2], raio_sol],
        fundo: [fundo[0], fundo[1], fundo[2], tem_fundo],
        tile: [0; 4],
        dimensao: [largura, altura, 0, 0],
        modo: [1, u32::from(sol_ativo), Ceu::Motor as u32, 0],
        irradiancia,
        opcoes: [0; 4],
        textura: [0.0; 4],
    })
}
