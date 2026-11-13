//! Testes da ficha K3 (estrutura): malha das fundações (A.4.2). Fixtures da A.10: E7 e E8.

use std::f64::consts::PI;

use crate::cena::Cena;
use crate::consultas::{executar, Saida};
use crate::esquema::{ENTRADA, ID_AUSENTE, NIVEL_TODOS};
use crate::estr_fundacao::quadro_corrida;
use crate::estr_malha::*;
use crate::estr_perfil::{contorno, lados_por_lod, P2};
use crate::estr_prisma::volume;
use crate::estr_testes::{cena, fechada, perfil, rel};
use crate::gc_malha::PecaMalha;
use crate::secoes_estr::*;
use crate::teste_util::Xorshift;

const NAN: f64 = f64::NAN;

fn tipo(modo: u8, forma: u8, base: PerfilLinha, altura_base: f64, pescoco: Option<(PerfilLinha, f64)>) -> TipoFundacaoLinha {
    TipoFundacaoLinha { modo, forma, base, altura_base, pescoco, material: 4 }
}

fn isolada(tipo: u32, topo: f64) -> FundacaoLinha {
    FundacaoLinha { nivel: 0, tipo, pos: Some([1.0, 2.0]), rotacao: 0.3, eixo: None, hosp: ID_AUSENTE, deslocamento_topo: topo }
}

fn corrida(tipo: u32, a: [f64; 2], b: [f64; 2], topo: f64) -> FundacaoLinha {
    FundacaoLinha { nivel: 0, tipo, pos: None, rotacao: 0.0, eixo: Some((a, b)), hosp: ID_AUSENTE, deslocamento_topo: topo }
}

/// Cena com uma fundação (id 10, tipo 1) e a malha dela (lod fino): `(malha, [peças por grupo])`.
fn monta(t: TipoFundacaoLinha, f: FundacaoLinha) -> Result<(MalhaEstr, Vec<PecaMalha>), u32> {
    let mut c = cena();
    c.estr.tipos_fundacao.insert(1, t);
    c.estr.fundacoes.insert(10, f);
    let m = montar(&c, 0, 2)?;
    let pecas = m.grupos.iter().map(|g| m.peca(g)).collect();
    Ok((m, pecas))
}

fn zs(p: &PecaMalha) -> (f64, f64) {
    let usados: Vec<f64> = p.triangulos.iter().flatten().map(|&k| p.vertices[k as usize][2]).collect();
    (usados.iter().cloned().fold(f64::INFINITY, f64::min), usados.iter().cloned().fold(f64::NEG_INFINITY, f64::max))
}

#[test]
fn e7_sapata_isolada_com_pescoco() {
    let t = tipo(FUNDACAO_ISOLADA, FUNDACAO_SAPATA, perfil(PERFIL_RETANGULAR, &[0.8, 0.8]), 0.3, Some((perfil(PERFIL_RETANGULAR, &[0.25, 0.25]), 0.5)));
    let (m, p) = monta(t, isolada(1, 0.0)).expect("malha");
    assert_eq!(m.grupos.iter().map(|g| (g.elemento, g.categoria, g.parte, g.material)).collect::<Vec<_>>(), vec![(10, CATEGORIA_FUNDACAO, PARTE_BASE, 4), (10, CATEGORIA_FUNDACAO, PARTE_PESCOCO, 4)]);
    assert!(rel(volume(&p[0]), 0.192) < 1e-9 && rel(volume(&p[1]), 0.03125) < 1e-9);
    assert!(rel(volume(&p[0]) + volume(&p[1]), 0.22325) < 1e-9);
    assert!(p.iter().all(fechada));
}

#[test]
fn e8_baldrame() {
    let t = tipo(FUNDACAO_CORRIDA, FUNDACAO_SAPATA, perfil(PERFIL_RETANGULAR, &[0.4, 0.3]), 0.3, None);
    let (m, p) = monta(t, corrida(1, [0.0, 0.0], [6.0, 0.0], -0.1)).expect("malha");
    assert_eq!(m.grupos.len(), 1);
    assert!(fechada(&p[0]));
    assert!(rel(volume(&p[0]), 0.72) < 1e-9, "{}", volume(&p[0]));
    // Seção perpendicular ao eixo: largura horizontal (y de -0,2 a 0,2) e altura vertical (z de -0,4 a -0,1).
    let (zmin, zmax) = zs(&p[0]);
    assert!(rel(zmax, -0.1) < 1e-12 && rel(zmin, -0.4) < 1e-12);
    let ys: Vec<f64> = p[0].vertices.iter().map(|v| v[1]).collect();
    assert!((ys.iter().cloned().fold(f64::NEG_INFINITY, f64::max) - 0.2).abs() < 1e-12);
}

