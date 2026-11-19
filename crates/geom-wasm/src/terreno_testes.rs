//! Testes de aceite da ficha R1 do terreno (PLANO do terreno A.10 e Parte D): valores de referência de T1 a T4, T8 e T9, fusão, malha válida, cotas e cache.

use std::collections::HashMap;

use crate::cena::Cena;
use crate::consultas::{executar, Saida};
use crate::esquema::{CONSULTA_TERRENO_COTAS, CONSULTA_TERRENO_MALHA, ENTRADA, ID_AUSENTE, NIVEL_TODOS};
use crate::terreno_fixture::{cena_com, enviar, enviar_sondas, t1, t2, t3, t4, t8, t9, TerrenoFx};
use crate::terreno_tipos::{existente, AVISO_COTAS_DIFERENTES, AVISO_LINHA_CRUZA, AVISO_SEM_TRIANGULOS};

fn u32s(s: &Saida) -> Vec<u32> {
    match s {
        Saida::U32(v) => v.clone(),
        Saida::F64(_) => panic!("esperava u32"),
    }
}

fn f64s(s: &Saida) -> Vec<f64> {
    match s {
        Saida::F64(v) => v.clone(),
        Saida::U32(_) => panic!("esperava f64"),
    }
}

/// Saídas da consulta 160.
pub struct MalhaLida {
    pub grupos: Vec<[u32; 5]>,
    pub v: Vec<[f64; 3]>,
    pub i: Vec<u32>,
}

pub fn malha(cena: &mut Cena, nivel: u32, superficie: u32) -> MalhaLida {
    let s = executar(cena, CONSULTA_TERRENO_MALHA, &[f64::from(nivel), f64::from(superficie)]).expect("terreno_malha");
    assert_eq!(s.len(), 3);
    let (g, v, i) = (u32s(&s[0]), f64s(&s[1]), u32s(&s[2]));
    MalhaLida { grupos: g.chunks_exact(5).map(|c| [c[0], c[1], c[2], c[3], c[4]]).collect(), v: v.chunks_exact(3).map(|c| [c[0], c[1], c[2]]).collect(), i }
}

impl MalhaLida {
    /// Triângulos (posições) do grupo `papel` do terreno.
    pub fn triangulos(&self, terreno: u32, papel: u32) -> Vec<[u32; 3]> {
        let g = self.grupos.iter().find(|g| g[0] == terreno && g[2] == papel).unwrap_or_else(|| panic!("grupo {papel} do terreno {terreno}"));
        self.i[g[3] as usize..(g[3] + g[4]) as usize].chunks_exact(3).map(|c| [c[0], c[1], c[2]]).collect()
    }

    fn p(&self, i: u32) -> [f64; 3] {
        self.v[i as usize]
    }

