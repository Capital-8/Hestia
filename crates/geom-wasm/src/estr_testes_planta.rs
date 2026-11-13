//! Testes da ficha K4 (estrutura): planta (consulta 201), corte (202) e quantidades (203). Fixtures da A.10 (E1, E4, E5, E7, E8).

use crate::cena::Cena;
use crate::consultas::{executar, Saida};
use crate::esquema::{ID_AUSENTE, NIVEL_TODOS};
use crate::estr_malha::*;
use crate::estr_perfil::{area_com_sinal, P2};
use crate::estr_prisma::volume;
use crate::estr_testes::{cena, perfil, rel};
use crate::secoes_estr::*;

const NAN: f64 = f64::NAN;

pub(crate) fn tipo_pilar(c: &mut Cena, id: u32, disciplina: u8, p: PerfilLinha) {
    c.estr.tipos_pilar.insert(id, TipoPilarLinha { disciplina, perfil: p, material: 7, espessura_camadas: 0.0 });
}

pub(crate) fn pilar_em(tipo: u32, pos: P2, altura: f64) -> PilarLinha {
    PilarLinha { nivel: 0, tipo, disciplina: 1, pos, rotacao: 0.0, deslocamento_base: 0.0, nivel_topo: ID_AUSENTE, deslocamento_topo: 0.0, altura, hosp: ID_AUSENTE }
}

pub(crate) fn viga_de(tipo: u32, a: P2, b: P2, z: [f64; 2]) -> VigaLinha {
    VigaLinha { nivel: 0, tipo, a, b, deslocamento_z: z, alinhamento: ALINHA_TOPO, rotacao: 0.0, extremidades: [0, 0] }
}

pub(crate) fn tipo_viga(c: &mut Cena, id: u32, p: PerfilLinha) {
    c.estr.tipos_viga.insert(id, TipoVigaLinha { perfil: p, material: 3 });
}

pub(crate) fn sapata_e7() -> TipoFundacaoLinha {
    let pescoco = Some((perfil(PERFIL_RETANGULAR, &[0.25, 0.25]), 0.5));
    TipoFundacaoLinha { modo: FUNDACAO_ISOLADA, forma: FUNDACAO_SAPATA, base: perfil(PERFIL_RETANGULAR, &[0.8, 0.8]), altura_base: 0.3, pescoco, material: 4 }
}

pub(crate) fn baldrame_e8() -> TipoFundacaoLinha {
    TipoFundacaoLinha { modo: FUNDACAO_CORRIDA, forma: FUNDACAO_SAPATA, base: perfil(PERFIL_RETANGULAR, &[0.4, 0.3]), altura_base: 0.3, pescoco: None, material: 4 }
}

pub(crate) fn isolada_em(tipo: u32, pos: P2, topo: f64) -> FundacaoLinha {
    FundacaoLinha { nivel: 0, tipo, pos: Some(pos), rotacao: 0.0, eixo: None, hosp: ID_AUSENTE, deslocamento_topo: topo }
}

pub(crate) fn corrida_de(tipo: u32, a: P2, b: P2, topo: f64) -> FundacaoLinha {
    FundacaoLinha { nivel: 0, tipo, pos: None, rotacao: 0.0, eixo: Some((a, b)), hosp: ID_AUSENTE, deslocamento_topo: topo }
}

pub(crate) fn u32s(s: &Saida) -> Vec<u32> {
    if let Saida::U32(v) = s { v.clone() } else { panic!("esperava u32") }
}

pub(crate) fn f64s(s: &Saida) -> Vec<f64> {
    if let Saida::F64(v) = s { v.clone() } else { panic!("esperava f64") }
}

/// Linha decodificada: `(elemento, categoria, estilo, papel, pontos)`.
pub(crate) type Linha = (u32, u32, u32, u32, Vec<P2>);

