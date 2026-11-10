//! Testes cargo do caminho hospedado (decisão 0055, Fase 3a). Montam as seções direto nas tabelas da cena.
use super::*;
use crate::esquema::ID_AUSENTE;
use crate::secoes_gc::*;

struct Res {
    trechos: Vec<u32>,
    nos: Vec<f64>,
    avisos: Vec<u32>,
}

fn rodar(c: &Cena, tol: f64) -> Res {
    let s = guarda_caminhos(c, NIVEL_TODOS, tol).expect("consulta");
    let u = |x: &Saida| match x {
        Saida::U32(v) => v.clone(),
        _ => panic!(),
    };
    let f = |x: &Saida| match x {
        Saida::F64(v) => v.clone(),
        _ => panic!(),
    };
    Res { trechos: u(&s[0]), nos: f(&s[1]), avisos: u(&s[2]) }
}

impl Res {
    fn trecho(&self, k: usize) -> Vec<[f64; 3]> {
        let mut ini = 0usize;
        for t in 0..k {
            ini += self.trechos[t * 5 + 3] as usize;
        }
        let n = self.trechos[k * 5 + 3] as usize;
        (ini..ini + n).map(|i| [self.nos[i * 3], self.nos[i * 3 + 1], self.nos[i * 3 + 2]]).collect()
    }
    fn origem(&self, k: usize) -> u32 {
        self.trechos[k * 5 + 2]
    }
    fn flags(&self, k: usize) -> u32 {
        self.trechos[k * 5 + 4]
    }
    fn n(&self) -> usize {
        self.trechos.len() / 5
    }
}

fn perto(a: [f64; 3], b: [f64; 3]) {
    for i in 0..3 {
        assert!((a[i] - b[i]).abs() < 1e-6, "{a:?} != {b:?}");
    }
}

fn cena_base(hosp: u8, hosp_num: u32, lados: u8, pos_base: u8, desloc: f64) -> Cena {
    let mut c = Cena::novo();
    c.gc.tipos.insert(
        1,
        TipoGuardaLinha { altura: 1.1, desloc: 0.035, ajuste_patamar: 0.0, folga_inferior: 0.0, junc_angular: 0, junc_tangente: 0, conexao: 0, tol_corda: 0.002, norma: ID_AUSENTE },
    );
    c.gc.guardas.insert(
        1,
        GuardaCorpoLinha { nivel: 0, tipo: 1, hosp, hosp_num, lados, pos_base, desloc, altura: f64::NAN, inverter: false, fechado: false, lado_desloc: 0, cota_base: 0.0, flags: 7 },
    );
    c
}

fn escada(c: &mut Cena) {
    c.gc.escadas.insert(1, EscadaGC { nivel: 0, z_base: 0.0, z_topo: 3.0, altura_espelho: 0.17, profundidade_piso: 0.28 });
}

fn comp(c: &mut Cena, id: u32, indice: u32, tipo: u8, caracol: bool) {
    c.gc.componentes.insert(id, ComponenteGC { escada: 1, indice, tipo, caracol, centro: [0.0, 0.0], r_int: 0.0, r_ext: 0.0 });
}

fn curva(c: &mut Cena, comp: u32, lado: u8, ordem: u32, a: [f64; 2], b: [f64; 2], sag: f64) {
    let id = c.gc.curvas.len() as u32 + 1;
    c.gc.curvas.insert(id, CurvaGC { componente: comp, lado, ordem, a, b, sag });
}

fn espelho(c: &mut Cena, comp: u32, indice: u32, a: [f64; 2], b: [f64; 2], z1: f64) {
    let id = c.gc.espelhos.len() as u32 + 1;
    c.gc.espelhos.insert(id, EspelhoGC { componente: comp, indice, a, b, z0: z1 - 0.17, z1 });
}

/// Lance reto ao longo de +x: espelhos em `x0 + k * 0.28`, largura `w`, `z1` partindo de `zi`; `dy` desloca o lance.
fn lance_reto(c: &mut Cena, comp_id: u32, indice: u32, x0: f64, n: u32, zi: f64, w: f64, dy: f64) {
    comp(c, comp_id, indice, COMPONENTE_LANCE, false);
    let fim = x0 + (n - 1) as f64 * 0.28;
    curva(c, comp_id, 0, 0, [x0 - 0.5, w / 2.0 + dy], [fim + 0.5, w / 2.0 + dy], 0.0);
    curva(c, comp_id, 1, 0, [x0 - 0.5, -w / 2.0 + dy], [fim + 0.5, -w / 2.0 + dy], 0.0);
    for k in 0..n {
        let x = x0 + k as f64 * 0.28;
        espelho(c, comp_id, k, [x, -w / 2.0 + dy], [x, w / 2.0 + dy], zi + 0.17 * k as f64);
    }
}

#[test]
fn escada_reta_um_trecho_por_lado_com_cota_linear() {
    let mut c = cena_base(HOSP_ESCADA, 1, 0b0101, 0, 0.0);
    escada(&mut c);
    lance_reto(&mut c, 1, 0, 0.0, 11, 0.17, 1.2, 0.0);
    let r = rodar(&c, 1e-6);
    assert_eq!(r.n(), 2);
    assert_eq!(r.origem(0), 0);
    assert_eq!(r.trecho(0).len(), 2);
    perto(r.trecho(0)[0], [0.0, 0.6, 0.17]);
    perto(r.trecho(0)[1], [2.8, 0.6, 0.17 + 1.7]);
    perto(r.trecho(1)[0], [0.0, -0.6, 0.17]);
    assert_eq!(r.flags(1) & FLAG_DIREITO, FLAG_DIREITO);
    let t = r.trecho(0);
    assert!(t.windows(2).all(|w| w[1][2] >= w[0][2]));
}

