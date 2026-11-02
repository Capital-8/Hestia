//! Quadro (`WallFrame`) de uma parede e geometria de faces, portados de `packages/engine/src/frame.ts`
//! e `wallFrameZ.ts` (sub-etapa A1, decisão 0047). Mesmas contas, mesma ordem.
//!
//! O JS envia `z0` e `topo` prontos (a altura vem de `wallMaxHeight`, que não é portada).

use std::rc::Rc;

use crate::geo2d::{
    arco_da_flecha, arco_local, arco_ponto, arco_tangente, dist, dot, hipot, intersecta_retas, norm, perp, sub, v, Arco, V,
};

/// Função da camada, na ordem de `FUNCTION_PRIORITY` do modelo.
pub const PRIORIDADE_PADRAO: [f64; 6] = [1.0, 2.0, 3.0, 3.0, 4.0, 5.0];
/// Índice de `structure`.
pub const FUNCAO_ESTRUTURA: u8 = 0;

/// Camada de um tipo (só números).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CamadaTipo {
    pub espessura: f64,
    pub funcao: u8,
    /// Prioridade efetiva (`layerPriority`): a da camada, ou a padrão da função.
    pub prioridade: f64,
    /// Distância da face externa até o início / fim da camada (`layerSpans`).
    pub de: f64,
    pub ate: f64,
}

/// Tipo de parede com o que a A1 lê dele.
#[derive(Clone, Debug, PartialEq)]
pub struct TipoCalc {
    pub camadas: Vec<CamadaTipo>,
    /// `totalThickness`: soma em ordem, começando em 0.
    pub total: f64,
    /// `coreSpan`.
    pub nucleo_de: f64,
    pub nucleo_ate: f64,
}

impl TipoCalc {
    /// Monta o tipo a partir de `(espessura, funcao, prioridade opcional)` na ordem face externa -> interna.
    pub fn novo(camadas: &[(f64, u8, Option<f64>)]) -> TipoCalc {
        let mut d = 0.0f64;
        let mut v_: Vec<CamadaTipo> = Vec::with_capacity(camadas.len());
        for &(e, f, p) in camadas {
            let de = d;
            d += e;
            let padrao = PRIORIDADE_PADRAO.get(f as usize).copied().unwrap_or(0.0);
            v_.push(CamadaTipo { espessura: e, funcao: f, prioridade: p.unwrap_or(padrao), de, ate: d });
        }
        let total = camadas.iter().fold(0.0f64, |s, c| s + c.0);
        // coreRange: primeira e última camada de estrutura; sem estrutura, o elemento inteiro.
        let mut primeiro: Option<usize> = None;
        let mut ultimo = 0usize;
        for (i, c) in v_.iter().enumerate() {
            if c.funcao == FUNCAO_ESTRUTURA {
                if primeiro.is_none() {
                    primeiro = Some(i);
                }
                ultimo = i;
            }
        }
        let (first, last) = match primeiro {
            Some(p) => (p, ultimo),
            None => (0, v_.len().saturating_sub(1)),
        };
        let nucleo_de = v_.get(first).map(|c| c.de).unwrap_or(0.0);
        let nucleo_ate = v_.get(last).map(|c| c.ate).unwrap_or(total);
        TipoCalc { camadas: v_, total, nucleo_de, nucleo_ate }
    }
}

/// `LocationLine` pelo código do esquema.
pub fn deslocamento_exterior(t: &TipoCalc, linha_loc: u8) -> f64 {
    match linha_loc {
        0 => t.total / 2.0,
        1 => (t.nucleo_de + t.nucleo_ate) / 2.0,
        2 => 0.0,
        3 => t.total,
        4 => t.nucleo_de,
        _ => t.nucleo_ate,
    }
}

/// Dados de uma parede que a A1 lê (equivalente ao `Wall` + `WallType`).
#[derive(Clone, Debug)]
pub struct ParedeEntrada {
    pub id: u32,
    pub a: V,
    pub b: V,
    pub ordem: f64,
    pub tipo: Rc<TipoCalc>,
    pub linha_loc: u8,
    pub invertida: bool,
    pub sag: f64,
    pub sem_junta: [bool; 2],
    /// `[a, b]`: `(miter?, inverte)`.
    pub junta: [(bool, bool); 2],
    pub z0: f64,
    pub topo: f64,
}

