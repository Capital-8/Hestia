//! Testes de aceite da ficha R3 do terreno (PLANO do terreno A.4 regras 6, 7, 8, 12 e 13, e A.10): superfície proposta, volumes de corte e aterro, mapa de
//! corte e aterro e perfil existente. Os avisos 3, 4 e 6, o fuzz e os tempos estão em `terreno_testes_regioes_fuzz.rs`.

use std::collections::HashMap;

use crate::cena::Cena;
use crate::consultas::executar;
use crate::esquema::{CONSULTA_QUANT_TERRENO_REGIOES, CONSULTA_TERRENO_CORTE, CONSULTA_TERRENO_CORTE_ATERRO, ID_AUSENTE, NIVEL_TODOS};
use crate::geo2d::v;
use crate::terreno_fixture::{cena_com, enviar, t1, t2, t5, t6, t7, RegiaoFx, TerrenoFx};
use crate::terreno_regioes::{definir_alcances, regioes_do_terreno, zp, Regiao};
use crate::terreno_testes::{cotas, malha, MalhaLida};
use crate::terreno_testes_curvas::{curvas, f64s, ler_linhas, planta, quant, u32s, LinhaLida};
use crate::terreno_tipos::existente;
use crate::teste_util::Xorshift;

type Bits = Vec<u64>;

/// Regiões do terreno prontas para `zp` (com o alcance definido a partir de E).
pub fn regioes_prontas(cena: &Cena, terreno: u32) -> Vec<Regiao> {
    let e = existente(cena, terreno).expect("existente");
    let mut r = regioes_do_terreno(&cena.terreno, terreno);
    definir_alcances(&mut r, &e.e);
    r
}

/// `zP(x, y)` pela função única da regra 7.
pub fn zp_em(cena: &Cena, terreno: u32, x: f64, y: f64) -> f64 {
    let e = existente(cena, terreno).expect("existente");
    zp(&regioes_prontas(cena, terreno), &e.e, v(x, y)).unwrap_or_else(|| panic!("({x}, {y}) fora de E"))
}

/// Consulta 166: `(regiao_num, terreno_num, [area_planta, area_superficie, volume_corte, volume_aterro])` por região.
pub fn quant_regioes(cena: &mut Cena, nivel: u32) -> Vec<(u32, u32, [f64; 4])> {
    let s = executar(cena, CONSULTA_QUANT_TERRENO_REGIOES, &[f64::from(nivel)]).expect("quant_terreno_regioes");
    let (l, v) = (u32s(&s[0]), f64s(&s[1]));
    assert_eq!((l.len() / 2, v.len() / 4), (v.len() / 4, l.len() / 2));
    l.chunks_exact(2).zip(v.chunks_exact(4)).map(|(l, v)| (l[0], l[1], [v[0], v[1], v[2], v[3]])).collect()
}

/// Grupo da consulta 167: `(terreno_num, tipo, triângulos)`; cada triângulo são 3 pontos `[x, y]`.
pub type GrupoDoMapa = (u32, u32, Vec<[[f64; 2]; 3]>);

/// Consulta 167 lida em grupos.
pub fn mapa(cena: &mut Cena, nivel: u32) -> Vec<GrupoDoMapa> {
    let s = executar(cena, CONSULTA_TERRENO_CORTE_ATERRO, &[f64::from(nivel)]).expect("terreno_corte_aterro");
    let (g, p) = (u32s(&s[0]), f64s(&s[1]));
    assert_eq!(g.len() % 4, 0);
    let mut proximo = 0;
    g.chunks_exact(4)
        .map(|c| {
            assert_eq!(c[2] as usize, proximo, "grupos contíguos");
            assert_eq!(c[3] % 3, 0, "3 pontos por triângulo");
            let pts: Vec<[f64; 2]> = p[2 * c[2] as usize..2 * (c[2] + c[3]) as usize].chunks_exact(2).map(|q| [q[0], q[1]]).collect();
            proximo += c[3] as usize;
            (c[0], c[1], pts.chunks_exact(3).map(|t| [t[0], t[1], t[2]]).collect())
        })
        .collect()
}

/// Área assinada de um triângulo.
pub fn area_tri(t: &[[f64; 2]; 3]) -> f64 {
    ((t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[1][1] - t[0][1]) * (t[2][0] - t[0][0])) / 2.0
}