#[test]
fn lado_desligado_e_deslocamento_para_dentro_ou_fora() {
    let mut c = cena_base(HOSP_ESCADA, 1, 0b0001, 0, 0.035);
    escada(&mut c);
    lance_reto(&mut c, 1, 0, 0.0, 5, 0.17, 1.2, 0.0);
    let r = rodar(&c, 1e-6);
    assert_eq!(r.n(), 1, "só o esquerdo");
    perto(r.trecho(0)[0], [0.0, 0.6 - 0.035, 0.17]);
    c.gc.guardas.get_mut(&1).unwrap().pos_base = 1;
    let r = rodar(&c, 1e-6);
    perto(r.trecho(0)[0], [0.0, 0.6 + 0.035, 0.17]);
    c.gc.guardas.get_mut(&1).unwrap().lados = 0b0100;
    let r = rodar(&c, 1e-6);
    perto(r.trecho(0)[0], [0.0, -0.6 - 0.035, 0.17]);
    c.gc.guardas.get_mut(&1).unwrap().lados = 0;
    assert_eq!(rodar(&c, 1e-6).n(), 0);
}

fn patamar_reto(c: &mut Cena, comp_id: u32, indice: u32, x0: f64, x1: f64, z: f64) {
    comp(c, comp_id, indice, COMPONENTE_PATAMAR, false);
    for (k, (x, y)) in [(x0, -0.6), (x1, -0.6), (x1, 0.6), (x0, 0.6)].into_iter().enumerate() {
        let id = c.gc.patamares_escada.len() as u32 + 1;
        c.gc.patamares_escada.insert(id, PontoAnelGC { dono: comp_id, componente: 0, indice: k as u32, p: [x, y], z });
    }
}

fn escada_com_patamar(dy2: f64) -> Cena {
    let mut c = cena_base(HOSP_ESCADA, 1, 0b1111, 0, 0.0);
    escada(&mut c);
    lance_reto(&mut c, 1, 0, 0.0, 4, 0.17, 1.2, 0.0);
    patamar_reto(&mut c, 2, 1, 0.84, 1.84, 0.51);
    lance_reto(&mut c, 3, 2, 1.84, 4, 0.68, 1.2, dy2);
    c
}

#[test]
fn lance_patamar_lance_soldados() {
    let c = escada_com_patamar(0.0);
    let r = rodar(&c, 1e-6);
    assert_eq!(r.n(), 6);
    assert_eq!((r.origem(0), r.origem(1), r.origem(2)), (0, 1, 0));
    assert_eq!(r.flags(0) & FLAG_SOLDADO, 0);
    assert_eq!(r.flags(1) & FLAG_SOLDADO, FLAG_SOLDADO);
    assert_eq!(r.flags(2) & FLAG_SOLDADO, FLAG_SOLDADO);
    assert_eq!(r.trecho(1).len(), 2);
    perto(r.trecho(1)[0], [0.84, 0.6, 0.51]);
    perto(r.trecho(1)[1], [1.84, 0.6, 0.51]);
    assert!(r.avisos.is_empty());
    perto(r.trecho(4)[0], [0.84, -0.6, 0.51]);
}

#[test]
fn emenda_que_nao_fecha_abre_o_caminho_e_avisa() {
    let c = escada_com_patamar(0.1);
    let r = rodar(&c, 1e-6);
    assert_eq!(r.n(), 6);
    assert_eq!(r.flags(2) & FLAG_SOLDADO, 0);
    assert!(r.avisos.chunks(4).any(|a| a[1] == AVISO_HOSPEDEIRO_DESCONTINUO && a[2] == 2));
    assert!(rodar(&c, 0.5).avisos.is_empty());
}

#[test]
fn patamar_desligado_parte_a_cadeia_em_dois() {
    let mut c = escada_com_patamar(0.0);
    c.gc.guardas.get_mut(&1).unwrap().lados = 0b0101;
    let r = rodar(&c, 1e-6);
    assert_eq!(r.n(), 4);
    assert_eq!(r.flags(1) & FLAG_SOLDADO, 0, "o segundo lance abre trecho próprio");
    assert!(r.avisos.is_empty());
}