/// Sistema de coordenadas de uma parede (`WallFrame`).
#[derive(Clone, Debug)]
pub struct Quadro {
    pub id: u32,
    pub tipo: Rc<TipoCalc>,
    pub a: V,
    pub b: V,
    pub u: V,
    pub n: V,
    pub length: f64,
    pub arc: Option<Arco>,
    pub sign: f64,
    pub ext_offset: f64,
    pub thickness: f64,
    pub s_ext: f64,
    pub s_int: f64,
    pub s_hi: f64,
    pub s_lo: f64,
    pub s_mid: f64,
    pub ordem: f64,
    pub sem_junta: [bool; 2],
    pub junta: [(bool, bool); 2],
    pub z0: f64,
    pub topo: f64,
}

/// `buildFrame` + `withWallZ`. `None` se a corda for menor que 1e-4 m.
pub fn construir_quadro(w: &ParedeEntrada) -> Option<Quadro> {
    let d = sub(w.b, w.a);
    let chord = hipot(d.x, d.y);
    if chord < 1e-4 {
        return None;
    }
    let arc = arco_da_flecha(w.a, w.b, w.sag);
    let length = arc.map(|x| x.length).unwrap_or(chord);
    let u = match &arc {
        Some(x) => arco_tangente(x, 0.0),
        None => norm(d),
    };
    let n = perp(u);
    let sign = if w.invertida { -1.0 } else { 1.0 };
    let thickness = w.tipo.total;
    let ext_offset = deslocamento_exterior(&w.tipo, w.linha_loc);
    let s_ext = sign * ext_offset;
    let s_int = sign * (ext_offset - thickness);
    let s_hi = s_ext.max(s_int);
    let s_lo = s_ext.min(s_int);
    Some(Quadro {
        id: w.id,
        tipo: Rc::clone(&w.tipo),
        a: w.a,
        b: w.b,
        u,
        n,
        length,
        arc,
        sign,
        ext_offset,
        thickness,
        s_ext,
        s_int,
        s_hi,
        s_lo,
        s_mid: (s_hi + s_lo) / 2.0,
        ordem: w.ordem,
        sem_junta: w.sem_junta,
        junta: w.junta,
        z0: w.z0,
        topo: w.topo,
    })
}

/// `pointAt`.
pub fn ponto_em(f: &Quadro, t: f64, s: f64) -> V {
    if let Some(arc) = &f.arc {
        return arco_ponto(arc, t, s);
    }
    v(f.a.x + f.u.x * t + f.n.x * s, f.a.y + f.u.y * t + f.n.y * s)
}

/// `tangentAt`.
pub fn tangente_em(f: &Quadro, t: f64) -> V {
    match &f.arc {
        Some(arc) => arco_tangente(arc, t),
        None => f.u,
    }
}

/// `normalAt`.
pub fn normal_em(f: &Quadro, t: f64) -> V {
    perp(tangente_em(f, t))
}

/// `endTangent`: tangente em a (`which = 0`) ou b (`1`), sentido a->b.
pub fn tangente_da_ponta(f: &Quadro, which: usize) -> V {
    tangente_em(f, if which == 0 { 0.0 } else { f.length })
}

/// `sAtDepth`.
pub fn s_na_profundidade(f: &Quadro, d: f64) -> f64 {
    f.sign * (f.ext_offset - d)
}

/// `toLocal`: `(t, s)` de um ponto do mundo.
pub fn para_local(f: &Quadro, p: V) -> (f64, f64) {
    if let Some(arc) = &f.arc {
        return arco_local(arc, p);
    }
    let r = sub(p, f.a);
    (dot(r, f.u), dot(r, f.n))
}

/// Curva de uma face: reta (ponto e direção unitária) ou circunferência.
#[derive(Clone, Copy, Debug)]
pub enum Curva {
    Reta { p: V, d: V },
    Circulo { c: V, r: f64 },
}

