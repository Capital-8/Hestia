//! Junções entre paredes de um nível, portadas de `packages/engine/src/joins.ts`, `joinNode.ts`,
//! `joinPair.ts`, `joinTypes.ts` e `joinSides.ts` (sub-etapa A1, decisão 0047).
//!
//! Reproduz o TypeScript passo a passo, inclusive a ordem de iteração, os limiares e os desempates
//! (`<` estrito, ordem estável). Não corrige nada: se o TS tem uma manha, ela está aqui.
//!
//! Identidade: o TS compara objetos (`r.f === h.f`); aqui, o índice do quadro na lista do nível.

use std::collections::BTreeMap;

use crate::geo2d::{arredonda_js, cross, dist, dot, mul, neg, perp, sub, v, V};
use crate::quadro::{
    acerto_no_plano, curva_da_face, interseccao_de_curvas, normal_em, para_local, ponto_em, s_na_profundidade, tangente_da_ponta,
    Curva, Quadro,
};

/// Tolerância padrão de junção (m).
pub const TOL_JUNCAO_PADRAO: f64 = 0.02;
/// ~2°: abaixo disso as paredes são consideradas colineares.
const COLINEAR_SIN: f64 = 0.035;
/// Abaixo disso (|sen|) duas paredes são paralelas.
const PARALELA: f64 = 0.035;
const LIMITE_ESQUADRIA: f64 = 6.0;

/// Arco da parede dona de uma ponta (`MiterSide.arc`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ArcoLado {
    pub center: V,
    pub radius: f64,
    pub k: f64,
}

/// `MiterSide`: dados do vizinho para esquadrejar uma camada contra ele.
#[derive(Clone, Debug, PartialEq)]
pub struct LadoMitra {
    pub wall_id: u32,
    pub o: V,
    pub u: V,
    pub n: V,
    pub s_hi: f64,
    pub s_lo: f64,
    /// +1 ou -1.
    pub sigma: f64,
    pub outer_to_core: f64,
    pub core_end: f64,
    pub bounds: Vec<f64>,
    pub arc: Option<ArcoLado>,
}

/// `StepRun`.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Degrau {
    pub s: f64,
    pub s1: Option<f64>,
    pub t: f64,
    pub t1: Option<f64>,
    pub on: Option<f64>,
    pub host: Option<u32>,
}

/// `SideSpec`.
#[derive(Clone, Debug, PartialEq)]
pub enum Corte {
    Reto(f64),
    Esquadria(Box<LadoMitra>, Box<LadoMitra>),
    Degraus(Vec<Degrau>),
    Plano { p: V, q: V, pts: Vec<V> },
}

/// `Chord`: corda que outra parede deixa numa face de arco.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Corda {
    pub s: f64,
    pub p: V,
    pub q: V,
}

/// `WallEnds` de uma parede. `hi` e `lo` do `EndSpec` do TS são sempre o mesmo corte (`both`), então
/// guarda-se um só por extremidade.
#[derive(Clone, Debug, PartialEq)]
pub struct Pontas {
    pub fim: [Corte; 2],
    pub cordas: Vec<Corda>,
}

/// Extremidade de uma parede num nó (`EndRef`).
#[derive(Clone, Copy, Debug)]
pub struct Ponta {
    /// Índice do quadro.
    pub f: usize,
    /// 0 = a, 1 = b.
    pub which: usize,
    pub o: V,
    /// Direção unitária saindo do nó para dentro da parede.
    pub dir: V,
}

/// Situação de uma extremidade (`JoinStatus`). Parceiros e hospedeira por índice de quadro.
#[derive(Clone, Debug, PartialEq)]
pub enum Estado {
    Livre,
    Proibida,
    Par(Vec<(usize, usize)>),
    No(Vec<(usize, usize)>),
    Tee(usize),
}

/// Resultado de `computeEnds`, indexado como os quadros, com o mapa id -> índice para as hospedeiras.
pub struct Resolvido {
    pub pontas: Vec<Pontas>,
    pub idx: BTreeMap<u32, usize>,
}

fn z_sobrepoe(a: &Quadro, b: &Quadro) -> bool {
    a.z0 < b.topo - 1e-6 && b.z0 < a.topo - 1e-6
}

