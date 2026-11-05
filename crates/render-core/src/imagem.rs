//! Codificação PNG do quadro renderizado.
//!
//! Usa o crate `png` (puro Rust). O PNG é usado para testes nativos e para a imagem still; a ABI
//! do wasm entrega RGBA cru para o `RustFrameSource`/`createImageBitmap` não precisar decodificar
//! PNG em produção.

use crate::erro::Erro;

pub fn codificar_png(largura: u32, altura: u32, rgba: &[u8]) -> Result<Vec<u8>, Erro> {
    let esperado = (largura as usize)
        .checked_mul(altura as usize)
        .and_then(|n| n.checked_mul(4))
        .ok_or(Erro::TrabalhoInvalido)?;
    if largura == 0 || altura == 0 || rgba.len() != esperado {
        return Err(Erro::TrabalhoInvalido);
    }

    let mut saida = Vec::new();
    {
        let mut codificador = png::Encoder::new(&mut saida, largura, altura);
        codificador.set_color(png::ColorType::Rgba);
        codificador.set_depth(png::BitDepth::Eight);
        // `Fast` é suficiente para previews e mantém o artefato pequeno e o render rápido.
        codificador.set_compression(png::Compression::Fast);
        let mut escritor = codificador.write_header().map_err(|_| Erro::Interno)?;
        escritor.write_image_data(rgba).map_err(|_| Erro::Interno)?;
    }
    Ok(saida)
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn assinatura_e_dimensao() {
        let rgba = vec![128u8; 4 * 4 * 3];
        let png = codificar_png(4, 3, &rgba).expect("png");
        assert!(png.starts_with(b"\x89PNG\r\n\x1a\n"));
        let leitor = png::Decoder::new(std::io::Cursor::new(&png))
            .read_info()
            .expect("info");
        assert_eq!(leitor.info().width, 4);
        assert_eq!(leitor.info().height, 3);
    }

    #[test]
    fn tamanho_incompativel_e_recusado() {
        assert_eq!(
            codificar_png(2, 2, &[0; 3]).err(),
            Some(Erro::TrabalhoInvalido)
        );
    }
}
