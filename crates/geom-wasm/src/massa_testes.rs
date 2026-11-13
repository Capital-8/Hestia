//! Aceite da ficha R1 do plano de massa: massas de referência M1 a M5 (A.10), malha fechada, interpolação de parâmetros e a consulta 140.

use crate::cena::Cena;
use crate::consultas::{executar, Saida};
use crate::esquema::{CONSULTA_MASSA_MALHA, ENTRADA, NIVEL_TODOS};
use crate::massa_fixture::{analisar, area_do_papel, m1, m2, m3, m4, m5, m5_petala, por_na_cena, todas};
use crate::massa_malha::{casca, massa_malha, orelhas};
use crate::massa_pilha::Pilha;
use crate::massa_tipos::{area_com_sinal, Massa, Perfil, PAPEL_BASE, PAPEL_LATERAL, PAPEL_TOPO};
use std::f64::consts::TAU;

fn raio_max(anel: &[[f64; 2]]) -> f64 {
    anel.iter().map(|p| p[0].hypot(p[1])).fold(0.0, f64::max)
}

#[test]
fn m1_caixa_volume_exato() {
    for lod in 0..3 {
        let m = massa_malha(&[m1()], lod).expect("malha");
        let a = analisar(&m);
        assert!(a.fechada);
        assert!((a.volume - 540.0).abs() < 1e-9, "lod {lod}: volume {}", a.volume);
        // Extrusão linear sem torção: só os dois anéis das seções; as 4 quinas caem na grade de 64.
        assert_eq!((m.vertices.len(), m.indices.len(), m.grupos.len()), (128, 3 * (128 + 62 + 62), 3));
        assert!((area_do_papel(&m, PAPEL_BASE) - 60.0).abs() < 1e-9 && (area_do_papel(&m, PAPEL_TOPO) - 60.0).abs() < 1e-9);
        assert!((area_do_papel(&m, PAPEL_LATERAL) - 32.0 * 9.0).abs() < 1e-9);
    }
    // As quinas do retângulo são vértices da malha (cantos vivos).
    let m = massa_malha(&[m1()], 1).expect("malha");
    for q in [[5.0, 3.0, 0.0], [-5.0, 3.0, 9.0], [-5.0, -3.0, 0.0], [5.0, -3.0, 9.0], [5.0, 0.0, 0.0]] {
        assert!(m.vertices.contains(&q), "falta o vértice {q:?}");
    }
}

#[test]
fn m2_cilindro_area_do_poligono() {
    let p = Pilha::nova(&m2()).expect("pilha");
    let n = p.t.len();
    assert_eq!(n, 64);
    // Área do polígono regular inscrito com |T| pontos.
    let esperada = 0.5 * n as f64 * 25.0 * (TAU / n as f64).sin();
    for z in [0.0, 3.0, 6.0, 11.9, 12.0] {
        let anel = p.anel_em_z(z).expect("fatia");
        assert!((area_com_sinal(&anel) - esperada).abs() < 1e-9, "z {z}");
    }
    for lod in 0..3 {
        let c = casca(&m2(), lod).expect("casca");
        assert!(c.aneis.iter().all(|a| (area_com_sinal(a) - esperada).abs() < 1e-9));
        let a = analisar(&massa_malha(&[m2()], lod).expect("malha"));
        assert!((a.volume - esperada * 12.0).abs() < 1e-9, "lod {lod}: volume {}", a.volume);
    }
}

#[test]
fn m3_torcida_area_constante() {
    let p = Pilha::nova(&m3()).expect("pilha");
    for i in 0..=300 {
        let anel = p.anel_em_z(i as f64 * 0.1).expect("fatia");
        assert!((area_com_sinal(&anel) - 64.0).abs() < 1e-6, "z {}", i as f64 * 0.1);
    }
    let c = casca(&m3(), 2).expect("casca");
    // π/2 em passos de 2,5°: 36 divisões, 37 anéis.
    assert_eq!(c.aneis.len(), 37);
    assert!(c.aneis.iter().all(|a| (area_com_sinal(a) - 64.0).abs() < 1e-6));
    let a = analisar(&massa_malha(&[m3()], 2).expect("malha"));
    assert!((a.volume - 1920.0).abs() <= 1920.0 * 0.005, "volume {}", a.volume);
}