fn fim_de(f: &Quadro, which: usize) -> V {
    if which == 0 {
        f.a
    } else {
        f.b
    }
}

/// `refsOf`: extremidades que podem se unir, na ordem a, b de cada quadro.
pub fn pontas_de(frames: &[Quadro]) -> Vec<Ponta> {
    let mut refs = Vec::new();
    for (i, f) in frames.iter().enumerate() {
        if !f.sem_junta[0] {
            refs.push(Ponta { f: i, which: 0, o: ponto_em(f, 0.0, 0.0), dir: tangente_da_ponta(f, 0) });
        }
        if !f.sem_junta[1] {
            refs.push(Ponta { f: i, which: 1, o: ponto_em(f, f.length, 0.0), dir: neg(tangente_da_ponta(f, 1)) });
        }
    }
    refs
}

fn agrupa_pontas(frames: &[Quadro], refs: &[Ponta], tol: f64) -> Vec<Vec<usize>> {
    let mut parent: Vec<usize> = (0..refs.len()).collect();
    fn raiz(parent: &[usize], mut i: usize) -> usize {
        while parent.get(i).copied().unwrap_or(i) != i {
            i = parent.get(i).copied().unwrap_or(i);
        }
        i
    }
    for i in 0..refs.len() {
        for j in (i + 1)..refs.len() {
            let (ri, rj) = (&refs[i], &refs[j]);
            if ri.f == rj.f || !z_sobrepoe(&frames[ri.f], &frames[rj.f]) {
                continue;
            }
            if dist(ri.o, rj.o) <= tol {
                let (a, b) = (raiz(&parent, i), raiz(&parent, j));
                parent[a] = b;
            }
        }
    }
    let mut ordem: Vec<usize> = Vec::new();
    let mut grupos: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
    for i in 0..refs.len() {
        let k = raiz(&parent, i);
        let g = grupos.entry(k).or_default();
        if g.is_empty() {
            ordem.push(k);
        }
        g.push(i);
    }
    ordem.into_iter().filter_map(|k| grupos.remove(&k)).collect()
}

/// `endPartners`.
fn parceiros_da_ponta(frames: &[Quadro], me: usize, which: usize, tol: f64) -> Vec<(usize, usize)> {
    let mf = &frames[me];
    let o = fim_de(mf, which);
    let mut out = Vec::new();
    for (i, f) in frames.iter().enumerate() {
        if i == me || !z_sobrepoe(mf, f) {
            continue;
        }
        if dist(f.a, o) <= tol {
            out.push((i, 0));
        }
        if dist(f.b, o) <= tol {
            out.push((i, 1));
        }
    }
    out
}

/// `cornerHostOf`: canto com a extremidade de outra parede (a ponta cai sobre a tampa da outra).
fn hospedeira_de_canto(frames: &[Quadro], r: &Ponta, refs: &[Ponta], tol: f64, tomadas: &[bool]) -> Option<usize> {
    let mut melhor: Option<(usize, f64)> = None;
    for (hi, h) in refs.iter().enumerate() {
        if h.f == r.f || tomadas.get(hi).copied().unwrap_or(false) || !z_sobrepoe(&frames[r.f], &frames[h.f]) {
            continue;
        }
        if cross(r.dir, h.dir).abs() < COLINEAR_SIN {
            continue;
        }
        let hf = &frames[h.f];
        let (loc_t, loc_s) = para_local(hf, r.o);
        let t_end = if h.which == 0 { 0.0 } else { hf.length };
        if (loc_t - t_end).abs() > tol {
            continue;
        }
        if (loc_s - hf.s_mid).abs() > hf.thickness / 2.0 + tol {
            continue;
        }
        let d = dist(r.o, h.o);
        match melhor {
            Some((_, bd)) if !(d < bd) => {}
            _ => melhor = Some((hi, d)),
        }
    }
    melhor.map(|(h, _)| h)
}

