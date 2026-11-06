//! Pipelines, layouts, texturas e buffers do renderizador.
//!
//! As pipelines são criadas uma vez por `Motor`; as cenas e as regiões só reusam esses objetos.

use std::mem::size_of;

use wgpu::util::DeviceExt;

use crate::constantes::{FORMATO_COR, FORMATO_NORMAIS, FORMATO_OCLUSAO, FORMATO_PROFUNDIDADE};
use crate::erro::ErroRender;
use crate::geometria::Vertice;
use crate::gpu::Gpu;

const ATRIBUTOS: [wgpu::VertexAttribute; 10] = wgpu::vertex_attr_array![
    0 => Float32x3, // posição
    1 => Float32x3, // normal de face
    2 => Float32x3, // cor base linear
    3 => Float32,   // rugosidade
    4 => Float32,   // metálico
    5 => Float32x3, // emissivo
    6 => Float32,   // tipo de superfície procedural (u8 como f32)
    7 => Float32,   // escala do padrão (metros por repetição)
    8 => Float32,   // opacidade do material (abaixo de 1: passe de vidro)
    9 => Uint32x4   // índices de textura: albedo, normal, rugosidade, metálico (0xFFFFFFFF = nenhum)
];

/// Layouts de bind group usados pelas pipelines.
pub struct Layouts {
    /// Só o uniforme (passe de sombra).
    pub uniforme: wgpu::BindGroupLayout,
    /// Uniforme, mapa de sombra, comparador, harmônicos do céu e oclusão (passe principal, grupo 0).
    pub principal: wgpu::BindGroupLayout,
    /// Texturas de material (passe principal, grupo 1): sampler no binding 0 e um `texture_2d_array`
    /// por mapa nos bindings 1 a 4 (albedo, normal, rugosidade, metálico). Cada camada é uma textura
    /// da cena no tamanho comum (ver texturas.rs). Mapa sem textura usa uma 1x1 branca de uma camada.
    pub texturas: wgpu::BindGroupLayout,
    /// Pré-passe de normais: uniforme (0) e uniforme extra da oclusão (5).
    pub pre: wgpu::BindGroupLayout,
    /// SSAO: uniforme extra (5) e pré-passe de normais e profundidade (6).
    pub ssao: wgpu::BindGroupLayout,
    /// Desfoque: uniforme extra (5), pré-passe (6) e oclusão bruta (7).
    pub desfoque: wgpu::BindGroupLayout,
    /// Vidro: uniforme (0), uniforme extra com a visão (5) e cópia da cor opaca da região (8).
    pub vidro: wgpu::BindGroupLayout,
}

/// Pipelines fixas do renderizador.
pub struct Pipelines {
    /// Céu de fundo em tela cheia, desenhado antes do opaco (mesmo layout do principal).
    pub ceu: wgpu::RenderPipeline,
    pub principal: wgpu::RenderPipeline,
    pub sombra: wgpu::RenderPipeline,
    /// Pré-passe de normais e profundidade (1 amostra, sem blend).
    pub pre: wgpu::RenderPipeline,
    /// SSAO em tela cheia.
    pub ssao: wgpu::RenderPipeline,
    /// Desfoque bilateral em tela cheia.
    pub desfoque: wgpu::RenderPipeline,
    /// Vidro: depois do opaco, lê a cópia da cor e não escreve profundidade.
    pub vidro: wgpu::RenderPipeline,
}

fn layout_atributos() -> wgpu::VertexBufferLayout<'static> {
    wgpu::VertexBufferLayout {
        array_stride: size_of::<Vertice>() as wgpu::BufferAddress,
        step_mode: wgpu::VertexStepMode::Vertex,
        attributes: &ATRIBUTOS,
    }
}

