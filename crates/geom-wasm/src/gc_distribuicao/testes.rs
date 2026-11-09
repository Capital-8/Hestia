use super::*;
use serde_json::{json, Value};

const OURO: &str = include_str!("../../../../packages/engine/src/guardaCorpoRef/distribuicao.ouro.json");

fn aproximado(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-6
}

fn poste_p(largura: Option<f64>) -> PosteP {
    PosteP { ativo: largura.is_some(), perfil: PerfilP::circular(largura.unwrap_or(0.05)), material: 1, acima: 0.0, abaixo: 0.0 }
}

pub(super) fn param_postes(ini: Option<f64>, fim: Option<f64>, canto: Option<f64>, inter: Option<f64>, modo: u8, esp: f64, num: u32) -> ParamPostes {
    ParamPostes { inicio: poste_p(ini), fim: poste_p(fim), canto: poste_p(canto), intermediario: poste_p(inter), ang_canto: 0.0873, modo, espacamento: esp, numero: num }
}

fn elem(largura: Option<f64>, dist: f64) -> ElemP {
    ElemP { perfil: largura.map(PerfilP::circular), material: 2, dist_anterior: dist, desloc_lateral: 0.0, desloc_base: 0.0, desloc_topo: 0.0 }
}

pub(super) fn padrao(periodo: f64, justif: u8) -> PadraoP {
    PadraoP {
        elementos: vec![elem(Some(0.012), 0.0)],
        periodo,
        justif,
        sobra: 0,
        quebra: 2,
        ang_quebra: 0.0873,
        escopo: ESCOPO_VAO,
        h_base: 0.1,
        h_topo: 1.0,
        por_degrau: PorDegrauP { ativo: false, quantidade: 1, dist_quina: 0.0, perfil: None, material: 0 },
    }
}

pub(super) fn config(postes: ParamPostes, padroes: Vec<PadraoP>) -> ConfigDistribuicao {
    ConfigDistribuicao { altura: 1.1, postes, padroes, paineis: vec![], degraus: vec![], gerar_malha: false }
}

fn reta(comp: f64) -> TrechoGC {
    CadeiaGC::reta(1, (0.0, 0.0), (comp, 0.0), 0.0).trechos.remove(0)
}

fn s_postes(o: &SaidaDistribuicao) -> Vec<f64> {
    o.postes.iter().map(|p| p.s).collect()
}

fn s_bal(o: &SaidaDistribuicao, i: usize) -> Vec<f64> {
    o.balaustres[i].iter().map(|b| b.s).collect()
}

fn painel(larg_max: f64, folga: f64, fam: u8) -> PainelP {
    PainelP {
        familia: fam,
        h_base: 0.1,
        h_topo: 1.0,
        desl_base: 0.0,
        desl_topo: 0.0,
        espessura: 0.01,
        folga_lateral: folga,
        largura_max: larg_max,
        material: 3,
        perf_diam: 0.01,
        perf_passo_x: 0.02,
        perf_passo_y: 0.02,
        perf_alternado: true,
        tela_larg: 0.05,
        tela_alt: 0.05,
        tela_fio: 0.003,
        cabo_diam: 0.01,
        cabo_espac: 0.09,
        cabo_orient: 0,
    }
}

// --- postes --------------------------------------------------------------------------------------------------------------------------------------

#[test]
fn postes_espacamento_maximo_nunca_passa() {
    let cfg = config(param_postes(Some(0.05), Some(0.05), Some(0.05), Some(0.05), MODO_MAXIMO, 1.2, 0), vec![]);
    let o = distribuir(&reta(3.0), &cfg, LIMITE_BALAUSTRES).unwrap();
    assert_eq!(s_postes(&o).iter().map(|s| (s * 1e6).round() / 1e6).collect::<Vec<_>>(), vec![0.0, 1.0, 2.0, 3.0]);
    assert_eq!(o.postes.iter().map(|p| p.papel).collect::<Vec<_>>(), vec![POSTE_INICIO, POSTE_INTERMEDIARIO, POSTE_INTERMEDIARIO, POSTE_FIM]);
    // Exato: 2,4 m com máximo 1,2 pede 1 poste (vão de 1,2 não passa do máximo).
    let o = distribuir(&reta(2.4), &cfg, LIMITE_BALAUSTRES).unwrap();
    assert_eq!(o.postes.len(), 3);
}

