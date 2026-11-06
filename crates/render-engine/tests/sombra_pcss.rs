//! Integração da sombra PCSS: a cena H1 renderizada não fica preta nem estourada.
//!
//! Exige GPU nativa, como os demais testes de `Motor`.

use render_core::Cena;
use render_engine::{Motor, Retangulo};

const CENA: &[u8] = include_bytes!("fixtures/cena-h1.hstr");

#[test]
fn imagem_com_sombra_pcss_nao_e_preta_e_tem_luminancia_razoavel() {
    let cena = Cena::decodificar(CENA).expect("fixture HSTR válido");
    let motor = Motor::nativo_com_amostras(1).expect("GPU nativa necessária para este teste");
    let cena_gpu = motor.carregar_cena(&cena).expect("carregar cena");
    let (largura, altura) = (640u32, 360u32);
    let rgba = motor
        .renderizar_regiao(
            &cena_gpu,
            &cena.camera,
            largura,
            altura,
            Retangulo { x: 0, y: 0, w: largura, h: altura },
            1.0,
        )
        .expect("renderizar");

    let soma: f64 = rgba
        .chunks_exact(4)
        .map(|p| 0.2126 * p[0] as f64 + 0.7152 * p[1] as f64 + 0.0722 * p[2] as f64)
        .sum();
    let media = soma / (largura * altura) as f64;
    eprintln!("[pcss] luminância média = {media:.3}");
    assert!(rgba.chunks_exact(4).any(|p| p[0] > 0 || p[1] > 0 || p[2] > 0), "imagem preta");
    assert!(media > 10.0 && media < 245.0, "luminância média {media} fora de (10, 245)");
}

#[test]
fn sombra_em_cascata_existe_depois_do_render_e_texel_cresce_com_a_distancia() {
    let cena = Cena::decodificar(CENA).expect("fixture HSTR válido");
    let motor = Motor::nativo_com_amostras(1).expect("GPU nativa necessária para este teste");
    let cena_gpu = motor.carregar_cena(&cena).expect("carregar cena");
    assert!(cena_gpu.cascatas().is_none(), "nenhuma cascata antes do primeiro render");
    let (largura, altura) = (320u32, 180u32);
    motor
        .renderizar_regiao(
            &cena_gpu,
            &cena.camera,
            largura,
            altura,
            Retangulo { x: 0, y: 0, w: largura, h: altura },
            1.0,
        )
        .expect("renderizar");
    let cascatas = cena_gpu.cascatas().expect("cascatas calculadas pelo render com Sol");
    assert_eq!(cascatas.len(), render_engine::cascatas::NUMERO_CASCATAS);
    for par in cascatas.windows(2) {
        assert!(par[0].texel_m <= par[1].texel_m + 1.0e-12, "texel {:?} > {:?}", par[0], par[1]);
        assert!(par[0].fim <= par[1].fim + 1.0e-9, "intervalos fora de ordem");
    }
}

#[test]
fn sol_abaixo_do_horizonte_renderiza_sem_passe_de_sombra() {
    let mut cena = Cena::decodificar(CENA).expect("fixture HSTR válido");
    cena.atualizar_sol(render_core::cena::Sol {
        azimute: 40.0,
        elevacao: -10.0,
        intensidade: 1.0,
    })
    .expect("sol válido");
    let motor = Motor::nativo_com_amostras(1).expect("GPU nativa necessária para este teste");
    let cena_gpu = motor.carregar_cena(&cena).expect("carregar cena");
    let (largura, altura) = (320u32, 180u32);
    let rgba = motor
        .renderizar_regiao(
            &cena_gpu,
            &cena.camera,
            largura,
            altura,
            Retangulo { x: 0, y: 0, w: largura, h: altura },
            1.0,
        )
        .expect("renderizar");
    assert!(cena_gpu.cascatas().is_none(), "com o Sol abaixo do horizonte não há cascatas");
    assert!(rgba.chunks_exact(4).any(|p| p[0] > 0 || p[1] > 0 || p[2] > 0), "imagem preta");
}