/// `findTee`: quadro hospedeiro de um T (o de menor distância à linha de centro).
fn achar_tee(frames: &[Quadro], r: &Ponta, tol: f64) -> Option<usize> {
    let mut melhor: Option<(usize, f64)> = None;
    for (gi, g) in frames.iter().enumerate() {
        if gi == r.f || !z_sobrepoe(&frames[r.f], g) {
            continue;
        }
        let (loc_t, loc_s) = para_local(g, r.o);
        let sd = (loc_s - g.s_mid).abs();
        if loc_t < -tol || loc_t > g.length + tol {
            continue;
        }
        if sd > g.thickness / 2.0 + tol {
            continue;
        }
        let gt = match &g.arc {
            Some(arc) => crate::geo2d::arco_tangente(arc, loc_t),
            None => g.u,
        };
        if cross(r.dir, gt).abs() < 0.1 {
            continue;
        }
        match melhor {
            Some((_, bs)) if !(sd < bs) => {}
            _ => melhor = Some((gi, sd)),
        }
    }
    melhor.map(|(g, _)| g)
}

/// `joinStatus` de uma extremidade.
pub fn estado_da_ponta(frames: &[Quadro], me: usize, which: usize, tol: f64) -> Estado {
    let f = &frames[me];
    if f.sem_junta[which] {
        return Estado::Proibida;
    }
    let partners: Vec<(usize, usize)> =
        parceiros_da_ponta(frames, me, which, tol).into_iter().filter(|&(i, e)| !frames[i].sem_junta[e]).collect();
    if partners.len() == 1 {
        return Estado::Par(partners);
    }
    if partners.len() > 1 {
        return Estado::No(partners);
    }
    let refs = pontas_de(frames);
    let eu = refs.iter().find(|r| r.f == me && r.which == which);
    let canto = eu.and_then(|r| hospedeira_de_canto(frames, r, &refs, tol, &vec![false; refs.len()]));
    if let Some(ci) = canto {
        let c = &refs[ci];
        return Estado::Par(vec![(c.f, c.which)]);
    }
    let o = fim_de(f, which);
    let tg = tangente_da_ponta(f, which);
    let r = Ponta { f: me, which, o, dir: if which == 0 { tg } else { v(-tg.x, -tg.y) } };
    match achar_tee(frames, &r, tol) {
        Some(h) => Estado::Tee(h),
        None => Estado::Livre,
    }
}

// ---------------------------------------------------------------------------------------------
// joinSides.ts

/// `pairDepth`: profundidade em `to` que a camada de profundidade `d` de `from` encontra.
pub fn profundidade_pareada(from: &LadoMitra, to: &LadoMitra, d: f64) -> f64 {
    let dd = if d <= from.outer_to_core {
        to.outer_to_core + (d - from.outer_to_core)
    } else if d < from.core_end {
        to.outer_to_core + ((d - from.outer_to_core) * (to.core_end - to.outer_to_core)) / (from.core_end - from.outer_to_core)
    } else {
        to.core_end + (d - from.core_end)
    };
    0.0f64.max(dd.min(to.s_hi - to.s_lo))
}

/// `miterBreaks`.
pub fn quebras_da_esquadria(se: &LadoMitra, ot: &LadoMitra) -> Vec<f64> {
    let t = se.s_hi - se.s_lo;
    let to = ot.s_hi - ot.s_lo;
    let mut all: Vec<f64> = se.bounds.clone();
    all.extend(ot.bounds.iter().map(|&b| profundidade_pareada(ot, se, b)));
    all.push(se.outer_to_core);
    all.push(se.core_end);
    all.push(profundidade_pareada(ot, se, 0.0));
    all.push(profundidade_pareada(ot, se, to));
    let mut r: Vec<f64> = all.into_iter().map(|d| arredonda_js(d * 1e7) / 1e7).filter(|&d| d > 1e-7 && d < t - 1e-7).collect();
    r.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    r.dedup();
    r
}

/// `sOfDepth`.
pub fn s_da_profundidade(m: &LadoMitra, d: f64) -> f64 {
    if m.sigma > 0.0 {
        m.s_hi - d
    } else {
        m.s_lo + d
    }
}

fn face_do_lado(m: &LadoMitra, s: f64) -> Curva {
    match &m.arc {
        Some(a) => Curva::Circulo { c: a.center, r: a.radius + a.k * s },
        None => Curva::Reta { p: crate::geo2d::add(m.o, mul(m.n, s)), d: m.u },
    }
}