/// Confere a malha de um terreno com regiões (consulta 160 com `superficie` 1): grupos de superfície (um por região), saia e base; tudo finito; cada triângulo
/// de superfície com área em planta > 0 e normal para cima; cada aresta em 1 ou 2 triângulos; saia com 2 triângulos por aresta de borda. Devolve o número de
/// triângulos da superfície.
pub fn conferir_proposta(m: &MalhaLida, terreno: u32) -> usize {
    assert!(m.v.iter().flatten().all(|x| x.is_finite()), "saída não finita");
    let meus: Vec<&[u32; 5]> = m.grupos.iter().filter(|g| g[0] == terreno).collect();
    let tris = |g: &[u32; 5]| -> Vec<[u32; 3]> { m.i[g[3] as usize..(g[3] + g[4]) as usize].chunks_exact(3).map(|c| [c[0], c[1], c[2]]).collect() };
    let n_papeis = |p: u32| meus.iter().filter(|g| g[2] == p).count();
    assert_eq!((n_papeis(1), n_papeis(2)), (1, 1), "uma saia e uma base");
    assert!(meus.iter().filter(|g| g[2] == 0).all(|g| g[4] > 0), "grupo de superfície nunca vazio");
    let sup: Vec<[u32; 3]> = meus.iter().filter(|g| g[2] == 0).flat_map(|g| tris(g)).collect();
    assert!(!sup.is_empty());
    let mut usos: HashMap<(u32, u32), u32> = HashMap::new();
    for t in &sup {
        let (a, b, c) = (m.v[t[0] as usize], m.v[t[1] as usize], m.v[t[2] as usize]);
        assert!((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0.0, "área > 0 e normal para cima: {t:?}");
        for k in 0..3 {
            let (p, q) = (t[k], t[(k + 1) % 3]);
            *usos.entry((p.min(q), p.max(q))).or_insert(0) += 1;
        }
    }
    assert!(usos.values().all(|&n| n == 1 || n == 2), "aresta em mais de 2 triângulos");
    let n_borda = usos.values().filter(|&&n| n == 1).count();
    let saia = meus.iter().find(|g| g[2] == 1).map_or(0, |g| g[4] / 3);
    assert_eq!(saia as usize, 2 * n_borda, "um quadrilátero por aresta de borda");
    let base = meus.iter().find(|g| g[2] == 2).map_or(0, |g| g[4] / 3);
    assert_eq!(base as usize, sup.len());
    sup.len()
}

/// Corte (consulta 164) sem a restrição de papéis do leitor de `terreno_testes_corte`.
pub fn corte_todos(cena: &mut Cena, plano: [f64; 4], profundidade: f64) -> Vec<LinhaLida> {
    let args = [0.0, plano[0], plano[1], plano[2], plano[3], profundidade];
    ler_linhas(&executar(cena, CONSULTA_TERRENO_CORTE, &args).expect("terreno_corte"))
}

#[test]
fn zp_funcao_unica() {
    // T5 (plataforma 5..15, cota 8, taludes 0; E = 10): alcance 0,02.
    let cena = cena_com(&[t5(1)]);
    for (x, y, z, onde) in [
        (10.0, 10.0, 8.0, "dentro"),
        (5.0, 5.0, 8.0, "no canto do contorno"),
        (10.0, 15.0, 8.0, "na borda"),
        (4.99, 10.0, 10.0, "0,01 fora: sem talude não há limite, vale E"),
        (2.0, 2.0, 10.0, "longe"),
    ] {
        assert!((zp_em(&cena, 1, x, y) - z).abs() < 1e-12, "T5 {onde}: ({x}, {y})");
    }
    // T6 (nivelada cota 8, talude de corte 1; E = 10): o talude encontra E a 2 m do contorno; o alcance é o primeiro passo da iteração (D → 1,1 D + h) que passa disso.
    let cena = cena_com(&[t6(1)]);
    let r = regioes_prontas(&cena, 1);
    assert!(r[0].alcance >= 2.0 && r[0].alcance < 2.6 && (r[0].h - 0.25).abs() < 1e-12, "D = primeiro passo da iteração além de 2 m: {}", r[0].alcance);
    for (x, y, z, onde) in [
        (7.0, 7.0, 8.0, "dentro"),
        (5.0, 9.0, 8.0, "na borda"),
        (4.0, 10.0, 9.0, "talude de corte 1 a 1 m da borda"),
        (4.5, 10.0, 8.5, "talude a 0,5 m"),
        (3.0, 10.0, 10.0, "o talude encontra o terreno a 2 m"),
        (4.0, 4.0, 8.0 + 2f64.sqrt(), "talude em cone no canto (d = raiz de 2)"),
        (2.0, 10.0, 10.0, "além do alcance"),
        (2.0, 2.0, 10.0, "longe"),
    ] {
        assert!((zp_em(&cena, 1, x, y) - z).abs() < 1e-12, "T6 {onde}: ({x}, {y}) = {}", zp_em(&cena, 1, x, y));
    }
    // T7 (plataforma cota 12,25 sobre a rampa z = 10,25 + 0,1 x): dentro vale o plano; fora, E.
    let cena = cena_com(&[t7(1)]);
    assert!((zp_em(&cena, 1, 10.0, 10.0) - 12.25).abs() < 1e-12);
    assert!((zp_em(&cena, 1, 5.0, 12.0) - 12.25).abs() < 1e-12, "na borda");
    assert!((zp_em(&cena, 1, 4.0, 10.0) - 10.65).abs() < 1e-12, "fora, com talude 0: E(4, 10)");
    assert!((zp_em(&cena, 1, 18.0, 3.0) - 12.05).abs() < 1e-12, "longe: E");
    // Plano inclinado: sobe 10 % para +x a partir da referência (10, 10); duas regiões, a de maior ordem vale por último.
    let inclinada = RegiaoFx { inclinacao: 0.1, direcao: 0.0, ..RegiaoFx::quadrado(1, 1, 5.0, 5.0, 10.0, 8.0) };
    let cena = cena_com(&[TerrenoFx { regioes: vec![inclinada.clone()], ..t1(1) }]);
    assert!((zp_em(&cena, 1, 15.0, 10.0) - 8.5).abs() < 1e-12 && (zp_em(&cena, 1, 7.0, 12.0) - 7.7).abs() < 1e-12);
    let por_cima = RegiaoFx { ordem: 9, ..RegiaoFx::quadrado(2, 1, 8.0, 8.0, 4.0, 6.0) };
    let cena = cena_com(&[TerrenoFx { regioes: vec![por_cima, inclinada], ..t1(1) }]);
    assert!((zp_em(&cena, 1, 10.0, 10.0) - 6.0).abs() < 1e-12, "a região de maior ordem fica por cima");
    assert!((zp_em(&cena, 1, 6.0, 6.0) - 7.6).abs() < 1e-12, "fora da de cima, vale a de baixo");
}

#[test]
fn t5_plataforma_corte() {
    let mut cena = cena_com(&[t5(1)]);
    let q = quant(&mut cena, 0);
    let (corte, aterro) = (q[0].1[5], q[0].1[6]);
    assert!((200.0..=200.6).contains(&corte), "corte {corte}");
    assert!((0.0..=1e-9).contains(&aterro), "aterro {aterro}");
    let c = cotas(&mut cena, &[[10.0, 10.0], [2.0, 2.0]], 1);
    assert!((c[0].1 - 8.0).abs() < 1e-9 && (c[1].1 - 10.0).abs() < 1e-9, "cota proposta: {c:?}");
    let e = cotas(&mut cena, &[[10.0, 10.0]], 0);
    assert!((e[0].1 - 10.0).abs() < 1e-9, "a existente não muda");
    let r = quant_regioes(&mut cena, 0);
    assert_eq!(r.len(), 1);
    assert_eq!((r[0].0, r[0].1), (1, 1));
    assert!((r[0].2[0] - 100.0).abs() < 1e-9, "área em planta da região");
    assert!((r[0].2[2] - corte).abs() < 1e-9 && r[0].2[3].abs() < 1e-9, "todo o volume é da região");
    assert!(q[0].1[2] > 400.0, "área de superfície proposta: {}", q[0].1[2]);
    assert!(conferir_proposta(&malha(&mut cena, 0, 1), 1) > 2);
    // z_min e z_max cobrem E e P.
    assert_eq!((q[0].1[3], q[0].1[4]), (8.0, 10.0));
}

#[test]
fn t6_talude_corte() {
    let mut cena = cena_com(&[t6(1)]);
    let q = quant(&mut cena, 0);
    let (corte, aterro) = (q[0].1[5], q[0].1[6]);
    assert!((corte - 288.38).abs() <= 0.02 * 288.38, "corte {corte}: 200 da base, 80 das faces e 8,38 dos cantos em cone");
    assert!((0.0..=1e-9).contains(&aterro), "aterro {aterro}");
    let z = cotas(&mut cena, &[[4.0, 10.0], [10.0, 10.0], [1.0, 1.0]], 1);
    assert!((z[0].1 - 9.0).abs() <= 0.02, "cota proposta em (4, 10): {}", z[0].1);
    assert!((z[1].1 - 8.0).abs() < 1e-9 && (z[2].1 - 10.0).abs() < 1e-9);
    conferir_proposta(&malha(&mut cena, 0, 1), 1);
    let r = quant_regioes(&mut cena, 0);
    assert!((r[0].2[2] - corte).abs() < 1e-9, "o volume do terreno é o da região");
}

#[test]
fn t7_aterro() {
    let mut cena = cena_com(&[t7(1)]);
    let q = quant(&mut cena, 0);
    let (corte, aterro) = (q[0].1[5], q[0].1[6]);
    assert!((100.0..=100.4).contains(&aterro), "aterro {aterro}");
    assert!((0.0..=1e-6).contains(&corte), "corte {corte}");
    let c = cotas(&mut cena, &[[10.0, 10.0]], 1);
    assert!((c[0].1 - 12.25).abs() < 1e-9);
    assert_eq!((q[0].1[3], q[0].1[4]), (10.25, 12.25));
    conferir_proposta(&malha(&mut cena, 0, 1), 1);
}

#[test]
fn subdivisao_nao_muda_cota() {
    let sub = RegiaoFx::quadrado(7, 0, 5.0, 5.0, 10.0, 0.0);
    let mut cena = cena_com(&[TerrenoFx { regioes: vec![sub], ..t2(1) }]);
    let mut r = Xorshift::novo(2024);
    let pontos: Vec<[f64; 2]> = (0..100).map(|_| [r.intervalo(0.1, 19.9), r.intervalo(0.1, 19.9)]).collect();
    let (e, p) = (cotas(&mut cena, &pontos, 0), cotas(&mut cena, &pontos, 1));
    for (k, (a, b)) in e.iter().zip(&p).enumerate() {
        assert_eq!((a.0, b.0), (1, 1));
        assert!((a.1 - b.1).abs() < 1e-9, "ponto {k} {:?}: zP {} x E {}", pontos[k], b.1, a.1);
    }
    let m = malha(&mut cena, 0, 1);
    conferir_proposta(&m, 1);
    let sup: Vec<&[u32; 5]> = m.grupos.iter().filter(|g| g[2] == 0).collect();
    assert_eq!(sup.iter().map(|g| g[1]).collect::<Vec<_>>(), vec![ID_AUSENTE, 7], "o terreno sem região e o grupo da subdivisão");
    let area_grupo = |g: &[u32; 5]| -> f64 {
        m.i[g[3] as usize..(g[3] + g[4]) as usize].chunks_exact(3).map(|t| {
            let (a, b, c) = (m.v[t[0] as usize], m.v[t[1] as usize], m.v[t[2] as usize]);
            ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2.0
        }).sum()
    };
    assert!((sup.iter().map(|g| area_grupo(g)).sum::<f64>() - 400.0).abs() < 1e-6, "a soma das áreas dos grupos é a área do terreno");
    assert!((area_grupo(sup[1]) - 100.0).abs() < 1e-6, "o grupo da subdivisão cobre o polígono");
    let rq = quant_regioes(&mut cena, 0);
    assert_eq!(rq.len(), 1);
    assert!((rq[0].2[0] - 100.0).abs() < 1e-9, "área do polígono");
    assert!((rq[0].2[1] - 100.0 * 1.01f64.sqrt()).abs() < 1e-6, "área de superfície dos triângulos da região: {}", rq[0].2[1]);
    assert_eq!((rq[0].2[2], rq[0].2[3]), (0.0, 0.0), "subdivisão não corta nem aterra");
    let q = quant(&mut cena, 0);
    assert_eq!((q[0].1[5], q[0].1[6]), (0.0, 0.0));
    assert_eq!(mapa(&mut cena, 0).len(), 0);
    // As curvas da proposta ficam nas mesmas posições (a rampa é plana: retas em x = 2,5; 7,5; ...).
    assert!(curvas(&mut cena, 0, 1).iter().zip([2.5, 7.5, 12.5, 17.5]).all(|(l, x)| l.pontos.iter().all(|p| (p[0] - x).abs() < 1e-9)));
}

#[test]
fn sem_regiao_proposta_igual_existente() {
    let mut cena = cena_com(&[t1(1), t2(2), TerrenoFx { borda: Some(vec![[1.0, 1.0], [9.0, 1.0], [9.0, 9.0], [1.0, 9.0]]), ..t2(3) }]);
    let bits = |m: &MalhaLida| (m.grupos.clone(), m.i.clone(), m.v.iter().flatten().map(|x| x.to_bits()).collect::<Vec<_>>());
    assert_eq!(bits(&malha(&mut cena, NIVEL_TODOS, 0)), bits(&malha(&mut cena, NIVEL_TODOS, 1)), "consulta 160");
    let bl = |l: Vec<LinhaLida>| -> Vec<Bits> { l.iter().map(|x| x.pontos.iter().flatten().chain([&x.z]).map(|v| v.to_bits()).chain([u64::from(x.terreno), u64::from(x.marca), u64::from(x.fechada)]).collect()).collect() };
    assert_eq!(bl(curvas(&mut cena, NIVEL_TODOS, 0)), bl(curvas(&mut cena, NIVEL_TODOS, 1)), "consulta 161");
    assert_eq!(bl(planta(&mut cena, NIVEL_TODOS, 0)), bl(planta(&mut cena, NIVEL_TODOS, 1)), "consulta 162");
    let pts = [[10.0, 10.0], [3.0, 17.0], [5.0, 5.0], [50.0, 50.0]];
    assert_eq!(cotas(&mut cena, &pts, 0), cotas(&mut cena, &pts, 1), "consulta 163");
    assert_eq!(quant_regioes(&mut cena, NIVEL_TODOS), Vec::new());
    assert!(mapa(&mut cena, NIVEL_TODOS).is_empty());
}

#[test]
fn perfil_existente_so_com_plano() {
    let plano = [-1.0, 10.123, 1.0, 0.0];
    let mut t5c = cena_com(&[t5(1)]);
    let l = corte_todos(&mut t5c, plano, 0.0);
    let sem_silhueta = |l: &[LinhaLida]| -> Vec<u32> { l.iter().map(|x| x.marca).filter(|&p| p != 2).collect() };
    assert_eq!(sem_silhueta(&l), vec![0, 1], "cortado de P e perfil existente de E");
    let l: Vec<LinhaLida> = l.into_iter().filter(|x| x.marca != 2).collect();
    let perfil = &l[1];
    assert!(!perfil.fechada && perfil.pontos.iter().all(|p| (p[1] - 10.0).abs() < 1e-9), "E é plana em z = 10: {:?}", perfil.pontos);
    assert!((perfil.pontos[0][0] - 1.0).abs() < 1e-9 && (perfil.pontos[perfil.pontos.len() - 1][0] - 21.0).abs() < 1e-9, "de ponta a ponta do terreno");
    let cortado = &l[0];
    assert!(cortado.fechada);
    let z_no_meio = cortado.pontos[..cortado.pontos.len() - 2].windows(2).find(|w| w[0][0] <= 11.0 && 11.0 <= w[1][0]).map(|w| w[0][1]).expect("perfil passa por s = 11");
    assert!((z_no_meio - 8.0).abs() < 1e-9, "dentro da plataforma, P está em z = 8");
    let z_base = cortado.pontos[cortado.pontos.len() - 1][1];
    assert!((z_base - (8.0 - 3.0)).abs() < 1e-9, "z_base = min(z de E e de P) − espessura");
    let mut t2c = cena_com(&[t2(1)]);
    assert_eq!(sem_silhueta(&corte_todos(&mut t2c, plano, 0.0)), vec![0], "sem plataforma ou nivelada, nada de perfil existente");
    let so_sub = TerrenoFx { regioes: vec![RegiaoFx::quadrado(1, 0, 5.0, 5.0, 10.0, 0.0)], ..t2(1) };
    assert_eq!(sem_silhueta(&corte_todos(&mut cena_com(&[so_sub]), plano, 0.0)), vec![0], "subdivisão também não gera perfil existente");
    let t6c = corte_todos(&mut cena_com(&[t6(1)]), plano, 0.0);
    assert!(t6c.iter().any(|x| x.marca == 1), "a região nivelada gera");
}

#[test]
fn mapa_corte_aterro_t5() {
    let mut cena = cena_com(&[t5(1)]);
    let m = mapa(&mut cena, 0);
    assert_eq!(m.iter().map(|g| (g.0, g.1)).collect::<Vec<_>>(), vec![(1, 0)], "só um grupo, o de corte do terreno 1; nenhum de aterro");
    let area: f64 = m[0].2.iter().map(area_tri).sum();
    assert!(m[0].2.iter().all(|t| area_tri(t) > 0.0), "anti-horários");
    assert!((100.0..=101.0).contains(&area), "área em corte {area}");
    assert!(mapa(&mut cena_com(&[t7(1)]), 0).iter().all(|g| g.1 == 1), "T7 só tem aterro");
    let a7: f64 = mapa(&mut cena_com(&[t7(1)]), 0)[0].2.iter().map(area_tri).sum();
    assert!((100.0..=101.0).contains(&a7), "área em aterro {a7}");
    assert!(mapa(&mut cena, 5).is_empty(), "outro nível");
}

#[test]
fn mover_regiao_nao_refaz_existente() {
    let tri = |c: &Cena| c.cache_terreno.borrow().triangulacoes;
    let prop = |c: &Cena| c.cache_terreno.borrow().propostas_calculadas;
    let mut cena = cena_com(&[t5(1), t1(2)]);
    quant(&mut cena, NIVEL_TODOS);
    assert_eq!((tri(&cena), prop(&cena)), (2, 2));
    quant_regioes(&mut cena, NIVEL_TODOS);
    mapa(&mut cena, NIVEL_TODOS);
    malha(&mut cena, NIVEL_TODOS, 1);
    cotas(&mut cena, &[[1.0, 1.0]], 1);
    assert_eq!((tri(&cena), prop(&cena)), (2, 2), "consultas repetidas não refazem nada");
    let antes = quant(&mut cena, 0)[0].1[5];
    // Mover a região: P do terreno 1 é refeita; E dos dois e P do terreno 2 não.
    let movida = RegiaoFx::quadrado(1, 1, 8.0, 8.0, 10.0, 8.0);
    enviar(&mut cena, &[TerrenoFx { regioes: vec![movida], ..t1(1) }, t1(2)]).expect("enviar");
    let depois = quant(&mut cena, NIVEL_TODOS);
    assert_eq!((tri(&cena), prop(&cena)), (2, 3), "mover a região não refaz E");
    assert!((depois[0].1[5] - antes).abs() < 1e-9, "o mesmo quadrado 10 x 10, só deslocado: mesmo volume");
    let e_antes = existente(&cena, 1).expect("existente");
    // Reenviar igual não refaz nada.
    enviar(&mut cena, &[TerrenoFx { regioes: vec![RegiaoFx::quadrado(1, 1, 8.0, 8.0, 10.0, 8.0)], ..t1(1) }, t1(2)]).expect("enviar");
    quant(&mut cena, NIVEL_TODOS);
    assert_eq!((tri(&cena), prop(&cena)), (2, 3));
    assert!(std::rc::Rc::ptr_eq(&e_antes, &existente(&cena, 1).expect("existente")));
    // Mudar a cota da plataforma também só refaz P; mudar uma fonte do terreno 1 refaz E e P dele, não os do 2.
    enviar(&mut cena, &[TerrenoFx { regioes: vec![RegiaoFx::quadrado(1, 1, 8.0, 8.0, 10.0, 6.0)], ..t1(1) }, t1(2)]).expect("enviar");
    quant(&mut cena, NIVEL_TODOS);
    assert_eq!((tri(&cena), prop(&cena)), (2, 4));
    let mut outro = t1(1);
    outro.pontos[0][2] = 11.0;
    enviar(&mut cena, &[TerrenoFx { regioes: vec![RegiaoFx::quadrado(1, 1, 8.0, 8.0, 10.0, 6.0)], ..outro }, t1(2)]).expect("enviar");
    quant(&mut cena, NIVEL_TODOS);
    assert_eq!((tri(&cena), prop(&cena)), (3, 5), "só o terreno 1 refeito");
}