#[test]
fn postes_espacamento_fixo_e_aviso_de_sobra() {
    let cfg = config(param_postes(Some(0.05), Some(0.05), None, Some(0.05), MODO_FIXO, 1.4, 0), vec![]);
    let o = distribuir(&reta(3.0), &cfg, LIMITE_BALAUSTRES).unwrap();
    assert!(aproximado(o.postes[1].s, 1.4) && aproximado(o.postes[2].s, 2.8));
    assert_eq!(o.avisos.len(), 1);
    assert_eq!(o.avisos[0].codigo, AVISO_POSTE_SOBRA_CURTA);
    let cfg = config(param_postes(Some(0.05), Some(0.05), None, Some(0.05), MODO_FIXO, 1.0, 0), vec![]);
    let o = distribuir(&reta(3.0), &cfg, LIMITE_BALAUSTRES).unwrap();
    assert_eq!(o.postes.len(), 4);
    assert!(o.avisos.is_empty());
}

#[test]
fn postes_numero_fixo_por_trecho_e_descarte_por_largura() {
    let cfg = config(param_postes(Some(0.05), Some(0.05), None, Some(0.05), MODO_NUMERO, 0.0, 3), vec![]);
    let o = distribuir(&reta(3.0), &cfg, LIMITE_BALAUSTRES).unwrap();
    assert_eq!(s_postes(&o).len(), 5);
    assert!(aproximado(o.postes[2].s, 1.5));
    // Poste que cairia encostado no de nó é descartado.
    let o = distribuir(&reta(0.04), &cfg, LIMITE_BALAUSTRES).unwrap();
    assert_eq!(o.postes.len(), 2);
}

#[test]
fn postes_de_canto_so_acima_do_angulo_e_transicao() {
    let cfg = config(param_postes(Some(0.05), Some(0.05), Some(0.06), None, MODO_NENHUM, 0.0, 0), vec![]);
    let o = distribuir(&CadeiaGC::em_l(1, 2.0, 0.0).trechos[0], &cfg, 100).unwrap();
    assert_eq!(o.postes.iter().map(|p| p.papel).collect::<Vec<_>>(), vec![POSTE_INICIO, POSTE_CANTO, POSTE_FIM]);
    // Giro de 3 graus fica abaixo do limite de 5 graus: sem poste de canto.
    let a = 3.0_f64.to_radians();
    let t = TrechoGC {
        guarda: 1,
        indice: 0,
        origem: OrigemTrecho::Manual,
        curvo: false,
        fechado: false,
        nos: vec![No3 { x: 0.0, y: 0.0, z: 0.0 }, No3 { x: 1.0, y: 0.0, z: 0.0 }, No3 { x: 1.0 + a.cos(), y: a.sin(), z: 0.0 }],
    };
    assert_eq!(distribuir(&t, &cfg, 100).unwrap().postes.len(), 2);
    // Nó de transição (lance -> patamar): canto quando não há intermediário configurado.
    let o = distribuir(&CadeiaGC::lance_inclinado(1, 3.0, 0.0, 1.0, 1.0).trechos[0], &cfg, 100).unwrap();
    assert_eq!(o.postes.len(), 2);
    let mut t = CadeiaGC::lance_inclinado(1, 3.0, 0.0, 1.0, 1.0).trechos.remove(0);
    t.nos.push(No3 { x: 4.0, y: 0.0, z: 1.0 });
    let o = distribuir(&t, &cfg, 100).unwrap();
    assert_eq!(o.postes.iter().map(|p| p.papel).collect::<Vec<_>>(), vec![POSTE_INICIO, POSTE_CANTO, POSTE_FIM]);
    assert!(aproximado(o.postes[1].s, 3.0));
    // Laço fechado: um poste em cada canto, nenhum de início ou fim.
    let mut q = CadeiaGC::em_l(1, 2.0, 0.0).trechos.remove(0);
    q.nos.push(No3 { x: 0.0, y: 2.0, z: 0.0 });
    q.fechado = true;
    let o = distribuir(&q, &cfg, 100).unwrap();
    assert_eq!(o.postes.len(), 4);
    assert!(o.postes.iter().all(|p| p.papel == POSTE_CANTO));
}

#[test]
fn trecho_curvo_nao_tem_poste_no_meio() {
    let n = 24;
    let nos: Vec<No3> = (0..=n).map(|i| {
        let t = std::f64::consts::FRAC_PI_2 * i as f64 / n as f64;
        No3 { x: 2.0 * t.cos(), y: 2.0 * t.sin(), z: 0.5 * i as f64 / n as f64 }
    }).collect();
    let t = TrechoGC { guarda: 1, indice: 0, origem: OrigemTrecho::Caracol, curvo: true, fechado: false, nos };
    let cfg = config(param_postes(Some(0.05), Some(0.05), Some(0.05), None, MODO_NENHUM, 0.0, 0), vec![padrao(0.11, JUSTIF_DISTRIBUIR)]);
    let o = distribuir(&t, &cfg, LIMITE_BALAUSTRES).unwrap();
    assert_eq!(o.postes.len(), 2);
    // Espaçamento horizontal (comprimento de corda, não de arco) respeita o período; z cresce junto.
    let b = &o.balaustres[0];
    assert!(b.len() > 20);
    for w in b.windows(2) {
        assert!(w[1].z0 > w[0].z0);
        assert!((w[1].s - w[0].s) <= 0.11 + 1e-9);
    }
}