#[test]
fn patamar_de_giro_em_u_tem_cadeia_interna_curta_e_externa_com_cantos() {
    let mut c = cena_base(HOSP_ESCADA, 1, 0b1111, 0, 0.0);
    escada(&mut c);
    lance_reto(&mut c, 1, 0, 0.0, 4, 0.17, 1.2, 0.0);
    comp(&mut c, 3, 2, COMPONENTE_LANCE, false);
    curva(&mut c, 3, 0, 0, [1.5, 1.3], [-1.0, 1.3], 0.0);
    curva(&mut c, 3, 1, 0, [1.5, 2.5], [-1.0, 2.5], 0.0);
    for k in 0..3 {
        let x = 0.84 - 0.28 * k as f64;
        espelho(&mut c, 3, k, [x, 1.3], [x, 2.5], 0.68 + 0.17 * k as f64);
    }
    comp(&mut c, 2, 1, COMPONENTE_PATAMAR, false);
    let anel = [(0.84, 0.0), (2.4, 0.0), (2.4, 2.5), (0.84, 2.5), (0.84, 1.3), (0.84, 1.2)];
    for (k, (x, y)) in anel.into_iter().enumerate() {
        let id = c.gc.patamares_escada.len() as u32 + 1;
        c.gc.patamares_escada.insert(id, PontoAnelGC { dono: 2, componente: 0, indice: k as u32, p: [x, y], z: 0.51 });
    }
    let r = rodar(&c, 1e-6);
    assert_eq!(r.trecho(1).len(), 2);
    perto(r.trecho(1)[0], [0.84, 1.2, 0.51]);
    perto(r.trecho(1)[1], [0.84, 1.3, 0.51]);
    let ext = r.trecho(4);
    assert_eq!(ext.len(), 4);
    perto(ext[0], [0.84, 0.0, 0.51]);
    perto(ext[1], [2.4, 0.0, 0.51]);
    perto(ext[3], [0.84, 2.5, 0.51]);
}

#[test]
fn caracol_helice_com_cota_linear_no_arco() {
    let mut c = cena_base(HOSP_ESCADA, 1, 0b0101, 1, 0.0);
    escada(&mut c);
    comp(&mut c, 1, 0, COMPONENTE_LANCE, true);
    let q = std::f64::consts::FRAC_1_SQRT_2;
    for (lado, r) in [(0u8, 0.5), (1u8, 1.5)] {
        curva(&mut c, 1, lado, 0, [r, 0.0], [0.0, r], -r * (1.0 - q));
    }
    for k in 0..10u32 {
        let th = std::f64::consts::FRAC_PI_2 * (0.05 + 0.9 * k as f64 / 9.0);
        espelho(&mut c, 1, k, [0.4 * th.cos(), 0.4 * th.sin()], [1.6 * th.cos(), 1.6 * th.sin()], 0.17 * (k + 1) as f64);
    }
    let r = rodar(&c, 1e-6);
    assert_eq!(r.n(), 2);
    assert_eq!(r.origem(0), 3);
    assert_eq!(r.flags(0) & FLAG_CURVO, FLAG_CURVO);
    let t = r.trecho(0);
    assert!(t.len() >= 8);
    let th0 = std::f64::consts::FRAC_PI_2 * 0.05;
    let th1 = std::f64::consts::FRAC_PI_2 * 0.95;
    for p in &t {
        assert!((p[0].hypot(p[1]) - 0.5).abs() < 2.5e-3, "raio {}", p[0].hypot(p[1]));
        let th = p[1].atan2(p[0]);
        let z = 0.17 + (1.7 - 0.17) * (th - th0) / (th1 - th0);
        assert!((p[2] - z).abs() < 3e-3, "z {} esperado {z}", p[2]);
    }
    assert!(t.windows(2).all(|w| w[1][2] > w[0][2]));
    for w in t.windows(2) {
        let m = ((w[0][0] + w[1][0]) / 2.0).hypot((w[0][1] + w[1][1]) / 2.0);
        assert!(0.5 - m < 2.1e-3);
    }
    let mut c2 = c;
    c2.gc.guardas.get_mut(&1).unwrap().desloc = 0.1;
    let t2 = rodar(&c2, 1e-6).trecho(0);
    assert!((t2[3][0].hypot(t2[3][1]) - 0.4).abs() < 3e-3);
}

#[test]
fn rampa_lance_e_patamar() {
    let mut c = cena_base(HOSP_RAMPA, 1, 0b1111, 0, 0.0);
    c.gc.rampas.insert(1, RampaGC { nivel: 0, z_base: 0.0, z_topo: 0.6 });
    c.gc.lances_rampa.insert(
        1,
        LanceRampaGC { rampa: 1, indice: 0, inicio: [0.0, 0.0], fim: [5.0, 0.0], a: [0.0, -0.75], b: [0.0, 0.75], c: [5.0, -0.75], d: [5.0, 0.75], z0: 0.0, z1: 0.4 },
    );
    for (k, (x, y)) in [(5.0, -0.75), (6.5, -0.75), (6.5, 0.75), (5.0, 0.75)].into_iter().enumerate() {
        c.gc.patamares_rampa.insert(k as u32 + 1, PontoAnelGC { dono: 1, componente: 1, indice: k as u32, p: [x, y], z: 0.4 });
    }
    c.gc.lances_rampa.insert(
        2,
        LanceRampaGC { rampa: 1, indice: 2, inicio: [6.5, 0.0], fim: [10.0, 0.0], a: [6.5, -0.75], b: [6.5, 0.75], c: [10.0, -0.75], d: [10.0, 0.75], z0: 0.4, z1: 0.6 },
    );
    let r = rodar(&c, 1e-6);
    assert_eq!(r.n(), 6);
    perto(r.trecho(0)[0], [0.0, 0.75, 0.0]);
    perto(r.trecho(0)[1], [5.0, 0.75, 0.4]);
    assert_eq!(r.origem(1), 1);
    perto(r.trecho(1)[0], [5.0, 0.75, 0.4]);
    perto(r.trecho(1)[1], [6.5, 0.75, 0.4]);
    perto(r.trecho(2)[1], [10.0, 0.75, 0.6]);
    perto(r.trecho(5)[1], [10.0, -0.75, 0.6]);
}

