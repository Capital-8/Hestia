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

// ---- Caracterização do encaixe do talude na topografia (ficha malha-terreno) ----
//
// Referência: `zP` ideal, isto é, `aplicar` com alcance infinito sobre E exata. O erro medido é `|P(p) − zP_ref(p)|` em pontos de uma grade fina em volta das
// regiões (fora da parede vertical de 1 cm), o que acusa pé de talude em degrau, alcance curto e vinco serrilhado.

use crate::geo2d::v;
use crate::esquema::ID_AUSENTE;
use crate::terreno_regioes::{aplicar, regioes_do_terreno};
use crate::terreno_tipos::existente;

/// Terreno 60 × 60 (passo 3 m) com a cota `f(x, y)`.
fn terreno_60(f: impl Fn(f64, f64) -> f64, regioes: Vec<RegiaoFx>) -> TerrenoFx {
    let mut p = Vec::new();
    for j in 0..=20 {
        for i in 0..=20 {
            let (x, y) = (3.0 * f64::from(i), 3.0 * f64::from(j));
            p.push([x, y, f(x, y)]);
        }
    }
    TerrenoFx { intervalo: 1.0, regioes, ..TerrenoFx::novo(1, p) }
}

/// Maior `|P − zP_ref|` na faixa de `folga` m em volta das regiões, e o ponto do pior erro.
fn erro_do_pe(fx: TerrenoFx, folga: f64) -> (f64, [f64; 2]) {
    let mut cena = cena_com(&[fx]);
    let ex = existente(&cena, 1).expect("E");
    let mut regs = regioes_do_terreno(&cena.terreno, 1);
    regs.iter_mut().for_each(|r| r.alcance = 1e6);
    let (mut x0, mut y0, mut x1, mut y1) = (f64::MAX, f64::MAX, f64::MIN, f64::MIN);
    for r in &regs {
        let c = r.caixa();
        (x0, y0, x1, y1) = (x0.min(c[0]), y0.min(c[1]), x1.max(c[2]), y1.max(c[3]));
    }
    let mut pts = Vec::new();
    let mut y = (y0 - folga).max(0.05) + 0.0137;
    while y < (y1 + folga).min(59.95) {
        let mut x = (x0 - folga).max(0.05) + 0.0071;
        while x < (x1 + folga).min(59.95) {
            let p = v(x, y);
            if !regs.iter().any(|r| r.plana() && (r.dentro(p) || r.mais_proximo(p).1 < 0.05)) {
                pts.push(p);
            }
            x += 0.37;
        }
        y += 0.37;
    }
    let z = cotas(&mut cena, &pts.iter().map(|p| [p.x, p.y]).collect::<Vec<_>>(), 1);
    let mut pior = (0.0, [0.0, 0.0]);
    for (p, z) in pts.iter().zip(&z) {
        assert_ne!(z.0, ID_AUSENTE);
        let ref_z = aplicar(&regs, *p, ex.e.cota(p.x, p.y).expect("em E"));
        let e = (z.1 - ref_z).abs();
        if e > pior.0 {
            pior = (e, [p.x, p.y]);
        }
    }
    pior
}

fn conferir(nome: &str, fx: TerrenoFx, folga: f64) {
    let (e, p) = erro_do_pe(fx, folga);
    eprintln!("{nome}: erro máximo {e:.4} m em {p:?}");
    assert!(e <= 0.02, "{nome}: erro do pé do talude {e} m em {p:?}");
}

fn reg(id: u32, papel: u8, c: Vec<[f64; 2]>, cota: f64, corte: f64, aterro: f64) -> RegiaoFx {
    RegiaoFx { talude_corte: corte, talude_aterro: aterro, ..RegiaoFx::nova(id, papel, c, cota) }
}

#[test]
fn morro_alem_do_alcance() {
    let q = vec![[25.0, 25.0], [35.0, 25.0], [35.0, 35.0], [25.0, 35.0]];
    conferir("morro", terreno_60(|x, y| 10.0 + 0.012 * ((x - 30.0).powi(2) + (y - 30.0).powi(2)), vec![reg(1, 2, q, 5.0, 1.5, 0.0)]), 22.0);
}

#[test]
fn plataforma_em_l_cantos_concavos() {
    let l = vec![[20.0, 20.0], [40.0, 20.0], [40.0, 30.0], [30.0, 30.0], [30.0, 40.0], [20.0, 40.0]];
    conferir("L", terreno_60(|x, _| 10.0 + 0.05 * x, vec![reg(1, 1, l, 8.0, 1.5, 2.0)]), 10.0);
}

#[test]
fn pentagono() {
    let c: Vec<[f64; 2]> = (0..5).map(|k| f64::from(k) * 2.0 * std::f64::consts::PI / 5.0).map(|a| [30.0 + 8.0 * a.cos(), 30.0 + 8.0 * a.sin()]).collect();
    conferir("pentágono", terreno_60(|_, y| 10.0 + 0.04 * y, vec![reg(1, 2, c, 11.0, 1.5, 2.0)]), 12.0);
}

#[test]
fn regiao_de_plano_inclinado() {
    let q = vec![[22.0, 22.0], [38.0, 22.0], [38.0, 38.0], [22.0, 38.0]];
    let r = RegiaoFx { inclinacao: 0.1, direcao: 0.6, ..reg(1, 2, q, 10.0, 1.5, 2.0) };
    conferir("plano inclinado", terreno_60(|_, _| 10.0, vec![r]), 10.0);
}

#[test]
fn duas_regioes_sobrepostas() {
    let a = vec![[15.0, 15.0], [35.0, 15.0], [35.0, 35.0], [15.0, 35.0]];
    let b = vec![[25.0, 25.0], [45.0, 25.0], [45.0, 45.0], [25.0, 45.0]];
    conferir("sobrepostas", terreno_60(|x, y| 10.0 + 0.03 * (x + y), vec![reg(1, 2, a, 9.0, 1.5, 2.0), reg(2, 2, b, 12.0, 1.5, 2.0)]), 10.0);
}

#[test]
fn talude_suave_1_para_10() {
    let q = vec![[25.0, 25.0], [35.0, 25.0], [35.0, 35.0], [25.0, 35.0]];
    conferir("1:10", terreno_60(|_, _| 10.0, vec![reg(1, 2, q, 8.0, 10.0, 0.0)]), 24.0);
}
