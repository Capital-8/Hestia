//! Ficha terreno/talude-breakline: o pé do talude (onde o talude encontra E) não pode sair serrilhado. A malha proposta tem de reproduzir `zP` com erro de
//! no máximo 1 cm ao longo do pé; 1 cm é a precisão de obra de uma cota de terraplenagem e fica abaixo do dente de serra de ~10 cm do passo da grade.

use crate::terreno_fixture::{cena_com, RegiaoFx, TerrenoFx, t2};
use crate::terreno_testes::cotas;

/// Rampa E = 10,25 + 0,1·x; região nivelada (5,5)–(15,15), cota 8,1, talude de corte 1. A oeste, `zP(x) = min(10,25 + 0,1x; 8,1 + (5 − x))`: o pé fica em
/// x = 2,85/1,1 = 2,5909…, z = 10,5091…, fora da grade de 0,25 m.
#[test]
fn pe_do_talude_sem_serrilhado() {
    let r = RegiaoFx { talude_corte: 1.0, ..RegiaoFx::quadrado(1, 2, 5.0, 5.0, 10.0, 8.1) };
    let mut cena = cena_com(&[TerrenoFx { regioes: vec![r], ..t2(1) }]);
    // (x, zP literal) para y em 7,13, 9,9 e 12,37 (nearest = lado oeste).
    let casos = [(2.0, 10.45), (2.3, 10.48), (2.55, 10.505), (2.59, 10.509), (2.6, 10.5), (2.65, 10.45), (2.7, 10.4), (2.9, 10.2), (3.4, 9.7)];
    let mut pontos = Vec::new();
    for y in [7.13, 9.9, 12.37] {
        for c in casos {
            pontos.push([c.0, y]);
        }
    }
    let z = cotas(&mut cena, &pontos, 1);
    let mut pior: f64 = 0.0;
    for k in 0..pontos.len() {
        let esperado = casos[k % casos.len()].1;
        pior = pior.max((z[k].1 - esperado).abs());
    }
    assert!(pior <= 0.01, "erro máximo no pé do talude {pior}");
}
