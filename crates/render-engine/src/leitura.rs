//! Leitura da textura de cor para a memória e remoção do padding de linha do wgpu.

use std::sync::mpsc;

use crate::erro::ErroRender;
use crate::gpu::Gpu;

/// Alinhamento exigido por `copy_texture_to_buffer` no wgpu/WebGPU.
const ALINHAMENTO_LINHA: u32 = 256;

/// Copia a textura RGBA8 para um buffer mapeável e devolve linhas compactas.
pub fn ler_textura(
    gpu: &Gpu,
    textura: &wgpu::Texture,
    largura: u32,
    altura: u32,
) -> Result<Vec<u8>, ErroRender> {
    let device = &gpu.device;
    let linha_sem_padding = largura * 4;
    let linha_com_padding = linha_sem_padding.div_ceil(ALINHAMENTO_LINHA) * ALINHAMENTO_LINHA;
    let leitura = device.create_buffer(&wgpu::BufferDescriptor {
        label: Some("leitura RGBA8"),
        size: linha_com_padding as u64 * altura as u64,
        usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
        mapped_at_creation: false,
    });

    let mut codificador = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
        label: Some("cópia da textura"),
    });
    codificador.copy_texture_to_buffer(
        textura.as_image_copy(),
        wgpu::TexelCopyBufferInfo {
            buffer: &leitura,
            layout: wgpu::TexelCopyBufferLayout {
                offset: 0,
                bytes_per_row: Some(linha_com_padding),
                rows_per_image: Some(altura),
            },
        },
        wgpu::Extent3d {
            width: largura,
            height: altura,
            depth_or_array_layers: 1,
        },
    );
    gpu.queue.submit(Some(codificador.finish()));

    let (envio, recebimento) = mpsc::channel();
    leitura
        .slice(..)
        .map_async(wgpu::MapMode::Read, move |resultado| {
            let _ = envio.send(resultado);
        });
    device
        .poll(wgpu::PollType::wait_indefinitely())
        .map_err(|erro| ErroRender::Gpu(format!("espera da leitura: {erro}")))?;
    match recebimento.recv() {
        Ok(Ok(())) => {}
        Ok(Err(erro)) => {
            return Err(ErroRender::Gpu(format!(
                "mapeamento da textura falhou: {erro:?}"
            )))
        }
        Err(erro) => return Err(ErroRender::Gpu(format!("canal de leitura: {erro}"))),
    }

    let dados = leitura
        .slice(..)
        .get_mapped_range()
        .map_err(|erro| ErroRender::Gpu(format!("leitura mapeada indisponível: {erro:?}")))?;
    let mut rgba = Vec::with_capacity((largura * altura * 4) as usize);
    for linha in 0..altura as usize {
        let inicio = linha * linha_com_padding as usize;
        rgba.extend_from_slice(&dados[inicio..inicio + linha_sem_padding as usize]);
    }
    drop(dados);
    leitura.unmap();
    Ok(rgba)
}