/// `crossAt`.
pub fn cruza_em(se: &LadoMitra, s_a: f64, ot: &LadoMitra, s_b: f64) -> Option<V> {
    interseccao_de_curvas(face_do_lado(se, s_a), face_do_lado(ot, s_b), se.o)
}

/// `miterPoint`.
pub fn ponto_da_esquadria(se: &LadoMitra, ot: &LadoMitra, d: f64) -> Option<V> {
    cruza_em(se, s_da_profundidade(se, d), ot, s_da_profundidade(ot, profundidade_pareada(se, ot, d)))
}

/// `sideFacing`.
fn lado_voltado(frames: &[Quadro], r: &Ponta, sigma: f64) -> LadoMitra {
    let f = &frames[r.f];
    let (nucleo_de, nucleo_ate) = (f.tipo.nucleo_de, f.tipo.nucleo_ate);
    let canto_e_exterior = (sigma > 0.0) == (f.sign > 0.0);
    let outer_to_core = 0.0f64.max(if canto_e_exterior { nucleo_de } else { f.thickness - nucleo_ate });
    let u = if r.which == 0 { r.dir } else { neg(r.dir) };
    let t = f.thickness;
    let mut cum = vec![0.0f64];
    for l in &f.tipo.camadas {
        let ultimo = cum.last().copied().unwrap_or(0.0);
        cum.push(ultimo + l.espessura);
    }
    let bounds: Vec<f64> = if canto_e_exterior { cum } else { cum.iter().map(|c| t - c).rev().collect() };
    let core_end = outer_to_core + (nucleo_ate - nucleo_de);
    let arc = f.arc.map(|a| ArcoLado { center: a.center, radius: a.radius, k: a.k });
    LadoMitra { wall_id: f.id, o: r.o, u, n: perp(u), s_hi: f.s_hi, s_lo: f.s_lo, sigma, outer_to_core, core_end, bounds, arc }
}

/// `sideOf`: lado do canto voltado para o vizinho `towards`.
fn lado_de(frames: &[Quadro], r: &Ponta, towards: V) -> LadoMitra {
    let u = if r.which == 0 { r.dir } else { neg(r.dir) };
    let sigma = if dot(perp(u), towards) > 0.0 { -1.0 } else { 1.0 };
    lado_voltado(frames, r, sigma)
}

/// `setEnd`: grava o corte e registra as cordas deixadas em faces de arco das hospedeiras.
fn grava_ponta(out: &mut Resolvido, frames: &[Quadro], r: &Ponta, spec: Corte) {
    let Some(&meu) = out.idx.get(&frames[r.f].id) else { return };
    let mut cordas: Vec<(usize, Corda)> = Vec::new();
    if let Corte::Degraus(runs) = &spec {
        for run in runs {
            let (Some(on), Some(s1), Some(host)) = (run.on, run.s1, run.host) else { continue };
            let Some(&hi) = out.idx.get(&host) else { continue };
            let f = &frames[r.f];
            let corda = Corda { s: on, p: ponto_em(f, run.t, run.s), q: ponto_em(f, run.t1.unwrap_or(run.t), s1) };
            cordas.push((hi, corda));
        }
    }
    if let Some(p) = out.pontas.get_mut(meu) {
        p.fim[r.which] = spec;
    }
    for (hi, c) in cordas {
        if let Some(h) = out.pontas.get_mut(hi) {
            h.cordas.push(c);
        }
    }
}