#[test]
fn m4_bulbo_sem_ultrapassagem() {
    let p = Pilha::nova(&m4()).expect("pilha");
    for i in 0..=1500 {
        let z = i as f64 * 0.01;
        let anel = p.anel_em_z(z).expect("fatia");
        for q in &anel {
            let r = q[0].hypot(q[1]);
            assert!(r.is_finite() && r > 0.0 && r <= 6.0 + 1e-9, "z {z}: raio {r}");
        }
        // Área com sinal positiva: o anel não virou do avesso (raio não ficou negativo).
        assert!(area_com_sinal(&anel) > 0.0);
    }
    for q in p.anel_em_z(8.0).expect("fatia") {
        assert!((q[0].hypot(q[1]) - 6.0).abs() < 1e-9);
    }
    for lod in 0..3 {
        let c = casca(&m4(), lod).expect("casca");
        assert!(c.aneis.iter().all(|a| raio_max(a) <= 6.0 + 1e-9));
        // O anel da seção z = 8 está na malha, com raio 6.
        let k = c.z.iter().position(|z| *z == 8.0).expect("anel em z = 8");
        assert!(c.aneis[k].iter().all(|q| (q[0].hypot(q[1]) - 6.0).abs() < 1e-9));
    }
}

#[test]
fn m5_copias_sao_rotacoes() {
    for lod in 0..3 {
        let m = massa_malha(&m5(), lod).expect("malha");
        let da_petala: Vec<&[u32; 5]> = m.grupos.iter().filter(|g| g[0] == 6).collect();
        assert_eq!(da_petala.len(), 36);
        assert_eq!(da_petala.iter().map(|g| g[1]).max(), Some(11));
        assert_eq!(m.grupos.iter().filter(|g| g[0] == 5).count(), 3);
        // Vértices da pétala: 12 blocos iguais em tamanho, depois dos do bulbo.
        let n_bulbo = massa_malha(&m5()[..1], lod).expect("bulbo").vertices.len();
        let por_copia = (m.vertices.len() - n_bulbo) / 12;
        assert_eq!(n_bulbo + 12 * por_copia, m.vertices.len());
        let copia = |i: usize| &m.vertices[n_bulbo + i * por_copia..n_bulbo + (i + 1) * por_copia];
        for i in 0..12 {
            let (s, c) = (i as f64 * 30.0_f64.to_radians()).sin_cos();
            for (a, b) in copia(0).iter().zip(copia(i)) {
                let g = [a[0] * c - a[1] * s, a[0] * s + a[1] * c, a[2]];
                assert!((g[0] - b[0]).abs() < 1e-9 && (g[1] - b[1]).abs() < 1e-9 && g[2] == b[2], "lod {lod}, cópia {i}");
            }
        }
        // A cópia 0 é a própria massa, sem arranjo.
        let sozinha = massa_malha(&[Massa { arranjo: None, ..m5_petala() }], lod).expect("pétala");
        assert_eq!(copia(0), &sozinha.vertices[..]);
        // Os índices de cada cópia são os da cópia 0 deslocados.
        let g0 = da_petala[0];
        let g1 = da_petala[3];
        assert_eq!(g0[4], g1[4]);
        for k in 0..g0[4] as usize {
            assert_eq!(m.indices[g0[3] as usize + k] + por_copia as u32, m.indices[g1[3] as usize + k]);
        }
    }
}

#[test]
fn malha_fechada() {
    for (nome, massas) in todas() {
        for lod in 0..3 {
            let m = massa_malha(&massas, lod).expect("malha");
            let a = analisar(&m);
            assert!(a.fechada, "{nome} lod {lod}: aresta fora de exatamente 2 triângulos ou orientação incoerente");
            assert!(a.finita && a.volume > 0.0, "{nome} lod {lod}: volume {}", a.volume);
            // Cada casca sozinha também fecha e tem volume positivo (normais para fora).
            for trio in m.grupos.chunks_exact(3) {
                assert_eq!([trio[0][2], trio[1][2], trio[2][2]], [PAPEL_LATERAL, PAPEL_BASE, PAPEL_TOPO]);
                assert_eq!(trio[1][3], trio[0][3] + trio[0][4]);
                let (i0, i1) = (trio[0][3] as usize, (trio[2][3] + trio[2][4]) as usize);
                let so = crate::massa_malha::MalhaMassa { grupos: trio.to_vec(), vertices: m.vertices.clone(), indices: m.indices[i0..i1].to_vec() };
                let b = analisar(&so);
                assert!(b.fechada && b.volume > 0.0, "{nome} lod {lod}: casca {:?}", trio[0]);
            }
            // Tampas: base com normal para baixo, topo para cima (1e-12 cobre o arredondamento de três pontos colineares numa cópia girada).
            for g in &m.grupos {
                for t in m.indices[g[3] as usize..(g[3] + g[4]) as usize].chunks_exact(3) {
                    let (p, q, r) = (m.vertices[t[0] as usize], m.vertices[t[1] as usize], m.vertices[t[2] as usize]);
                    let nz = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
                    assert!(g[2] != PAPEL_BASE || nz <= 1e-12, "{nome}: base para cima ({nz})");
                    assert!(g[2] != PAPEL_TOPO || nz >= -1e-12, "{nome}: topo para baixo ({nz})");
                }
            }
        }
    }
}

