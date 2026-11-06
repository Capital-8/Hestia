//! Estatística da amostragem por cosseno: para densidade cos θ / π, E[cos θ] = 2/3.
//!
//! 100 mil amostras com o hash PCG do próprio protótipo (determinístico), tolerância 0,01.

use render_pt0::amostragem::{cosseno_local, pcg, uniforme};

#[test]
fn media_do_cosseno_e_dois_terços() {
    let mut estado = pcg(0x1234_5678);
    let n = 100_000u32;
    let mut soma = 0.0f64;
    for _ in 0..n {
        let u1 = uniforme(&mut estado);
        let u2 = uniforme(&mut estado);
        soma += f64::from(cosseno_local(u1, u2)[2]);
    }
    let media = soma / f64::from(n);
    assert!(
        (media - 2.0 / 3.0).abs() < 0.01,
        "média de cos θ = {media:.5}, esperado 0,6667 ± 0,01"
    );
}

#[test]
fn media_do_cosseno_sem_o_hash_tambem_bate() {
    // Controle: uma sequência uniforme simples (contador) dá o mesmo resultado com 100 mil pontos.
    let n = 100_000u32;
    let mut soma = 0.0f64;
    for i in 0..n {
        let u1 = (i as f32 + 0.5) / n as f32;
        let u2 = ((i as u64 * 2_654_435_761u64) % 1_000_003) as f32 / 1_000_003.0;
        soma += f64::from(cosseno_local(u1, u2)[2]);
    }
    let media = soma / f64::from(n);
    assert!((media - 2.0 / 3.0).abs() < 0.01, "média de cos θ = {media:.5}");
}
