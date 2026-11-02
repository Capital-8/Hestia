//! Grupos (clusters) de paredes por caixas sobrepostas, portados de `clusterWalls` (`resolve.ts`) e
//! das partes de `layerGeom.ts` que ele usa (`endPoint`, `pointOnSide`, `stepT`, `runT`), na
//! sub-etapa A1 (decisão 0047).

use crate::geo2d::{arco_amostra, V};
use crate::juncoes::{ponto_da_esquadria, Corte, Degrau, Pontas};
use crate::quadro::{acerto_no_plano, ponto_em, Quadro};

/// Folga das caixas dos grupos (m).
pub const CLUSTER_PAD: f64 = 0.02;

/// `runT`: posição do corte de uma faixa em `s` (linear entre `t` e `t1` quando oblíqua).
pub fn t_da_faixa(r: &Degrau, s: f64) -> f64 {
    let (Some(t1), Some(s1)) = (r.t1, r.s1) else { return r.t };
    if s1 == r.s {
        return r.t;
    }
    let f = (s - r.s) / (s1 - r.s);
    if f <= 0.0 {
        return r.t;
    }
    if f >= 1.0 {
        return t1;
    }
    r.t + (t1 - r.t) * f
}

/// `stepT` com a borda `low`.
fn t_do_degrau(runs: &[Degrau], s: f64) -> f64 {
    let Some(&primeiro) = runs.first() else { return 0.0 };
    let mut run = primeiro;
    for r in runs {
        if r.s > s + 1e-12 {
            break;
        }
        run = *r;
    }
    t_da_faixa(&run, s)
}

/// `endPoint(f, which, spec, s)`: ponto da extremidade na espessura `s`.
pub fn ponto_da_ponta(f: &Quadro, which: usize, corte: &Corte, s: f64) -> V {
    match corte {
        Corte::Reto(t) => ponto_em(f, *t, s),
        Corte::Plano { p, q, .. } => {
            let perto = ponto_em(f, if which == 0 { 0.0 } else { f.length }, s);
            acerto_no_plano(f, s, *p, *q, perto).unwrap_or(perto)
        }
        Corte::Degraus(runs) => ponto_em(f, t_do_degrau(runs, s), s),
        Corte::Esquadria(se, ot) => {
            let d = if se.sigma > 0.0 { se.s_hi - s } else { s - se.s_lo };
            let p = ponto_da_esquadria(se, ot, 0.0f64.max(d.min(se.s_hi - se.s_lo)));
            p.unwrap_or_else(|| ponto_em(f, if which == 0 { 0.0 } else { f.length }, s))
        }
    }
}

/// `clusterWalls`: grupos de índices de quadro, numerados na ordem do primeiro membro; dentro de cada
/// grupo, a ordem dos quadros.
pub fn agrupar_paredes(frames: &[Quadro], pontas: &[Pontas]) -> Vec<Vec<usize>> {
    #[derive(Clone, Copy)]
    struct Caixa {
        minx: f64,
        miny: f64,
        maxx: f64,
        maxy: f64,
    }
    let caixas: Vec<Caixa> = frames
        .iter()
        .enumerate()
        .map(|(i, f)| {
            let mut c = Caixa { minx: f64::INFINITY, miny: f64::INFINITY, maxx: f64::NEG_INFINITY, maxy: f64::NEG_INFINITY };
            let mut pts: Vec<V> = Vec::new();
            if let Some(e) = pontas.get(i) {
                for s in [f.s_hi, f.s_lo] {
                    pts.push(ponto_da_ponta(f, 0, &e.fim[0], s));
                    pts.push(ponto_da_ponta(f, 1, &e.fim[1], s));
                    if let Some(arc) = &f.arc {
                        pts.extend(arco_amostra(arc, 0.0, f.length, s, 0.05));
                    }
                }
            }
            for p in pts {
                if p.x < c.minx {
                    c.minx = p.x;
                }
                if p.y < c.miny {
                    c.miny = p.y;
                }
                if p.x > c.maxx {
                    c.maxx = p.x;
                }
                if p.y > c.maxy {
                    c.maxy = p.y;
                }
            }
            Caixa { minx: c.minx - CLUSTER_PAD, miny: c.miny - CLUSTER_PAD, maxx: c.maxx + CLUSTER_PAD, maxy: c.maxy + CLUSTER_PAD }
        })
        .collect();
    let mut parent: Vec<usize> = (0..frames.len()).collect();
    fn raiz(parent: &[usize], mut i: usize) -> usize {
        while parent.get(i).copied().unwrap_or(i) != i {
            i = parent.get(i).copied().unwrap_or(i);
        }
        i
    }
    for i in 0..caixas.len() {
        for j in (i + 1)..caixas.len() {
            let (a, b) = (caixas[i], caixas[j]);
            if a.minx <= b.maxx && a.maxx >= b.minx && a.miny <= b.maxy && a.maxy >= b.miny {
                let (ri, rj) = (raiz(&parent, i), raiz(&parent, j));
                parent[ri] = rj;
            }
        }
    }
    let mut ordem: Vec<usize> = Vec::new();
    let mut grupos: std::collections::BTreeMap<usize, Vec<usize>> = std::collections::BTreeMap::new();
    for i in 0..frames.len() {
        let k = raiz(&parent, i);
        let g = grupos.entry(k).or_default();
        if g.is_empty() {
            ordem.push(k);
        }
        g.push(i);
    }
    ordem.into_iter().filter_map(|k| grupos.remove(&k)).collect()
}
