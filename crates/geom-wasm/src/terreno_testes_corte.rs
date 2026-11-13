//! Testes de aceite da ficha R2 do terreno (PLANO do terreno A.4 regra 11 e A.10): o corte vertical, consulta 164 (`terreno_corte`).

use crate::cena::Cena;
use crate::consultas::executar;
use crate::esquema::{CONSULTA_TERRENO_CORTE, ENTRADA, NIVEL_TODOS};
use crate::terreno_corte::{FAIXAS, PAPEL_CORTADO, PAPEL_SILHUETA};
use crate::terreno_fixture::{cena_com, t2, t3, t4, TerrenoFx};
use crate::terreno_testes::cotas;
use crate::terreno_testes_curvas::{ler_linhas, LinhaLida};
use crate::teste_util::Xorshift;

/// Linhas da consulta 164 (`marca` = papel; os pontos são `(s, z)`).
pub fn corte(cena: &mut Cena, nivel: u32, plano: [f64; 4], profundidade: f64) -> Vec<LinhaLida> {
    let args = [f64::from(nivel), plano[0], plano[1], plano[2], plano[3], profundidade];
    let s = executar(cena, CONSULTA_TERRENO_CORTE, &args).expect("terreno_corte");
    assert_eq!(s.len(), 2);
    let l = ler_linhas(&s);
    assert!(l.iter().all(|x| x.fechada == (x.marca == PAPEL_CORTADO) && (x.marca == PAPEL_CORTADO || x.marca == PAPEL_SILHUETA)), "cortado é fechado; silhueta é aberta");
    l
}

fn cortados(l: &[LinhaLida]) -> Vec<&LinhaLida> {
    l.iter().filter(|x| x.marca == PAPEL_CORTADO).collect()
}

/// z do perfil (os pontos do polígono menos os dois da base) em `s`, por interpolação linear.
fn z_do_perfil(pol: &LinhaLida, s: f64) -> f64 {
    let p = &pol.pontos[..pol.pontos.len() - 2];
    let k = p.windows(2).position(|w| s >= w[0][0] && s <= w[1][0]).unwrap_or_else(|| panic!("s = {s} fora do perfil"));
    let (a, b) = (p[k], p[k + 1]);
    a[1] + (b[1] - a[1]) * (s - a[0]) / (b[0] - a[0])
}

#[test]
fn t2_corte_perfil_reto() {
    let mut cena = cena_com(&[t2(1)]);
    let l = corte(&mut cena, 0, [0.0, 10.0, 1.0, 0.0], 0.0);
    let c = cortados(&l);
    assert_eq!(c.len(), 1, "um trecho contínuo");
    let p = &c[0].pontos;
    let perfil = &p[..p.len() - 2];
    assert_eq!((perfil[0], perfil[perfil.len() - 1]), ([0.0, 10.25], [20.0, 12.25]), "de z = 10,25 a z = 12,25");
    assert!(perfil.windows(2).all(|w| w[1][0] > w[0][0]), "ordenado por s");
    assert!(perfil.iter().all(|q| (q[1] - (10.25 + 0.1 * q[0])).abs() < 1e-12), "reto: {perfil:?}");
    assert_eq!(p[p.len() - 2..], [[20.0, 7.25], [0.0, 7.25]], "fechado em z_base = 10,25 − 3");
    // A origem e o módulo da direção só deslocam s: com a origem em x = 5, o perfil vai de s = −5 a s = 15.
    let d = corte(&mut cena, NIVEL_TODOS, [5.0, 10.0, 7.0, 0.0], 0.0);
    let q = &cortados(&d)[0].pontos;
    assert_eq!((q[0], q[q.len() - 3]), ([-5.0, 10.25], [15.0, 12.25]));
    // No sentido −x o mesmo perfil sai espelhado.
    let e = corte(&mut cena, 0, [20.0, 10.0, -1.0, 0.0], 0.0);
    let r = &cortados(&e)[0].pontos;
    assert_eq!((r[0], r[r.len() - 3]), ([0.0, 12.25], [20.0, 10.25]));
    assert!(corte(&mut cena, 4, [0.0, 10.0, 1.0, 0.0], 0.0).is_empty(), "outro nível");
}

#[test]
fn corte_bate_com_cotas() {
    // Terreno aleatório de 300 pontos e um plano oblíquo.
    let mut r = Xorshift::novo(164);
    let pontos = (0..300).map(|_| [r.intervalo(0.0, 60.0), r.intervalo(0.0, 40.0), r.intervalo(-4.0, 9.0)]).collect();
    for (fx, plano) in [(TerrenoFx::novo(1, pontos), [-3.0, 2.0, 2.0, 1.0]), (t4(1), [1.0, 19.0, 3.0, -2.0]), (t3(1), [0.0, 0.0, 1.0, 1.0])] {
        let mut cena = cena_com(&[fx]);
        let l = corte(&mut cena, 0, plano, 0.0);
        let c = cortados(&l);
        assert_eq!(c.len(), 1, "terreno convexo: um trecho só");
        let p = &c[0].pontos;
        let (s0, s1) = (p[0][0], p[p.len() - 3][0]);
        assert!(s1 - s0 > 10.0);
        let n = plano[2].hypot(plano[3]);
        let (ux, uy) = (plano[2] / n, plano[3] / n);
        let ss: Vec<f64> = (0..50).map(|k| s0 + (s1 - s0) * (k as f64 + 0.5) / 50.0).collect();
        let sondas: Vec<[f64; 2]> = ss.iter().map(|s| [plano[0] + ux * s, plano[1] + uy * s]).collect();
        for (s, cota) in ss.iter().zip(cotas(&mut cena, &sondas, 0)) {
            assert_eq!(cota.0, 1, "s = {s} está no terreno");
            let z = z_do_perfil(c[0], *s);
            assert!((z - cota.1).abs() < 1e-9, "s = {s}: perfil {z}, consulta 163 {}", cota.1);
        }
    }
}