pub(crate) fn linhas(s: &[Saida]) -> Vec<Linha> {
    let (tab, pts) = (u32s(&s[0]), f64s(&s[1]));
    let mut k = 0;
    tab.chunks_exact(5)
        .map(|t| {
            let n = t[4] as usize;
            let p = pts[2 * k..2 * (k + n)].chunks_exact(2).map(|c| [c[0], c[1]]).collect();
            k += n;
            (t[0], t[1], t[2], t[3], p)
        })
        .collect()
}

/// Área de um anel fechado (que repete o primeiro ponto).
pub(crate) fn area_fechada(p: &[P2]) -> f64 {
    assert_eq!(p.first(), p.last(), "anel fechado repete o primeiro ponto");
    area_com_sinal(&p[..p.len() - 1]).abs()
}

fn planta(c: &mut Cena, corte: f64, detalhe: f64) -> Vec<Linha> {
    linhas(&executar(c, 201, &[NIVEL_TODOS as f64, corte, detalhe]).expect("201"))
}

#[test]
fn planta_pilar_cortado_tem_secao_e_furos() {
    let mut c = cena();
    tipo_pilar(&mut c, 1, DISCIPLINA_ESTRUTURAL, perfil(PERFIL_TUBO_RETANGULAR, &[0.1, 0.1, 0.005]));
    tipo_pilar(&mut c, 2, DISCIPLINA_ESTRUTURAL, perfil(PERFIL_TUBO_CIRCULAR, &[0.3, 0.02]));
    c.estr.pilares.insert(10, pilar_em(1, [1.0, 1.0], 3.0));
    c.estr.pilares.insert(11, pilar_em(2, [3.0, 1.0], 3.0));
    // Acima do corte (base 2,0): não sai. Abaixo (altura 1,0): contorno projetado cheio.
    c.estr.pilares.insert(12, PilarLinha { deslocamento_base: 2.0, ..pilar_em(1, [5.0, 1.0], 1.0) });
    c.estr.pilares.insert(13, pilar_em(1, [7.0, 1.0], 1.0));
    let l = planta(&mut c, 1.2, 2.0);
    let chaves: Vec<[u32; 4]> = l.iter().map(|x| [x.0, x.1, x.2, x.3]).collect();
    assert_eq!(chaves, vec![[10, 0, 0, 0], [10, 0, 0, 1], [11, 0, 0, 0], [11, 0, 0, 1], [13, 0, 0, 2]]);
    assert!(rel(area_fechada(&l[0].4), 0.01) < 1e-9 && rel(area_fechada(&l[1].4), 0.0081) < 1e-9, "anel e furo do tubo");
    assert_eq!((l[2].4.len(), l[3].4.len()), (97, 97), "tubo circular: 96 lados, fechado");
    assert!(l[0].4.iter().all(|p| (p[0] - 1.0).abs() <= 0.05 + 1e-12 && (p[1] - 1.0).abs() <= 0.05 + 1e-12));
    // Detalhe grosso: 24 lados no círculo.
    let g = planta(&mut c, 1.2, 0.0);
    assert_eq!(g[2].4.len(), 25);
    // Corte exatamente no topo ainda corta; abaixo de tudo, nada.
    assert_eq!(planta(&mut c, 3.0, 1.0).iter().filter(|x| x.3 == PAPEL_ANEL_T).count(), 3, "pilar 12 (2,0 a 3,0) também cortado");
    assert!(planta(&mut c, -1.0, 1.0).is_empty());
}

const PAPEL_ANEL_T: u32 = 0;

