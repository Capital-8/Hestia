//! Codificação e gravação do PNG RGBA8 já renderizado.

use std::fs;
use std::path::Path;

use crate::erro::ErroRender;

/// Codifica `rgba` (sem padding) como PNG de 8 bits por canal, em memória.
pub fn codificar(rgba: &[u8], largura: u32, altura: u32) -> Result<Vec<u8>, ErroRender> {
    let esperado = (largura as usize)
        .checked_mul(altura as usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| ErroRender::Interno("dimensões do PNG transbordaram".into()))?;
    if rgba.len() != esperado {
        return Err(ErroRender::Interno(format!(
            "buffer RGBA com {} bytes; esperado {esperado} para {largura}x{altura}",
            rgba.len()
        )));
    }

    let mut saida = Vec::new();
    {
        let mut codificador = png::Encoder::new(&mut saida, largura, altura);
        codificador.set_color(png::ColorType::Rgba);
        codificador.set_depth(png::BitDepth::Eight);
        codificador.set_compression(png::Compression::Fast);
        let mut escritor = codificador
            .write_header()
            .map_err(|erro| ErroRender::Png(format!("cabeçalho: {erro}")))?;
        escritor
            .write_image_data(rgba)
            .map_err(|erro| ErroRender::Png(format!("dados: {erro}")))?;
        escritor
            .finish()
            .map_err(|erro| ErroRender::Png(format!("finalização: {erro}")))?;
    }
    Ok(saida)
}

/// Escreve `rgba` (sem padding) como PNG de 8 bits por canal.
pub fn gravar(caminho: &Path, rgba: &[u8], largura: u32, altura: u32) -> Result<(), ErroRender> {
    let bytes = codificar(rgba, largura, altura)?;
    fs::write(caminho, bytes).map_err(|fonte| ErroRender::Entrada {
        caminho: caminho.to_path_buf(),
        fonte,
    })
}
