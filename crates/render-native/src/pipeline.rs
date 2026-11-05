//! Pipelines, bind groups, texturas e o vertex buffer do renderizador.

use std::mem::size_of;

use render_core::cena::Cena;
use wgpu::util::DeviceExt;

use crate::constantes::{FORMATO_COR, FORMATO_PROFUNDIDADE, LADO_SOMBRA};
use crate::erro::ErroRender;
use crate::geometria::Vertice;
use crate::gpu::Gpu;
use crate::iluminacao::montar_uniformes;

const ATRIBUTOS: [wgpu::VertexAttribute; 6] = wgpu::vertex_attr_array![
    0 => Float32x3, // posição
    1 => Float32x3, // normal de face
    2 => Float32x3, // cor base linear
    3 => Float32,   // rugosidade
    4 => Float32,   // metálico
    5 => Float32x3  // emissivo
];

/// Estruturas de GPU reutilizadas pelos dois passes.
pub struct Recursos {
    pub pipeline_principal: wgpu::RenderPipeline,
    pub pipeline_sombra: wgpu::RenderPipeline,
    pub grupo_principal: wgpu::BindGroup,
    pub grupo_sombra: wgpu::BindGroup,
    pub uniformes: wgpu::Buffer,
    pub vertex_buffer: wgpu::Buffer,
    pub n_vertices: u32,
}

fn layout_atributos() -> wgpu::VertexBufferLayout<'static> {
    wgpu::VertexBufferLayout {
        array_stride: size_of::<Vertice>() as wgpu::BufferAddress,
        step_mode: wgpu::VertexStepMode::Vertex,
        attributes: &ATRIBUTOS,
    }
}

/// Cria uma textura 2D simples (uma camada, um mip).
pub fn criar_textura(
    device: &wgpu::Device,
    rotulo: &str,
    largura: u32,
    altura: u32,
    formato: wgpu::TextureFormat,
    uso: wgpu::TextureUsages,
) -> wgpu::Texture {
    device.create_texture(&wgpu::TextureDescriptor {
        label: Some(rotulo),
        size: wgpu::Extent3d {
            width: largura,
            height: altura,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: formato,
        usage: uso,
        view_formats: &[],
    })
}

fn criar_pipelines(
    gpu: &Gpu,
    grupo_sombra: &wgpu::BindGroupLayout,
    grupo_principal: &wgpu::BindGroupLayout,
) -> (wgpu::RenderPipeline, wgpu::RenderPipeline) {
    let device = &gpu.device;
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("pbr com sombra direcional"),
        source: wgpu::ShaderSource::Wgsl(include_str!("shader.wgsl").into()),
    });

    let layout_sombra = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("layout da sombra"),
        bind_group_layouts: &[Some(grupo_sombra)],
        immediate_size: 0,
    });
    let layout_principal = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("layout principal"),
        bind_group_layouts: &[Some(grupo_principal)],
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
    let multisample = wgpu::MultisampleState::default();

    let pipeline_sombra = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
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
        multisample,
        fragment: None,
        multiview_mask: None,
        cache: None,
    });

    let pipeline_principal = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
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
        multisample,
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

    (pipeline_principal, pipeline_sombra)
}

/// Cria buffers, layouts, bind groups e pipelines para uma cena já expandida.
#[allow(clippy::too_many_arguments)] // parâmetros de GPU/pipeline são explícitos e sem estado global
pub fn criar_recursos(
    gpu: &Gpu,
    cena: &Cena,
    camera: &render_core::camera::Camera,
    vertices: &[Vertice],
    largura: u32,
    altura: u32,
    raio: f64,
    exposicao: f64,
    sombra_view: &wgpu::TextureView,
) -> Result<Recursos, ErroRender> {
    let device = &gpu.device;
    let buffer_vertices = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("vértices da cena"),
        contents: bytemuck::cast_slice(vertices),
        usage: wgpu::BufferUsages::VERTEX,
    });

    let uniformes = montar_uniformes(cena, camera, largura, altura, raio, exposicao);
    let buffer_uniformes = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("uniformes"),
        contents: bytemuck::bytes_of(&uniformes),
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
    });

    let layout_uniforme = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
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

    let layout_principal = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
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
        ],
    });

    let comparador = device.create_sampler(&wgpu::SamplerDescriptor {
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

    let grupo_sombra = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("grupo da sombra"),
        layout: &layout_uniforme,
        entries: &[wgpu::BindGroupEntry {
            binding: 0,
            resource: buffer_uniformes.as_entire_binding(),
        }],
    });
    let grupo_principal = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: Some("grupo principal"),
        layout: &layout_principal,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: buffer_uniformes.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: wgpu::BindingResource::TextureView(sombra_view),
            },
            wgpu::BindGroupEntry {
                binding: 2,
                resource: wgpu::BindingResource::Sampler(&comparador),
            },
        ],
    });

    let (pipeline_principal, pipeline_sombra) =
        criar_pipelines(gpu, &layout_uniforme, &layout_principal);

    Ok(Recursos {
        pipeline_principal,
        pipeline_sombra,
        grupo_principal,
        grupo_sombra,
        uniformes: buffer_uniformes,
        vertex_buffer: buffer_vertices,
        n_vertices: vertices.len() as u32,
    })
}

/// Garante que o limite de textura cobre a resolução e o mapa de sombra.
pub fn validar_limite_textura(gpu: &Gpu, largura: u32, altura: u32) -> Result<(), ErroRender> {
    let limite = gpu.device.limits().max_texture_dimension_2d;
    if limite < LADO_SOMBRA.max(largura).max(altura) {
        return Err(ErroRender::Gpu(format!(
            "limite de textura 2D da GPU ({limite}) é menor que o necessário \
             ({largura}x{altura} / sombra {LADO_SOMBRA})"
        )));
    }
    Ok(())
}
