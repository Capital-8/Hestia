//! Distribuição sobre o caminho REAL da Fase 3a (`guarda_caminhos`): lance, patamar e caracol montados nas tabelas da cena.
use super::testes::{config, padrao, param_postes};
use super::*;
use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::{ID_AUSENTE, NIVEL_TODOS};
use crate::gc_caminho::guarda_caminhos;
use crate::secoes_gc::*;

fn cena(lados: u8, pos_base: u8) -> Cena {
    let mut c = Cena::novo();
    c.gc.tipos.insert(
        1,
        TipoGuardaLinha { altura: 1.1, desloc: 0.035, ajuste_patamar: 0.0, folga_inferior: 0.0, junc_angular: 0, junc_tangente: 0, conexao: 0, tol_corda: 0.002, norma: ID_AUSENTE },
    );
    c.gc.guardas.insert(
        1,
        GuardaCorpoLinha {
            nivel: 0,
            tipo: 1,
            hosp: HOSP_ESCADA,
            hosp_num: 1,
            lados,
            pos_base,
            desloc: 0.0,
            altura: f64::NAN,
            inverter: false,
            fechado: false,
            lado_desloc: 0,
            cota_base: 0.0,
            flags: 7,
        },
    );
    c.gc.escadas.insert(1, EscadaGC { nivel: 0, z_base: 0.0, z_topo: 3.0, altura_espelho: 0.17, profundidade_piso: 0.28 });
    c
}

fn espelho(c: &mut Cena, comp: u32, indice: u32, a: [f64; 2], b: [f64; 2], z1: f64) {
    let id = c.gc.espelhos.len() as u32 + 1;
    c.gc.espelhos.insert(id, EspelhoGC { componente: comp, indice, a, b, z0: z1 - 0.17, z1 });
}

fn curva(c: &mut Cena, comp: u32, lado: u8, a: [f64; 2], b: [f64; 2], sag: f64) {
    let id = c.gc.curvas.len() as u32 + 1;
    c.gc.curvas.insert(id, CurvaGC { componente: comp, lado, ordem: 0, a, b, sag });
}

/// Cadeias do Rust real convertidas para `CadeiaGC` (saída 0 `trechos`, saída 1 `nos`).
fn cadeias(c: &Cena) -> CadeiaGC {
    let s = guarda_caminhos(c, NIVEL_TODOS, 1e-6).expect("consulta");
    let (Saida::U32(tr), Saida::F64(nos)) = (&s[0], &s[1]) else { panic!() };
    let mut out = CadeiaGC::default();
    let mut ini = 0usize;
    for k in 0..tr.len() / 5 {
        let n = tr[k * 5 + 3] as usize;
        let origem = match tr[k * 5 + 2] {
            0 => OrigemTrecho::Lance,
            1 => OrigemTrecho::Patamar,
            3 => OrigemTrecho::Caracol,
            _ => OrigemTrecho::Manual,
        };
        let flags = tr[k * 5 + 4];
        out.trechos.push(TrechoGC {
            guarda: tr[k * 5],
            indice: tr[k * 5 + 1],
            origem,
            curvo: flags & 1 != 0,
            fechado: flags & 2 != 0,
            nos: (ini..ini + n).map(|i| No3 { x: nos[i * 3], y: nos[i * 3 + 1], z: nos[i * 3 + 2] }).collect(),
        });
        ini += n;
    }
    out
}

/// `dist` negativo = centro da pisada.
fn cfg_por_degrau(q: u32, dist: f64, degraus: Vec<DegrauP>) -> ConfigDistribuicao {
    let mut pad = padrao(0.11, JUSTIF_DISTRIBUIR);
    pad.por_degrau = PorDegrauP { ativo: true, quantidade: q, dist_quina: dist.max(0.0), centro: dist < 0.0, perfil: Some(PerfilP::circular(0.012)), material: 5 };
    let mut cfg = config(param_postes(Some(0.05), Some(0.05), Some(0.05), None, MODO_NENHUM, 0.0, 0), vec![pad]);
    cfg.degraus = degraus;
    cfg.gerar_malha = true;
    cfg
}

