//! Renderiza um arquivo HSTR em GPU nativa e grava PNG.
//!
//! Uso: `cargo run --example renderizar_hstr -- <entrada.hstr> <saida.png> [largura altura [amostras [exposicao [temperatura]]]]`.
//! - `amostras`: 1 ou 4 (padrão 4, o mesmo de `Motor::nativo`), ou `auto`: perfil escolhido pelo
//!   adaptador (ou por `RENDER_PERFIL=leve|padrao|alta`), ver perfil.rs.
//! - `exposicao`: número em EV (padrão 0, multiplicador 2^EV) ou `auto` (exposição automática: uma
//!   passada de estimativa e uma final, ver `cor::exposicao_automatica`).
//! - `temperatura`: kelvin do balanço de branco, de 2000 a 20000 (padrão 6500, neutro).
//!
//! Ferramenta de prova visual; não faz parte do caminho de produção.

use render_core::Cena;
use render_engine::{cor, png_saida, Motor, Retangulo};

fn main() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        return Err("uso: renderizar_hstr <entrada.hstr> <saida.png> [largura altura [amostras [EV|auto [K]]]]".into());
    }
    let largura: u32 = args.get(3).map_or(Ok(640), |v| v.parse()).map_err(|e| format!("{e}"))?;
    let altura: u32 = args.get(4).map_or(Ok(360), |v| v.parse()).map_err(|e| format!("{e}"))?;
    let amostras_texto = args.get(5).map_or("4", String::as_str);
    let modo_exposicao = args.get(6).map_or("0", String::as_str);
    let temperatura: f64 = args.get(7).map_or(Ok(cor::TEMPERATURA_NEUTRA_K), |v| v.parse()).map_err(|e| format!("{e}"))?;

    let bytes = std::fs::read(&args[1]).map_err(|e| e.to_string())?;
    let cena = Cena::decodificar(&bytes).map_err(|e| e.to_string())?;
    let motor = if amostras_texto == "auto" {
        Motor::nativo_auto()
    } else {
        let amostras: u32 = amostras_texto.parse().map_err(|e| format!("{e}"))?;
        Motor::nativo_com_amostras(amostras)
    }
    .map_err(|e| e.to_string())?
    .com_temperatura(temperatura)
    .map_err(|e| e.to_string())?;
    println!(
        "perfil {} ({}), {} amostras, lado de tile {}, teto de textura {} px",
        motor.perfil().perfil.nome,
        motor.perfil().motivo,
        motor.amostras(),
        motor.perfil().perfil.lado_tile,
        motor.perfil().perfil.lado_maximo_textura
    );
    let cena_gpu = motor.carregar_cena(&cena).map_err(|e| e.to_string())?;
    println!("cena na GPU: {:.1} MiB de texturas", cena_gpu.bytes_texturas() as f64 / 1_048_576.0);
    let regiao = Retangulo { x: 0, y: 0, w: largura, h: altura };
    let renderizar = |exposicao: f64| {
        let inicio = std::time::Instant::now();
        let rgba = motor
            .renderizar_regiao(&cena_gpu, &cena.camera, largura, altura, regiao, exposicao)
            .map_err(|e| e.to_string());
        println!("render {largura}x{altura}: {:.0} ms", inicio.elapsed().as_secs_f64() * 1000.0);
        rgba
    };
    let (rgba, exposicao_usada) = if modo_exposicao == "auto" {
        let primeira = renderizar(1.0)?;
        let media = cor::luminancia_media_da_cena(&primeira);
        let exposicao = cor::exposicao_automatica(media);
        println!("exposição automática: luminância média estimada {media:.4}, EV {:.3}", exposicao.log2());
        (renderizar(exposicao)?, exposicao)
    } else {
        let ev: f64 = modo_exposicao.parse().map_err(|e| format!("exposição inválida: {e}"))?;
        let exposicao = 2f64.powf(ev);
        (renderizar(exposicao)?, exposicao)
    };
    let png = png_saida::codificar(&rgba, largura, altura).map_err(|e| e.to_string())?;
    std::fs::write(&args[2], png).map_err(|e| e.to_string())?;
    println!(
        "gravado {} ({largura}x{altura}, {} amostras, EV {:.3}, {temperatura} K, adaptador: {})",
        args[2],
        motor.amostras(),
        exposicao_usada.log2(),
        motor.adaptador()
    );
    Ok(())
}