fn manual_c(pts: &[(f64, f64, f64)], fechado: bool, desloc: f64, lado: u8) -> Cena {
    let mut c = cena_base(HOSP_MANUAL, ID_AUSENTE, 0, 0, desloc);
    let g = c.gc.guardas.get_mut(&1).unwrap();
    g.fechado = fechado;
    g.lado_desloc = lado;
    g.cota_base = 3.0;
    for (i, (x, y, dz)) in pts.iter().enumerate() {
        c.gc.caminhos.insert(i as u32 + 1, CaminhoLinha { guarda: 1, indice: i as u32, x: *x, y: *y, dz: *dz });
    }
    c
}

#[test]
fn manual_aberto_com_dz_e_lados() {
    let pts = [(0.0, 0.0, 0.0), (4.0, 0.0, 0.0), (4.0, 3.0, 0.5)];
    let r = rodar(&manual_c(&pts, false, 0.1, 0), 1e-6);
    assert_eq!(r.n(), 1);
    assert_eq!(r.origem(0), 2);
    let t = r.trecho(0);
    perto(t[0], [0.0, 0.1, 3.0]);
    perto(t[1], [3.9, 0.1, 3.0]);
    perto(t[2], [3.9, 3.0, 3.5]);
    let d = rodar(&manual_c(&pts, false, 0.1, 1), 1e-6).trecho(0);
    perto(d[0], [0.0, -0.1, 3.0]);
    perto(d[1], [4.1, -0.1, 3.0]);
    let ce = rodar(&manual_c(&pts, false, 0.1, 2), 1e-6).trecho(0);
    perto(ce[1], [4.0, 0.0, 3.0]);
    let mut inv = manual_c(&pts, false, 0.0, 2);
    inv.gc.guardas.get_mut(&1).unwrap().inverter = true;
    perto(rodar(&inv, 1e-6).trecho(0)[0], [4.0, 3.0, 3.5]);
}

#[test]
fn manual_fechado_desloca_com_esquadria_e_recusa_excesso() {
    let q = [(0.0, 0.0, 0.0), (4.0, 0.0, 0.0), (4.0, 4.0, 0.0), (0.0, 4.0, 0.0)];
    let r = rodar(&manual_c(&q, true, 0.1, 0), 1e-6);
    assert_eq!(r.flags(0) & FLAG_FECHADO, FLAG_FECHADO);
    let t = r.trecho(0);
    assert_eq!(t.len(), 4);
    perto(t[0], [0.1, 0.1, 3.0]);
    perto(t[2], [3.9, 3.9, 3.0]);
    let p = [(0.0, 0.0, 0.0), (0.1, 0.0, 0.0), (0.1, 0.1, 0.0), (0.0, 0.1, 0.0)];
    let r = rodar(&manual_c(&p, true, 0.2, 0), 1e-6);
    assert_eq!(r.n(), 0);
    assert_eq!(r.avisos[1], AVISO_DESLOCAMENTO_EXCEDE);
}

#[test]
fn esquadria_acima_de_2_5_vezes_vira_chanfro() {
    let a = 150.0f64.to_radians();
    let pts = [(0.0, 0.0, 0.0), (1.0, 0.0, 0.0), (1.0 + a.cos(), a.sin(), 0.0)];
    let r = rodar(&manual_c(&pts, false, 0.1, 1), 1e-6);
    assert_eq!(r.trecho(0).len(), 4, "o canto vira dois pontos");
}

#[test]
fn referencia_quebrada_continua_dando_entrada() {
    let mut c = cena_base(HOSP_ESCADA, 7, 15, 0, 0.0);
    assert_eq!(guarda_caminhos(&c, NIVEL_TODOS, 1e-6).err(), Some(ENTRADA));
    c.gc.guardas.clear();
    assert_eq!(rodar(&c, 1e-6).n(), 0);
}

#[test]
fn filtra_por_nivel() {
    let q = [(0.0, 0.0, 0.0), (4.0, 0.0, 0.0)];
    let c = manual_c(&q, false, 0.0, 2);
    assert!(matches!(&guarda_caminhos(&c, 5, 1e-6).unwrap()[0], Saida::U32(v) if v.is_empty()));
}

// ------------------------------------------------ invariantes de geometria (ADR 0055: inverter só troca a orientação)

use crate::gc_montagem::{montar, Montagem};

/// Copia o tipo completo (perfis, postes, trilhos, corrimão, padrão) da cena de teste da montagem e acrescenta deslocamentos laterais
/// assimétricos (trilho, elemento do padrão e corrimão de um lado só): qualquer troca de lado ao inverter aparece como mudança de lado.
fn equipar(c: &mut Cena, por_degrau: bool) {
    let l = crate::gc_montagem::testes::cena_l(false);
    c.gc.perfis = l.gc.perfis;
    c.gc.tipos = l.gc.tipos;
    c.gc.postes = l.gc.postes;
    c.gc.trilhos = l.gc.trilhos;
    c.gc.corrimaos = l.gc.corrimaos;
    c.gc.padroes = l.gc.padroes;
    c.gc.padrao_elementos = l.gc.padrao_elementos;
    c.gc.trilhos.get_mut(&1).unwrap().desloc = 0.02;
    c.gc.padrao_elementos.get_mut(&1).unwrap().desloc_lateral = 0.03;
    c.gc.corrimaos.get_mut(&1).unwrap().posicao = 1;
    if por_degrau {
        let p = c.gc.padroes.get_mut(&1).unwrap();
        p.pd_ativo = true;
        p.pd_qtd = 2;
        p.pd_dist = 0.04;
        p.pd_perfil = 1;
        p.pd_material = 4;
    }
}

