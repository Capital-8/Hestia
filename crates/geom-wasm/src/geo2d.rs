//! Vetores 2D e arcos, portados de `packages/geom/src/vec.ts`, `line.ts` e `arc.ts` (sub-etapa A1,
//! decisão 0047). Reproduz o TypeScript operação por operação (inclusive a ordem das contas), sem
//! "corrigir" nada: a equivalência com o TS é o critério.
//!
//! `Math.hypot` do V8 não é `sqrt(x*x+y*y)`: usa escala pelo maior módulo e soma compensada
//! (Kahan). [`hipot`] repete o algoritmo para as distâncias baterem até nos últimos bits.

/// Vetor 2D em metros.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct V {
    pub x: f64,
    pub y: f64,
}

/// `EPS` de `vec.ts`.
pub const EPS: f64 = 1e-9;

pub const fn v(x: f64, y: f64) -> V {
    V { x, y }
}

pub fn add(a: V, b: V) -> V {
    v(a.x + b.x, a.y + b.y)
}
pub fn sub(a: V, b: V) -> V {
    v(a.x - b.x, a.y - b.y)
}
pub fn mul(a: V, k: f64) -> V {
    v(a.x * k, a.y * k)
}
pub fn neg(a: V) -> V {
    v(-a.x, -a.y)
}
pub fn dot(a: V, b: V) -> f64 {
    a.x * b.x + a.y * b.y
}
pub fn cross(a: V, b: V) -> f64 {
    a.x * b.y - a.y * b.x
}
/// Perpendicular à esquerda.
pub fn perp(a: V) -> V {
    v(-a.y, a.x)
}

/// `Math.hypot(x, y)` do V8.
pub fn hipot(x: f64, y: f64) -> f64 {
    let (ax, ay) = (x.abs(), y.abs());
    if ax.is_infinite() || ay.is_infinite() {
        return f64::INFINITY;
    }
    if ax.is_nan() || ay.is_nan() {
        return f64::NAN;
    }
    let max = ax.max(ay);
    if max == 0.0 {
        return 0.0;
    }
    let mut soma = 0.0f64;
    let mut comp = 0.0f64;
    for t in [ax, ay] {
        let n = t / max;
        let parcela = n * n - comp;
        let prelim = soma + parcela;
        comp = (prelim - soma) - parcela;
        soma = prelim;
    }
    soma.sqrt() * max
}

pub fn len(a: V) -> f64 {
    hipot(a.x, a.y)
}
pub fn dist(a: V, b: V) -> f64 {
    hipot(a.x - b.x, a.y - b.y)
}
pub fn norm(a: V) -> V {
    let l = len(a);
    if l < EPS {
        v(0.0, 0.0)
    } else {
        v(a.x / l, a.y / l)
    }
}

/// `Math.round` do JS: ao inteiro mais próximo, empate para +infinito.
pub fn arredonda_js(x: f64) -> f64 {
    let r = x.floor();
    if x - r >= 0.5 {
        r + 1.0
    } else {
        r
    }
}

/// Interseção de duas retas (`intersectLines`): devolve o ponto, ou `None` se paralelas.
pub fn intersecta_retas(p: V, d: V, q: V, e: V) -> Option<V> {
    let den = cross(d, e);
    if den.abs() < EPS {
        return None;
    }
    let qp = sub(q, p);
    let t = cross(qp, e) / den;
    Some(add(p, mul(d, t)))
}

/// Arco definido pelas extremidades e pela flecha (`Arc` de `arc.ts`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Arco {
    pub center: V,
    pub radius: f64,
    pub a0: f64,
    pub sweep: f64,
    pub length: f64,
    /// +1 ou -1.
    pub k: f64,
}

pub fn arco_da_flecha(a: V, b: V, sag: f64) -> Option<Arco> {
    let chord = len(sub(b, a));
    if sag.abs() < 1e-6 || chord < 1e-6 {
        return None;
    }
    let h = sag.abs().min(chord / 2.0);
    let r = (chord * chord) / 4.0 / (2.0 * h) + h / 2.0;
    let u = norm(sub(b, a));
    let n = perp(u);
    let sgn = if sag > 0.0 { 1.0 } else { -1.0 };
    let mid = v((a.x + b.x) / 2.0, (a.y + b.y) / 2.0);
    let apex = add(mid, mul(n, h * sgn));
    let center = sub(apex, mul(n, r * sgn));
    let mag = 2.0 * (chord / (2.0 * r)).min(1.0).asin();
    let sweep = if sgn > 0.0 { -mag } else { mag };
    Some(Arco {
        center,
        radius: r,
        a0: (a.y - center.y).atan2(a.x - center.x),
        sweep,
        length: r * mag,
        k: if sgn > 0.0 { 1.0 } else { -1.0 },
    })
}