#[test]
fn estaca_circular_e_tubo_circular() {
    let r = 0.15;
    let lados = lados_por_lod(2) as f64;
    // Área do polígono regular de 96 lados inscrito em d/2.
    let area_circ = lados / 2.0 * r * r * (2.0 * PI / lados).sin();
    let (_, p) = monta(tipo(FUNDACAO_ISOLADA, FUNDACAO_ESTACA, perfil(PERFIL_CIRCULAR, &[0.3]), 8.0, None), isolada(1, 0.0)).expect("circular");
    assert!(fechada(&p[0]));
    assert!(rel(volume(&p[0]), area_circ * 8.0) < 1e-9);
    let ri = 0.15 - 0.02;
    let area_tubo = lados / 2.0 * (r * r - ri * ri) * (2.0 * PI / lados).sin();
    let (_, p) = monta(tipo(FUNDACAO_ISOLADA, FUNDACAO_ESTACA, perfil(PERFIL_TUBO_CIRCULAR, &[0.3, 0.02]), 6.0, None), isolada(1, -0.5)).expect("tubo");
    assert!(fechada(&p[0]));
    assert!(rel(volume(&p[0]), area_tubo * 6.0) < 1e-9, "{} {}", volume(&p[0]), area_tubo * 6.0);
}

#[test]
fn corrida_inclinada_em_planta() {
    let t = tipo(FUNDACAO_CORRIDA, FUNDACAO_SAPATA, perfil(PERFIL_RETANGULAR, &[0.5, 0.4]), 0.4, None);
    let (a, b) = ([1.0, -2.0], [4.0, 2.0]);
    let (_, p) = monta(t, corrida(1, a, b, 0.0)).expect("malha");
    assert!(fechada(&p[0]));
    assert!(rel(volume(&p[0]), 0.5 * 0.4 * 5.0) < 1e-9);
    // As quatro quinas da face inicial ficam a 0,25 do eixo na horizontal.
    let q = quadro_corrida(a, b, 0.0, [-0.2, 0.2]).expect("quadro");
    assert!(q.ex[2].abs() < 1e-15 && (q.ex[0].hypot(q.ex[1]) - 1.0).abs() < 1e-12);
    assert!((q.ex[0] * 3.0 + q.ex[1] * 4.0).abs() < 1e-12, "X perpendicular ao eixo");
}

#[test]
fn topo_negativo_e_pescoco_sobre_a_base() {
    let (cota, topo) = (3.0, -0.8);
    let mut c = cena();
    // Nível 1 (id 2 na seção 19: nivel_num 1) tem cota 3; usar a fundação nele.
    let sem = tipo(FUNDACAO_ISOLADA, FUNDACAO_SAPATA, perfil(PERFIL_RETANGULAR, &[0.8, 0.8]), 0.3, None);
    let com = tipo(FUNDACAO_ISOLADA, FUNDACAO_SAPATA, perfil(PERFIL_RETANGULAR, &[0.8, 0.8]), 0.3, Some((perfil(PERFIL_RETANGULAR, &[0.25, 0.25]), 0.5)));
    c.estr.tipos_fundacao.insert(1, sem);
    c.estr.tipos_fundacao.insert(2, com);
    c.estr.fundacoes.insert(10, FundacaoLinha { nivel: 1, ..isolada(1, topo) });
    c.estr.fundacoes.insert(11, FundacaoLinha { nivel: 1, ..isolada(2, topo) });
    let m = montar(&c, 1, 2).expect("malha");
    assert_eq!(m.grupos.len(), 3);
    let faixa = |k: usize| zs(&m.peca(&m.grupos[k]));
    // Sem pescoço: topo da base em cota + topo; face inferior 0,3 abaixo.
    let (lo, hi) = faixa(0);
    assert!((hi - (cota + topo)).abs() < 1e-12 && (lo - (cota + topo - 0.3)).abs() < 1e-12);
    // Com pescoço: o pescoço termina em cota + topo; a base assenta 0,5 abaixo (topo da base = base do pescoço).
    let (blo, bhi) = faixa(1);
    let (plo, phi) = faixa(2);
    assert!((phi - (cota + topo)).abs() < 1e-12 && (plo - (cota + topo - 0.5)).abs() < 1e-12);
    assert!((bhi - plo).abs() < 1e-12 && (blo - (plo - 0.3)).abs() < 1e-12);
}