#[test]
fn corte_fecha_na_base() {
    let mut cena = cena_com(&[t3(1)]);
    let l = corte(&mut cena, 0, [0.0, 10.0, 1.0, 0.0], 0.0);
    let c = cortados(&l);
    assert_eq!(c.len(), 1);
    assert!(c[0].fechada, "polígono fechado");
    assert_eq!(c[0].pontos, vec![[0.0, 0.0], [10.0, 5.0], [20.0, 0.0], [20.0, -3.0], [0.0, -3.0]], "perfil por s e, por fim, a base em z_base = −3");
    // Triângulo de 20 × 5 sobre o retângulo de 20 × 3. O polígono sai no sentido horário em (s, z): perfil em s crescente por cima, base de volta.
    assert!(c[0].area().abs() > 0.0);
    assert!((c[0].area() + 110.0).abs() < 1e-9, "área {}", c[0].area());
    // Com a espessura da base maior, só a base desce.
    let mut cena = cena_com(&[TerrenoFx { espessura_base: 7.5, ..t3(1) }]);
    let l = corte(&mut cena, 0, [0.0, 10.0, 1.0, 0.0], 0.0);
    assert_eq!(cortados(&l)[0].pontos[3..], [[20.0, -7.5], [0.0, -7.5]]);
}

#[test]
fn corte_fora_do_terreno_vazio() {
    let mut cena = cena_com(&[t3(1)]);
    assert!(corte(&mut cena, 0, [0.0, -5.0, 1.0, 0.0], 2.0).is_empty(), "plano fora e o terreno além da profundidade: nada");
    assert!(corte(&mut cena, 0, [0.0, 25.0, 1.0, 0.0], 100.0).is_empty(), "plano fora olhando para o outro lado: nada");
    let l = corte(&mut cena, 0, [0.0, -5.0, 1.0, 0.0], 100.0);
    assert!(cortados(&l).is_empty() && !l.is_empty(), "plano fora olhando para o terreno: só silhueta");
    // Como em guarda_corte: direção nula ou profundidade negativa não geram nada.
    assert!(corte(&mut cena, 0, [0.0, 10.0, 0.0, 0.0], 5.0).is_empty());
    assert!(corte(&mut cena, 0, [0.0, 10.0, 1.0, 0.0], -1.0).is_empty());
    for k in 1..6 {
        let mut args = [0.0, 0.0, 10.0, 1.0, 0.0, 5.0];
        args[k] = f64::NAN;
        assert_eq!(executar(&mut cena, CONSULTA_TERRENO_CORTE, &args).err(), Some(ENTRADA), "argumento {k}");
    }
    assert_eq!(executar(&mut cena, CONSULTA_TERRENO_CORTE, &[0.5, 0.0, 10.0, 1.0, 0.0, 5.0]).err(), Some(ENTRADA));
    assert!(corte(&mut cena_com(&[TerrenoFx::novo(1, Vec::new())]), 0, [0.0, 10.0, 1.0, 0.0], 5.0).is_empty(), "terreno sem triângulos");
}

#[test]
fn silhueta_t3() {
    let mut cena = cena_com(&[t3(1)]);
    // Plano em y = −5 na direção +x: a normal esquerda é +y, olhando para o terreno.
    let l = corte(&mut cena, 0, [0.0, -5.0, 1.0, 0.0], 100.0);
    assert_eq!(l.len(), 1, "só a silhueta, num trecho");
    let s = &l[0];
    assert_eq!((s.terreno, s.marca, s.fechada, s.pontos.len()), (1, PAPEL_SILHUETA, false, FAIXAS));
    let pico = s.pontos.iter().map(|p| p[1]).fold(f64::NEG_INFINITY, f64::max);
    assert_eq!(pico, 5.0, "pico em z = 5");
    let w = 20.0 / FAIXAS as f64;
    for (j, p) in s.pontos.iter().enumerate() {
        assert!((p[0] - (j as f64 + 0.5) * w).abs() < 1e-9, "s no meio da faixa {j}");
        // Envoltória da pirâmide: z = 5 · (1 − |s − 10| / 10); cada faixa guarda o seu máximo, que fica na ponta mais perto do pico.
        let perto = if j < FAIXAS / 2 { (j + 1) as f64 * w } else { j as f64 * w };
        assert!((p[1] - 5.0 * (1.0 - (perto - 10.0).abs() / 10.0)).abs() < 1e-9, "faixa {j}: {}", p[1]);
    }
    // Com o plano cortando o terreno em y = 10, a silhueta do que fica além é a mesma envoltória, e o cortado sai junto (primeiro).
    let l = corte(&mut cena, 0, [0.0, 10.0, 1.0, 0.0], 100.0);
    assert_eq!(l.iter().map(|x| x.marca).collect::<Vec<_>>(), vec![PAPEL_CORTADO, PAPEL_SILHUETA]);
    assert_eq!(l[1].pontos.iter().map(|p| p[1]).fold(f64::NEG_INFINITY, f64::max), 5.0);
    // Profundidade curta: de y = −5 até y = 0 só se vê a aresta da frente, em z = 0.
    let l = corte(&mut cena, 0, [0.0, -5.0, 1.0, 0.0], 5.0);
    assert!(l.len() == 1 && l[0].pontos.iter().all(|p| p[1] == 0.0));
}
