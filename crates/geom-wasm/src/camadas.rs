//! Geometria de camada de `packages/engine/src/layerGeom.ts` (sub-etapa A2, decisão 0047): ponto da
//! extremidade segundo o corte (`pointOnSide`), cadeias de quebra (`sideChain`, `planeChain`), polilinha da
//! ponta (`endPolyline`), contorno de camada reta e em arco (`layerQuad`, `arcBoundary`, `arcEdge`).
//!
//! Reproduz o TypeScript passo a passo (mesmos limiares, mesma ordem, mesmos desempates de ordenação
//! estável), inclusive o que parece manha. `withProfile`/`withBottomProfile` ficam para a A3.
//!
//! `EndSpec.hi` e `EndSpec.lo` do TS são sempre o mesmo corte (só `both` os constrói), então cada
//! extremidade tem um corte só e `endPolyline` usa o ramo `spec.hi === spec.lo`.

use crate::esquema::LIMITE;
use crate::geo2d::{add, cross, dot, mul, sub, V, EPS};
use crate::grupos::t_da_faixa;
use crate::juncoes::{ponto_da_esquadria, quebras_da_esquadria, Corda, Corte, Degrau};
use crate::quadro::{acerto_no_plano, para_local, ponto_em, Quadro};

/// `MIN_AREA` de `layerGeom.ts`.
const AREA_MINIMA: f64 = 1e-9;

/// Borda da faixa que está sendo cortada (`edge` de `stepT`).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Borda {
    Baixa,
    Alta,
}

/// `stepT`.
fn t_do_degrau(runs: &[Degrau], s: f64, borda: Borda) -> f64 {
    let Some(&primeiro) = runs.first() else { return 0.0 };
    let mut run = primeiro;
    for r in runs {
        let para = match borda {
            Borda::Baixa => r.s > s + 1e-12,
            Borda::Alta => r.s >= s - 1e-12,
        };
        if para {
            break;
        }
        run = *r;
    }
    t_da_faixa(&run, s)
}

/// `pointOnSide`: ponto da extremidade em `s` segundo o corte.
pub fn ponto_no_corte(f: &Quadro, which: usize, corte: &Corte, s: f64, borda: Borda) -> V {
    let na_ponta = |f: &Quadro| ponto_em(f, if which == 0 { 0.0 } else { f.length }, s);
    match corte {
        Corte::Reto(t) => ponto_em(f, *t, s),
        Corte::Plano { p, q, .. } => {
            let perto = na_ponta(f);
            acerto_no_plano(f, s, *p, *q, perto).unwrap_or(perto)
        }
        Corte::Degraus(runs) => ponto_em(f, t_do_degrau(runs, s, borda), s),
        Corte::Esquadria(se, ot) => {
            let d = if se.sigma > 0.0 { se.s_hi - s } else { s - se.s_lo };
            ponto_da_esquadria(se, ot, 0.0f64.max(d.min(se.s_hi - se.s_lo))).unwrap_or_else(|| na_ponta(f))
        }
    }
}

fn cmp_f(a: f64, b: f64) -> std::cmp::Ordering {
    a.partial_cmp(&b).unwrap_or(std::cmp::Ordering::Equal)
}

/// `planeChain`: pontos compartilhados da reta que caem entre as duas pontas da camada.
fn cadeia_plana(f: &Quadro, which: usize, corte: &Corte, p: V, q: V, pts: &[V], lo: f64, hi: f64) -> Vec<V> {
    let a = ponto_no_corte(f, which, corte, lo, Borda::Baixa);
    let b = ponto_no_corte(f, which, corte, hi, Borda::Alta);
    let d = sub(q, p);
    let ll = dot(d, d);
    let lam = |x: V| dot(sub(x, p), d) / ll;
    let la = lam(a);
    let lb = lam(b);
    let x0 = la.min(lb);
    let x1 = la.max(lb);
    let mut dentro: Vec<V> = pts.iter().copied().filter(|&x| lam(x) > x0 + 1e-9 && lam(x) < x1 - 1e-9).collect();
    dentro.sort_by(|&u, &w| cmp_f(lam(u), lam(w)));
    if la <= lb {
        dentro
    } else {
        dentro.reverse();
        dentro
    }
}