// --- balaústres ----------------------------------------------------------------------------------------------------------------------------------

fn base_balaustres(justif: u8) -> (TrechoGC, ConfigDistribuicao) {
    (reta(1.0), config(param_postes(Some(0.05), Some(0.05), None, None, MODO_NENHUM, 0.0, 0), vec![padrao(0.11, justif)]))
}

#[test]
fn justificacao_inicio_fim_centro() {
    // a = 0,025 + 0,006 = 0,031; Lu = 0,938; k = 9 repetições; sobra = 0,058.
    let (t, cfg) = base_balaustres(JUSTIF_INICIO);
    let s = s_bal(&distribuir(&t, &cfg, 100).unwrap(), 0);
    assert_eq!(s.len(), 9);
    assert!(aproximado(s[0], 0.031) && aproximado(s[8], 0.031 + 0.88));
    let (t, cfg) = base_balaustres(JUSTIF_FIM);
    let s = s_bal(&distribuir(&t, &cfg, 100).unwrap(), 0);
    assert!(aproximado(s[0], 0.031 + 0.058) && aproximado(s[8], 1.0 - 0.031));
    let (t, cfg) = base_balaustres(JUSTIF_CENTRO);
    let s = s_bal(&distribuir(&t, &cfg, 100).unwrap(), 0);
    assert!(aproximado(s[0], 0.031 + 0.029) && aproximado(s[0] - 0.031, 0.969 - s[8]));
}

#[test]
fn distribuir_preenche_o_vao_e_nunca_passa_do_periodo() {
    let (t, cfg) = base_balaustres(JUSTIF_DISTRIBUIR);
    let o = distribuir(&t, &cfg, 100).unwrap();
    let s = s_bal(&o, 0);
    assert_eq!(s.len(), 10);
    assert!(aproximado(s[0], 0.031) && aproximado(s[9], 0.969));
    for w in s.windows(2) {
        assert!(w[1] - w[0] <= 0.11 + 1e-9);
        assert!(aproximado(w[1] - w[0], 0.938 / 9.0));
    }
    assert!(o.avisos.is_empty());
    // Vão curto: período refeito abaixo da metade do pedido avisa.
    let mut cfg3 = cfg.clone();
    cfg3.padroes[0].periodo = 0.5;
    let o = distribuir(&reta(0.3), &cfg3, 100).unwrap();
    // Lu = 0,238 (D = 0): m = 1 -> período 0,238 < 0,25: avisa; dois balaústres, um em cada ponta do vão útil.
    assert_eq!(o.balaustres[0].len(), 2);
    assert!(o.avisos.iter().any(|a| a.codigo == AVISO_PADRAO_COMPRIMIDO));
}

#[test]
fn sobra_balaustre_extra_e_folga_nas_pontas() {
    let (_t, mut cfg) = base_balaustres(JUSTIF_INICIO);
    let t = reta(1.0);
    // Lu = 0,938, período 0,15: k = 7, sobra = 0,038 < 0,075: sem extra.
    cfg.padroes[0].periodo = 0.15;
    cfg.padroes[0].sobra = SOBRA_EXTRA;
    assert_eq!(distribuir(&t, &cfg, 100).unwrap().balaustres[0].len(), 7);
    // Período 0,2: k = 5, sobra = 0,138 >= 0,1: um extra rente ao poste de fim.
    cfg.padroes[0].periodo = 0.2;
    let s = s_bal(&distribuir(&t, &cfg, 100).unwrap(), 0);
    assert_eq!(s.len(), 6);
    assert!(aproximado(*s.last().unwrap(), 0.969));
    cfg.padroes[0].sobra = SOBRA_FOLGA_PONTAS;
    let s = s_bal(&distribuir(&t, &cfg, 100).unwrap(), 0);
    assert_eq!(s.len(), 5);
    assert!(aproximado(s[0] - 0.031, 0.138 / 2.0));
}