/// `faceCurve`.
pub fn curva_da_face(f: &Quadro, s: f64) -> Curva {
    match &f.arc {
        Some(arc) => Curva::Circulo { c: arc.center, r: arc.radius + arc.k * s },
        None => Curva::Reta { p: v(f.a.x + f.n.x * s, f.a.y + f.n.y * s), d: f.u },
    }
}

fn mais_proximo(pts: &[V], perto: V) -> Option<V> {
    let mut melhor: Option<V> = None;
    for &p in pts {
        match melhor {
            Some(b) if !(dist(p, perto) < dist(b, perto)) => {}
            _ => melhor = Some(p),
        }
    }
    melhor
}

fn reta_circulo(p: V, d: V, c: V, r: f64) -> Vec<V> {
    let w = sub(p, c);
    let b = dot(d, w);
    let raw = b * b - (dot(w, w) - r * r);
    if raw < -1e-10 {
        return Vec::new();
    }
    let sq = raw.max(0.0).sqrt();
    [-b - sq, -b + sq].iter().map(|&k| v(p.x + d.x * k, p.y + d.y * k)).collect()
}

fn circulo_circulo(gc: V, gr: f64, hc: V, hr: f64) -> Vec<V> {
    let dv = sub(hc, gc);
    let d = hipot(dv.x, dv.y);
    if d < 1e-12 {
        return Vec::new();
    }
    let a = (gr * gr - hr * hr + d * d) / (2.0 * d);
    let h2 = gr * gr - a * a;
    if h2 < -1e-10 {
        return Vec::new();
    }
    let hh = h2.max(0.0).sqrt();
    let ux = dv.x / d;
    let uy = dv.y / d;
    let bx = gc.x + ux * a;
    let by = gc.y + uy * a;
    vec![v(bx - uy * hh, by + ux * hh), v(bx + uy * hh, by - ux * hh)]
}

/// `intersectCurves`: interseção de duas curvas de face, a mais perto de `perto`.
pub fn interseccao_de_curvas(g: Curva, h: Curva, perto: V) -> Option<V> {
    match (g, h) {
        (Curva::Reta { p: gp, d: gd }, Curva::Reta { p: hp, d: hd }) => intersecta_retas(gp, gd, hp, hd),
        (Curva::Reta { p, d }, Curva::Circulo { c, r }) => mais_proximo(&reta_circulo(p, d, c, r), perto),
        (Curva::Circulo { c, r }, Curva::Reta { p, d }) => mais_proximo(&reta_circulo(p, d, c, r), perto),
        (Curva::Circulo { c: gc, r: gr }, Curva::Circulo { c: hc, r: hr }) => mais_proximo(&circulo_circulo(gc, gr, hc, hr), perto),
    }
}

/// `planeHit`: ponto em que a face de profundidade `s` cruza o segmento p->q.
pub fn acerto_no_plano(f: &Quadro, s: f64, p: V, q: V, perto: V) -> Option<V> {
    let reta = Curva::Reta { p, d: norm(sub(q, p)) };
    let face = curva_da_face(f, s);
    let raizes: Vec<V> = match face {
        Curva::Circulo { c, r } => match reta {
            Curva::Reta { p: rp, d: rd } => reta_circulo(rp, rd, c, r),
            Curva::Circulo { .. } => Vec::new(),
        },
        Curva::Reta { .. } => interseccao_de_curvas(face, reta, perto).into_iter().collect(),
    };
    let d = sub(q, p);
    let ll = dot(d, d);
    let dentro: Vec<V> = raizes
        .iter()
        .copied()
        .filter(|&x| {
            let lam = dot(sub(x, p), d) / ll;
            (-1e-6..=1.0 + 1e-6).contains(&lam)
        })
        .collect();
    mais_proximo(if dentro.is_empty() { &raizes } else { &dentro }, perto)
}

#[cfg(test)]
mod testes {
    use super::*;