/// `sideChain`: vértices intermediários da linha de uma face entre `lo` e `hi`, em ordem crescente de s.
fn cadeia_do_lado(f: &Quadro, corte: &Corte, lo: f64, hi: f64, which: usize) -> Vec<V> {
    match corte {
        Corte::Plano { p, q, pts } => cadeia_plana(f, which, corte, *p, *q, pts, lo, hi),
        Corte::Degraus(runs) => {
            // Cada troca de faixa é um degrau: o vértice de baixo (fim do corte anterior) e o de cima (início do seguinte).
            let mut out = Vec::new();
            for i in 1..runs.len() {
                let r = &runs[i];
                if r.s <= lo + 1e-9 || r.s >= hi - 1e-9 {
                    continue;
                }
                out.push(ponto_em(f, t_da_faixa(&runs[i - 1], r.s), r.s));
                out.push(ponto_em(f, r.t, r.s));
            }
            out
        }
        Corte::Esquadria(m, outro) => {
            let d_de = |s: f64| if m.sigma > 0.0 { m.s_hi - s } else { s - m.s_lo };
            let d1 = d_de(lo).min(d_de(hi));
            let d2 = d_de(lo).max(d_de(hi));
            let ds: Vec<f64> = quebras_da_esquadria(m, outro).into_iter().filter(|&d| d > d1 + 1e-7 && d < d2 - 1e-7).collect();
            let mut pts: Vec<(f64, V)> = ds.into_iter().filter_map(|d| ponto_da_esquadria(m, outro, d).map(|p| (d, p))).collect();
            // s crescente = d decrescente quando a face externa do canto é a de s maior.
            if m.sigma > 0.0 {
                pts.sort_by(|x, y| cmp_f(y.0, x.0));
            } else {
                pts.sort_by(|x, y| cmp_f(x.0, y.0));
            }
            pts.into_iter().map(|(_, p)| p).collect()
        }
        Corte::Reto(_) => Vec::new(),
    }
}

/// `endPolyline` com `hi === lo`: a linha da extremidade entre `lo` e `hi` (crescente), com as pontas.
fn polilinha_da_ponta(f: &Quadro, which: usize, corte: &Corte, lo: f64, hi: f64) -> Vec<V> {
    let mut out = vec![ponto_no_corte(f, which, corte, lo, Borda::Baixa)];
    out.extend(cadeia_do_lado(f, corte, lo, hi, which));
    out.push(ponto_no_corte(f, which, corte, hi, Borda::Alta));
    out
}

fn area_com_sinal(q: &[V]) -> f64 {
    let mut s = 0.0;
    for i in 0..q.len() {
        let a = q[i];
        let b = q[(i + 1) % q.len()];
        s += a.x * b.y - b.x * a.y;
    }
    s / 2.0
}

/// `intersectSegments`.
fn interseccao_de_segmentos(a: V, b: V, c: V, d: V) -> Option<V> {
    // intersectLines(a, b - a, c, d - c)
    let (p, dd, q, e) = (a, sub(b, a), c, sub(d, c));
    let den = cross(dd, e);
    if den.abs() < EPS {
        return None;
    }
    let qp = sub(q, p);
    let t = cross(qp, e) / den;
    let u = cross(qp, dd) / den;
    let tol = 1e-9;
    if t < -tol || t > 1.0 + tol || u < -tol || u > 1.0 + tol {
        return None;
    }
    Some(add(p, mul(dd, t)))
}

/// `crossing`: quadrilátero com arestas opostas cruzadas.
fn cruzando(q: &[V; 4]) -> bool {
    let bate = |i: usize, j: usize| -> bool {
        let Some(p) = interseccao_de_segmentos(q[i], q[(i + 1) % 4], q[j], q[(j + 1) % 4]) else { return false };
        !q.iter().any(|w| (w.x - p.x).abs() < 1e-9 && (w.y - p.y).abs() < 1e-9)
    };
    bate(0, 2) || bate(1, 3)
}

/// `isSimple`.
fn e_simples(q: &[V; 4]) -> bool {
    area_com_sinal(q).abs() >= AREA_MINIMA && !cruzando(q)
}

/// `passoDoArco`.
fn passo_do_arco(r: f64) -> f64 {
    0.5f64.min(0.05f64.max((8.0 * r * 3e-4).sqrt()))
}

