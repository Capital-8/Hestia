//! Junção entre paredes da parede cortina (decisão 0056, §5.3 e §6.5; seção 110 `cortina_extremidades`, esquema v16).
//!
//! A cortina NÃO participa da junção por camadas: a parede comum que termina nela fica com ponta livre (corte reto no eixo), e a cortina recua até a
//! face da vizinha. Regras da v1:
//! - cortina × parede comum, em L ou em T (ou cortina que atravessa o nó): ENCOSTO RETO. A cortina termina com corte perpendicular ao seu eixo, recuada
//!   até o MENOR valor que elimina a sobreposição entre a faixa do sistema e o contorno da vizinha (o fecho convexo dos dois segmentos de face). Em T o
//!   recuo é a meia espessura da vizinha projetada no eixo da cortina. O montante de borda fica na ponta, como sempre;
//! - cortina × cortina em ângulo: MONTANTE DE CANTO. As duas terminam em cortes perpendiculares aos eixos delas, recuados até `max(recuo geométrico,
//!   meia largura do montante de canto)`, e o montante de canto é o prisma que preenche o que sobra: o hexágono formado pelos dois cortes e pelos
//!   encontros das faces internas e das externas (as faces das duas cortinas, mesmo com profundidades e linhas de localização diferentes). Sem
//!   fresta e sem sobreposição por construção. O montante de canto substitui os dois montantes de borda daquela ponta; o tipo é o `corner` do tipo da
//!   cortina de MENOR id (ou o montante de borda dela, se `corner` for nulo; sem nenhum dos dois, a junção não acontece);
//! - cortinas colineares (ângulo de 178° a 180°): continuidade. É o mesmo preenchimento (quadrilátero entre os dois cortes), com um único montante no
//!   lugar de dois de borda;
//! - `noJoin` (bit 0 das flags da ponta) desliga a junção: a cortina termina no eixo do nó. Se a vizinha cortina desligou a dela (ou não aponta de
//!   volta para esta), esta ponta trata a vizinha como parede comum (encosto).
//!
//! O cálculo é simétrico: as duas cortinas de um canto chegam ao mesmo polígono, e só a de menor id o emite (`emite`).

use crate::cortina_tipos::*;
use crate::esquema::ID_AUSENTE;
use crate::secoes_cortina::{CortinaLinha, ExtremidadeLinha, SecoesCortina, TipoCortinaLinha};

type V = [f64; 2];

/// Seno máximo do ângulo entre dois eixos para valerem como colineares (~2°, o mesmo `COLLINEAR_SIN` das junções das paredes comuns).
const SENO_COLINEAR: f64 = 0.035;
/// Folga das comparações geométricas (m).
const EPS: f64 = 1e-9;
/// Seno mínimo para um canto: abaixo disso (menos de ~5° entre as paredes) as faixas quase se sobrepõem e a junção deixaria de ser razoável.
const SENO_MINIMO_CANTO: f64 = 0.087;

/// Montante de canto de uma ponta: o polígono que preenche o encontro (no mundo, anti-horário) e o tipo do montante.
#[derive(Clone, Debug, PartialEq)]
pub struct Canto {
    /// `id_num` do tipo de montante do canto (um tipo existente de `tipos_montante_cortina`).
    pub montante: u32,
    /// Esta cortina é a que emite o montante (a de menor id das duas).
    pub emite: bool,
    pub poligono: Vec<V>,
}

/// Resultado de uma ponta: quanto a cortina recua do nó (m, ao longo do eixo dela, para dentro) e, se há canto com outra cortina, o montante.
#[derive(Clone, Debug, PartialEq)]
pub struct Ponta {
    pub recuo: f64,
    pub canto: Option<Canto>,
}

fn sub(a: V, b: V) -> V {
    [a[0] - b[0], a[1] - b[1]]
}
fn dot(a: V, b: V) -> f64 {
    a[0] * b[0] + a[1] * b[1]
}
fn cross(a: V, b: V) -> f64 {
    a[0] * b[1] - a[1] * b[0]
}
fn rot90(w: V) -> V {
    [-w[1], w[0]]
}
fn mais(p: V, w: V, k: f64) -> V {
    [p[0] + w[0] * k, p[1] + w[1] * k]
}