/// Cria uma textura 2D simples (uma camada, um mip) com `amostras` amostras por pixel
/// (1 para a textura comum e para o mapa de sombra; 4 para o alvo multiamostra do MSAA).
pub fn criar_textura(
    device: &wgpu::Device,
    rotulo: &str,
    largura: u32,
    altura: u32,
    formato: wgpu::TextureFormat,
    uso: wgpu::TextureUsages,
    amostras: u32,
) -> wgpu::Texture {
    device.create_texture(&wgpu::TextureDescriptor {
        label: Some(rotulo),
        size: wgpu::Extent3d {
            width: largura,
            height: altura,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: amostras,
        dimension: wgpu::TextureDimension::D2,
        format: formato,
        usage: uso,
        view_formats: &[],
    })
}

/// Cria os layouts de bind group (uma vez por dispositivo).
pub fn criar_layouts(device: &wgpu::Device) -> Layouts {
    let uniforme = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("uniforme"),
        entries: &[wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::VERTEX,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform,
                has_dynamic_offset: false,
                min_binding_size: None,
            },
            count: None,
        }],
    });

    let principal = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("uniforme + sombra"),
        entries: &[
            wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 1,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Texture {
                    sample_type: wgpu::TextureSampleType::Depth,
                    view_dimension: wgpu::TextureViewDimension::D2,
                    multisampled: false,
                },
                count: None,
            },
            wgpu::BindGroupLayoutEntry {
                binding: 2,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Comparison),
                count: None,
            },
            // Harmônicos esféricos (SH9) da irradiância do céu: array<vec4<f32>, 9>.
            wgpu::BindGroupLayoutEntry {
                binding: 3,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            },
            // Oclusão ambiente da região (R8, lida com textureLoad: sem sampler).
            entrada_textura(4),
        ],
    });

    // Grupo 1 das texturas: o sampler no binding 0 e um array de texturas por mapa nos bindings
    // 1..=4 (albedo, normal, rugosidade, metálico). Sem limite de slots: as camadas ficam no array.
    let mut entradas_texturas = vec![wgpu::BindGroupLayoutEntry {
        binding: 0,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
        count: None,
    }];
    for mapa in 0..crate::texturas::MAPAS as u32 {
        entradas_texturas.push(wgpu::BindGroupLayoutEntry {
            binding: 1 + mapa,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Texture {
                sample_type: wgpu::TextureSampleType::Float { filterable: true },
                view_dimension: wgpu::TextureViewDimension::D2Array,
                multisampled: false,
            },
            count: None,
        });
    }
    let texturas = criar_layout(device, "texturas de material", &entradas_texturas);

    let pre = criar_layout(
        device,
        "pré-passe de normais",
        &[
            entrada_uniforme(0, wgpu::ShaderStages::VERTEX_FRAGMENT),
            entrada_uniforme(5, wgpu::ShaderStages::FRAGMENT),
        ],
    );
    let ssao = criar_layout(
        device,
        "SSAO",
        &[
            entrada_uniforme(5, wgpu::ShaderStages::FRAGMENT),
            entrada_textura(6),
        ],
    );
    let desfoque = criar_layout(
        device,
        "desfoque da oclusão",
        &[
            entrada_uniforme(5, wgpu::ShaderStages::FRAGMENT),
            entrada_textura(6),
            entrada_textura(7),
        ],
    );
    let vidro = criar_layout(
        device,
        "vidro",
        &[
            entrada_uniforme(0, wgpu::ShaderStages::VERTEX_FRAGMENT),
            entrada_uniforme(5, wgpu::ShaderStages::FRAGMENT),
            entrada_textura(8),
        ],
    );

    Layouts {
        uniforme,
        principal,
        texturas,
        pre,
        ssao,
        desfoque,
        vidro,
    }
}

fn entrada_uniforme(binding: u32, visibility: wgpu::ShaderStages) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility,
        ty: wgpu::BindingType::Buffer {
            ty: wgpu::BufferBindingType::Uniform,
            has_dynamic_offset: false,
            min_binding_size: None,
        },
        count: None,
    }
}

/// Textura de float lida por `textureLoad` (sem filtro e sem sampler).
fn entrada_textura(binding: u32) -> wgpu::BindGroupLayoutEntry {
    wgpu::BindGroupLayoutEntry {
        binding,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Texture {
            sample_type: wgpu::TextureSampleType::Float { filterable: false },
            view_dimension: wgpu::TextureViewDimension::D2,
            multisampled: false,
        },
        count: None,
    }
}

fn criar_layout(
    device: &wgpu::Device,
    rotulo: &str,
    entradas: &[wgpu::BindGroupLayoutEntry],
) -> wgpu::BindGroupLayout {
    device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some(rotulo),
        entries: entradas,
    })
}