/// `arcBoundary`: vértices de uma face de arco à profundidade `s`, ordenados por t.
fn fronteira_do_arco(f: &Quadro, fim: &[Corte; 2], cordas: &[Corda], s: f64) -> Result<Vec<(f64, V)>, u32> {
    let mut pts: Vec<V> = Vec::new();
    for which in 0..2 {
        // `[spec.lo, spec.hi]` x `['low', 'high']`: lo e hi são o mesmo corte.
        for _ in 0..2 {
            for borda in [Borda::Baixa, Borda::Alta] {
                pts.push(ponto_no_corte(f, which, &fim[which], s, borda));
            }
        }
    }
    let cordas: Vec<&Corda> = cordas.iter().filter(|c| (c.s - s).abs() < 1e-9).collect();
    for c in &cordas {
        pts.push(c.p);
        pts.push(c.q);
    }
    let ts: Vec<f64> = pts.iter().map(|&p| para_local(f, p).0).collect();
    let t_min = ts.iter().copied().fold(f64::INFINITY, f64::min);
    let t_max = ts.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let intervalos: Vec<(f64, f64)> = cordas
        .iter()
        .map(|c| {
            let a = para_local(f, c.p).0;
            let b = para_local(f, c.q).0;
            (a.min(b), a.max(b))
        })
        .collect();
    let mut out: Vec<(f64, V)> = pts.iter().enumerate().map(|(i, &p)| (ts[i], p)).collect();
    // A grade só cobre o alcance da parede (pontas degeneradas podem cair longe e não podem gerar milhões de pontos).
    let raio = f.arc.map(|a| a.radius).ok_or(LIMITE)?;
    let passo = passo_do_arco(raio);
    let g_lo = t_min.max(-2.0);
    let g_hi = t_max.min(f.length + 2.0);
    let mut k = (g_lo / passo).ceil();
    let mut n = 0usize;
    while k * passo < g_hi {
        let t = k * passo;
        if t > t_min && !intervalos.iter().any(|&(a, b)| t > a - 1e-9 && t < b + 1e-9) {
            out.push((t, ponto_em(f, t, s)));
        }
        k += 1.0;
        n += 1;
        if n > 4_000_000 {
            return Err(LIMITE);
        }
    }
    out.sort_by(|x, y| cmp_f(x.0, y.0));
    let mut filtrado = Vec::with_capacity(out.len());
    for i in 0..out.len() {
        if i == 0 || out[i].0 - out[i - 1].0 > 1e-9 {
            filtrado.push(out[i]);
        }
    }
    Ok(filtrado)
}

/// `arcEdge`: vértices intermediários da face de arco à profundidade `s`, de `de` até `ate` (pontas excluídas).
fn aresta_do_arco(f: &Quadro, fim: &[Corte; 2], cordas: &[Corda], s: f64, de: V, ate: V) -> Result<Vec<V>, u32> {
    let t0 = para_local(f, de).0;
    let t1 = para_local(f, ate).0;
    let lo = t0.min(t1) + 1e-9;
    let hi = t0.max(t1) - 1e-9;
    let mut dentro: Vec<V> = fronteira_do_arco(f, fim, cordas, s)?.into_iter().filter(|q| q.0 > lo && q.0 < hi).map(|q| q.1).collect();
    if t0 > t1 {
        dentro.reverse();
    }
    Ok(dentro)
}

/// `arcLayerRing`.
fn anel_da_camada_em_arco(f: &Quadro, fim: &[Corte; 2], cordas: &[Corda], lo: f64, hi: f64) -> Result<Vec<V>, u32> {
    let a_line = polilinha_da_ponta(f, 0, &fim[0], lo, hi);
    let b_line = polilinha_da_ponta(f, 1, &fim[1], lo, hi);
    let (Some(&a_lo), Some(&a_hi), Some(&b_lo), Some(&b_hi)) = (a_line.first(), a_line.last(), b_line.first(), b_line.last()) else {
        return Err(LIMITE);
    };
    let mut out = vec![a_lo];
    out.extend(aresta_do_arco(f, fim, cordas, lo, a_lo, b_lo)?);
    out.extend(b_line.iter().copied());
    out.extend(aresta_do_arco(f, fim, cordas, hi, b_hi, a_hi)?);
    out.extend(a_line.iter().skip(1).rev().copied());
    Ok(out)
}

/// `layerQuad(f, ends, s1, s2)`: contorno da camada entre as profundidades `s1` e `s2`.
pub fn contorno_da_camada(f: &Quadro, fim: &[Corte; 2], cordas: &[Corda], s1: f64, s2: f64) -> Result<Vec<V>, u32> {
    let lo = s1.min(s2);
    let hi = s1.max(s2);
    if f.arc.is_some() {
        return anel_da_camada_em_arco(f, fim, cordas, lo, hi);
    }
    let a_line = polilinha_da_ponta(f, 0, &fim[0], lo, hi);
    let b_line = polilinha_da_ponta(f, 1, &fim[1], lo, hi);
    let (Some(&a0), Some(&a1), Some(&b0), Some(&b1)) = (a_line.first(), a_line.last(), b_line.first(), b_line.last()) else {
        return Err(LIMITE);
    };
    let quad = [a0, b0, b1, a1];
    if e_simples(&quad) {
        // Em esquadria entre tipos diferentes a linha do canto tem quebras: a camada acompanha a cadeia inteira.
        let a_mid: Vec<V> = a_line.iter().skip(1).take(a_line.len().saturating_sub(2)).copied().collect();
        let b_mid: Vec<V> = b_line.iter().skip(1).take(b_line.len().saturating_sub(2)).copied().collect();
        if !a_mid.is_empty() || !b_mid.is_empty() {
            let mut out = vec![quad[0], quad[1]];
            out.extend(b_mid);
            out.push(quad[2]);
            out.push(quad[3]);
            out.extend(a_mid.into_iter().rev());
            return Ok(out);
        }
        return Ok(quad.to_vec());
    }
    Ok(vec![ponto_em(f, 0.0, lo), ponto_em(f, f.length, lo), ponto_em(f, f.length, hi), ponto_em(f, 0.0, hi)])
}