#[test]
fn interpola_parametros_nao_mundo() {
    let r = 4.0 * std::f64::consts::SQRT_2;
    let c = casca(&m3(), 2).expect("casca");
    let (base, meio, topo) = (&c.aneis[0], &c.aneis[c.aneis.len() / 2], &c.aneis[c.aneis.len() - 1]);
    assert_eq!(c.z[c.aneis.len() / 2], 15.0);
    assert!((raio_max(base) - r).abs() < 1e-9 && (raio_max(topo) - r).abs() < 1e-9);
    // Interpolando pontos de mundo, o anel do meio encolheria para r·cos(45°).
    assert!((raio_max(meio) - r).abs() < 1e-9, "raio do meio {}", raio_max(meio));
    for anel in &c.aneis {
        assert!((raio_max(anel) - r).abs() < 1e-9);
    }
    // E o anel do meio está girado 45°: o vértice de t = 0 fica em (r·cos 45°, r·sin 45°) = (4, 4).
    assert!((meio[0][0] - 4.0).abs() < 1e-9 && (meio[0][1] - 4.0).abs() < 1e-9);
}

#[test]
fn orelhas_de_anel_concavo_e_com_pontos_colineares() {
    // "L" com um ponto a mais no meio de um lado (colinear).
    let l = [[0.0, 0.0], [2.0, 0.0], [4.0, 0.0], [4.0, 1.0], [1.0, 1.0], [1.0, 3.0], [0.0, 3.0]];
    let t = orelhas(&l);
    assert_eq!(t.len(), 5);
    let area = |t: &[u32; 3]| area_com_sinal(&[l[t[0] as usize], l[t[1] as usize], l[t[2] as usize]]);
    // Nenhum triângulo do avesso nem fora do "L": as áreas são positivas e somam a do polígono.
    assert!(t.iter().all(|x| area(x) > 0.0));
    assert!((t.iter().map(area).sum::<f64>() - 6.0).abs() < 1e-12);
    for x in &t {
        let c = [(l[x[0] as usize][0] + l[x[1] as usize][0] + l[x[2] as usize][0]) / 3.0, (l[x[0] as usize][1] + l[x[1] as usize][1] + l[x[2] as usize][1]) / 3.0];
        assert!(c[1] < 1.0 || c[0] < 1.0, "triângulo no vão do L: {x:?}");
    }
    assert_eq!(orelhas(&[[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]]), vec![[2, 0, 1]]);
    assert!(orelhas(&l[..2]).is_empty());
    // Anel que se cruza (laço em 8): ainda assim n - 2 triângulos, para a casca fechar.
    assert_eq!(orelhas(&[[0.0, 0.0], [2.0, 2.0], [2.0, 0.0], [0.0, 2.0]]).len(), 2);
}

#[test]
fn massa_concava_fecha_e_tem_o_volume_do_prisma() {
    let l = Perfil::Livre { pontos: vec![[-1.0, -1.0], [3.0, -1.0], [3.0, 0.5], [0.5, 0.5], [0.5, 2.0], [-1.0, 2.0]] };
    let mut m = m1();
    for s in &mut m.secoes {
        s.perfil = l.clone();
    }
    let a = analisar(&massa_malha(&[m], 1).expect("malha"));
    assert!(a.fechada);
    assert!((a.volume - (4.0 * 1.5 + 1.5 * 1.5) * 9.0).abs() < 1e-9, "volume {}", a.volume);
}

#[test]
fn a_conferencia_da_malha_acusa_buraco_e_face_virada() {
    let m = massa_malha(&[m1()], 0).expect("malha");
    assert!(analisar(&m).fechada);
    assert_eq!(analisar(&m).triangulos, 128 + 62 + 62);
    let mut buraco = m.clone();
    buraco.indices.truncate(m.indices.len() - 3);
    assert!(!analisar(&buraco).fechada);
    let mut virada = m.clone();
    virada.indices.swap(0, 1);
    assert!(!analisar(&virada).fechada);
    let mut dobrada = m.clone();
    dobrada.indices.extend_from_slice(&m.indices[..3]);
    assert!(!analisar(&dobrada).fechada);
    let mut ruim = m.clone();
    ruim.vertices[5][1] = f64::NAN;
    assert!(!analisar(&ruim).finita);
}

fn u32s(s: &Saida) -> &[u32] {
    match s {
        Saida::U32(v) => v,
        Saida::F64(_) => panic!("esperava u32"),
    }
}