#[test]
fn padrao_que_nao_cabe_vira_aviso_sem_truncar() {
    let (_, mut cfg) = base_balaustres(JUSTIF_INICIO);
    cfg.padroes[0].elementos = vec![elem(Some(0.012), 0.0), elem(Some(0.012), 0.1), elem(Some(0.012), 0.1)];
    cfg.padroes[0].periodo = 0.5;
    // Vão de 0,3 m: Lu = 0,3 - 0,062 = 0,238 >= D = 0,2: cabe; em 0,25 m: Lu = 0,188 < 0,2: só 2 elementos, com aviso.
    assert_eq!(distribuir(&reta(0.3), &cfg, 100).unwrap().balaustres[0].len(), 3);
    let o = distribuir(&reta(0.25), &cfg, 100).unwrap();
    assert_eq!(o.balaustres[0].len(), 2);
    assert_eq!(o.avisos.iter().map(|a| a.codigo).collect::<Vec<_>>(), vec![AVISO_PADRAO_NAO_CABE]);
    // Sem espaço nenhum: vão menor que os dois postes.
    let o = distribuir(&t_reta(0.05), &cfg, 100).unwrap();
    assert!(o.balaustres[0].is_empty());
    assert_eq!(o.avisos[0].codigo, AVISO_VAO_SEM_ESPACO);
}

fn t_reta(c: f64) -> TrechoGC {
    reta(c)
}

#[test]
fn elemento_vazio_ocupa_espaco_e_nao_gera_peca() {
    let (t, mut cfg) = base_balaustres(JUSTIF_INICIO);
    cfg.padroes[0].elementos = vec![elem(Some(0.012), 0.0), elem(None, 0.05)];
    cfg.padroes[0].periodo = 0.2;
    let o = distribuir(&t, &cfg, 100).unwrap();
    assert!(o.balaustres[0].iter().all(|b| b.elem == Some(0)));
    assert_eq!(o.balaustres[0].len(), 5);
}

#[test]
fn vaos_com_poste_intermediario_recebem_o_padrao_separado() {
    let postes = param_postes(Some(0.05), Some(0.05), None, Some(0.05), MODO_NUMERO, 0.0, 1);
    let (t, mut cfg) = (reta(2.0), config(postes, vec![padrao(0.11, JUSTIF_DISTRIBUIR)]));
    let o = distribuir(&t, &cfg, 1000).unwrap();
    let s = s_bal(&o, 0);
    // Nenhum balaústre encosta no poste do meio (s = 1,0).
    assert!(s.iter().all(|v| (v - 1.0).abs() > 0.025 + 0.006 - 1e-9));
    assert!(s.windows(2).all(|w| w[1] - w[0] <= 0.11 + 1e-9 || (w[0] < 1.0 && w[1] > 1.0)));
    // Escopo segmento: o padrão corre pelo trecho inteiro e remove só o que colide.
    cfg.padroes[0].escopo = 1;
    cfg.padroes[0].justif = JUSTIF_INICIO;
    let o = distribuir(&t, &cfg, 1000).unwrap();
    assert!(s_bal(&o, 0).iter().all(|v| (v - 1.0).abs() >= 0.031 - 1e-9));
}

#[test]
fn quebra_por_angulo_e_nunca_no_canto() {
    let postes = param_postes(Some(0.05), Some(0.05), Some(0.05), None, MODO_NENHUM, 0.0, 0);
    let l = CadeiaGC::em_l(1, 1.0, 0.0).trechos.remove(0);
    let mut pad = padrao(0.1, JUSTIF_DISTRIBUIR);
    pad.escopo = 1;
    pad.quebra = 1; // ângulo
    let por_angulo = distribuir(&l, &config(postes.clone(), vec![pad.clone()]), 1000).unwrap();
    pad.quebra = 2; // nunca
    let continuo = distribuir(&l, &config(postes, vec![pad]), 1000).unwrap();
    // Com quebra, cada perna recomeça no poste de canto: o canto (s = 1) tem um balaústre de cada lado a 0,031 do poste.
    let perto: Vec<f64> = s_bal(&por_angulo, 0).into_iter().filter(|v| (v - 1.0).abs() < 0.05).collect();
    assert_eq!(perto.len(), 2);
    // Contínuo: o padrão corre e perde só os que colidem com o poste de canto.
    assert!(s_bal(&continuo, 0).iter().all(|v| (v - 1.0).abs() >= 0.031 - 1e-9));
    assert!(continuo.balaustres[0].len() >= por_angulo.balaustres[0].len() - 2);
}

