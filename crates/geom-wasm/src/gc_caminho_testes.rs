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