    fn tipo19() -> Rc<TipoCalc> {
        // reboco 0.02 / bloco 0.15 (estrutura) / reboco 0.02
        Rc::new(TipoCalc::novo(&[(0.02, 4, None), (0.15, 0, None), (0.02, 4, None)]))
    }

    fn parede(a: V, b: V, sag: f64, linha: u8, inv: bool) -> ParedeEntrada {
        ParedeEntrada {
            id: 1,
            a,
            b,
            ordem: 0.0,
            tipo: tipo19(),
            linha_loc: linha,
            invertida: inv,
            sag,
            sem_junta: [false; 2],
            junta: [(true, false); 2],
            z0: 0.0,
            topo: 3.0,
        }
    }

    #[test]
    fn tipo_calcula_nucleo_e_total() {
        let t = tipo19();
        assert!((t.total - 0.19).abs() < 1e-15);
        assert_eq!((t.nucleo_de, t.nucleo_ate), (0.02, 0.02 + 0.15));
        assert_eq!(t.camadas[0].prioridade, 4.0);
        assert_eq!(t.camadas[1].prioridade, 1.0);
        // sem estrutura: o tipo inteiro
        let s = TipoCalc::novo(&[(0.1, 4, None), (0.05, 5, Some(9.0))]);
        assert_eq!((s.nucleo_de, s.nucleo_ate), (0.0, 0.15000000000000002));
        assert_eq!(s.camadas[1].prioridade, 9.0);
        // vazio
        let z = TipoCalc::novo(&[]);
        assert_eq!((z.total, z.nucleo_de, z.nucleo_ate), (0.0, 0.0, 0.0));
    }

    #[test]
    fn quadro_reto_horizontal() {
        let f = construir_quadro(&parede(v(0.0, 0.0), v(4.0, 0.0), 0.0, 0, false)).expect("quadro");
        assert_eq!(f.u, v(1.0, 0.0));
        assert_eq!(f.n, v(-0.0, 1.0));
        assert_eq!(f.length, 4.0);
        assert!((f.s_ext - 0.095).abs() < 1e-12 && (f.s_int + 0.095).abs() < 1e-12);
        assert!((f.s_hi - 0.095).abs() < 1e-12 && (f.s_mid).abs() < 1e-12);
        let invertida = construir_quadro(&parede(v(0.0, 0.0), v(4.0, 0.0), 0.0, 3, true)).expect("quadro");
        assert!((invertida.s_ext + 0.19).abs() < 1e-12 && invertida.s_int.abs() < 1e-12);
    }

    #[test]
    fn corda_curta_nao_tem_quadro() {
        assert!(construir_quadro(&parede(v(0.0, 0.0), v(0.00005, 0.0), 0.0, 0, false)).is_none());
    }

    #[test]
    fn quadro_em_arco_e_ponto() {
        let f = construir_quadro(&parede(v(0.0, 0.0), v(2.0, 0.0), 1.0, 0, false)).expect("quadro");
        assert!(f.arc.is_some());
        assert!((f.length - std::f64::consts::PI).abs() < 1e-12);
        let p = ponto_em(&f, f.length, 0.0);
        assert!(dist(p, v(2.0, 0.0)) < 1e-9);
        let (t, s) = para_local(&f, p);
        assert!((t - f.length).abs() < 1e-9 && s.abs() < 1e-9);
    }

    #[test]
    fn interseccoes() {
        let a = Curva::Reta { p: v(0.0, 0.0), d: v(1.0, 0.0) };
        let b = Curva::Reta { p: v(2.0, -1.0), d: v(0.0, 1.0) };
        assert_eq!(interseccao_de_curvas(a, b, v(0.0, 0.0)), Some(v(2.0, 0.0)));
        let c = Curva::Circulo { c: v(0.0, 0.0), r: 2.0 };
        let p = interseccao_de_curvas(a, c, v(5.0, 0.0)).expect("ponto");
        assert!((p.x - 2.0).abs() < 1e-12);
        let c2 = Curva::Circulo { c: v(2.0, 0.0), r: 2.0 };
        assert!(interseccao_de_curvas(c, c2, v(1.0, 5.0)).is_some());
    }
}