/// Cria as duas pipelines (sombra e principal) a partir do shader WGSL.
///
/// A principal usa `amostras` (1 ou 4, validado pelo `Motor`); a da sombra fica sempre com 1,
/// porque o mapa de sombra nao usa MSAA.
pub fn criar_pipelines(gpu: &Gpu, layouts: &Layouts, amostras: u32) -> Pipelines {
    let device = &gpu.device;
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("pbr com sombra direcional"),
        source: wgpu::ShaderSource::Wgsl(include_str!("shader.wgsl").into()),
    });

    let layout_sombra = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("layout da sombra"),
        bind_group_layouts: &[Some(&layouts.uniforme)],
        immediate_size: 0,
    });
    let layout_principal = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("layout principal"),
        bind_group_layouts: &[Some(&layouts.principal), Some(&layouts.texturas)],
        immediate_size: 0,
    });
    let layout_pre = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("layout do pré-passe"),
        bind_group_layouts: &[Some(&layouts.pre)],
        immediate_size: 0,
    });
    let layout_ssao = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("layout do SSAO"),
        bind_group_layouts: &[Some(&layouts.ssao)],
        immediate_size: 0,
    });
    let layout_desfoque = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("layout do desfoque"),
        bind_group_layouts: &[Some(&layouts.desfoque)],
        immediate_size: 0,
    });
    let layout_vidro = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("layout do vidro"),
        bind_group_layouts: &[Some(&layouts.vidro)],
        immediate_size: 0,
    });

    let primitiva = wgpu::PrimitiveState {
        topology: wgpu::PrimitiveTopology::TriangleList,
        strip_index_format: None,
        front_face: wgpu::FrontFace::Ccw,
        // A malha exportada pode ter enrolamento irregular; sem culling não somem paredes.
        cull_mode: None,
        unclipped_depth: false,
        polygon_mode: wgpu::PolygonMode::Fill,
        conservative: false,
    };
    let multisample_sombra = wgpu::MultisampleState::default();
    let multisample_principal = wgpu::MultisampleState {
        count: amostras,
        ..Default::default()
    };

    let sombra = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("sombra direcional"),
        layout: Some(&layout_sombra),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_sombra"),
            compilation_options: Default::default(),
            buffers: &[Some(layout_atributos())],
        },
        primitive: primitiva,
        depth_stencil: Some(wgpu::DepthStencilState {
            format: FORMATO_PROFUNDIDADE,
            depth_write_enabled: Some(true),
            depth_compare: Some(wgpu::CompareFunction::LessEqual),
            stencil: wgpu::StencilState::default(),
            bias: wgpu::DepthBiasState {
                constant: 2,
                slope_scale: 2.0,
                clamp: 0.0,
            },
        }),
        multisample: multisample_sombra,
        fragment: None,
        multiview_mask: None,
        cache: None,
    });

    let principal = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("pbr principal"),
        layout: Some(&layout_principal),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_principal"),
            compilation_options: Default::default(),
            buffers: &[Some(layout_atributos())],
        },
        primitive: primitiva,
        depth_stencil: Some(wgpu::DepthStencilState {
            format: FORMATO_PROFUNDIDADE,
            depth_write_enabled: Some(true),
            depth_compare: Some(wgpu::CompareFunction::LessEqual),
            stencil: wgpu::StencilState::default(),
            bias: wgpu::DepthBiasState::default(),
        }),
        multisample: multisample_principal,
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_principal"),
            compilation_options: Default::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format: FORMATO_COR,
                blend: None,
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        multiview_mask: None,
        cache: None,
    });

    // Céu de fundo: triângulo em tela cheia, sem vértices. Não lê nem escreve profundidade (o opaco
    // desenhado depois sobrescreve o céu onde há geometria), mas tem as mesmas amostras do principal.
    let ceu = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("céu de fundo"),
        layout: Some(&layout_principal),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_ceu"),
            compilation_options: Default::default(),
            buffers: &[],
        },
        primitive: primitiva,
        depth_stencil: Some(wgpu::DepthStencilState {
            format: FORMATO_PROFUNDIDADE,
            depth_write_enabled: Some(false),
            depth_compare: Some(wgpu::CompareFunction::Always),
            stencil: wgpu::StencilState::default(),
            bias: wgpu::DepthBiasState::default(),
        }),
        multisample: multisample_principal,
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_ceu"),
            compilation_options: Default::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format: FORMATO_COR,
                blend: None,
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        multiview_mask: None,
        cache: None,
    });

    // Vidro: mesma geometria e mesmo viewport do principal, com as mesmas amostras. Escreve a
    // cor inteira (sem blend: o fundo refratado já entra na conta) e não escreve profundidade,
    // para o vidro não tapar o vidro atrás dele. O teste LessEqual usa a profundidade do opaco.
    let vidro = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("vidro"),
        layout: Some(&layout_vidro),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_principal"),
            compilation_options: Default::default(),
            buffers: &[Some(layout_atributos())],
        },
        primitive: primitiva,
        depth_stencil: Some(wgpu::DepthStencilState {
            format: FORMATO_PROFUNDIDADE,
            depth_write_enabled: Some(false),
            depth_compare: Some(wgpu::CompareFunction::LessEqual),
            stencil: wgpu::StencilState::default(),
            bias: wgpu::DepthBiasState::default(),
        }),
        multisample: multisample_principal,
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_vidro"),
            compilation_options: Default::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format: FORMATO_COR,
                blend: None,
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        multiview_mask: None,
        cache: None,
    });

    // Pré-passe: mesma geometria e mesma profundidade do principal, sem MSAA e sem blend.
    let pre = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("pré-passe de normais"),
        layout: Some(&layout_pre),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_principal"),
            compilation_options: Default::default(),
            buffers: &[Some(layout_atributos())],
        },
        primitive: primitiva,
        depth_stencil: Some(wgpu::DepthStencilState {
            format: FORMATO_PROFUNDIDADE,
            depth_write_enabled: Some(true),
            depth_compare: Some(wgpu::CompareFunction::LessEqual),
            stencil: wgpu::StencilState::default(),
            bias: wgpu::DepthBiasState::default(),
        }),
        multisample: wgpu::MultisampleState::default(),
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_normais"),
            compilation_options: Default::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format: FORMATO_NORMAIS,
                blend: None,
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        multiview_mask: None,
        cache: None,
    });

    let ssao = criar_pipeline_tela_cheia(device, &shader, &layout_ssao, "SSAO", "fs_ssao");
    let desfoque = criar_pipeline_tela_cheia(
        device,
        &shader,
        &layout_desfoque,
        "desfoque da oclusão",
        "fs_desfoque",
    );

    Pipelines {
        ceu,
        principal,
        sombra,
        pre,
        ssao,
        desfoque,
        vidro,
    }
}