fn caso_u() -> Cena {
    let mut c = cena_base(HOSP_ESCADA, 1, 0b1111, 0, 0.0);
    escada(&mut c);
    lance_reto(&mut c, 1, 0, 0.0, 4, 0.17, 1.2, 0.0);
    comp(&mut c, 3, 2, COMPONENTE_LANCE, false);
    curva(&mut c, 3, 0, 0, [1.5, 1.3], [-1.0, 1.3], 0.0);
    curva(&mut c, 3, 1, 0, [1.5, 2.5], [-1.0, 2.5], 0.0);
    for k in 0..3 {
        let x = 0.84 - 0.28 * k as f64;
        espelho(&mut c, 3, k, [x, 1.3], [x, 2.5], 0.68 + 0.17 * k as f64);
    }
    comp(&mut c, 2, 1, COMPONENTE_PATAMAR, false);
    for (k, (x, y)) in [(0.84, 0.0), (2.4, 0.0), (2.4, 2.5), (0.84, 2.5), (0.84, 1.3), (0.84, 1.2)].into_iter().enumerate() {
        let id = c.gc.patamares_escada.len() as u32 + 1;
        c.gc.patamares_escada.insert(id, PontoAnelGC { dono: 2, componente: 0, indice: k as u32, p: [x, y], z: 0.51 });
    }
    c
}

fn caso_caracol() -> Cena {
    let mut c = cena_base(HOSP_ESCADA, 1, 0b0101, 1, 0.0);
    escada(&mut c);
    comp(&mut c, 1, 0, COMPONENTE_LANCE, true);
    let q = std::f64::consts::FRAC_1_SQRT_2;
    for (lado, r) in [(0u8, 0.5), (1u8, 1.5)] {
        curva(&mut c, 1, lado, 0, [r, 0.0], [0.0, r], -r * (1.0 - q));
    }
    for k in 0..10u32 {
        let th = std::f64::consts::FRAC_PI_2 * (0.05 + 0.9 * k as f64 / 9.0);
        espelho(&mut c, 1, k, [0.4 * th.cos(), 0.4 * th.sin()], [1.6 * th.cos(), 1.6 * th.sin()], 0.17 * (k + 1) as f64);
    }
    c
}

fn caso_rampa() -> Cena {
    let mut c = cena_base(HOSP_RAMPA, 1, 0b1111, 0, 0.0);
    c.gc.rampas.insert(1, RampaGC { nivel: 0, z_base: 0.0, z_topo: 0.6 });
    c.gc.lances_rampa.insert(
        1,
        LanceRampaGC { rampa: 1, indice: 0, inicio: [0.0, 0.0], fim: [5.0, 0.0], a: [0.0, -0.75], b: [0.0, 0.75], c: [5.0, -0.75], d: [5.0, 0.75], z0: 0.0, z1: 0.4 },
    );
    for (k, (x, y)) in [(5.0, -0.75), (6.5, -0.75), (6.5, 0.75), (5.0, 0.75)].into_iter().enumerate() {
        c.gc.patamares_rampa.insert(k as u32 + 1, PontoAnelGC { dono: 1, componente: 1, indice: k as u32, p: [x, y], z: 0.4 });
    }
    c.gc.lances_rampa.insert(
        2,
        LanceRampaGC { rampa: 1, indice: 2, inicio: [6.5, 0.0], fim: [10.0, 0.0], a: [6.5, -0.75], b: [6.5, 0.75], c: [10.0, -0.75], d: [10.0, 0.75], z0: 0.4, z1: 0.6 },
    );
    c
}

/// Distância lateral com sinal (esquerda positiva) do ponto ao segmento mais próximo da cadeia, medida sempre na cadeia do sentido normal.
fn lateral(m: &Montagem, p: [f64; 3]) -> f64 {
    let mut melhor = (f64::INFINITY, 0.0);
    for t in &m.cadeia.trechos {
        let mut pts: Vec<[f64; 2]> = t.nos.iter().map(|n| [n.x, n.y]).collect();
        if t.fechado {
            pts.push(pts[0]);
        }
        for w in pts.windows(2) {
            let (dx, dy) = (w[1][0] - w[0][0], w[1][1] - w[0][1]);
            let l2 = dx * dx + dy * dy;
            if l2 < 1e-18 {
                continue;
            }
            let u = (((p[0] - w[0][0]) * dx + (p[1] - w[0][1]) * dy) / l2).clamp(0.0, 1.0);
            let d = (p[0] - (w[0][0] + u * dx)).hypot(p[1] - (w[0][1] + u * dy));
            if d < melhor.0 - 1e-12 {
                melhor = (d, (dx * (p[1] - w[0][1]) - dy * (p[0] - w[0][0])) / l2.sqrt());
            }
        }
    }
    melhor.1
}