#[test]
fn planta_viga_abaixo_do_corte_e_tracejada() {
    let mut c = cena();
    tipo_viga(&mut c, 1, perfil(PERFIL_RETANGULAR, &[0.15, 0.4]));
    tipo_viga(&mut c, 2, perfil(PERFIL_I, &[0.1, 0.2, 0.008, 0.005]));
    // 5: abaixo (topo 0,5); 6: acima (topo 3,0); 7: cortada (1,0 a 1,4); 8: I cortado na alma; 9: inclinada abaixo.
    c.estr.vigas.insert(5, viga_de(1, [0.0, 0.0], [5.0, 0.0], [0.5, 0.5]));
    c.estr.vigas.insert(6, viga_de(1, [0.0, 2.0], [5.0, 2.0], [3.0, 3.0]));
    c.estr.vigas.insert(7, viga_de(1, [0.0, 4.0], [5.0, 4.0], [1.4, 1.4]));
    c.estr.vigas.insert(8, viga_de(2, [0.0, 6.0], [5.0, 6.0], [1.3, 1.3]));
    c.estr.vigas.insert(9, viga_de(1, [0.0, 8.0], [3.0, 12.0], [0.2, 0.8]));
    let l = planta(&mut c, 1.2, 1.0);
    let chaves: Vec<[u32; 4]> = l.iter().map(|x| [x.0, x.1, x.2, x.3]).collect();
    assert_eq!(chaves, vec![[5, 1, 1, 2], [7, 1, 0, 0], [8, 1, 0, 0], [9, 1, 1, 2]]);
    assert!(rel(area_fechada(&l[0].4), 0.75) < 1e-9, "retângulo projetado 0,15 × 5");
    assert_eq!(l[0].4.len(), 5);
    assert!(rel(area_fechada(&l[1].4), 0.75) < 1e-9, "viga cortada: a faixa toda");
    assert!(rel(area_fechada(&l[2].4), 0.005 * 5.0) < 1e-9, "I cortado na alma: faixa de tw");
    // Inclinada abaixo do corte: o contorno convexo da projeção (seção perpendicular ao eixo inclinado: as pontas avançam em planta).
    let a9 = area_fechada(&l[3].4);
    assert!((0.15 * 5.0 - 1e-9..0.15 * 5.2).contains(&a9), "{a9}");
}

#[test]
fn planta_viga_inclinada_cortada() {
    let mut c = cena();
    tipo_viga(&mut c, 1, perfil(PERFIL_RETANGULAR, &[0.15, 0.4]));
    c.estr.vigas.insert(1, viga_de(1, [0.0, 0.0], [5.0, 0.0], [0.5, 2.0]));
    // Faixa de corte longe das pontas: área 0,15 · 0,4 / sen θ.
    let l = planta(&mut c, 1.2, 1.0);
    assert_eq!(l.len(), 1);
    let sen = 1.5 / 27.25f64.sqrt();
    assert!(rel(area_fechada(&l[0].4), 0.06 / sen) < 1e-6, "{}", area_fechada(&l[0].4));
    // Corte junto da ponta a: a faixa é recortada pela face da ponta (menor que a faixa inteira, maior que zero).
    let l = planta(&mut c, 0.45, 1.0);
    assert_eq!(l.len(), 1);
    let a = area_fechada(&l[0].4);
    assert!(a > 0.0 && a < 0.06 / sen, "{a}");
    assert!(l[0].4.iter().all(|p| p[0] >= -0.2 && p[0] <= 5.0));
}

#[test]
fn planta_fundacao_tracejada() {
    let mut c = cena();
    c.estr.tipos_fundacao.insert(1, sapata_e7());
    c.estr.tipos_fundacao.insert(2, baldrame_e8());
    c.estr.fundacoes.insert(3, isolada_em(1, [1.0, 1.0], -0.1));
    c.estr.fundacoes.insert(4, corrida_de(2, [0.0, 3.0], [6.0, 3.0], -0.1));
    let l = planta(&mut c, 1.2, 1.0);
    let chaves: Vec<[u32; 4]> = l.iter().map(|x| [x.0, x.1, x.2, x.3]).collect();
    assert_eq!(chaves, vec![[3, 2, 1, 2], [3, 2, 1, 2], [4, 2, 1, 2]], "base e pescoço tracejados, corrida tracejada");
    assert!(rel(area_fechada(&l[0].4), 0.64) < 1e-9 && rel(area_fechada(&l[1].4), 0.0625) < 1e-9);
    assert!(rel(area_fechada(&l[2].4), 2.4) < 1e-9);
    // Corte no pescoço (de -0,6 a -0,1): pescoço cortado (cheio), base abaixo (tracejada); a corrida (-0,4 a -0,1) também cortada.
    let l = planta(&mut c, -0.3, 1.0);
    let chaves: Vec<[u32; 4]> = l.iter().map(|x| [x.0, x.1, x.2, x.3]).collect();
    assert_eq!(chaves, vec![[3, 2, 1, 2], [3, 2, 0, 0], [4, 2, 0, 0]]);
}