#[test]
fn consulta_140_le_as_secoes_filtra_o_nivel_e_ordena() {
    let mut c = Cena::novo();
    let mut outra = Massa { num: 9, nivel: 7, ..m2() };
    outra.z_base = 3.5;
    por_na_cena(&mut c, &[m3(), m1(), outra.clone()]);
    // A leitura tipada devolve exatamente as massas gravadas, em ordem de massa_num.
    assert_eq!(c.massa.massas_do_nivel(NIVEL_TODOS), Ok(vec![m1(), m3(), outra.clone()]));
    assert_eq!(c.massa.massas_do_nivel(7), Ok(vec![outra.clone()]));
    let todas = executar(&mut c, CONSULTA_MASSA_MALHA, &[NIVEL_TODOS as f64, 1.0]).expect("consulta");
    let g = u32s(&todas[0]);
    assert_eq!(g.chunks_exact(5).map(|x| (x[0], x[1], x[2])).collect::<Vec<_>>(), vec![(1, 0, 0), (1, 0, 1), (1, 0, 2), (3, 0, 0), (3, 0, 1), (3, 0, 2), (9, 0, 0), (9, 0, 1), (9, 0, 2)]);
    assert_eq!(todas[1].len() % 3, 0);
    assert_eq!(u32s(&todas[2]).len(), g.chunks_exact(5).map(|x| x[4] as usize).sum::<usize>());
    // Só o nível 7: a massa 9, com a base na cota 3,5.
    let n7 = executar(&mut c, CONSULTA_MASSA_MALHA, &[7.0, 0.0]).expect("consulta");
    assert_eq!(u32s(&n7[0]).chunks_exact(5).map(|x| x[0]).collect::<Vec<_>>(), vec![9, 9, 9]);
    let esperada = massa_malha(&[outra], 0).expect("malha");
    assert_eq!(n7[1], Saida::F64(esperada.vertices.iter().flat_map(|p| p.iter().copied()).collect()));
    assert_eq!(esperada.vertices[0][2], 3.5);
    assert_eq!(esperada.vertices[esperada.vertices.len() - 1][2], 15.5);
    // Nível sem massa: saídas vazias. lod fora de 0..2: ENTRADA.
    let vazio = executar(&mut c, CONSULTA_MASSA_MALHA, &[3.0, 1.0]).expect("consulta");
    assert!(vazio.iter().all(|s| s.is_empty()));
    assert_eq!(executar(&mut c, CONSULTA_MASSA_MALHA, &[0.0, 3.0]), Err(ENTRADA));
    assert_eq!(executar(&mut c, CONSULTA_MASSA_MALHA, &[0.0, f64::NAN]), Err(ENTRADA));
}

#[test]
fn leitura_tipada_recusa_pilha_invalida_e_pula_massa_sem_secoes() {
    let mut c = Cena::novo();
    por_na_cena(&mut c, &[m1(), m4()]);
    // Massa só com a linha da seção 140 (sem seções): não gera geometria.
    c.massa.massas.insert(50, c.massa.massas[&1]);
    assert_eq!(c.massa.massas_do_nivel(0).map(|v| v.iter().map(|m| m.num).collect::<Vec<_>>()), Ok(vec![1, 4]));
    // Ordem repetida numa pilha lida: ENTRADA (só no nível que a contém).
    let mut d = Cena::novo();
    por_na_cena(&mut d, &[m1(), Massa { nivel: 2, ..m2() }]);
    let id = *d.massa.secoes.iter().find(|(_, s)| s.massa == 2 && s.ordem == 1).expect("seção").0;
    d.massa.secoes.get_mut(&id).expect("seção").ordem = 0;
    assert_eq!(d.massa.massas_do_nivel(2), Err(ENTRADA));
    assert_eq!(d.massa.massas_do_nivel(0).map(|v| v.len()), Ok(1));
    // Ponto com ordem repetida no perfil livre: ENTRADA.
    let mut e = Cena::novo();
    por_na_cena(&mut e, &[m1()]);
    e.massa.pontos.get_mut(&2).expect("ponto").ordem = 0;
    assert_eq!(e.massa.massas_do_nivel(0), Err(ENTRADA));
    // Regra de A.3 quebrada (resolução fora da faixa, escala nula, perfil livre de área nula): ENTRADA.
    for f in [(|c: &mut Cena| c.massa.massas.get_mut(&1).expect("massa").resolucao = 8) as fn(&mut Cena), |c| c.massa.secoes.get_mut(&1).expect("seção").escala = 0.0, |c| c.massa.pontos.get_mut(&2).expect("ponto").y = 9.0] {
        let mut x = Cena::novo();
        por_na_cena(&mut x, &[m1()]);
        f(&mut x);
        assert_eq!(executar(&mut x, CONSULTA_MASSA_MALHA, &[0.0, 1.0]), Err(ENTRADA));
    }
}
