//! Volume de sobreposição exato entre duas peças com alturas afins. Porta de `packages/engine/src/junctionNet.ts`
//! (`ajustarAfim`, `recortarAnel` e `volumeExatoAfim`), operação por operação, para que o resultado bata com o TS.
//!
//! Método: as retas onde duas alturas se igualam (topo com topo, base com base, topo com base) dividem a região comum em
//! células convexas. Em cada célula a altura é afim, então a integral é a área da célula vezes a altura no centróide dela
//! (fórmula do polígono, com furos). A altura de cada peça é o par `[base, topo]` em cada ponto da planta.

use crate::geo2d::{hipot, v, V};
use crate::MultiPoligono;

/// Função afim sobre a planta: `gx·x + gy·y + gc`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Afim {
    pub gx: f64,
    pub gy: f64,
    pub gc: f64,
}

/// Retângulo envolvente de todos os vértices (furos incluídos), como `multiPoints` do TS.
fn envolvente(m: &MultiPoligono) -> Option<(f64, f64, f64, f64)> {
    let mut x0 = f64::INFINITY;
    let mut y0 = f64::INFINITY;
    let mut x1 = f64::NEG_INFINITY;
    let mut y1 = f64::NEG_INFINITY;
    let mut algum = false;
    for poli in m {
        for anel in poli {
            for p in anel {
                algum = true;
                x0 = x0.min(p[0]);
                y0 = y0.min(p[1]);
                x1 = x1.max(p[0]);
                y1 = y1.max(p[1]);
            }
        }
    }
    if algum {
        Some((x0, y0, x1, y1))
    } else {
        None
    }
}

/// Ajusta `f` como função afim sobre a região `m`. Testa a afinidade em cinco pontos (cantos do retângulo envolvente e
/// o centro). Devolve `None` se não for afim (ex.: topo de perfil com quebra) ou se a região estiver vazia.
pub fn ajustar_afim(f: &dyn Fn(V) -> f64, m: &MultiPoligono) -> Option<Afim> {
    let (x0, y0, x1, y1) = envolvente(m)?;
    let s = (x1 - x0).max(y1 - y0).max(1.0);
    let f00 = f(v(x0, y0));
    let f10 = f(v(x0 + s, y0));
    let f01 = f(v(x0, y0 + s));
    let f11 = f(v(x0 + s, y0 + s));
    let gx = (f10 - f00) / s;
    let gy = (f01 - f00) / s;
    let gc = f00 - gx * x0 - gy * y0;
    let cx = x0 + s / 2.0;
    let cy = y0 + s / 2.0;
    let fc = f(v(cx, cy));
    let esc = 1.0f64.max(f00.abs()).max(f11.abs()).max(fc.abs());
    if (f11 - (gx * (x0 + s) + gy * (y0 + s) + gc)).abs() > 1e-9 * esc {
        return None;
    }
    if (fc - (gx * cx + gy * cy + gc)).abs() > 1e-9 * esc {
        return None;
    }
    Some(Afim { gx, gy, gc })
}

/// Recorte de um anel pelo semiplano `s·(gx·x + gy·y + gc) >= 0` (Sutherland–Hodgman). Preserva a área orientada.
/// `s` é `1` ou `-1`.
pub fn recortar_anel(anel: &[V], d: &Afim, s: i8) -> Vec<V> {
    let sinal = s as f64;
    let f = |p: V| sinal * (d.gx * p.x + d.gy * p.y + d.gc);
    let mut out: Vec<V> = Vec::new();
    for k in 0..anel.len() {
        let p = anel[k];
        let q = anel[(k + 1) % anel.len()];
        let fp = f(p);
        let fq = f(q);
        if fp >= 0.0 {
            out.push(p);
        }
        if (fp >= 0.0) != (fq >= 0.0) {
            let t = fp / (fp - fq);
            out.push(v(p.x + (q.x - p.x) * t, p.y + (q.y - p.y) * t));
        }
    }
    out
}