#[test]
fn malha_valida_das_fundacoes() {
    let casos = [
        (tipo(FUNDACAO_ISOLADA, FUNDACAO_SAPATA, perfil(PERFIL_RETANGULAR, &[0.8, 0.6]), 0.3, Some((perfil(PERFIL_CIRCULAR, &[0.3]), 0.4))), isolada(1, 0.1), 0.8 * 0.6 * 0.3),
        (tipo(FUNDACAO_ISOLADA, FUNDACAO_BLOCO, perfil(PERFIL_CIRCULAR, &[1.0]), 0.5, None), isolada(1, -1.0), 0.0),
        (tipo(FUNDACAO_ISOLADA, FUNDACAO_ESTACA, perfil(PERFIL_TUBO_CIRCULAR, &[0.4, 0.05]), 5.0, None), isolada(1, 0.0), 0.0),
        (tipo(FUNDACAO_CORRIDA, FUNDACAO_SAPATA, perfil(PERFIL_RETANGULAR, &[0.4, 0.3]), 0.3, None), corrida(1, [0.0, 0.0], [3.0, 4.0], 0.0), 0.4 * 0.3 * 5.0),
    ];
    for lod in 0..3 {
        for (t, f, _) in casos {
            let mut c = cena();
            c.estr.tipos_fundacao.insert(1, t);
            c.estr.fundacoes.insert(10, f);
            let m = montar(&c, 0, lod).expect("malha");
            for g in &m.grupos {
                let p = m.peca(g);
                assert!(fechada(&p), "{t:?} lod {lod}");
                let perf = if g.parte == PARTE_PESCOCO { t.pescoco.expect("pescoço").0 } else { t.base };
                let area = contorno(&perf, &[], lados_por_lod(lod)).expect("perfil").area();
                let comp = if g.parte == PARTE_PESCOCO { t.pescoco.expect("pescoço").1 } else if t.modo == FUNDACAO_CORRIDA { 5.0 } else { t.altura_base };
                assert!(rel(volume(&p), area * comp) < 1e-9, "{t:?} lod {lod}: {}", volume(&p));
            }
        }
    }
    // Todas as normais para fora: volume com sinal positivo (conferido acima); personalizado como base.
    let anel: Vec<P2> = vec![[0.0, 0.0], [1.0, 0.0], [1.0, 0.4], [0.4, 0.4], [0.4, 1.0], [0.0, 1.0]];
    let mut c = cena();
    c.estr.tipos_fundacao.insert(1, tipo(FUNDACAO_ISOLADA, FUNDACAO_SAPATA, PerfilLinha { forma: PERFIL_PERSONALIZADO, p: [NAN; 6], perfil: 3 }, 0.3, None));
    c.estr.perfis.extend(anel.iter().enumerate().map(|(i, &p)| ((i + 1) as u32, VerticePerfilLinha { perfil: 3, anel: 0, indice: i as u32, p })));
    c.estr.fundacoes.insert(10, isolada(1, 0.0));
    let m = montar(&c, 0, 2).expect("personalizado");
    assert!(rel(volume(&m.peca(&m.grupos[0])), 0.64 * 0.3) < 1e-9, "área do L por Shoelace vezes a altura");
    assert!(fechada(&m.peca(&m.grupos[0])));
}

#[test]
fn entrada_sem_panico_nos_invalidos() {
    let sap = tipo(FUNDACAO_ISOLADA, FUNDACAO_SAPATA, perfil(PERFIL_RETANGULAR, &[0.8, 0.8]), 0.3, None);
    let cor = tipo(FUNDACAO_CORRIDA, FUNDACAO_SAPATA, perfil(PERFIL_RETANGULAR, &[0.4, 0.3]), 0.3, None);
    let casos: Vec<(TipoFundacaoLinha, FundacaoLinha)> = vec![
        (cor, corrida(1, [0.0, 0.0], [0.0005, 0.0], 0.0)),
        (cor, corrida(1, [1.0, 1.0], [1.0, 1.0], 0.0)),
        (cor, corrida(1, [NAN, 0.0], [1.0, 0.0], 0.0)),
        (cor, isolada(1, 0.0)),
        (sap, corrida(1, [0.0, 0.0], [3.0, 0.0], 0.0)),
        (sap, FundacaoLinha { pos: None, ..isolada(1, 0.0) }),
        (sap, isolada(1, NAN)),
        (tipo(FUNDACAO_ISOLADA, FUNDACAO_SAPATA, perfil(PERFIL_RETANGULAR, &[0.8, -1.0]), 0.3, None), isolada(1, 0.0)),
        (tipo(FUNDACAO_ISOLADA, FUNDACAO_SAPATA, perfil(PERFIL_RETANGULAR, &[0.8, 0.8]), 0.0, None), isolada(1, 0.0)),
        (tipo(FUNDACAO_ISOLADA, FUNDACAO_SAPATA, perfil(PERFIL_I, &[0.1, 0.2, 0.1, 0.005]), 0.3, None), isolada(1, 0.0)),
        (tipo(FUNDACAO_ISOLADA, FUNDACAO_SAPATA, perfil(PERFIL_RETANGULAR, &[0.8, 0.8]), 0.3, Some((perfil(PERFIL_RETANGULAR, &[0.2, 0.2]), NAN))), isolada(1, 0.0)),
        (tipo(FUNDACAO_ISOLADA, FUNDACAO_ESTACA, perfil(PERFIL_CIRCULAR, &[0.3]), 5.0, Some((perfil(PERFIL_RETANGULAR, &[0.2, 0.2]), 0.3))), isolada(1, 0.0)),
    ];
    for (t, f) in casos {
        assert_eq!(monta(t, f).map(|_| ()), Err(ENTRADA), "{t:?} {f:?}");
    }
    // Tipo ausente e nível ausente.
    let mut c = cena();
    c.estr.fundacoes.insert(10, isolada(9, 0.0));
    assert_eq!(montar(&c, NIVEL_TODOS, 2).err(), Some(ENTRADA));
    c.estr.tipos_fundacao.insert(9, sap);
    c.estr.fundacoes.insert(10, FundacaoLinha { nivel: 77, ..isolada(9, 0.0) });
    assert_eq!(montar(&c, NIVEL_TODOS, 2).err(), Some(ENTRADA));
    // Quadro de extrusão com eixo nulo.
    assert_eq!(quadro_corrida([0.0, 0.0], [0.0, 0.0], 0.0, [0.0, 1.0]), Err(ENTRADA));
}