/// Faixa de deslocamento lateral do sistema em relação ao eixo, medida na normal à esquerda de `a → b`: `[s_mid − d/2, s_mid + d/2]` (a mesma conta de
/// `cortina_pecas`: `ext` conforme a linha de localização e `σ` conforme `flipped`).
pub fn faixa_lateral(c: &CortinaLinha, d: f64) -> (f64, f64) {
    let ext = match c.loc {
        0 | 1 => d / 2.0,
        2 | 4 => 0.0,
        _ => d,
    };
    let sigma = if c.invertida { -1.0 } else { 1.0 };
    let s_mid = sigma * (ext - d / 2.0);
    (s_mid - d / 2.0, s_mid + d / 2.0)
}

/// Fecho convexo (cadeia monótona), anti-horário, sem pontos repetidos.
fn casco(mut p: Vec<V>) -> Vec<V> {
    p.sort_by(|a, b| a[0].total_cmp(&b[0]).then(a[1].total_cmp(&b[1])));
    p.dedup_by(|a, b| (a[0] - b[0]).abs() < EPS && (a[1] - b[1]).abs() < EPS);
    if p.len() < 3 {
        return p;
    }
    let mut h: Vec<V> = Vec::new();
    for pass in 0..2 {
        let inicio = h.len();
        let it: Box<dyn Iterator<Item = &V>> = if pass == 0 { Box::new(p.iter()) } else { Box::new(p.iter().rev()) };
        for &q in it {
            while h.len() >= inicio + 2 && cross(sub(h[h.len() - 1], h[h.len() - 2]), sub(q, h[h.len() - 1])) <= 0.0 {
                h.pop();
            }
            h.push(q);
        }
        h.pop();
    }
    h
}

/// Recorta um polígono convexo pelo semiplano `coord[eixo] >= limite` (ou `<=`, se `maior` for falso).
fn recorta(poli: &[V], eixo: usize, limite: f64, maior: bool) -> Vec<V> {
    let dentro = |q: V| if maior { q[eixo] >= limite } else { q[eixo] <= limite };
    let mut out = Vec::new();
    for k in 0..poli.len() {
        let (p, q) = (poli[k], poli[(k + 1) % poli.len()]);
        let (dp, dq) = (dentro(p), dentro(q));
        if dp {
            out.push(p);
        }
        if dp != dq {
            let s = (limite - p[eixo]) / (q[eixo] - p[eixo]);
            out.push([p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s]);
        }
    }
    out
}

/// Encosto reto: o MENOR recuo `r >= 0` tal que a parte da cortina além de `r` (a faixa `λ ∈ [lo, hi]`, `τ >= r`) não invade o fecho dos quatro pontos
/// de face da vizinha. `p` é o nó, `w` a direção que sai dele para dentro da cortina e `m` a normal à esquerda de `w`.
pub fn recuo_encosto(p: V, w: V, m: V, lo: f64, hi: f64, faces: [V; 4]) -> f64 {
    let local: Vec<V> = casco(faces.to_vec()).iter().map(|&q| {
        let r = sub(q, p);
        [dot(r, w), dot(r, m)]
    }).collect();
    if local.len() < 3 {
        return 0.0;
    }
    // Eixo 0 é τ e eixo 1 é λ; o recorte encolhe a faixa em EPS para um contato só de borda não contar como sobreposição.
    let poli = recorta(&recorta(&local, 1, lo + EPS, true), 1, hi - EPS, false);
    poli.iter().map(|q| q[0]).fold(0.0, f64::max)
}