#[test]
fn planta_camadas_so_no_detalhe_fino() {
    let mut c = cena();
    c.estr.tipos_pilar.insert(1, TipoPilarLinha { disciplina: DISCIPLINA_ARQUITETONICO, perfil: perfil(PERFIL_RETANGULAR, &[0.2, 0.2]), material: 7, espessura_camadas: 0.02 });
    c.estr.pilares.insert(1, PilarLinha { disciplina: 0, ..pilar_em(1, [0.0, 0.0], 3.0) });
    let fino = planta(&mut c, 1.2, 2.0);
    assert_eq!(fino.iter().map(|x| x.3).collect::<Vec<_>>(), vec![0, 3]);
    assert!(rel(area_fechada(&fino[1].4), 0.24 * 0.24) < 1e-9);
    assert_eq!(planta(&mut c, 1.2, 1.0).len(), 1);
    assert_eq!(planta(&mut c, 1.2, 7.0), fino, "detalhe acima de 2 vale como fino");
}

fn corte(c: &mut Cena, o: P2, d: P2, prof: f64) -> Vec<Linha> {
    linhas(&executar(c, 202, &[NIVEL_TODOS as f64, o[0], o[1], d[0], d[1], prof]).expect("202"))
}

fn faixa(pts: &[P2], k: usize) -> (f64, f64) {
    pts.iter().fold((f64::INFINITY, f64::NEG_INFINITY), |a, p| (a.0.min(p[k]), a.1.max(p[k])))
}