/// `stairSpec`: corte em degraus que pareia camada com camada.
fn degraus_pareados(frames: &[Quadro], r: &Ponta, se: &LadoMitra, ot: &LadoMitra, baixo: bool, cap: f64) -> Option<Corte> {
    let f = &frames[r.f];
    let t_total = se.s_hi - se.s_lo;
    let mut breaks = vec![0.0f64];
    breaks.extend(quebras_da_esquadria(se, ot));
    breaks.push(t_total);
    let end_t = if r.which == 0 { 0.0 } else { f.length };
    let ok = |t: Option<f64>| -> Option<f64> { t.filter(|x| x.is_finite() && (x - end_t).abs() <= cap) };
    let mut runs: Vec<Degrau> = Vec::new();
    for k in 0..breaks.len().saturating_sub(1) {
        let (d0, d1) = (breaks[k], breaks[k + 1]);
        let d_edge = 0.0f64.max((if baixo { d0 } else { d1 }).min(t_total));
        let s_other = s_da_profundidade(ot, profundidade_pareada(se, ot, d_edge));
        let t_at_s = |s: f64| -> Option<f64> { cruza_em(se, s, ot, s_other).map(|p| para_local(f, p).0) };
        let s_a = s_da_profundidade(se, d0);
        let s_b = s_da_profundidade(se, d1);
        let s_low = s_a.min(s_b);
        let s_high = s_a.max(s_b);
        let t_edge = t_at_s(if baixo { s_a } else { s_b });
        let t_low = t_at_s(s_low);
        let t_high = t_at_s(s_high);
        let (te, tl, th) = (ok(t_edge)?, ok(t_low)?, ok(t_high)?);
        if (th - tl).abs() < 1e-9 {
            runs.push(Degrau { s: s_low, s1: None, t: te, t1: None, on: None, host: None });
        } else {
            runs.push(Degrau { s: s_low, s1: Some(s_high), t: tl, t1: Some(th), on: None, host: None });
        }
    }
    runs.sort_by(|x, y| x.s.partial_cmp(&y.s).unwrap_or(std::cmp::Ordering::Equal));
    if runs.is_empty() {
        None
    } else {
        Some(Corte::Degraus(runs))
    }
}

/// `buttAgainst`: ponta do ramal encostada na parede que passa, camada a camada.
fn encosto_em(frames: &[Quadro], r: &Ponta, hi: usize) -> Option<Corte> {
    let host = &frames[hi];
    let f = &frames[r.f];
    let (loc_t, loc_s) = para_local(host, r.o);
    let lado = if (loc_s - host.s_mid).abs() > 1e-6 { loc_s - host.s_mid } else { dot(r.dir, normal_em(host, loc_t)) };
    let from_hi = lado >= 0.0;
    let near_s = if from_hi { host.s_hi } else { host.s_lo };
    let spans: Vec<_> = host.tipo.camadas.iter().filter(|c| c.espessura >= 1e-6).collect();
    let distancia = |s: f64| (near_s - s).abs();
    let face_para = |prioridade: f64| -> f64 {
        let mut best = host.thickness;
        for sp in &spans {
            if sp.prioridade > prioridade {
                continue;
            }
            let d = distancia(s_na_profundidade(host, sp.de)).min(distancia(s_na_profundidade(host, sp.ate)));
            if d < best {
                best = d;
            }
        }
        best
    };
    let prende = |t: f64| -> f64 {
        if r.which == 0 {
            t.min(f.length - 0.01)
        } else {
            t.max(0.01)
        }
    };
    let eixo = Curva::Reta { p: r.o, d: r.dir };
    let mut runs: Vec<Degrau> = Vec::new();
    for sp in &f.tipo.camadas {
        if sp.espessura < 1e-6 {
            continue;
        }
        let d = face_para(sp.prioridade);
        let face_s = if from_hi { near_s - d } else { near_s + d };
        let face = curva_da_face(host, face_s);
        let s_lo = s_na_profundidade(f, sp.de).min(s_na_profundidade(f, sp.ate));
        let s_hi = s_na_profundidade(f, sp.de).max(s_na_profundidade(f, sp.ate));
        let t_on = |c: Curva| -> Option<f64> { interseccao_de_curvas(face, c, r.o).map(|q| para_local(f, q).0) };
        let t_lo = t_on(curva_da_face(f, s_lo));
        let t_hi = t_on(curva_da_face(f, s_hi));
        let (Some(t_lo), Some(t_hi)) = (t_lo, t_hi) else { return None };
        if !t_lo.is_finite() || !t_hi.is_finite() {
            return None;
        }
        if f.arc.is_none() && host.arc.is_none() && (t_hi - t_lo).abs() < 1e-9 {
            let Some(t_axis) = t_on(eixo) else { return None };
            if !t_axis.is_finite() {
                return None;
            }
            runs.push(Degrau { s: s_lo, s1: None, t: prende(t_axis), t1: None, on: Some(face_s), host: Some(host.id) });
        } else {
            runs.push(Degrau { s: s_lo, s1: Some(s_hi), t: prende(t_lo), t1: Some(prende(t_hi)), on: Some(face_s), host: Some(host.id) });
        }
    }
    if runs.is_empty() {
        return None;
    }
    runs.sort_by(|x, y| x.s.partial_cmp(&y.s).unwrap_or(std::cmp::Ordering::Equal));
    Some(Corte::Degraus(runs))
}