#[test]
fn balaustres_seguem_a_inclinacao_e_ficam_verticais() {
    let t = CadeiaGC::lance_inclinado(1, 3.0, 0.0, 1.5, 1.0).trechos.remove(0);
    let o = distribuir(&t, &config(param_postes(Some(0.05), Some(0.05), None, None, MODO_NENHUM, 0.0, 0), vec![padrao(0.11, JUSTIF_DISTRIBUIR)]), 1000).unwrap();
    for b in &o.balaustres[0] {
        assert!(aproximado(b.z0, 0.5 * b.s + 0.1));
        assert!(aproximado(b.z1 - b.z0, 0.9));
    }
}

#[test]
fn por_degrau_uma_duas_e_tres_por_degrau() {
    let t = CadeiaGC::lance_inclinado(1, 0.84, 0.0, 0.5, 0.0).trechos.remove(0);
    let degraus: Vec<DegrauP> = (0..3).map(|i| DegrauP { s0: 0.28 * i as f64, profundidade: 0.28, z: 0.17 * (i + 1) as f64 }).collect();
    for q in 1..=3u32 {
        let mut pad = padrao(0.11, JUSTIF_DISTRIBUIR);
        pad.por_degrau = PorDegrauP { ativo: true, quantidade: q, dist_quina: 0.04, perfil: Some(PerfilP::circular(0.012)), material: 5 };
        let mut cfg = config(param_postes(None, None, None, None, MODO_NENHUM, 0.0, 0), vec![pad]);
        cfg.degraus = degraus.clone();
        let o = distribuir(&t, &cfg, 100).unwrap();
        let b = &o.balaustres[0];
        assert_eq!(b.len(), 3 * q as usize);
        assert!(b.iter().all(|x| x.elem.is_none()));
        let passo = (0.28 - 0.04) / q as f64;
        assert!(aproximado(b[0].s, 0.04));
        if q > 1 {
            assert!(aproximado(b[1].s - b[0].s, passo));
        }
        // A base está no degrau; o topo na cota do eixo mais o topo do padrão.
        assert!(aproximado(b[0].z0, 0.17));
        assert!(aproximado(b[0].z1, perc_z(&t, b[0].s) + 1.0));
    }
    // Patamar usa o padrão normal, mesmo com por degrau ligado.
    let p = CadeiaGC::lance_inclinado(1, 3.0, 0.0, 1.0, 1.0).trechos.remove(1);
    let mut pad = padrao(0.11, JUSTIF_DISTRIBUIR);
    pad.por_degrau = PorDegrauP { ativo: true, quantidade: 2, dist_quina: 0.04, perfil: Some(PerfilP::circular(0.012)), material: 5 };
    let mut cfg = config(param_postes(None, None, None, None, MODO_NENHUM, 0.0, 0), vec![pad]);
    cfg.degraus = degraus;
    let o = distribuir(&p, &cfg, 1000).unwrap();
    assert!(o.balaustres[0].iter().all(|x| x.elem == Some(0)));
}

fn perc_z(t: &TrechoGC, s: f64) -> f64 {
    Percurso::de(t).amostra(s).z
}

#[test]
fn limite_de_balaustres_devolve_limite() {
    let t = reta(500.0);
    let cfg = config(param_postes(None, None, None, None, MODO_NENHUM, 0.0, 0), vec![padrao(0.02, JUSTIF_DISTRIBUIR)]);
    assert_eq!(distribuir(&t, &cfg, LIMITE_BALAUSTRES).err(), Some(LIMITE));
    assert!(distribuir(&reta(300.0), &cfg, LIMITE_BALAUSTRES).is_ok());
    // O que sobrou do guarda-corpo conta.
    assert_eq!(distribuir(&reta(3.0), &cfg, 10).err(), Some(LIMITE));
}

#[test]
fn padrao_invalido_e_entrada() {
    let t = reta(1.0);
    let mut cfg = config(param_postes(None, None, None, None, MODO_NENHUM, 0.0, 0), vec![padrao(0.0, JUSTIF_INICIO)]);
    assert_eq!(distribuir(&t, &cfg, 10).err(), Some(ENTRADA));
    cfg.padroes[0].periodo = 0.1;
    cfg.padroes[0].elementos.clear();
    assert_eq!(distribuir(&t, &cfg, 10).err(), Some(ENTRADA));
}

#[test]
fn distribuicao_e_deterministica() {
    let (t, cfg) = base_balaustres(JUSTIF_DISTRIBUIR);
    let mut cfg = cfg;
    cfg.gerar_malha = true;
    let a = distribuir(&t, &cfg, 100).unwrap();
    let b = distribuir(&t, &cfg, 100).unwrap();
    assert_eq!(a.pecas.len(), b.pecas.len());
    for (x, y) in a.pecas.iter().zip(&b.pecas) {
        assert_eq!(x.malha.vertices, y.malha.vertices);
        assert_eq!(x.malha.indices, y.malha.indices);
    }
}