/// Por papel: quantidade, volume total, soma do lado médio dos grupos; mais a lista de grupos que atravessam o eixo.
struct Resumo {
    qtd: [usize; 8],
    vol: [f64; 8],
    lat: [f64; 8],
    atravessa: Vec<String>,
}

/// Largura máxima de perfil dos testes (poste de 0,06 m): um grupo só "atravessa" o eixo se entrar mais que meia largura nos dois lados.
const LARGURA_MAX_PERFIL: f64 = 0.06;

fn resumir(m: &Montagem, ref_cad: &Montagem, nome: &str) -> Resumo {
    let mut r = Resumo { qtd: [0; 8], vol: [0.0; 8], lat: [0.0; 8], atravessa: Vec::new() };
    for (i, g) in m.malha.grupos.iter().enumerate() {
        let a = m.malha.analisar(i);
        assert!(a.fechada && a.volume > 0.0, "{nome}: grupo {i} (papel {}) aberto, invertido ou sem volume: {a:?}", g.papel);
        let idx = &m.malha.indices[g.primeiro as usize..(g.primeiro + g.n) as usize];
        let (mut mn, mut mx, mut soma) = (f64::INFINITY, f64::NEG_INFINITY, 0.0);
        for &k in idx {
            let l = lateral(ref_cad, m.malha.vertices[k as usize]);
            mn = mn.min(l);
            mx = mx.max(l);
            soma += l;
        }
        if mn < -LARGURA_MAX_PERFIL / 2.0 - 1e-3 && mx > LARGURA_MAX_PERFIL / 2.0 + 1e-3 {
            r.atravessa.push(format!("grupo {i} papel {} lateral [{mn:.3}, {mx:.3}]", g.papel));
        }
        let p = g.papel as usize;
        r.qtd[p] += 1;
        r.vol[p] += a.volume;
        r.lat[p] += soma / idx.len() as f64;
    }
    r
}

fn confere_inversao(nome: &str, mut c: Cena) {
    let hospedado = c.gc.guardas[&1].hosp != HOSP_MANUAL;
    equipar(&mut c, hospedado);
    let normal = montar(&c, NIVEL_TODOS, 1, ID_AUSENTE, 1e-3, true).unwrap_or_else(|e| panic!("{nome}: montar falhou ({e})"));
    c.gc.guardas.get_mut(&1).unwrap().inverter = true;
    let inv = montar(&c, NIVEL_TODOS, 1, ID_AUSENTE, 1e-3, true).unwrap_or_else(|e| panic!("{nome}: montar invertido falhou ({e})"));
    let (a, b) = (resumir(&normal, &normal, nome), resumir(&inv, &normal, nome));
    assert!(a.qtd.iter().sum::<usize>() > 0, "{nome}: sem peças");
    assert!(a.atravessa.is_empty(), "{nome}: peça cruza o caminho no sentido normal: {:?}", a.atravessa);
    assert!(b.atravessa.is_empty(), "{nome}: peça cruza o caminho invertido: {:?}", b.atravessa);
    for papel in 0..8u32 {
        let n = |m: &Montagem| m.pecas.iter().filter(|p| p.papel == papel).count();
        assert_eq!(n(&normal), n(&inv), "{nome}: papel {papel}: peças lógicas");
    }

    for p in 0..8 {
        assert_eq!(a.qtd[p], b.qtd[p], "{nome}: papel {p}: quantidade de peças muda ao inverter");
        assert!((a.vol[p] - b.vol[p]).abs() <= 1e-3 * a.vol[p].max(1e-9), "{nome}: papel {p}: volume {} x {}", a.vol[p], b.vol[p]);
        let n = a.qtd[p].max(1) as f64;
        assert!((a.lat[p] - b.lat[p]).abs() / n < 0.01, "{nome}: papel {p}: lado médio {} x {}", a.lat[p] / n, b.lat[p] / n);
    }
}

#[test]
fn invariantes_do_guarda_corpo_sentido_normal_e_invertido() {
    confere_inversao("reta", {
        let mut c = cena_base(HOSP_ESCADA, 1, 0b0101, 0, 0.0);
        escada(&mut c);
        lance_reto(&mut c, 1, 0, 0.0, 11, 0.17, 1.2, 0.0);
        c
    });
    confere_inversao("lance-patamar-lance", escada_com_patamar(0.0));
    confere_inversao("U com patamar de giro", caso_u());
    confere_inversao("caracol", caso_caracol());
    confere_inversao("rampa com patamar", caso_rampa());
    let l = [(0.0, 0.0, 0.0), (4.0, 0.0, 0.0), (4.0, 3.0, 0.5)];
    for lado in [0u8, 1, 2] {
        confere_inversao(&format!("manual aberto lado {lado}"), manual_c(&l, false, 0.1, lado));
    }
    confere_inversao("manual fechado", manual_c(&[(0.0, 0.0, 0.0), (4.0, 0.0, 0.0), (4.0, 4.0, 0.0), (0.0, 4.0, 0.0)], true, 0.1, 0));
}

// ------------------------------------------------ avisos de geometria degenerada (ADR 0055 §23)

use crate::gc_avisos::{
    AV_CAMINHO_NULO, AV_CAMINHO_REPETIDO, AV_DESLOCAMENTO_EXCEDE, AV_HOSPEDEIRO_DESCONTINUO, AV_PADRAO_NAO_CABE, AV_PERFIL_AUTO_INTERSECTA, AV_SEM_BORDA,
    AV_TRECHO_CURTO, AV_VAO_SEM_ESPACO,
};