/// Diferença de duas afins; `None` se forem iguais (reta degenerada, não divide nada).
fn diferenca(f: &Afim, g: &Afim) -> Option<Afim> {
    let d = Afim { gx: f.gx - g.gx, gy: f.gy - g.gy, gc: f.gc - g.gc };
    if hipot(d.gx, d.gy) < 1e-12 {
        None
    } else {
        Some(d)
    }
}

/// Altura comum às duas peças num ponto: `max(0, min(topo_a, topo_b) - max(base_a, base_b))`.
fn altura_comum(a: &dyn Fn(V) -> [f64; 2], b: &dyn Fn(V) -> [f64; 2], p: V) -> f64 {
    let [a0, a1] = a(p);
    let [b0, b1] = b(p);
    0.0f64.max(a1.min(b1) - a0.max(b0))
}

/// Volume de sobreposição exato quando as alturas são afins. `a` e `b` dão `[base, topo]` em cada ponto da planta.
/// `common` é a região comum às duas plantas. Devolve `None` se alguma face não for afim (aí quem chama mantém o
/// cálculo antigo).
pub fn volume_exato_afim(common: &MultiPoligono, a: &dyn Fn(V) -> [f64; 2], b: &dyn Fn(V) -> [f64; 2]) -> Option<f64> {
    let fa0 = |p: V| a(p)[0];
    let fa1 = |p: V| a(p)[1];
    let fb0 = |p: V| b(p)[0];
    let fb1 = |p: V| b(p)[1];
    let a0 = ajustar_afim(&fa0, common)?;
    let a1 = ajustar_afim(&fa1, common)?;
    let b0 = ajustar_afim(&fb0, common)?;
    let b1 = ajustar_afim(&fb1, common)?;
    let candidatas = [
        diferenca(&a1, &b0),
        diferenca(&a1, &a0),
        diferenca(&b1, &a0),
        diferenca(&b1, &b0),
        diferenca(&a1, &b1),
        diferenca(&a0, &b0),
    ];
    let retas: Vec<Afim> = candidatas.into_iter().flatten().collect();

    let mut total = 0.0;
    for mascara in 0u32..(1u32 << retas.len()) {
        let mut area = 0.0;
        let mut mx = 0.0;
        let mut my = 0.0;
        for poli in common {
            for anel_original in poli {
                let mut anel: Vec<V> = anel_original.iter().map(|p| v(p[0], p[1])).collect();
                for (k, d) in retas.iter().enumerate() {
                    if anel.len() >= 3 {
                        let s: i8 = if (mascara >> k) & 1 == 1 { 1 } else { -1 };
                        anel = recortar_anel(&anel, d, s);
                    }
                }
                if anel.len() < 3 {
                    continue;
                }
                let mut a2 = 0.0;
                let mut sx = 0.0;
                let mut sy = 0.0;
                for k in 0..anel.len() {
                    let p = anel[k];
                    let q = anel[(k + 1) % anel.len()];
                    let cr = p.x * q.y - q.x * p.y;
                    a2 += cr;
                    sx += (p.x + q.x) * cr;
                    sy += (p.y + q.y) * cr;
                }
                area += a2 / 2.0;
                mx += sx / 6.0;
                my += sy / 6.0;
            }
        }
        if area.abs() < 1e-18 {
            continue;
        }
        total += area * altura_comum(a, b, v(mx / area, my / area));
    }
    Some(total)
}

#[cfg(test)]
mod testes {
    use super::*;