fn sentido(arc: &Arco) -> f64 {
    if arc.sweep < 0.0 {
        -1.0
    } else {
        1.0
    }
}

pub fn arco_ponto(arc: &Arco, t: f64, s: f64) -> V {
    let th = arc.a0 + sentido(arc) * (t / arc.radius);
    let rho = arc.radius + arc.k * s;
    v(arc.center.x + rho * th.cos(), arc.center.y + rho * th.sin())
}

pub fn arco_tangente(arc: &Arco, t: f64) -> V {
    let th = arc.a0 + sentido(arc) * (t / arc.radius);
    let d = sentido(arc);
    v(-th.sin() * d, th.cos() * d)
}

/// `arcLocal`: `(t, s)` de um ponto no sistema do arco.
pub fn arco_local(arc: &Arco, p: V) -> (f64, f64) {
    let th = (p.y - arc.center.y).atan2(p.x - arc.center.x);
    let d = sentido(arc);
    let mag = arc.sweep.abs();
    let lower = mag / 2.0 - std::f64::consts::PI;
    let mut dth = (th - arc.a0) * d - lower;
    let dois_pi = std::f64::consts::PI * 2.0;
    dth = ((dth % dois_pi) + dois_pi) % dois_pi + lower;
    let rho = hipot(p.x - arc.center.x, p.y - arc.center.y);
    (dth * arc.radius, (rho - arc.radius) * arc.k)
}

/// `arcSample`: pontos da curva paralela `s`, de `t0` a `t1`, com erro de corda <= `tol`.
pub fn arco_amostra(arc: &Arco, t0: f64, t1: f64, s: f64, tol: f64) -> Vec<V> {
    let rho = EPS.max(arc.radius + arc.k * s);
    let span = (t1 - t0).abs() / arc.radius;
    let step = 2.0 * (1.0 - tol / rho).max(0.0).acos();
    let n = 2.0f64.max(720.0f64.min((span / step.max(1e-3)).ceil()));
    let ni = if n.is_finite() { n as usize } else { 2 };
    let mut out = Vec::with_capacity(ni + 1);
    for i in 0..=ni {
        out.push(arco_ponto(arc, t0 + ((t1 - t0) * i as f64) / n, s));
    }
    out
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn hipot_basico() {
        assert_eq!(hipot(3.0, 4.0), 5.0);
        assert_eq!(hipot(0.0, 0.0), 0.0);
        assert!((hipot(1e-200, 1e-200) - 1.4142135623730951e-200).abs() < 1e-214);
    }

    #[test]
    fn arredonda_como_math_round() {
        assert_eq!(arredonda_js(2.5), 3.0);
        assert_eq!(arredonda_js(-2.5), -2.0);
        assert_eq!(arredonda_js(0.49999999999999994), 0.0);
        assert_eq!(arredonda_js(-0.4), 0.0);
        assert_eq!(arredonda_js(7.0), 7.0);
    }

    #[test]
    fn arco_semicircular() {
        let arc = arco_da_flecha(v(0.0, 0.0), v(2.0, 0.0), 1.0).expect("arco");
        assert!((arc.radius - 1.0).abs() < 1e-12);
        assert!((arc.length - std::f64::consts::PI).abs() < 1e-12);
        assert_eq!(arc.k, 1.0);
        let m = arco_ponto(&arc, arc.length / 2.0, 0.0);
        assert!((m.x - 1.0).abs() < 1e-12 && (m.y - 1.0).abs() < 1e-12);
        assert!(arco_da_flecha(v(0.0, 0.0), v(2.0, 0.0), 1e-7).is_none());
        let (t, s) = arco_local(&arc, m);
        assert!((t - arc.length / 2.0).abs() < 1e-9 && s.abs() < 1e-12);
    }

    #[test]
    fn amostra_tem_extremos() {
        let arc = arco_da_flecha(v(0.0, 0.0), v(4.0, 0.0), -0.5).expect("arco");
        let pts = arco_amostra(&arc, 0.0, arc.length, 0.1, 0.05);
        assert!(pts.len() >= 3);
        let p0 = arco_ponto(&arc, 0.0, 0.1);
        assert_eq!(pts[0], p0);
    }
}