#[test]
fn corte_secao_hachurada_e_projecao() {
    let mut c = cena();
    tipo_pilar(&mut c, 1, DISCIPLINA_ESTRUTURAL, perfil(PERFIL_RETANGULAR, &[0.2, 0.4]));
    tipo_pilar(&mut c, 2, DISCIPLINA_ESTRUTURAL, perfil(PERFIL_TUBO_RETANGULAR, &[0.1, 0.1, 0.005]));
    tipo_pilar(&mut c, 3, DISCIPLINA_ESTRUTURAL, perfil(PERFIL_CIRCULAR, &[0.3]));
    tipo_viga(&mut c, 1, perfil(PERFIL_RETANGULAR, &[0.15, 0.4]));
    c.estr.pilares.insert(1, pilar_em(1, [1.0, 0.0], 3.0)); // cortado pelo plano y = 0
    c.estr.pilares.insert(2, pilar_em(1, [3.0, 2.0], 3.0)); // atrás, visível: projetado
    c.estr.pilares.insert(3, pilar_em(1, [5.0, -3.0], 3.0)); // do lado de quem olha: não sai
    c.estr.pilares.insert(4, pilar_em(1, [7.0, 6.0], 3.0)); // além da profundidade
    c.estr.pilares.insert(5, pilar_em(2, [12.0, 0.0], 3.0)); // tubo cortado no meio: duas paredes
    c.estr.pilares.insert(6, PilarLinha { rotacao: std::f64::consts::FRAC_PI_4, ..pilar_em(1, [14.0, 2.0], 3.0) });
    c.estr.pilares.insert(7, pilar_em(3, [16.0, 2.0], 3.0));
    c.estr.vigas.insert(1, viga_de(1, [10.0, -2.0], [10.0, 2.0], [3.0, 3.0])); // atravessa o plano
    let l = corte(&mut c, [0.0, 0.0], [1.0, 0.0], 5.0);
    let de = |e: u32, cat: u32| l.iter().filter(|x| x.0 == e && x.1 == cat).cloned().collect::<Vec<_>>();
    let p1 = de(1, 0);
    assert_eq!(p1.iter().map(|x| [x.2, x.3]).collect::<Vec<_>>(), vec![[0, 0]], "seção sem arestas projetadas");
    assert!(rel(area_fechada(&p1[0].4), 0.6) < 1e-9);
    let (s0, s1) = faixa(&p1[0].4, 0);
    assert!((s0 - 0.9).abs() < 1e-12 && (s1 - 1.1).abs() < 1e-12);
    let p2 = de(2, 0);
    assert_eq!(p2.len(), 4, "contorno projetado: 2 arestas verticais e 2 horizontais");
    assert!(p2.iter().all(|x| x.2 == 1 && x.3 == 2 && x.4.len() == 2));
    let todos: Vec<P2> = p2.iter().flat_map(|x| x.4.clone()).collect();
    let ((s0, s1), (z0, z1)) = (faixa(&todos, 0), faixa(&todos, 1));
    assert!((s0 - 2.9).abs() < 1e-12 && (s1 - 3.1).abs() < 1e-12 && z0 == 0.0 && z1 == 3.0);
    assert!(de(3, 0).is_empty() && de(4, 0).is_empty());
    let p5 = de(5, 0);
    let cortadas: Vec<_> = p5.iter().filter(|x| x.2 == 0).collect();
    assert_eq!(cortadas.len(), 2, "tubo: duas faixas cortadas");
    assert!(cortadas.iter().all(|x| x.3 == 0 && rel(area_fechada(&x.4), 0.005 * 3.0) < 1e-9));
    // Pelo vão do tubo vê-se a face interna do fundo: 2 arestas verticais e 2 de tampa.
    assert_eq!(p5.iter().filter(|x| x.2 == 1 && x.3 == 2).count(), 4);
    assert_eq!(de(6, 0).len(), 7, "pilar girado: 3 arestas verticais (duas faces de frente) e 4 de tampa");
    assert_eq!(de(7, 0).iter().filter(|x| (x.4[0][0] - x.4[1][0]).abs() < 1e-12).count(), 2, "círculo: só as duas silhuetas verticais");
    let v1 = de(1, 1);
    assert_eq!(v1.len(), 1);
    assert!(rel(area_fechada(&v1[0].4), 0.06) < 1e-9, "viga atravessada: o perfil");
    let (z0, z1) = faixa(&v1[0].4, 1);
    assert!((z0 - 2.6).abs() < 1e-12 && (z1 - 3.0).abs() < 1e-12);
    // Direção nula ou profundidade negativa: vazio; elevação de fora vê os pilares projetados.
    assert!(corte(&mut c, [0.0, 0.0], [0.0, 0.0], 5.0).is_empty());
    assert!(corte(&mut c, [0.0, 0.0], [1.0, 0.0], -1.0).is_empty());
    let el = corte(&mut c, [0.0, -10.0], [1.0, 0.0], 30.0);
    assert!(el.iter().all(|x| x.2 == 1 && x.3 == 2));
}