// ---------------------------------------------------------------------------------------------
// joinPair.ts

/// `centerlineHit`: onde o eixo do ramal encontra a linha de centro da parede atravessada.
fn encontro_na_linha_de_centro(branch: &Ponta, through: &Quadro) -> Option<V> {
    let (o, d) = (branch.o, branch.dir);
    match &through.arc {
        None => {
            let den = dot(d, through.n);
            if den.abs() < 0.05 {
                return None;
            }
            let lam = (through.s_mid - dot(sub(o, through.a), through.n)) / den;
            Some(v(o.x + d.x * lam, o.y + d.y * lam))
        }
        Some(arc) => {
            let rho = arc.radius + arc.k * through.s_mid;
            let w = sub(o, arc.center);
            let bq = dot(w, d);
            let disc = bq * bq - (dot(w, w) - rho * rho);
            if disc < 0.0 {
                return None;
            }
            let sq = disc.sqrt();
            let l1 = -bq - sq;
            let l2 = -bq + sq;
            let lam = if l1.abs() <= l2.abs() { l1 } else { l2 };
            Some(v(o.x + d.x * lam, o.y + d.y * lam))
        }
    }
}

/// `toCenterline`: o ramal termina na linha de centro da parede atravessada.
fn ate_a_linha_de_centro(frames: &[Quadro], branch: &Ponta, through: usize) -> Option<Corte> {
    let hit = encontro_na_linha_de_centro(branch, &frames[through])?;
    let bf = &frames[branch.f];
    let t = para_local(bf, hit).0;
    Some(Corte::Reto(if branch.which == 0 { t.min(bf.length - 0.01) } else { t.max(0.01) }))
}

fn reto_no(frames: &[Quadro], r: &Ponta) -> Corte {
    Corte::Reto(if r.which == 0 { 0.0 } else { frames[r.f].length })
}

fn reto_afastado(frames: &[Quadro], r: &Ponta, ext: f64) -> Corte {
    Corte::Reto(if r.which == 0 { -ext } else { frames[r.f].length + ext })
}

fn extensao_externa(frames: &[Quadro], a: &Ponta, b: &Ponta) -> f64 {
    let sa = lado_de(frames, a, b.dir);
    let sb = lado_de(frames, b, a.dir);
    let Some(p) = ponto_da_esquadria(&sa, &sb, 0.0) else { return 0.0 };
    0.0f64.max(-dot(sub(p, a.o), a.dir))
}

fn limita_extensao(ext: f64, f1: &Quadro, f2: &Quadro) -> f64 {
    ext.min(LIMITE_ESQUADRIA * 0.05f64.max(f1.thickness).max(f2.thickness))
}

/// `pairRoles`: `(lead, follower, miter?)`.
fn papeis_do_par(frames: &[Quadro], a: &Ponta, b: &Ponta) -> (Ponta, Ponta, bool) {
    let (first, second) = if frames[a.f].ordem <= frames[b.f].ordem { (*a, *b) } else { (*b, *a) };
    let (miter, flip) = frames[first.f].junta[first.which];
    if flip {
        (second, first, miter)
    } else {
        (first, second, miter)
    }
}