// --- painéis -------------------------------------------------------------------------------------------------------------------------------------

#[test]
fn paineis_dividem_o_vao_em_iguais() {
    let mut cfg = config(param_postes(Some(0.05), Some(0.05), None, None, MODO_NENHUM, 0.0, 0), vec![]);
    cfg.paineis = vec![painel(1.2, 0.02, FAM_VIDRO)];
    let o = distribuir(&reta(3.0), &cfg, 100).unwrap();
    // avail = 3 - 0,05 - 0,04 = 2,91; n = 3; largura = (2,91 - 0,04) / 3.
    let g = &o.paineis[0];
    assert_eq!(g.len(), 3);
    let w = (2.91 - 0.04) / 3.0;
    for p in g {
        assert!(aproximado(p.s1 - p.s0, w));
    }
    assert!(aproximado(g[0].s0, 0.025 + 0.02));
    assert!(aproximado(g[1].s0 - g[0].s1, 0.02));
    assert!(aproximado(3.0 - 0.025 - 0.02, g[2].s1));
    // Sem limite: um painel por vão.
    cfg.paineis[0].largura_max = 0.0;
    assert_eq!(distribuir(&reta(3.0), &cfg, 100).unwrap().paineis[0].len(), 1);
    // Vão sem espaço.
    let o = distribuir(&reta(0.08), &cfg, 100).unwrap();
    assert!(o.paineis[0].is_empty());
    assert_eq!(o.avisos[0].codigo, AVISO_VAO_SEM_ESPACO);
}

#[test]
fn paineis_entre_postes_intermediarios() {
    let mut cfg = config(param_postes(Some(0.05), Some(0.05), None, Some(0.05), MODO_NUMERO, 0.0, 1), vec![]);
    cfg.paineis = vec![painel(0.0, 0.0, FAM_CHAPA)];
    let o = distribuir(&reta(2.0), &cfg, 100).unwrap();
    assert_eq!(o.paineis[0].len(), 2);
    assert!(aproximado(o.paineis[0][0].s1, 1.0 - 0.025));
}

// --- malha ---------------------------------------------------------------------------------------------------------------------------------------

fn confere_solido(m: &Malha) {
    assert!(m.fechada(), "malha não é fechada e orientada");
    assert!(m.volume() > 0.0, "volume {}", m.volume());
}

#[test]
fn malha_dos_perfis_e_fechada_com_volume_positivo() {
    let circ = prisma_vertical(&PerfilP::circular(0.05), 1.0, 2.0, 1.0, 0.0, 0.0, 1.0);
    confere_solido(&circ);
    assert_eq!(circ.euler(), 2);
    assert!(aproximado(circ.volume(), 0.5 * 16.0 * (0.025_f64).powi(2) * (std::f64::consts::TAU / 16.0).sin()));
    let grande = prisma_vertical(&PerfilP::circular(0.1), 0.0, 0.0, 1.0, 0.0, 0.0, 1.0);
    assert_eq!(grande.vertices.len(), 48);
    let ret = prisma_vertical(&PerfilP::retangular(0.04, 0.02), 0.0, 0.0, 0.0, 1.0, 0.0, 1.0);
    confere_solido(&ret);
    assert!(aproximado(ret.volume(), 0.04 * 0.02));
    // Polígono em L, dado no sentido horário: a malha corrige.
    let l = PerfilP { forma: FORMA_POLIGONO, largura: 0.0, altura: 0.0, lados: 0, pontos: vec![[0.0, 0.0], [0.0, 0.1], [0.05, 0.1], [0.05, 0.05], [0.1, 0.05], [0.1, 0.0]] };
    let m = prisma_vertical(&l, 0.0, 0.0, 1.0, 0.0, 0.0, 1.0);
    confere_solido(&m);
    assert!(aproximado(m.volume(), 0.0075));
    assert_eq!(m.euler(), 2);
}