#[test]
fn lance_e_patamar_reais_por_degrau_e_padrao() {
    let mut c = cena(0b0011, 0);
    for (id, indice, tipo) in [(1u32, 0u32, COMPONENTE_LANCE), (2, 1, COMPONENTE_PATAMAR)] {
        c.gc.componentes.insert(id, ComponenteGC { escada: 1, indice, tipo, caracol: false, centro: [0.0, 0.0], r_int: 0.0, r_ext: 0.0 });
    }
    curva(&mut c, 1, 0, [-0.5, 0.6], [3.3, 0.6], 0.0);
    curva(&mut c, 1, 1, [-0.5, -0.6], [3.3, -0.6], 0.0);
    for k in 0..11u32 {
        espelho(&mut c, 1, k, [0.28 * k as f64, -0.6], [0.28 * k as f64, 0.6], 0.17 + 0.17 * k as f64);
    }
    for (k, (x, y)) in [(2.8, -0.6), (3.8, -0.6), (3.8, 0.6), (2.8, 0.6)].into_iter().enumerate() {
        let id = c.gc.patamares_escada.len() as u32 + 1;
        c.gc.patamares_escada.insert(id, PontoAnelGC { dono: 2, componente: 0, indice: k as u32, p: [x, y], z: 1.87 });
    }
    let cad = cadeias(&c);
    assert_eq!(cad.trechos.len(), 2);
    assert_eq!(cad.trechos[0].origem, OrigemTrecho::Lance);
    assert_eq!(cad.trechos[1].origem, OrigemTrecho::Patamar);
    let degraus: Vec<DegrauP> = (0..10).map(|k| DegrauP { s0: 0.28 * k as f64, profundidade: 0.28, z: 0.17 + 0.17 * k as f64 }).collect();
    for q in 1..=3u32 {
        let cfg = cfg_por_degrau(q, 0.04, degraus.clone());
        let lance = distribuir(&cad.trechos[0], &cfg, LIMITE_BALAUSTRES).unwrap();
        assert_eq!(lance.balaustres[0].len(), 10 * q as usize);
        assert!(lance.balaustres[0].iter().all(|b| b.elem.is_none() && b.z1 > b.z0));
        for (k, b) in lance.balaustres[0].iter().step_by(q as usize).enumerate() {
            assert!((b.z0 - (0.17 + 0.17 * k as f64)).abs() < 1e-6);
            assert!((b.s - (0.28 * k as f64 + 0.04)).abs() < 1e-6);
            assert!(b.s - 0.28 * k as f64 >= 0.006 - 1e-9 && b.s - 0.28 * k as f64 <= 0.28 - 0.006 + 1e-9, "montante fora do piso");
        }
        for p in &lance.pecas {
            assert!(p.malha.fechada() && p.malha.volume() > 0.0);
        }
        // Patamar usa o padrão normal mesmo com por degrau ligado.
        let pat = distribuir(&cad.trechos[1], &cfg, LIMITE_BALAUSTRES).unwrap();
        assert!(!pat.balaustres[0].is_empty() && pat.balaustres[0].iter().all(|b| b.elem == Some(0)));
        assert!(pat.balaustres[0].iter().all(|b| (b.z0 - (1.87 + 0.1)).abs() < 1e-6));
    }
}

#[test]
fn caracol_real_por_degrau_acompanha_a_helice() {
    let mut c = cena(0b0001, 1);
    c.gc.componentes.insert(1, ComponenteGC { escada: 1, indice: 0, tipo: COMPONENTE_LANCE, caracol: true, centro: [0.0, 0.0], r_int: 0.0, r_ext: 0.0 });
    let q = std::f64::consts::FRAC_1_SQRT_2;
    for (lado, r) in [(0u8, 0.5), (1u8, 1.5)] {
        curva(&mut c, 1, lado, [r, 0.0], [0.0, r], -r * (1.0 - q));
    }
    let th = |k: u32| std::f64::consts::FRAC_PI_2 * (0.05 + 0.9 * k as f64 / 9.0);
    for k in 0..10u32 {
        espelho(&mut c, 1, k, [0.4 * th(k).cos(), 0.4 * th(k).sin()], [1.6 * th(k).cos(), 1.6 * th(k).sin()], 0.17 * (k + 1) as f64);
    }
    let cad = cadeias(&c);
    assert_eq!(cad.trechos.len(), 1);
    let t = &cad.trechos[0];
    assert!(t.curvo && t.origem == OrigemTrecho::Caracol);
    let perc = Percurso::de(t);
    let ang0 = t.nos[0].y.atan2(t.nos[0].x);
    let raio = t.nos[0].x.hypot(t.nos[0].y);
    let s_de = |k: u32| (th(k) - ang0) * raio;
    let degraus: Vec<DegrauP> = (0..9).map(|k| DegrauP { s0: s_de(k), profundidade: s_de(k + 1) - s_de(k), z: 0.17 * (k + 1) as f64 }).collect();
    let cfg = cfg_por_degrau(2, -1.0, degraus);
    let o = distribuir(t, &cfg, LIMITE_BALAUSTRES).unwrap();
    assert_eq!(o.postes.len(), 2, "caracol: poste só nas pontas");
    let b = &o.balaustres[0];
    // Centro da pisada, 2 por degrau: o primeiro montante do primeiro degrau cai sobre o poste de início e sai, e o último do último degrau passa do fim da cadeia.
    assert_eq!(b.len(), 16);
    for w in b.windows(2) {
        assert!(w[1].z1 > w[0].z1 - 1e-9 && w[1].s > w[0].s);
    }
    for k in 1..9usize {
        let bk = &b[2 * k - 1];
        assert!((bk.z0 - 0.17 * (k + 1) as f64).abs() < 1e-9);
        // A base está no piso do degrau e o eixo segue a cadeia: no meio da pisada fica a até um espelho (0,17 m) acima do piso.
        assert!((perc.amostra(bk.s).z - bk.z0).abs() < 0.17, "degrau {k}: eixo {} base {}", perc.amostra(bk.s).z, bk.z0);
    }
    for p in &o.pecas {
        assert!(p.malha.fechada() && p.malha.volume() > 0.0);
    }
}