/// `planeSpecs`: canto com parede curva, as duas cortadas pela mesma reta O-K.
fn cortes_planos(frames: &[Quadro], lead: &Ponta, follower: &Ponta, sa: &LadoMitra, sb: &LadoMitra, cap: f64) -> (Corte, Corte) {
    let ta = sa.s_hi - sa.s_lo;
    let tb = sb.s_hi - sb.s_lo;
    let o_ = cruza_em(sa, s_da_profundidade(sa, 0.0), sb, s_da_profundidade(sb, 0.0));
    let k_ = cruza_em(sa, s_da_profundidade(sa, ta), sb, s_da_profundidade(sb, tb));
    let dentro = |p: Option<V>| -> Option<V> { p.filter(|&x| dist(x, lead.o) <= cap) };
    let (Some(o), Some(k)) = (dentro(o_), dentro(k_)) else {
        return (reto_no(frames, lead), reto_no(frames, follower));
    };
    if dist(o, k) < 1e-6 {
        return (reto_no(frames, lead), reto_no(frames, follower));
    }
    let cruzamentos = |f: &Quadro, m: &LadoMitra, perto: V| -> Vec<V> {
        m.bounds.iter().filter_map(|&d| acerto_no_plano(f, s_da_profundidade(m, d), o, k, perto)).collect()
    };
    let mut pts = cruzamentos(&frames[lead.f], sa, lead.o);
    pts.extend(cruzamentos(&frames[follower.f], sb, lead.o));
    let plano = Corte::Plano { p: o, q: k, pts };
    (plano.clone(), plano)
}

/// `pairSpecs`.
fn cortes_do_par(frames: &[Quadro], a: &Ponta, b: &Ponta) -> Option<(Corte, Corte)> {
    let (lead, follower, miter) = papeis_do_par(frames, a, b);
    let (lf, ff) = (&frames[lead.f], &frames[follower.f]);
    let cap = LIMITE_ESQUADRIA * 0.05f64.max(lf.thickness).max(ff.thickness);
    let sa = lado_de(frames, &lead, follower.dir);
    let sb = lado_de(frames, &follower, lead.dir);
    if lf.arc.is_some() || ff.arc.is_some() {
        return Some(cortes_planos(frames, &lead, &follower, &sa, &sb, cap));
    }
    if miter {
        let ok = |s: &LadoMitra, o: &LadoMitra, r: &Ponta| -> bool {
            let t = s.s_hi - s.s_lo;
            for d in [0.0, t] {
                match ponto_da_esquadria(s, o, d) {
                    Some(p) if !(dist(p, r.o) > cap) => {}
                    _ => return false,
                }
            }
            true
        };
        if ok(&sa, &sb, &lead) && ok(&sb, &sa, &follower) {
            return Some((
                Corte::Esquadria(Box::new(sa.clone()), Box::new(sb.clone())),
                Corte::Esquadria(Box::new(sb), Box::new(sa)),
            ));
        }
        // Ângulo agudo demais (as duas paredes são retas aqui): mantém o corte reto.
        return None;
    }
    let lead_steps = degraus_pareados(frames, &lead, &sa, &sb, true, cap);
    let follow_steps = degraus_pareados(frames, &follower, &sb, &sa, false, cap);
    match (lead_steps, follow_steps) {
        (Some(l), Some(f)) => Some((l, f)),
        _ => None,
    }
}

/// `joinPair`.
fn junta_par(out: &mut Resolvido, frames: &[Quadro], a: &Ponta, b: &Ponta) {
    let (lead, follower, miter) = papeis_do_par(frames, a, b);
    if let Some((cl, cf)) = cortes_do_par(frames, a, b) {
        grava_ponta(out, frames, &lead, cl);
        grava_ponta(out, frames, &follower, cf);
        return;
    }
    if !miter {
        // Parede curva (ou degrau fora do limite): a dominante atravessa até o canto externo e a outra para no eixo.
        let ext = limita_extensao(extensao_externa(frames, &lead, &follower), &frames[lead.f], &frames[follower.f]);
        grava_ponta(out, frames, &lead, reto_afastado(frames, &lead, ext));
        if let Some(spec) = ate_a_linha_de_centro(frames, &follower, lead.f) {
            grava_ponta(out, frames, &follower, spec);
        }
    }
    // Esquadria mal condicionada (ângulo agudo demais): mantém o corte reto que já estava.
}

// ---------------------------------------------------------------------------------------------
// joinNode.ts e joins.ts

fn angulo_de(r: &Ponta) -> f64 {
    r.dir.y.atan2(r.dir.x)
}

fn lacuna_antihoraria(from: f64, to: f64) -> f64 {
    let dois_pi = std::f64::consts::PI * 2.0;
    (((to - from) % dois_pi) + dois_pi) % dois_pi
}