/// Monta o nível com o tipo completo, no sentido normal e no invertido, e confere o invariante: todo caso degenerado gera aviso e nunca uma peça
/// inválida (grupo aberto, invertido ou sem volume). Devolve a montagem do sentido normal.
fn montar_sem_peca_invalida(nome: &str, mut c: Cena) -> Montagem {
    equipar(&mut c, false);
    let normal = montar(&c, NIVEL_TODOS, 1, ID_AUSENTE, 1e-3, true).unwrap_or_else(|e| panic!("{nome}: montar falhou ({e})"));
    c.gc.guardas.get_mut(&1).unwrap().inverter = true;
    let inv = montar(&c, NIVEL_TODOS, 1, ID_AUSENTE, 1e-3, true).unwrap_or_else(|e| panic!("{nome}: montar invertido falhou ({e})"));
    for (rotulo, m) in [("normal", &normal), ("invertido", &inv)] {
        for (i, g) in m.malha.grupos.iter().enumerate() {
            let a = m.malha.analisar(i);
            assert!(a.fechada && a.volume > 0.0, "{nome} ({rotulo}): grupo {i} (papel {}) inválido: {a:?}", g.papel);
        }
    }
    for k in [AV_TRECHO_CURTO, AV_CAMINHO_REPETIDO, AV_CAMINHO_NULO, AV_SEM_BORDA, AV_DESLOCAMENTO_EXCEDE, AV_HOSPEDEIRO_DESCONTINUO] {
        assert_eq!(tem(&normal, k), tem(&inv, k), "{nome}: o aviso {k} difere ao inverter");
    }
    normal
}

fn tem(m: &Montagem, codigo: u32) -> bool {
    m.avisos.iter().any(|a| a.codigo == codigo)
}

fn aviso_de(m: &Montagem, codigo: u32) -> &crate::gc_avisos::Aviso {
    m.avisos.iter().find(|a| a.codigo == codigo).unwrap_or_else(|| panic!("sem aviso {codigo}: {:?}", m.avisos))
}

#[test]
fn aviso_trecho_curto_no_lado_interno_do_patamar_em_l() {
    // O lance entra pela aresta x = 0,84 e o seguinte sai pela aresta vizinha (y = 0,6): no canto o lado interno sobra com um nó só e vira ponto.
    let mut c = cena_base(HOSP_ESCADA, 1, 0b1111, 0, 0.0);
    escada(&mut c);
    lance_reto(&mut c, 1, 0, 0.0, 4, 0.17, 1.2, 0.0);
    patamar_reto(&mut c, 2, 1, 0.84, 1.84, 0.51);
    comp(&mut c, 3, 2, COMPONENTE_LANCE, false);
    curva(&mut c, 3, 0, 0, [1.84, 0.6], [1.84, 3.0], 0.0);
    curva(&mut c, 3, 1, 0, [0.84, 0.6], [0.84, 3.0], 0.0);
    for k in 0..3 {
        let y = 0.6 + 0.28 * k as f64;
        espelho(&mut c, 3, k, [0.84, y], [1.84, y], 0.68 + 0.17 * k as f64);
    }
    let r = rodar(&c, 1e-6);
    let curtos: Vec<&[u32]> = r.avisos.chunks(4).filter(|a| a[1] == AVISO_TRECHO_CURTO).collect();
    assert_eq!(curtos.len(), 1, "um lado do patamar vira ponto: {:?}", r.avisos);
    assert_eq!(curtos[0][3], 1, "o item é o patamar");
    let m = montar_sem_peca_invalida("L", c);
    let a = aviso_de(&m, AV_TRECHO_CURTO);
    assert_eq!((a.guarda, a.indice), (1, 1));
}

#[test]
fn aviso_trecho_que_vira_ponto_na_montagem() {
    let m = montar_sem_peca_invalida("ponto", manual_c(&[(0.0, 0.0, 0.0), (5e-7, 0.0, 0.0)], false, 0.0, 2));
    let a = aviso_de(&m, AV_TRECHO_CURTO);
    assert!(a.medido <= 1e-6 && a.limite > 0.0);
    assert!(m.pecas.is_empty(), "nenhuma peça no trecho que vira ponto");
}

#[test]
fn aviso_deslocamento_maior_que_a_largura() {
    let p = [(0.0, 0.0, 0.0), (0.1, 0.0, 0.0), (0.1, 0.1, 0.0), (0.0, 0.1, 0.0)];
    let m = montar_sem_peca_invalida("desloc", manual_c(&p, true, 0.2, 0));
    let a = aviso_de(&m, AV_DESLOCAMENTO_EXCEDE);
    assert_eq!((a.guarda, a.medido), (1, 0.2));
    assert!(m.malha.grupos.is_empty());
}

