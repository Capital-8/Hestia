//! Gera uma cena HSTR v3 com texturas de material: lê uma cena (v1, v2 ou v3), carrega PNGs RGBA8,
//! gera a cadeia de mips por média 2x2 e atribui os índices de textura aos materiais.
//!
//! Uso: `cargo run --example gerar_cena_texturas -- <entrada.hstr> <saida.hstr> <material=albedo,normal,rugosidade,metalico>...`
//! Cada canal é um caminho de PNG RGBA8 ou `-` para nenhum. Ferramenta de prova visual; não faz
//! parte do caminho de produção (a produção exporta a cena pelo TypeScript).

use std::collections::HashMap;
use std::io::Cursor;

use render_core::cena::{Cena, Textura};

/// Lê um PNG RGBA8 e devolve (largura, altura, pixels).
fn ler_png_rgba(caminho: &str) -> Result<(u32, u32, Vec<u8>), String> {
    let bytes = std::fs::read(caminho).map_err(|e| format!("{caminho}: {e}"))?;
    let mut leitor = png::Decoder::new(Cursor::new(bytes))
        .read_info()
        .map_err(|e| format!("{caminho}: {e}"))?;
    let mut buffer = vec![0; leitor.output_buffer_size()];
    let info = leitor
        .next_frame(&mut buffer)
        .map_err(|e| format!("{caminho}: {e}"))?;
    if info.color_type != png::ColorType::Rgba || info.bit_depth != png::BitDepth::Eight {
        return Err(format!("{caminho}: é preciso PNG RGBA de 8 bits"));
    }
    Ok((info.width, info.height, buffer[..info.buffer_size()].to_vec()))
}

/// Cadeia completa de mips a partir do nível 0 (média de blocos 2x2, com a borda repetida).
fn com_mips(largura: u32, altura: u32, base: Vec<u8>) -> Textura {
    let mut niveis = vec![base];
    for nivel in 1..Textura::niveis_completos(largura, altura) {
        let (w0, h0) = Textura::dimensoes_do_nivel(largura, altura, nivel - 1);
        let (w1, h1) = Textura::dimensoes_do_nivel(largura, altura, nivel);
        let proximo = {
            let anterior = &niveis[(nivel - 1) as usize];
            let mut saida = vec![0u8; (w1 * h1 * 4) as usize];
            for y in 0..h1 {
                for x in 0..w1 {
                    for c in 0..4u32 {
                        let mut soma = 0u32;
                        for (dx, dy) in [(0, 0), (1, 0), (0, 1), (1, 1)] {
                            let sx = (2 * x + dx).min(w0 - 1);
                            let sy = (2 * y + dy).min(h0 - 1);
                            soma += u32::from(anterior[((sy * w0 + sx) * 4 + c) as usize]);
                        }
                        saida[((y * w1 + x) * 4 + c) as usize] = ((soma + 2) / 4) as u8;
                    }
                }
            }
            saida
        };
        niveis.push(proximo);
    }
    Textura {
        largura,
        altura,
        niveis,
    }
}

fn main() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        return Err(
            "uso: gerar_cena_texturas <entrada.hstr> <saida.hstr> <material=albedo,normal,rugosidade,metalico>..."
                .into(),
        );
    }
    let bytes = std::fs::read(&args[1]).map_err(|e| format!("{}: {e}", args[1]))?;
    let mut cena = Cena::decodificar(&bytes).map_err(|e| e.to_string())?;

    // Cada PNG entra uma vez na cena, mesmo que seja usado por mais de um material.
    let mut indice_por_caminho: HashMap<String, u32> = HashMap::new();
    for atribuicao in &args[3..] {
        let (material, canais) = atribuicao
            .split_once('=')
            .ok_or_else(|| format!("atribuição '{atribuicao}' sem '='"))?;
        let material: usize = material
            .parse()
            .map_err(|e| format!("material '{material}': {e}"))?;
        let mut texturas_do_material = [None; 4];
        for (canal, caminho) in canais.split(',').enumerate().take(4) {
            if caminho.is_empty() || caminho == "-" {
                continue;
            }
            let indice = match indice_por_caminho.get(caminho) {
                Some(&indice) => indice,
                None => {
                    let (largura, altura, pixels) = ler_png_rgba(caminho)?;
                    let indice = cena.texturas.len() as u32;
                    cena.texturas.push(com_mips(largura, altura, pixels));
                    indice_por_caminho.insert(caminho.to_string(), indice);
                    indice
                }
            };
            texturas_do_material[canal] = Some(indice);
        }
        let destino = cena
            .materiais
            .get_mut(material)
            .ok_or_else(|| format!("material {material} não existe na cena"))?;
        destino.texturas = texturas_do_material;
    }

    let saida = cena.codificar();
    std::fs::write(&args[2], &saida).map_err(|e| format!("{}: {e}", args[2]))?;
    let versao = u32::from_le_bytes([saida[4], saida[5], saida[6], saida[7]]);
    println!(
        "gravado {} (HSTR v{versao}, {} texturas)",
        args[2],
        cena.texturas.len()
    );
    Ok(())
}