#[test]
fn quant_bate_com_malha() {
    let mut c = cena();
    tipo_pilar(&mut c, 1, DISCIPLINA_ESTRUTURAL, perfil(PERFIL_RETANGULAR, &[0.2, 0.4]));
    tipo_pilar(&mut c, 2, DISCIPLINA_ESTRUTURAL, perfil(PERFIL_TUBO_CIRCULAR, &[0.3, 0.02]));
    tipo_viga(&mut c, 1, perfil(PERFIL_RETANGULAR, &[0.15, 0.4]));
    tipo_viga(&mut c, 2, perfil(PERFIL_I, &[0.1, 0.2, 0.008, 0.005]));
    c.estr.tipos_fundacao.insert(1, sapata_e7());
    c.estr.tipos_fundacao.insert(2, baldrame_e8());
    c.estr.tipos_fundacao.insert(3, TipoFundacaoLinha { modo: FUNDACAO_ISOLADA, forma: FUNDACAO_ESTACA, base: perfil(PERFIL_TUBO_CIRCULAR, &[0.3, 0.02]), altura_base: 8.0, pescoco: None, material: 4 });
    c.estr.pilares.insert(1, pilar_em(1, [0.0, 0.0], 3.0));
    c.estr.pilares.insert(2, PilarLinha { rotacao: 0.4, nivel_topo: 1, altura: NAN, deslocamento_topo: -0.2, ..pilar_em(2, [5.0, 0.0], NAN) });
    c.estr.vigas.insert(5, viga_de(1, [0.0, 0.0], [5.0, 0.0], [3.0, 3.0]));
    c.estr.vigas.insert(6, VigaLinha { rotacao: 0.7, alinhamento: ALINHA_CENTRO, ..viga_de(2, [0.0, 1.0], [3.0, 5.0], [0.0, 1.2]) });
    c.estr.fundacoes.insert(1, isolada_em(1, [0.0, 0.0], -0.1));
    c.estr.fundacoes.insert(2, corrida_de(2, [0.0, 0.0], [6.0, 0.0], -0.1));
    c.estr.fundacoes.insert(3, isolada_em(3, [5.0, 0.0], -0.5));
    let q = executar(&mut c, 203, &[NIVEL_TODOS as f64]).expect("203");
    let (tab, val) = (u32s(&q[0]), f64s(&q[1]));
    let chaves: Vec<[u32; 4]> = tab.chunks_exact(4).map(|x| [x[0], x[1], x[2], x[3]]).collect();
    assert_eq!(chaves, vec![[1, 0, 1, 7], [2, 0, 2, 7], [5, 1, 1, 3], [6, 1, 2, 3], [1, 2, 1, 4], [2, 2, 2, 4], [3, 2, 3, 4]]);
    // Volume da malha (consulta 200, LOD fino) por elemento.
    let m = montar(&c, NIVEL_TODOS, 2).expect("malha");
    for (k, ch) in chaves.iter().enumerate() {
        let vm: f64 = m.grupos.iter().filter(|g| g.elemento == ch[0] && g.categoria == ch[1] && g.parte != PARTE_CAMADAS).map(|g| volume(&m.peca(g))).sum();
        assert!(rel(val[4 * k], vm) < 1e-9, "{ch:?}: {} contra {vm}", val[4 * k]);
    }
    // E1: volume 0,24, forma 3,60, altura 3, seção 0,08. E5: 0,30 e 5,00 (forma 1,10 × 5). E7: 0,22325 (base 0,64). E8: 0,72 em 6,00.
    let e = |k: usize| [val[4 * k], val[4 * k + 1], val[4 * k + 2], val[4 * k + 3]];
    for (a, b) in e(0).iter().zip([0.24, 3.6, 3.0, 0.08]) {
        assert!(rel(*a, b) < 1e-12, "E1 {a} {b}");
    }
    for (a, b) in e(2).iter().zip([0.3, 5.5, 5.0, 0.06]) {
        assert!(rel(*a, b) < 1e-12, "E5 {a} {b}");
    }
    assert!(rel(e(4)[0], 0.22325) < 1e-12 && rel(e(4)[2], 0.8) < 1e-12 && rel(e(4)[3], 0.64) < 1e-12);
    assert!(rel(e(4)[1], 3.2 * 0.3 + 1.0 * 0.5) < 1e-12, "forma: laterais da base e do pescoço");
    assert!(rel(e(5)[0], 0.72) < 1e-12 && rel(e(5)[2], 6.0) < 1e-12);
    assert!(rel(e(6)[2], 8.0) < 1e-12, "estaca: comprimento");
    assert!(rel(e(1)[2], 2.8) < 1e-12, "pilar até o nível 1 menos 0,2");
    // Filtro de nível e determinismo.
    assert_eq!(executar(&mut c, 203, &[NIVEL_TODOS as f64]), Ok(q));
    assert!(u32s(&executar(&mut c, 203, &[4.0]).expect("vazio")[0]).is_empty());
}