#[test]
fn fuzz_fundacoes_100() {
    let mut r = Xorshift::novo(2027);
    let valores = [NAN, 0.0, -0.3, f64::INFINITY, 1e-12, 1e9, 0.05, 0.3, 0.8];
    let mut pick = |r: &mut Xorshift| if r.proximo().is_multiple_of(3) { valores[(r.proximo() % valores.len() as u64) as usize] } else { r.intervalo(0.01, 2.0) };
    let mut validos = 0;
    for i in 0..100 {
        let forma_perfil = [PERFIL_RETANGULAR, PERFIL_CIRCULAR, PERFIL_TUBO_CIRCULAR, PERFIL_I, PERFIL_PERSONALIZADO][(r.proximo() % 5) as usize];
        let p = PerfilLinha { forma: forma_perfil, p: [pick(&mut r), pick(&mut r), pick(&mut r), pick(&mut r), NAN, NAN], perfil: ID_AUSENTE };
        let pesc = (r.proximo() % 2 == 0).then(|| (perfil(PERFIL_RETANGULAR, &[pick(&mut r), pick(&mut r)]), pick(&mut r)));
        let t = tipo((r.proximo() % 2) as u8, (r.proximo() % 3) as u8, p, pick(&mut r), pesc);
        let f = FundacaoLinha {
            nivel: (r.proximo() % 3) as u32,
            tipo: 1,
            pos: (r.proximo() % 2 == 0).then(|| [pick(&mut r), pick(&mut r)]),
            rotacao: pick(&mut r),
            eixo: (r.proximo() % 2 == 0).then(|| ([pick(&mut r), pick(&mut r)], [pick(&mut r), pick(&mut r)])),
            hosp: ID_AUSENTE,
            deslocamento_topo: pick(&mut r),
        };
        if let Ok((_, pecas)) = monta(t, f) {
            validos += 1;
            assert!(pecas.iter().all(fechada), "rodada {i}");
        }
    }
    assert!(validos > 0, "o fuzz exercita ao menos uma fundação válida");
}

#[test]
fn consulta_200_inclui_fundacoes_depois_das_vigas() {
    let mut c: Cena = cena();
    c.estr.tipos_fundacao.insert(1, tipo(FUNDACAO_ISOLADA, FUNDACAO_SAPATA, perfil(PERFIL_RETANGULAR, &[0.8, 0.8]), 0.3, Some((perfil(PERFIL_RETANGULAR, &[0.25, 0.25]), 0.5))));
    c.estr.fundacoes.insert(3, isolada(1, 0.0));
    c.estr.fundacoes.insert(2, FundacaoLinha { nivel: 1, ..isolada(1, 0.0) });
    let s = executar(&mut c, 200, &[NIVEL_TODOS as f64, 2.0]).expect("consulta");
    let Saida::U32(g) = &s[0] else { panic!("grupos") };
    let chaves: Vec<_> = g.chunks(6).map(|x| (x[0], x[1], x[2])).collect();
    assert_eq!(chaves, vec![(2, 2, 1), (2, 2, 2), (3, 2, 1), (3, 2, 2)]);
    let Saida::U32(g1) = &executar(&mut c, 200, &[1.0, 2.0]).expect("nível 1")[0] else { panic!("grupos") };
    assert_eq!(g1.chunks(6).map(|x| x[0]).collect::<Vec<_>>(), vec![2, 2]);
}