/// `nodeOfWalls`: nó de 3+ paredes sem par colinear.
fn no_de_paredes(out: &mut Resolvido, frames: &[Quadro], g: &[Ponta]) {
    let mut refs: Vec<Ponta> = g.to_vec();
    refs.sort_by(|x, y| (angulo_de(x) - angulo_de(y)).partial_cmp(&0.0).unwrap_or(std::cmp::Ordering::Equal));
    for r in &refs {
        let t = if r.which == 0 { 0.0 } else { frames[r.f].length };
        grava_ponta(out, frames, r, Corte::Reto(t));
    }
    let n = refs.len();
    for i in 0..n {
        let a = refs[i];
        let b = refs[(i + 1) % n];
        if lacuna_antihoraria(angulo_de(&a), angulo_de(&b)) > std::f64::consts::PI && cross(a.dir, b.dir).abs() >= PARALELA {
            junta_par(out, frames, &a, &b);
            return;
        }
    }
}

/// `resolveNode`.
fn resolve_no(out: &mut Resolvido, frames: &[Quadro], g: &[Ponta]) {
    if g.len() == 2 {
        let (a, b) = (g[0], g[1]);
        if cross(a.dir, b.dir).abs() < COLINEAR_SIN {
            return; // continuação ou sobreposição: corte reto
        }
        junta_par(out, frames, &a, &b);
        return;
    }
    // 3+ paredes: procura um par colinear (parede "passante" dividida no nó).
    let mut pares: Vec<(usize, usize)> = Vec::new();
    for i in 0..g.len() {
        for j in (i + 1)..g.len() {
            if cross(g[i].dir, g[j].dir).abs() < COLINEAR_SIN && dot(g[i].dir, g[j].dir) < 0.0 {
                pares.push((i, j));
            }
        }
    }
    if pares.len() == 1 {
        let (pi, pj) = pares[0];
        let through = g[pi].f;
        for (i, r) in g.iter().enumerate() {
            if i == pi || i == pj {
                continue;
            }
            let spec = encosto_em(frames, r, through).or_else(|| ate_a_linha_de_centro(frames, r, through));
            if let Some(s) = spec {
                grava_ponta(out, frames, r, s);
            }
        }
        return;
    }
    no_de_paredes(out, frames, g);
}

/// `tryTee`.
fn tenta_tee(out: &mut Resolvido, frames: &[Quadro], r: &Ponta, tol: f64) {
    let Some(host) = achar_tee(frames, r, tol) else { return };
    let spec = encosto_em(frames, r, host).or_else(|| ate_a_linha_de_centro(frames, r, host));
    if let Some(s) = spec {
        grava_ponta(out, frames, r, s);
    }
}

/// `computeEnds`: como cada fim de parede é cortado, levando em conta as demais paredes do nível.
pub fn calcular_pontas(frames: &[Quadro], tol: f64) -> Resolvido {
    let mut out = Resolvido { pontas: Vec::with_capacity(frames.len()), idx: BTreeMap::new() };
    for (i, f) in frames.iter().enumerate() {
        out.idx.insert(f.id, i);
        out.pontas.push(Pontas { fim: [Corte::Reto(0.0), Corte::Reto(f.length)], cordas: Vec::new() });
    }
    let refs = pontas_de(frames);
    let mut agrupadas = vec![false; refs.len()];
    for g in agrupa_pontas(frames, &refs, tol) {
        if g.len() >= 2 {
            for &i in &g {
                agrupadas[i] = true;
            }
            let rs: Vec<Ponta> = g.iter().map(|&i| refs[i]).collect();
            resolve_no(&mut out, frames, &rs);
        }
    }
    // Canto por geometria: ponta livre na zona de extremidade de outra parede livre forma canto com ela.
    for ri in 0..refs.len() {
        if agrupadas[ri] {
            continue;
        }
        let r = refs[ri];
        let Some(hi) = hospedeira_de_canto(frames, &r, &refs, tol, &agrupadas) else { continue };
        agrupadas[ri] = true;
        agrupadas[hi] = true;
        resolve_no(&mut out, frames, &[r, refs[hi]]);
    }
    for ri in 0..refs.len() {
        if !agrupadas[ri] {
            tenta_tee(&mut out, frames, &refs[ri], tol);
        }
    }
    out
}