    /// Retângulo [x0,x1]×[y0,y1] como multipolígono (um anel, anti-horário).
    fn retangulo(x0: f64, y0: f64, x1: f64, y1: f64) -> MultiPoligono {
        vec![vec![vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1]]]]
    }

    fn lf(p: V) -> f64 {
        p.x
    }

    #[test]
    fn ajusta_afim_linear_e_recusa_quebra() {
        let m = retangulo(0.0, 0.0, 2.0, 1.0);
        let f = |p: V| 1.0 + 2.0 * p.x - 0.5 * p.y;
        let r = ajustar_afim(&f, &m).expect("afim");
        assert!((r.gx - 2.0).abs() < 1e-12 && (r.gy + 0.5).abs() < 1e-12 && (r.gc - 1.0).abs() < 1e-12);
        // Quebra em x = 1: o centro não cai no plano dos cantos.
        let quebra = |p: V| 1.0 + (p.x - 1.0).abs();
        assert!(ajustar_afim(&quebra, &m).is_none());
        assert!(ajustar_afim(&lf, &Vec::new()).is_none());
    }

    #[test]
    fn recorte_por_semiplano_preserva_area() {
        // Quadrado [0,2]² cortado por x >= 1 (f = x - 1): sobra [1,2]x[0,2], área 2.
        let quadrado: Vec<V> = vec![v(0.0, 0.0), v(2.0, 0.0), v(2.0, 2.0), v(0.0, 2.0)];
        let d = Afim { gx: 1.0, gy: 0.0, gc: -1.0 };
        let r = recortar_anel(&quadrado, &d, 1);
        let area: f64 = (0..r.len()).map(|k| r[k].x * r[(k + 1) % r.len()].y - r[(k + 1) % r.len()].x * r[k].y).sum::<f64>() / 2.0;
        assert_eq!(r.len(), 4);
        assert!((area - 2.0).abs() < 1e-12);
    }

    /// (a) retângulo [0,2]x[0,1], altura a = [0, 1+x], b = [0.3y, 1-x]. Analítico: 0.365.
    #[test]
    fn caso_a_retangulo_analitico() {
        let m = retangulo(0.0, 0.0, 2.0, 1.0);
        let a = |p: V| [0.0, 1.0 + p.x];
        let b = |p: V| [0.3 * p.y, 1.0 - p.x];
        let vol = volume_exato_afim(&m, &a, &b).expect("afim");
        assert!((vol - 0.365).abs() < 1e-9, "volume {vol}");
    }

    /// (b) L = [0,2]x[0,1] menos [0,1]x[0,0.5], mesmas alturas de (a). Analítico: 0.365 - 0.214375 = 0.150625.
    #[test]
    fn caso_b_forma_nao_convexa_analitico() {
        let forma: MultiPoligono = vec![vec![vec![[1.0, 0.0], [2.0, 0.0], [2.0, 1.0], [0.0, 1.0], [0.0, 0.5], [1.0, 0.5]]]];
        let a = |p: V| [0.0, 1.0 + p.x];
        let b = |p: V| [0.3 * p.y, 1.0 - p.x];
        let vol = volume_exato_afim(&forma, &a, &b).expect("afim");
        assert!((vol - 0.150625).abs() < 1e-9, "volume {vol}");
    }

    /// (c) retângulo [0,2]x[0,1], a = [0, 2-x], b = [0.5, 1+0.5x]. Altura = max(0, min(2-x, 1+0.5x) - 0.5), independe de y.
    /// Analítico: ∫₀^{2/3}(0.5+0.5x)dx + ∫_{2/3}^{1.5}(1.5-x)dx = 4/9 + 25/72 = 19/24.
    #[test]
    fn caso_c_retangulo_com_topos_cruzados() {
        let m = retangulo(0.0, 0.0, 2.0, 1.0);
        let a = |p: V| [0.0, 2.0 - p.x];
        let b = |p: V| [0.5, 1.0 + 0.5 * p.x];
        let vol = volume_exato_afim(&m, &a, &b).expect("afim");
        assert!((vol - 19.0 / 24.0).abs() < 1e-9, "volume {vol}");
    }

    #[test]
    fn face_nao_afim_devolve_none() {
        let m = retangulo(0.0, 0.0, 2.0, 1.0);
        let a = |p: V| [0.0, 1.0 + (p.x - 1.0).abs()];
        let b = |_p: V| [0.0, 1.0];
        assert!(volume_exato_afim(&m, &a, &b).is_none());
    }
}