/// Pipeline de tela cheia (triângulo sem buffer de vértices) que grava a oclusão de 1 canal.
fn criar_pipeline_tela_cheia(
    device: &wgpu::Device,
    shader: &wgpu::ShaderModule,
    layout: &wgpu::PipelineLayout,
    rotulo: &str,
    fragmento: &str,
) -> wgpu::RenderPipeline {
    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some(rotulo),
        layout: Some(layout),
        vertex: wgpu::VertexState {
            module: shader,
            entry_point: Some("vs_tela_cheia"),
            compilation_options: Default::default(),
            buffers: &[],
        },
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            strip_index_format: None,
            front_face: wgpu::FrontFace::Ccw,
            cull_mode: None,
            unclipped_depth: false,
            polygon_mode: wgpu::PolygonMode::Fill,
            conservative: false,
        },
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        fragment: Some(wgpu::FragmentState {
            module: shader,
            entry_point: Some(fragmento),
            compilation_options: Default::default(),
            targets: &[Some(wgpu::ColorTargetState {
                format: FORMATO_OCLUSAO,
                blend: None,
                write_mask: wgpu::ColorWrites::ALL,
            })],
        }),
        multiview_mask: None,
        cache: None,
    })
}

/// Cria um vertex buffer com a malha expandida.
pub fn criar_vertex_buffer(device: &wgpu::Device, vertices: &[Vertice]) -> wgpu::Buffer {
    device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("vértices da cena"),
        contents: bytemuck::cast_slice(vertices),
        usage: wgpu::BufferUsages::VERTEX,
    })
}

/// Garante que o limite de textura cobre a resolução e o mapa de sombra.
pub fn validar_limite_textura(
    gpu: &Gpu,
    largura: u32,
    altura: u32,
    lado_sombra: u32,
) -> Result<(), ErroRender> {
    let limite = gpu.device.limits().max_texture_dimension_2d;
    if limite < lado_sombra.max(largura).max(altura) {
        return Err(ErroRender::Gpu(format!(
            "limite de textura 2D da GPU ({limite}) é menor que o necessário \
             ({largura}x{altura} / sombra {lado_sombra})"
        )));
    }
    Ok(())
}