    fn normal(&self, t: [u32; 3]) -> [f64; 3] {
        let (a, b, c) = (self.p(t[0]), self.p(t[1]), self.p(t[2]));
        let (u, w) = ([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
        [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
    }

    pub fn area_planta(&self, terreno: u32) -> f64 {
        self.triangulos(terreno, 0).iter().map(|&t| self.normal(t)[2] / 2.0).sum()
    }

    pub fn area_superficie(&self, terreno: u32) -> f64 {
        self.triangulos(terreno, 0).iter().map(|&t| self.normal(t)).map(|n| (n[0] * n[0] + n[1] * n[1] + n[2] * n[2]).sqrt() / 2.0).sum()
    }

    /// Confere a malha de um terreno (aceite `malha_valida` e fuzz): tudo finito; cada triângulo de superfície com área em planta > 0 e normal para cima;
    /// cada aresta em 1 ou 2 triângulos (interna = 2); saia com um quadrilátero por aresta de borda, vertical, até `z_base`; base igual à superfície, na cota
    /// `z_base`, invertida. Devolve o número de triângulos da superfície.
    pub fn conferir(&self, terreno: u32, espessura_base: f64) -> usize {
        assert!(self.v.iter().flatten().all(|x| x.is_finite()), "saída não finita");
        let grupos: Vec<&[u32; 5]> = self.grupos.iter().filter(|g| g[0] == terreno).collect();
        assert_eq!(grupos.iter().map(|g| (g[1], g[2])).collect::<Vec<_>>(), vec![(ID_AUSENTE, 0), (ID_AUSENTE, 1), (ID_AUSENTE, 2)], "superfície, saia e base");
        let sup = self.triangulos(terreno, 0);
        assert!(!sup.is_empty());
        let mut usos: HashMap<(u32, u32), u32> = HashMap::new();
        let mut z_min = f64::INFINITY;
        for &t in &sup {
            assert!(self.normal(t)[2] > 0.0, "área em planta > 0 e normal para cima: {t:?}");
            for k in 0..3 {
                let (a, b) = (t[k], t[(k + 1) % 3]);
                assert_ne!(a, b);
                *usos.entry((a.min(b), a.max(b))).or_insert(0) += 1;
                z_min = z_min.min(self.p(a)[2]);
            }
        }
        assert!(usos.values().all(|&n| n == 1 || n == 2), "aresta em mais de 2 triângulos");
        let z_base = z_min - espessura_base;
        let n_borda = usos.values().filter(|&&n| n == 1).count();
        let saia = self.triangulos(terreno, 1);
        assert_eq!(saia.len(), 2 * n_borda, "um quadrilátero por aresta de borda");
        let centro = {
            let n = sup.len() as f64 * 3.0;
            let s = sup.iter().flatten().fold([0.0, 0.0], |s, &i| [s[0] + self.p(i)[0], s[1] + self.p(i)[1]]);
            [s[0] / n, s[1] / n]
        };
        let mut convexo_para_fora = 0;
        for q in saia.chunks_exact(2) {
            let (topo_a, base_a, base_b, topo_b) = (self.p(q[0][0]), self.p(q[0][1]), self.p(q[0][2]), self.p(q[1][2]));
            assert_eq!((q[1][0], q[1][1]), (q[0][0], q[0][2]));
            assert_eq!((topo_a[0], topo_a[1]), (base_a[0], base_a[1]), "parede vertical");
            assert_eq!((topo_b[0], topo_b[1]), (base_b[0], base_b[1]), "parede vertical");
            assert_eq!((base_a[2], base_b[2]), (z_base, z_base));
            assert!(topo_a[2] >= z_min && topo_b[2] >= z_min);
            let n = self.normal(q[0]);
            assert_eq!(n[2], 0.0);
            assert!(n[0] != 0.0 || n[1] != 0.0);
            if n[0] * (topo_a[0] - centro[0]) + n[1] * (topo_a[1] - centro[1]) > 0.0 {
                convexo_para_fora += 1;
            }
        }
        if n_borda == 4 {
            assert_eq!(convexo_para_fora, 4, "nas fixtures quadradas toda a saia olha para fora");
        }
        let base = self.triangulos(terreno, 2);
        assert_eq!(base.len(), sup.len());
        for (b, s) in base.iter().zip(&sup) {
            for (ib, is) in [(b[0], s[0]), (b[1], s[2]), (b[2], s[1])] {
                assert_eq!(self.p(ib), [self.p(is)[0], self.p(is)[1], z_base], "base = superfície em z_base, invertida");
            }
        }
        sup.len()
    }
}

/// Cotas da consulta 163 nos pontos dados: `(terreno_num, z, declividade)` por ponto.
pub fn cotas(cena: &mut Cena, pontos: &[[f64; 2]], superficie: u32) -> Vec<(u32, f64, f64)> {
    enviar_sondas(cena, pontos);
    let s = executar(cena, CONSULTA_TERRENO_COTAS, &[f64::from(superficie)]).expect("terreno_cotas");
    let (l, v) = (u32s(&s[0]), f64s(&s[1]));
    assert_eq!((l.len(), v.len()), (2 * pontos.len(), 2 * pontos.len()));
    (0..pontos.len()).map(|k| (assert_eq!(l[2 * k], k as u32), (l[2 * k + 1], v[2 * k], v[2 * k + 1])).1).collect()
}

fn cota(cena: &mut Cena, x: f64, y: f64) -> f64 {
    let c = cotas(cena, &[[x, y]], 0);
    assert_ne!(c[0].0, ID_AUSENTE, "({x}, {y}) fora do terreno");
    c[0].1
}

#[test]
fn t1_plano_areas() {
    let mut cena = cena_com(&[t1(1)]);
    let m = malha(&mut cena, 0, 0);
    assert!((m.area_planta(1) - 400.0).abs() < 1e-9);
    assert!((m.area_superficie(1) - 400.0).abs() < 1e-9);
    assert_eq!(m.triangulos(1, 0).len(), 2);
    assert!((cota(&mut cena, 5.0, 5.0) - 10.0).abs() < 1e-9);
    assert_eq!(cotas(&mut cena, &[[5.0, 5.0]], 0)[0].2, 0.0, "plano: declividade 0");
}

#[test]
fn t2_rampa_superficie_e_cota() {
    let mut cena = cena_com(&[t2(1)]);
    let m = malha(&mut cena, 0, 0);
    // A.10: 400·√1,01 (= 401,995025; o "401,99502" do plano é esse valor arredondado na quinta casa).
    assert!((m.area_superficie(1) - 400.0 * 1.01f64.sqrt()).abs() < 1e-6, "{}", m.area_superficie(1));
    assert!((m.area_superficie(1) - 401.99502).abs() < 1e-5);
    assert!((m.area_planta(1) - 400.0).abs() < 1e-9);
    let c = cotas(&mut cena, &[[10.0, 10.0]], 0)[0];
    assert!((c.1 - 11.25).abs() < 1e-9, "{}", c.1);
    assert!((c.2 - 0.1).abs() < 1e-12, "declividade de 10 %: {}", c.2);
}

#[test]
fn t3_piramide_quatro_triangulos() {
    let mut cena = cena_com(&[t3(1)]);
    let m = malha(&mut cena, NIVEL_TODOS, 0);
    assert_eq!(m.triangulos(1, 0).len(), 4);
    assert!((m.area_superficie(1) - 447.21360).abs() < 1e-5, "{}", m.area_superficie(1));
    assert!((m.area_planta(1) - 400.0).abs() < 1e-9);
    assert!((cota(&mut cena, 10.0, 10.0) - 5.0).abs() < 1e-9);
    assert!((cota(&mut cena, 5.0, 10.0) - 2.5).abs() < 1e-9);
}

#[test]
fn t4_vale_respeita_quebra() {
    let mut cena = cena_com(&[t4(1)]);
    let m = malha(&mut cena, 0, 0);
    assert!((cota(&mut cena, 10.0, 10.0) - 0.0).abs() < 1e-9);
    assert!((cota(&mut cena, 5.0, 7.0) - 1.0).abs() < 1e-9);
    assert!((m.area_superficie(1) - 407.92156).abs() < 1e-5, "{}", m.area_superficie(1));
    assert_eq!(m.triangulos(1, 0).len(), 4);
    let e = existente(&cena, 1).expect("existente");
    assert_eq!(e.t0.restricoes.len(), 1, "a quebra é aresta obrigatória");
    assert!(e.avisos.is_empty());
}

#[test]
fn t8_borda_recorta() {
    let mut cena = cena_com(&[t8(1)]);
    let m = malha(&mut cena, 0, 0);
    assert!((m.area_planta(1) - 100.0).abs() < 1e-9, "{}", m.area_planta(1));
    assert!((cota(&mut cena, 10.0, 10.0) - 5.0).abs() < 1e-9);
    assert!((cota(&mut cena, 5.0, 10.0) - 2.5).abs() < 1e-9, "ponto da borda: cota de T0 ali");
    assert!((cota(&mut cena, 5.0, 5.0) - 2.5).abs() < 1e-9, "canto da borda sobre a aresta de T0");
    assert_eq!(cotas(&mut cena, &[[2.0, 2.0]], 0)[0].0, ID_AUSENTE, "fora da borda é fora do terreno");
    let e = existente(&cena, 1).expect("existente");
    assert_eq!(e.t0.t.len(), 4, "T0 continua inteira");
    assert_eq!(e.e.ids.iter().filter(|&&id| id != ID_AUSENTE).count(), 1, "dos vértices de fonte só o centro fica dentro");
    assert_eq!(e.e.v.len(), 1 + 40, "o centro e a borda adensada de 1 em 1 m");
    assert!(e.avisos.is_empty());
}

#[test]
fn borda_fora_de_t0_recebe_a_cota_do_vertice_mais_proximo() {
    let fx = TerrenoFx { borda: Some(vec![[-5.0, -5.0], [25.0, -5.0], [25.0, 25.0], [-5.0, 25.0]]), ..t3(1) };
    let mut cena = cena_com(&[fx]);
    let m = malha(&mut cena, 0, 0);
    assert!((m.area_planta(1) - 900.0).abs() < 1e-9);
    assert!((cota(&mut cena, -5.0, -5.0) - 0.0).abs() < 1e-9);
    assert!((cota(&mut cena, 10.0, 10.0) - 5.0).abs() < 1e-9);
    m.conferir(1, 3.0);
}

#[test]
fn fusao_de_pontos_coincidentes() {
    let mut fx = t1(1);
    fx.pontos.push([20.0004, 20.0003, 10.0005]);
    fx.pontos.push([0.0002, 0.0, 14.0]);
    let mut cena = cena_com(&[fx]);
    let e = existente(&cena, 1).expect("existente");
    assert_eq!(e.t0.v.len(), 4, "os dois pontos a menos de 1 mm viram um com o vizinho");
    assert_eq!(e.t0.v[0], [0.0, 0.0, 10.0], "o primeiro vence, com a posição e a cota dele");
    assert_eq!(e.t0.ids, vec![0, 1, 2, 3]);
    assert_eq!(e.avisos.len(), 1, "só o par com cotas diferentes em mais de 1 mm avisa");
    let a = e.avisos[0];
    assert_eq!((a.codigo, a.indice, a.x, a.y, a.z, a.limite), (AVISO_COTAS_DIFERENTES, 5, 0.0, 0.0, 10.0, 0.001));
    assert!((a.medido - 4.0).abs() < 1e-12);
    assert_eq!(malha(&mut cena, 0, 0).triangulos(1, 0).len(), 2);
    assert!((cota(&mut cena, 0.0, 0.0) - 10.0).abs() < 1e-9);
}

#[test]
fn t9_restricoes_cruzadas_nao_derrubam() {
    let mut cena = cena_com(&[t9(1)]);
    let m = malha(&mut cena, 0, 0);
    m.conferir(1, 3.0);
    assert!((m.area_planta(1) - 400.0).abs() < 1e-9);
    assert!((cota(&mut cena, 5.0, 5.0) - 10.0).abs() < 1e-9);
    let e = existente(&cena, 1).expect("existente");
    let cruzes: Vec<_> = e.avisos.iter().filter(|a| a.codigo == AVISO_LINHA_CRUZA).collect();
    assert_eq!(cruzes.len(), 1, "aviso 2 uma vez");
    assert_eq!((cruzes[0].x, cruzes[0].y, cruzes[0].z, cruzes[0].indice), (10.0, 10.0, 10.0, 1), "no ponto médio do trecho pulado (a segunda quebra)");
    assert_eq!(e.t0.restricoes.len(), 1);
}

#[test]
fn malha_valida() {
    // (fixture, triângulos esperados (0 = não fixado), menor cota da superfície). Em T8 a menor cota é a da borda (2,5), não a dos cantos de fora.
    for (nome, fx, n, z_min) in [("T1", t1(1), 2, 10.0), ("T2", t2(1), 2, 10.25), ("T3", t3(1), 4, 0.0), ("T4", t4(1), 4, 0.0), ("T8", t8(1), 40, 2.5), ("T9", t9(1), 0, 10.0)] {
        let mut cena = cena_com(&[fx]);
        for superficie in [0, 1] {
            let m = malha(&mut cena, 0, superficie);
            let tri = m.conferir(1, 3.0);
            if n > 0 {
                assert_eq!(tri, n, "{nome}");
            }
            let z_base = m.triangulos(1, 2).iter().map(|t| m.v[t[0] as usize][2]).fold(f64::INFINITY, f64::min);
            assert_eq!(z_base, z_min - 3.0, "{nome}: z_base = min(z) − espessura_base");
        }
    }
}

#[test]
fn superficie_proposta_igual_a_existente_ate_a_r3() {
    let mut cena = cena_com(&[t3(1), t8(2)]);
    let (a, b) = (malha(&mut cena, 0, 0), malha(&mut cena, 0, 1));
    assert_eq!((a.grupos, a.v, a.i), (b.grupos, b.v, b.i));
    assert_eq!(cotas(&mut cena, &[[10.0, 10.0], [1.0, 1.0]], 0), cotas(&mut cena, &[[10.0, 10.0], [1.0, 1.0]], 1));
}

#[test]
fn cotas_batem_com_vertices() {
    let curva = TerrenoFx { curvas: vec![(3.0, vec![[4.0, 4.0], [16.0, 4.0], [16.0, 16.0], [4.0, 16.0]], true)], ..t3(1) };
    for fx in [t1(1), t2(1), t3(1), t4(1), t9(1), curva] {
        let fontes = fx.vertices_de_fonte();
        let mut cena = cena_com(&[fx]);
        let pontos: Vec<[f64; 2]> = fontes.iter().map(|p| [p[0], p[1]]).collect();
        for (c, p) in cotas(&mut cena, &pontos, 0).iter().zip(&fontes) {
            assert_eq!(c.0, 1);
            assert!((c.1 - p[2]).abs() < 1e-9, "({}, {}): {} x {}", p[0], p[1], c.1, p[2]);
            assert!(c.2.is_finite() && c.2 >= 0.0);
        }
        let fora = cotas(&mut cena, &[[-0.5, 3.0], [20.5, 3.0], [1e5, 1e5]], 0);
        assert!(fora.iter().all(|c| *c == (ID_AUSENTE, 0.0, 0.0)), "ponto fora: ID_AUSENTE e zeros");
    }
}

#[test]
fn terrenos_sobrepostos_responde_o_de_menor_id_e_o_nivel_filtra_a_malha() {
    let alto = TerrenoFx { nivel: 4, ..t1(2) };
    let mut cena = cena_com(&[t3(5), alto]);
    assert_eq!(cotas(&mut cena, &[[10.0, 10.0]], 0)[0], (2, 10.0, 0.0), "T1 (id 2) vence a pirâmide (id 5)");
    assert_eq!(malha(&mut cena, NIVEL_TODOS, 0).grupos.iter().map(|g| g[0]).collect::<Vec<_>>(), vec![2, 2, 2, 5, 5, 5]);
    assert_eq!(malha(&mut cena, 4, 0).grupos.iter().map(|g| g[0]).collect::<Vec<_>>(), vec![2, 2, 2]);
    assert_eq!(malha(&mut cena, 0, 0).grupos.iter().map(|g| g[0]).collect::<Vec<_>>(), vec![5, 5, 5]);
    assert!(malha(&mut cena, 9, 0).grupos.is_empty());
    let m = malha(&mut cena, NIVEL_TODOS, 0);
    m.conferir(2, 3.0);
    m.conferir(5, 3.0);
}

#[test]
fn menos_de_tres_pontos_saida_vazia() {
    let colineares = TerrenoFx::novo(1, vec![[0.0, 0.0, 1.0], [5.0, 5.0, 2.0], [10.0, 10.0, 3.0]]);
    let com_quebra = TerrenoFx { quebras: vec![vec![[0.0, 0.0, 1.0], [10.0, 10.0, 3.0]]], ..colineares.clone() };
    for fx in [TerrenoFx::novo(1, Vec::new()), TerrenoFx::novo(1, vec![[0.0, 0.0, 1.0], [5.0, 0.0, 2.0]]), colineares, com_quebra] {
        let mut cena = cena_com(&[fx]);
        let m = malha(&mut cena, 0, 0);
        assert!(m.grupos.is_empty() && m.v.is_empty() && m.i.is_empty(), "saídas vazias, sem erro");
        assert_eq!(cotas(&mut cena, &[[0.0, 0.0]], 0)[0], (ID_AUSENTE, 0.0, 0.0));
        let e = existente(&cena, 1).expect("existente");
        assert_eq!(e.avisos.iter().map(|a| a.codigo).collect::<Vec<_>>(), vec![AVISO_SEM_TRIANGULOS], "aviso 5");
    }
    let mut vazia = Cena::novo();
    assert!(malha(&mut vazia, NIVEL_TODOS, 0).grupos.is_empty());
    assert!(cotas(&mut vazia, &[], 0).is_empty());
}

#[test]
#[allow(non_snake_case)]
fn entrada_nan_e_ENTRADA() {
    for ruim in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        for eixo in 0..3 {
            let mut fx = t3(1);
            fx.pontos[4][eixo] = ruim;
            let mut cena = cena_com(&[t1(1)]);
            assert_eq!(enviar(&mut cena, &[fx]), Err(ENTRADA), "seção com {ruim} é recusada");
            assert_eq!(malha(&mut cena, 0, 0).triangulos(1, 0).len(), 2, "e a cena fica como estava");
        }
    }
    let mut cena = cena_com(&[t1(1)]);
    for args in [[f64::NAN, 0.0], [0.0, f64::NAN], [0.0, 2.0], [0.0, 0.5], [-1.0, 0.0], [0.0, f64::INFINITY]] {
        assert_eq!(executar(&mut cena, CONSULTA_TERRENO_MALHA, &args).err(), Some(ENTRADA), "{args:?}");
    }
    for arg in [f64::NAN, 2.0, -1.0, 0.5] {
        assert_eq!(executar(&mut cena, CONSULTA_TERRENO_COTAS, &[arg]).err(), Some(ENTRADA), "{arg}");
    }
    assert_eq!(executar(&mut cena, CONSULTA_TERRENO_MALHA, &[0.0]).err(), Some(ENTRADA), "falta argumento");
    // Coordenada finita que a biblioteca de triangulação recusa (menor que o mínimo dela) também é ENTRADA, não pânico.
    let mut minusculo = t3(1);
    minusculo.pontos[4][0] = 1e-300;
    let mut cena = cena_com(&[minusculo]);
    assert_eq!(executar(&mut cena, CONSULTA_TERRENO_MALHA, &[0.0, 0.0]).err(), Some(ENTRADA));
    enviar_sondas(&mut cena, &[[1.0, 1.0]]);
    assert_eq!(executar(&mut cena, CONSULTA_TERRENO_COTAS, &[0.0]).err(), Some(ENTRADA));
}

#[test]
fn cache_por_terreno() {
    let conta = |cena: &Cena| cena.cache_terreno.borrow().triangulacoes;
    let mut cena = cena_com(&[t1(1), t3(2)]);
    assert_eq!(conta(&cena), 0);
    malha(&mut cena, NIVEL_TODOS, 0);
    assert_eq!(conta(&cena), 2);
    malha(&mut cena, NIVEL_TODOS, 1);
    cotas(&mut cena, &[[1.0, 1.0]], 0);
    cotas(&mut cena, &[[2.0, 2.0], [3.0, 3.0]], 0);
    assert_eq!(conta(&cena), 2, "consultas repetidas e sondas novas não refazem nada");
    let e1 = existente(&cena, 1).expect("existente");
    // Muda o terreno 2 (a cota do centro): só ele é refeito.
    let mut outro = t3(2);
    outro.pontos[4][2] = 6.5;
    enviar(&mut cena, &[t1(1), outro.clone()]).expect("enviar");
    assert!((cotas(&mut cena, &[[10.0, 10.0]], 0)[0].1 - 10.0).abs() < 1e-9);
    let m = malha(&mut cena, NIVEL_TODOS, 0);
    assert_eq!(conta(&cena), 3, "mudar o terreno 2 não refaz a triangulação do 1");
    assert!(std::rc::Rc::ptr_eq(&e1, &existente(&cena, 1).expect("existente")), "o terreno 1 é o mesmo objeto do cache");
    assert_eq!(m.v.iter().filter(|p| p[2] == 6.5).count(), 1);
    // Espessura da base e nível não são fonte: não refazem a triangulação, mas mudam a malha de desenho.
    let grosso = TerrenoFx { espessura_base: 5.0, ..t1(1) };
    enviar(&mut cena, &[grosso, outro]).expect("enviar");
    let m = malha(&mut cena, NIVEL_TODOS, 0);
    assert_eq!(conta(&cena), 3);
    assert_eq!(m.conferir(1, 5.0), 2);
    // Terreno removido sai do cache; ao voltar igual, é refeito uma vez.
    enviar(&mut cena, &[t1(1)]).expect("enviar");
    malha(&mut cena, NIVEL_TODOS, 0);
    assert_eq!(conta(&cena), 3);
    enviar(&mut cena, &[t1(1), t3(2)]).expect("enviar");
    malha(&mut cena, NIVEL_TODOS, 0);
    assert_eq!(conta(&cena), 4);
}
