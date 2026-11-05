//! Inicialização explícita do wgpu: nenhum fallback para CPU path tracer.
//!
//! Os backends pedidos são DX12, Vulkan e Metal (o que existir na plataforma). Se o único
//! adaptador for do tipo `Cpu`, o processo falha com mensagem clara, a menos que o operador
//! peça conscientemente um rasterizador de software com `RENDER_NATIVE_PERMITIR_CPU=1`.

use std::sync::Arc;

use crate::erro::ErroRender;

/// Dispositivo, fila e informações do adaptador escolhido.
pub struct Gpu {
    pub device: wgpu::Device,
    pub queue: wgpu::Queue,
    pub backend: wgpu::Backend,
    pub adaptador: String,
    pub tipo: wgpu::DeviceType,
}

/// Cria a instância e escolhe o melhor adaptador disponível.
pub fn iniciar() -> Result<Gpu, ErroRender> {
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
    .map_err(|erro| {
        ErroRender::Gpu(format!(
            "nenhum adaptador DX12/Vulkan/Metal disponível ({erro:?}). \
             Instale/atualize o driver da GPU; não existe fallback de CPU."
        ))
    })?;

    let info = adaptador.get_info();
    if info.device_type == wgpu::DeviceType::Cpu
        && std::env::var_os("RENDER_NATIVE_PERMITIR_CPU").is_none()
    {
        return Err(ErroRender::Gpu(format!(
            "o único adaptador é '{}' ({:?}), um rasterizador de software. \
             Defina RENDER_NATIVE_PERMITIR_CPU=1 para usá-lo conscientemente.",
            info.name, info.backend
        )));
    }

    let (device, queue) = pollster::block_on(adaptador.request_device(&wgpu::DeviceDescriptor {
        label: Some("render-native"),
        required_features: wgpu::Features::empty(),
        required_limits: adaptador.limits(),
        ..Default::default()
    }))
    .map_err(|erro| ErroRender::Gpu(format!("falha ao criar o dispositivo: {erro:?}")))?;

    device.on_uncaptured_error(Arc::new(|erro| {
        eprintln!("render-native: erro de validação da GPU: {erro}");
    }));

    Ok(Gpu {
        device,
        queue,
        backend: info.backend,
        adaptador: info.name,
        tipo: info.device_type,
    })
}