#[test]
fn malha_do_cilindro_e_do_painel() {
    let c = cilindro([0.0, 0.0, 0.0], [1.0, 2.0, 3.0], 0.01, 16);
    confere_solido(&c);
    let mut cfg = config(param_postes(Some(0.05), Some(0.05), Some(0.05), None, MODO_NENHUM, 0.0, 0), vec![]);
    cfg.gerar_malha = true;
    for fam in [FAM_VIDRO, FAM_CHAPA, FAM_PERFURADA, FAM_TELA, FAM_CABO] {
        cfg.paineis = vec![painel(1.0, 0.02, fam)];
        let o = distribuir(&CadeiaGC::em_l(1, 2.0, 0.0).trechos[0], &cfg, 100).unwrap();
        let pecas: Vec<&PecaMalha> = o.pecas.iter().filter(|p| p.papel == PAPEL_PAINEL || p.papel == PAPEL_CABO).collect();
        assert!(!pecas.is_empty(), "família {fam}");
        for p in pecas {
            assert!(p.malha.volume() > 0.0, "família {fam}");
            if fam == FAM_PERFURADA || fam == FAM_TELA {
                assert!(p.simplificado);
            }
        }
    }
    // Vidro: um sólido por painel, espessura 0,01.
    cfg.paineis = vec![painel(0.0, 0.0, FAM_VIDRO)];
    let o = distribuir(&reta(1.0), &cfg, 100).unwrap();
    let v = o.pecas.iter().find(|p| p.papel == PAPEL_PAINEL).unwrap();
    confere_solido(&v.malha);
    assert!(aproximado(v.malha.volume(), (1.0 - 0.05) * 0.9 * 0.01));
}

#[test]
fn cabos_horizontais_centralizados() {
    let mut cfg = config(param_postes(Some(0.05), Some(0.05), None, None, MODO_NENHUM, 0.0, 0), vec![]);
    cfg.gerar_malha = true;
    cfg.paineis = vec![painel(0.0, 0.0, FAM_CABO)];
    let o = distribuir(&reta(1.0), &cfg, 100).unwrap();
    // Altura útil 0,9 m, diâmetro 0,01, espaçamento 0,09: n = floor(0,89/0,09) + 1 = 10 cabos.
    assert_eq!(o.pecas.iter().filter(|p| p.papel == PAPEL_CABO).count(), 10);
    for p in o.pecas.iter().filter(|p| p.papel == PAPEL_CABO) {
        confere_solido(&p.malha);
    }
    cfg.paineis[0].cabo_orient = 1;
    let o = distribuir(&reta(1.0), &cfg, 100).unwrap();
    assert!(o.pecas.iter().filter(|p| p.papel == PAPEL_CABO).count() >= 9);
}

#[test]
fn malha_de_guarda_completa_tem_peca_para_cada_poste_e_balaustre() {
    let (t, mut cfg) = base_balaustres(JUSTIF_DISTRIBUIR);
    cfg.gerar_malha = true;
    let o = distribuir(&t, &cfg, 100).unwrap();
    assert_eq!(o.pecas.len(), o.postes.len() + o.balaustres[0].len());
    for p in &o.pecas {
        confere_solido(&p.malha);
    }
}

// --- referência: casos de ouro compartilhados com o TS ---------------------------------------------------------------------------------------------

fn n(v: &Value, k: &str, padrao: f64) -> f64 {
    v.get(k).and_then(Value::as_f64).unwrap_or(padrao)
}

fn perfil_json(v: &Value) -> Option<PerfilP> {
    v.as_f64().map(PerfilP::circular)
}

fn poste_json(v: &Value) -> PosteP {
    PosteP { ativo: !v.is_null(), perfil: PerfilP::circular(v.as_f64().unwrap_or(0.05)), material: 1, acima: 0.0, abaixo: 0.0 }
}

