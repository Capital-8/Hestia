//! Prova das sombras em cascata: renderiza um HSTR com uma câmera explícita e grava PNG.
//!
//! Uso: `cargo run --release --example csm_prova -- <entrada.hstr> <saida.png> <largura> <altura> <amostras> [px py pz tx ty tz fov_y]`.
//! Sem a câmera, usa a do arquivo. Com ela, `(px,py,pz)` é o olho, `(tx,ty,tz)` o alvo (Z para cima)
//! e `fov_y` em graus. Imprime o tempo de `renderizar_regiao` e a caixa dos vértices.
//!
//! Ferramenta de prova visual (sombras em cascata); não faz parte do caminho de produção.

use render_core::camera::Camera;
use render_core::vetor::Vec3;
use render_core::Cena;
use render_engine::{png_saida, Motor, Retangulo};

fn numero(args: &[String], i: usize) -> Result<f64, String> {
    args.get(i)
        .ok_or_else(|| format!("falta o argumento {i}"))?
        .parse()
        .map_err(|e| format!("argumento {i}: {e}"))
}

fn main() -> Result<(), String> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 6 {
        return Err("uso: csm_prova <entrada.hstr> <saida.png> <largura> <altura> <amostras> [px py pz tx ty tz fov_y]".into());
    }
    let largura: u32 = args[3].parse().map_err(|e| format!("largura: {e}"))?;
    let altura: u32 = args[4].parse().map_err(|e| format!("altura: {e}"))?;
    let amostras: u32 = args[5].parse().map_err(|e| format!("amostras: {e}"))?;

    let bytes = std::fs::read(&args[1]).map_err(|e| e.to_string())?;
    let mut cena = Cena::decodificar(&bytes).map_err(|e| e.to_string())?;

    let mut minimo = [f64::MAX; 3];
    let mut maximo = [f64::MIN; 3];
    let mut casa_min = [f64::MAX; 3];
    let mut casa_max = [f64::MIN; 3];
    for p in cena.posicoes.chunks_exact(3) {
        if p[2] > 0.5 {
            for k in 0..3 {
                casa_min[k] = casa_min[k].min(p[k]);
                casa_max[k] = casa_max[k].max(p[k]);
            }
        }
        for k in 0..3 {
            minimo[k] = minimo[k].min(p[k]);
            maximo[k] = maximo[k].max(p[k]);
        }
    }
    println!("caixa dos vértices: min {minimo:?} max {maximo:?}");
    println!("caixa dos vértices acima de 0,5 m: min {casa_min:?} max {casa_max:?}");
    println!(
        "sol: azimute {:.2} elevação {:.2} intensidade {:.3}; câmera do arquivo: {:?}",
        cena.sol.azimute,
        cena.sol.elevacao,
        cena.sol.intensidade,
        cena.camera.posicao
    );

    if args.len() >= 13 {
        let olho = Vec3::novo(numero(&args, 6)?, numero(&args, 7)?, numero(&args, 8)?);
        let alvo = Vec3::novo(numero(&args, 9)?, numero(&args, 10)?, numero(&args, 11)?);
        let fov = numero(&args, 12)?;
        let camera = Camera::olhando_para(
            olho,
            alvo,
            Vec3::novo(0.0, 0.0, 1.0),
            fov.to_radians(),
            largura as f64 / altura as f64,
            0.05,
            1000.0,
        )
        .map_err(|e| format!("câmera inválida: {e}"))?;
        cena.atualizar_camera(camera).map_err(|e| format!("{e}"))?;
    }

    println!("camera: perto {} longe {}", cena.camera.perto, cena.camera.longe);
    let motor = Motor::nativo_com_amostras(amostras).map_err(|e| e.to_string())?;
    let inicio = std::time::Instant::now();
    let cena_gpu = motor.carregar_cena(&cena).map_err(|e| e.to_string())?;
    println!("carregar_cena: {:.1} ms", inicio.elapsed().as_secs_f64() * 1000.0);
    let regiao = Retangulo { x: 0, y: 0, w: largura, h: altura };
    // Duas chamadas com a mesma câmera: a primeira pode incluir a construção de sombra por câmera.
    let mut rgba = Vec::new();
    for rodada in 1..=2 {
        let inicio = std::time::Instant::now();
        rgba = motor
            .renderizar_regiao(&cena_gpu, &cena.camera, largura, altura, regiao, 1.0)
            .map_err(|e| e.to_string())?;
        println!("render{rodada} {largura}x{altura}: {:.1} ms", inicio.elapsed().as_secs_f64() * 1000.0);
    }
    match cena_gpu.cascatas() {
        Some(cascatas) => {
            for (k, c) in cascatas.iter().enumerate() {
                println!(
                    "cascata {k}: profundidade de visão {:.3}..{:.3} m, texel {:.5} m, volume da luz {:.2} m",
                    c.inicio, c.fim, c.texel_m, c.profundidade_m
                );
            }
        }
        None => println!("cascatas: nenhuma (Sol abaixo do horizonte)"),
    }
    let png = png_saida::codificar(&rgba, largura, altura).map_err(|e| e.to_string())?;
    std::fs::write(&args[2], png).map_err(|e| e.to_string())?;
    println!("gravado {}", args[2]);
    Ok(())
}