/// Faixa lateral da vizinha vista do nó: direção (`wn`, saindo do nó), normal, e os extremos `λ` dos quatro pontos de face.
fn faixa_da_vizinha(p: V, e: &ExtremidadeLinha) -> Option<(V, V, f64, f64)> {
    let pts = [[e.face1[0], e.face1[1]], [e.face1[2], e.face1[3]], [e.face2[0], e.face2[1]], [e.face2[2], e.face2[3]]];
    let mut d = sub(pts[1], pts[0]);
    if d[0].hypot(d[1]) < EPS {
        d = sub(pts[3], pts[2]);
    }
    let n = d[0].hypot(d[1]);
    if n < EPS {
        return None;
    }
    d = [d[0] / n, d[1] / n];
    let centro = [(pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4.0, (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4.0];
    if dot(d, sub(centro, p)) < 0.0 {
        d = [-d[0], -d[1]];
    }
    let mn = rot90(d);
    let ls: Vec<f64> = pts.iter().map(|&q| dot(sub(q, p), mn)).collect();
    Some((d, mn, ls.iter().copied().fold(f64::INFINITY, f64::min), ls.iter().copied().fold(f64::NEG_INFINITY, f64::max)))
}

/// Ponta `fim` (0 = `a`, 1 = `b`) da cortina `id`, ou `None` quando não há junção (sem linha, sem vizinha, `noJoin`, ou geometria que a v1 não resolve):
/// a cortina termina no eixo do nó, como antes da fase 3.
pub fn resolver_ponta(sec: &SecoesCortina, id: u32, c: &CortinaLinha, t: &TipoCortinaLinha, fim: u8) -> Option<Ponta> {
    let e = sec.extremidades.values().find(|e| e.cortina == id && e.fim == fim)?;
    if e.vizinha == ID_AUSENTE || e.flags & 1 == 1 {
        return None;
    }
    let (dx, dy) = (c.b[0] - c.a[0], c.b[1] - c.a[1]);
    let l = dx.hypot(dy);
    if l < COMPRIMENTO_MIN {
        return None;
    }
    let u = [dx / l, dy / l];
    let (p, w) = if fim == 0 { (c.a, u) } else { (c.b, [-u[0], -u[1]]) };
    let m = rot90(w);
    // Faixa do sistema em λ (medida na normal à esquerda de w): no início coincide com a de a → b; no fim, a normal inverte.
    let (s_lo, s_hi) = faixa_lateral(c, t.profundidade);
    let (lo, hi) = if fim == 0 { (s_lo, s_hi) } else { (-s_hi, -s_lo) };
    let faces = [[e.face1[0], e.face1[1]], [e.face1[2], e.face1[3]], [e.face2[0], e.face2[1]], [e.face2[2], e.face2[3]]];
    let encosto = || Some(Ponta { recuo: recuo_encosto(p, w, m, lo, hi, faces), canto: None });

    let atravessa = e.flags & 4 == 4;
    if !e.vizinha_cortina || atravessa {
        return encosto();
    }
    // Vizinha cortina que termina no nó: precisa apontar de volta e ter a junção ligada; senão é só um obstáculo.
    let viz = sec.cortinas.get(&e.vizinha)?;
    let fim_viz = if (viz.a[0] - p[0]).hypot(viz.a[1] - p[1]) <= (viz.b[0] - p[0]).hypot(viz.b[1] - p[1]) { 0u8 } else { 1u8 };
    let reciproca = sec.extremidades.values().any(|x| x.cortina == e.vizinha && x.fim == fim_viz && x.vizinha == id && x.vizinha_cortina && x.flags & 1 == 0 && x.flags & 4 == 0);
    if !reciproca {
        return encosto();
    }
    let tvizinha = sec.tipos.get(&viz.tipo)?;
    let (wn, mn, ln_lo, ln_hi) = faixa_da_vizinha(p, e)?;

    // Ângulo entre as paredes (das duas direções que saem do nó): colinear, canto, ou geometria que a v1 não resolve (paredes dobradas uma sobre a outra).
    let seno = cross(w, wn).abs();
    let colinear = seno < SENO_COLINEAR && dot(w, wn) < 0.0;
    if !colinear && (seno < SENO_COLINEAR || (dot(w, wn) > 0.0 && seno < SENO_MINIMO_CANTO)) {
        return encosto();
    }

    // Montante do canto: o da cortina de menor id (o `corner` do tipo, ou o montante de borda daquela ponta).
    let (baixa_t, baixa_fim) = if id < e.vizinha { (t, fim) } else { (tvizinha, fim_viz) };
    let poste = [baixa_t.montantes[6], baixa_t.montantes[if baixa_fim == 0 { 2 } else { 3 }]].into_iter().find(|&x| x != ID_AUSENTE)?;
    let meio = sec.montantes.get(&poste)?.largura / 2.0;

    // Papéis A e B: de A para B, girando no sentido anti-horário, passa-se pelo interior do canto (a face de A à esquerda e a de B à direita são as internas).
    let eu_sou_a = colinear || cross(w, wn) > 0.0;
    let ((wa, ma, la_lo, la_hi), (wb, mb, lb_lo, lb_hi)) = if eu_sou_a { ((w, m, lo, hi), (wn, mn, ln_lo, ln_hi)) } else { ((wn, mn, ln_lo, ln_hi), (w, m, lo, hi)) };
    let (mut ta, mut tb) = (meio, meio);
    // Encontros das faces: `i` das internas, `o` das externas (relativos ao nó). Colinear não tem: o quadrilátero entre os dois cortes basta.
    let mut encontros: Option<(V, V)> = None;
    if !colinear {
        // x tal que x·ma = ha e x·mb = hb.
        let det = ma[0] * mb[1] - ma[1] * mb[0];
        let encontro = |ha: f64, hb: f64| -> V { [(mb[1] * ha - ma[1] * hb) / det, (-mb[0] * ha + ma[0] * hb) / det] };
        let (i, o) = (encontro(la_hi, lb_lo), encontro(la_lo, lb_hi));
        ta = ta.max(dot(i, wa)).max(dot(o, wa));
        tb = tb.max(dot(i, wb)).max(dot(o, wb));
        encontros = Some(([p[0] + i[0], p[1] + i[1]], [p[0] + o[0], p[1] + o[1]]));
    }
    let (corte_a, corte_b) = (mais(p, wa, ta), mais(p, wb, tb));
    // Contorno do preenchimento: corte de A (face externa), encontro externo, corte de B (externa e interna), encontro interno, corte de A (interna).
    // Em linha reta não há encontro: cada face de uma cortina vai até o plano do nó e dali salta para a face da outra (degrau se as profundidades
    // diferem; sem degrau, os pontos ficam colineares e `limpar` os tira).
    let mut poligono = vec![mais(corte_a, ma, la_lo)];
    match encontros {
        Some((_, o)) => poligono.push(o),
        None => poligono.extend([mais(p, ma, la_lo), mais(p, mb, lb_hi)]),
    }
    poligono.push(mais(corte_b, mb, lb_hi));
    poligono.push(mais(corte_b, mb, lb_lo));
    match encontros {
        Some((i, _)) => poligono.push(i),
        None => poligono.extend([mais(p, mb, lb_lo), mais(p, ma, la_hi)]),
    }
    poligono.push(mais(corte_a, ma, la_hi));
    let poligono = limpar(poligono);
    if poligono.len() < 3 {
        return None;
    }
    let recuo = if eu_sou_a { ta } else { tb };
    Some(Ponta { recuo, canto: Some(Canto { montante: poste, emite: id < e.vizinha, poligono }) })
}

fn area2(p: &[V]) -> f64 {
    (0..p.len()).map(|k| cross(p[k], p[(k + 1) % p.len()])).sum()
}

/// Tira vértices repetidos e colineares e deixa o polígono anti-horário.
fn limpar(mut p: Vec<V>) -> Vec<V> {
    p.dedup_by(|a, b| (a[0] - b[0]).abs() < 1e-9 && (a[1] - b[1]).abs() < 1e-9);
    while p.len() > 1 && (p[0][0] - p[p.len() - 1][0]).abs() < 1e-9 && (p[0][1] - p[p.len() - 1][1]).abs() < 1e-9 {
        p.pop();
    }
    let mut mudou = true;
    while mudou && p.len() > 3 {
        mudou = false;
        for k in 0..p.len() {
            let (a, b, c) = (p[(k + p.len() - 1) % p.len()], p[k], p[(k + 1) % p.len()]);
            if cross(sub(b, a), sub(c, b)).abs() < 1e-12 {
                p.remove(k);
                mudou = true;
                break;
            }
        }
    }
    if area2(&p) < 0.0 {
        p.reverse();
    }
    p
}

#[cfg(test)]
#[path = "cortina_juncao_testes.rs"]
mod testes;
