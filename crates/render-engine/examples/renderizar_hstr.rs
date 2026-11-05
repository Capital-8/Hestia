//! Renderiza um arquivo HSTR em GPU nativa (MSAA x4, como `Motor::nativo`) e grava PNG.
//!
//! Uso: `cargo run --example renderizar_hstr -- <entrada.hstr> <saida.png> [largura altura]`.
//! Ferramenta de prova visual; não faz parte do caminho de produção.

use render_core::Cena;
use render_engine::{png_saida, Motor, Retangulo};

fn main() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        return Err("uso: renderizar_hstr <entrada.hstr> <saida.png> [largura altura]".into());
    }
    let largura: u32 = args.get(3).map_or(Ok(640), |v| v.parse()).map_err(|e| format!("{e}"))?;
    let altura: u32 = args.get(4).map_or(Ok(360), |v| v.parse()).map_err(|e| format!("{e}"))?;

    let bytes = std::fs::read(&args[1]).map_err(|e| e.to_string())?;
    let cena = Cena::decodificar(&bytes).map_err(|e| e.to_string())?;
    let motor = Motor::nativo().map_err(|e| e.to_string())?;
    let cena_gpu = motor.carregar_cena(&cena).map_err(|e| e.to_string())?;
    let rgba = motor
        .renderizar_regiao(
            &cena_gpu,
            &cena.camera,
            largura,
            altura,
            Retangulo { x: 0, y: 0, w: largura, h: altura },
            1.0,
        )
        .map_err(|e| e.to_string())?;
    let png = png_saida::codificar(&rgba, largura, altura).map_err(|e| e.to_string())?;
    std::fs::write(&args[2], png).map_err(|e| e.to_string())?;
    println!("gravado {} ({largura}x{altura}, adaptador: {})", args[2], motor.adaptador());
    Ok(())
}