fn config_json(c: &Value) -> (TrechoGC, ConfigDistribuicao) {
    let nos = c["nos"].as_array().unwrap().iter().map(|p| No3 { x: p[0].as_f64().unwrap(), y: p[1].as_f64().unwrap(), z: p[2].as_f64().unwrap() }).collect();
    let origem = match c["origem"].as_u64().unwrap_or(2) {
        0 => OrigemTrecho::Lance,
        1 => OrigemTrecho::Patamar,
        3 => OrigemTrecho::Caracol,
        _ => OrigemTrecho::Manual,
    };
    let t = TrechoGC { guarda: 1, indice: 0, origem, curvo: c["curvo"].as_bool().unwrap_or(false), fechado: c["fechado"].as_bool().unwrap_or(false), nos };
    let p = &c["postes"];
    let postes = ParamPostes {
        inicio: poste_json(&p["inicio"]),
        fim: poste_json(&p["fim"]),
        canto: poste_json(&p["canto"]),
        intermediario: poste_json(&p["intermediario"]),
        ang_canto: n(p, "ang_canto", 0.0873),
        modo: n(p, "modo", 0.0) as u8,
        espacamento: n(p, "espacamento", 0.0),
        numero: n(p, "numero", 0.0) as u32,
    };
    let mut padroes = Vec::new();
    if let Some(d) = c.get("padrao").filter(|d| !d.is_null()) {
        let pd = &d["por_degrau"];
        padroes.push(PadraoP {
            elementos: d["elementos"]
                .as_array()
                .unwrap()
                .iter()
                .map(|e| ElemP {
                    perfil: perfil_json(&e["largura"]),
                    material: 2,
                    dist_anterior: n(e, "dist", 0.0),
                    desloc_lateral: n(e, "lateral", 0.0),
                    desloc_base: n(e, "base", 0.0),
                    desloc_topo: n(e, "topo", 0.0),
                })
                .collect(),
            periodo: n(d, "periodo", 0.11),
            justif: n(d, "justif", 3.0) as u8,
            sobra: n(d, "sobra", 0.0) as u8,
            quebra: n(d, "quebra", 2.0) as u8,
            ang_quebra: n(d, "ang_quebra", 0.0873),
            escopo: n(d, "escopo", 0.0) as u8,
            h_base: n(d, "h_base", 0.1),
            h_topo: n(d, "h_topo", 1.0),
            por_degrau: PorDegrauP {
                ativo: pd.get("ativo").and_then(Value::as_bool).unwrap_or(false),
                quantidade: n(pd, "quantidade", 1.0) as u32,
                dist_quina: n(pd, "dist_quina", 0.0),
                perfil: perfil_json(&pd["largura"]),
                material: 5,
            },
        });
    }
    let mut paineis = Vec::new();
    if let Some(d) = c.get("painel").filter(|d| !d.is_null()) {
        let mut pn = painel(n(d, "largura_max", 0.0), n(d, "folga", 0.0), FAM_VIDRO);
        pn.h_base = n(d, "h_base", 0.1);
        pn.h_topo = n(d, "h_topo", 1.0);
        paineis.push(pn);
    }
    let degraus = c["degraus"].as_array().map_or(vec![], |a| a.iter().map(|d| DegrauP { s0: n(d, "s0", 0.0), profundidade: n(d, "prof", 0.28), z: n(d, "z", 0.0) }).collect());
    (t, ConfigDistribuicao { altura: n(c, "altura", 1.1), postes, padroes, paineis, degraus, gerar_malha: false })
}

fn arred(x: f64) -> f64 {
    (x * 1e6).round() / 1e6 + 0.0
}

fn saida_json(o: &SaidaDistribuicao) -> Value {
    json!({
        "postes": o.postes.iter().map(|p| json!([arred(p.s), p.papel, arred(p.x), arred(p.y), arred(p.z0), arred(p.z1)])).collect::<Vec<_>>(),
        "balaustres": o.balaustres.first().map_or(vec![], |l| l.iter().map(|b| json!([arred(b.s), arred(b.x), arred(b.y), arred(b.z0), arred(b.z1), b.elem.map_or(-1, |e| e as i64)])).collect()),
        "paineis": o.paineis.first().map_or(vec![], |l| l.iter().map(|p| json!([arred(p.s0), arred(p.s1)])).collect()),
        "avisos": o.avisos.iter().map(|a| json!([a.codigo, arred(a.s)])).collect::<Vec<_>>(),
    })
}

fn e_igual(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(x), Value::Number(y)) => (x.as_f64().unwrap() - y.as_f64().unwrap()).abs() < 1e-6,
        (Value::Array(x), Value::Array(y)) => x.len() == y.len() && x.iter().zip(y).all(|(p, q)| e_igual(p, q)),
        _ => a == b,
    }
}

#[test]
fn casos_de_ouro_conferem_com_o_arquivo_compartilhado() {
    let mut ouro: Value = serde_json::from_str(OURO).expect("JSON de ouro");
    let gerar = std::env::var("HESTIA_GC_GERAR_OURO").is_ok();
    for caso in ouro["casos"].as_array_mut().unwrap() {
        let (t, cfg) = config_json(caso);
        let obtido = saida_json(&distribuir(&t, &cfg, LIMITE_BALAUSTRES).unwrap());
        if gerar {
            caso["esperado"] = obtido;
        } else {
            assert!(e_igual(&obtido, &caso["esperado"]), "caso {}:\nobtido {obtido}\nesperado {}", caso["nome"], caso["esperado"]);
        }
    }
    if gerar {
        let caminho = concat!(env!("CARGO_MANIFEST_DIR"), "/../../packages/engine/src/guardaCorpoRef/distribuicao.ouro.json");
        std::fs::write(caminho, serde_json::to_string_pretty(&ouro).unwrap() + "\n").unwrap();
    }
}