#[test]
fn aviso_vertices_repetidos_e_segmento_nulo_no_caminho_manual() {
    let m = montar_sem_peca_invalida(
        "repetido",
        manual_c(&[(0.0, 0.0, 0.0), (0.0, 0.0, 0.0), (4.0, 0.0, 0.0), (4.0, 0.0, 0.0), (4.0, 0.0, 0.0), (4.0, 3.0, 0.0)], false, 0.0, 2),
    );
    let a = aviso_de(&m, AV_CAMINHO_REPETIDO);
    assert_eq!((a.medido, a.indice), (3.0, 1));
    assert!(!m.pecas.is_empty(), "o caminho sem os repetidos ainda desenha");
    let m = montar_sem_peca_invalida("nulo", manual_c(&[(1.0, 1.0, 0.0), (1.0, 1.0, 0.0), (1.0, 1.0, 0.0)], false, 0.0, 2));
    assert!(tem(&m, AV_CAMINHO_REPETIDO));
    let a = aviso_de(&m, AV_CAMINHO_NULO);
    assert_eq!(a.medido, 1.0);
    assert!(m.pecas.is_empty());
}

#[test]
fn aviso_hospedeiro_sem_borda_no_lado_pedido() {
    // Lance sem nenhum espelho: não há cadeia em nenhum lado ligado.
    let mut c = cena_base(HOSP_ESCADA, 1, 0b0101, 0, 0.0);
    escada(&mut c);
    comp(&mut c, 1, 0, COMPONENTE_LANCE, false);
    let r = rodar(&c, 1e-6);
    assert_eq!(r.n(), 0);
    assert_eq!(r.avisos.chunks(4).filter(|a| a[1] == AVISO_SEM_BORDA).count(), 2, "um por lado: {:?}", r.avisos);
    let m = montar_sem_peca_invalida("sem-borda", c);
    assert!(tem(&m, AV_SEM_BORDA));
    // Escada sem componentes: sem borda nos dois lados ligados.
    let mut c = cena_base(HOSP_ESCADA, 1, 0b0101, 0, 0.0);
    escada(&mut c);
    assert_eq!(rodar(&c, 1e-6).avisos.chunks(4).filter(|a| a[1] == AVISO_SEM_BORDA).count(), 2);
    // Patamar sem anel (menos de três pontos): sem borda; com o lado desligado não avisa.
    let mut c = cena_base(HOSP_ESCADA, 1, 0b1000, 0, 0.0);
    escada(&mut c);
    comp(&mut c, 2, 0, COMPONENTE_PATAMAR, false);
    assert!(rodar(&c, 1e-6).avisos.chunks(4).any(|a| a[1] == AVISO_SEM_BORDA));
    c.gc.guardas.get_mut(&1).unwrap().lados = 0;
    assert!(rodar(&c, 1e-6).avisos.is_empty());
}

#[test]
fn aviso_emenda_que_nao_fecha_sobe_para_a_lista() {
    let m = montar_sem_peca_invalida("descontinuo", escada_com_patamar(0.1));
    assert!(tem(&m, AV_HOSPEDEIRO_DESCONTINUO));
}

#[test]
fn aviso_perfil_que_se_auto_intersecta_na_curva_apertada() {
    // Trilhos de 4 cm: a 90 graus o contorno recua 2 cm por dentro; o segmento de 1 cm entre os dois cantos não comporta.
    let m = montar_sem_peca_invalida("apertada", manual_c(&[(0.0, 0.0, 0.0), (2.0, 0.0, 0.0), (2.0, 0.01, 0.0), (0.0, 0.01, 0.0)], false, 0.0, 2));
    let a = aviso_de(&m, AV_PERFIL_AUTO_INTERSECTA);
    assert!(a.medido > a.limite && (a.limite - 0.01).abs() < 1e-6, "{a:?}");
    // Folgado: nenhum aviso.
    let m = montar_sem_peca_invalida("folgada", manual_c(&[(0.0, 0.0, 0.0), (2.0, 0.0, 0.0), (2.0, 1.0, 0.0), (0.0, 1.0, 0.0)], false, 0.0, 2));
    assert!(!tem(&m, AV_PERFIL_AUTO_INTERSECTA));
    // Laço fechado apertado.
    let m = montar_sem_peca_invalida("fechado", manual_c(&[(0.0, 0.0, 0.0), (2.0, 0.0, 0.0), (2.0, 0.01, 0.0), (0.0, 0.01, 0.0)], true, 0.0, 2));
    assert!(tem(&m, AV_PERFIL_AUTO_INTERSECTA));
}

#[test]
fn aviso_padrao_que_nao_cabe_sobe_para_a_lista() {
    // Trecho de 5 cm: o padrão de 12 cm não cabe entre os postes de 6 cm.
    let m = montar_sem_peca_invalida("curtissimo", manual_c(&[(0.0, 0.0, 0.0), (0.05, 0.0, 0.0)], false, 0.0, 2));
    assert!(tem(&m, AV_PADRAO_NAO_CABE) || tem(&m, AV_VAO_SEM_ESPACO), "{:?}", m.avisos);
    assert_eq!(m.avisos.iter().find(|a| a.codigo == AV_PADRAO_NAO_CABE || a.codigo == AV_VAO_SEM_ESPACO).unwrap().guarda, 1);
}

#[test]
fn saida_plana_dos_avisos_de_geometria() {
    let m = montar_sem_peca_invalida("plana", manual_c(&[(0.0, 0.0, 0.0), (0.0, 0.0, 0.0), (4.0, 0.0, 0.0)], false, 0.0, 2));
    let (a, v) = crate::gc_avisos::achatar_avisos(&m.avisos);
    assert_eq!(a.len() / 4, v.len() / 5);
    assert!(a.chunks(4).any(|x| x[1] == AV_CAMINHO_REPETIDO));
}
