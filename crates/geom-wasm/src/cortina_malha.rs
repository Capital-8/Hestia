//! Malha da parede cortina (decisão 0056, §5.3 e §5.5; consulta `cortina_malha`, id 101): protótipos instanciáveis, as matrizes que os põem no mundo e
//! as peças avulsas (`grupos`) que não cabem num prisma.
//!
//! Cada tipo de montante e cada tipo de painel vira UM protótipo (um sólido de seção fixa e comprimento unitário); cada peça é uma instância, com uma
//! matriz 3 × 4 que escala o comprimento (montante) ou a largura e a altura (painel) e posiciona. A cortina de 60 células dá ~4 protótipos e ~250
//! instâncias. As peças são as de `cortina_pecas::resolver`, as mesmas da planta e das quantidades.
//!
//! Perfis (fase 3): `rect` e `round` são prismas como antes. `L`, `trapezoid` e `corner` usam o SÓLIDO POR FAIXAS (`solido`): a seção é triangulada,
//! cortada nas profundidades em que muda o limite da ponta, e cada ponta é um valor `a + b·y` por faixa de profundidade. Um prisma é o caso de limite
//! constante. Peça cuja ponta encosta num vizinho que varia com a profundidade (esquadria) sai em `grupos`, em coordenadas do mundo.
//!
//! Formato (documentado também no JSON do contrato):
//! - protótipo de montante: perfil no plano local `(x, y)` (x na largura vista na face, y na profundidade, já com o deslocamento do tipo) extrudado em
//!   `z` de 0 a 1; protótipo de painel: caixa `x ∈ [-0,5; 0,5]`, `y` na espessura (com o deslocamento do tipo), `z ∈ [0, 1]`;
//! - cada face tem vértices próprios (sombreamento chapado) e os triângulos saem anti-horários vistos de fora; `indices` é LOCAL ao protótipo;
//! - matriz: 12 números por instância, três linhas `[r00 r01 r02 tx, r10 r11 r12 ty, r20 r21 r22 tz]` (linha-maior); mundo = M · (x, y, z, 1);
//!   a base é sempre destra e a translação cai na grade de 1 µm;
//! - `grupos`: `[cortina_num, papel, material_num, primeiro_indice, n_indices, transparente]`; `vertices_av` em coordenadas do MUNDO (x, y, z) e
//!   `indices_av` ABSOLUTOS (índice em `vertices_av`), 3 por triângulo; um grupo por cortina e material.

use std::collections::{BTreeMap, BTreeSet};

use crate::consultas::Saida;
use crate::cortina_pecas::{CortinaR, Geom, Montante, PainelPeca, PainelTipo, PecaEsq, PecaMont};
use crate::cortina_tipos::*;
use crate::esquema::LIMITE;

/// Protótipo: geometria local de um tipo.
#[derive(Clone, Debug, PartialEq)]
pub struct Proto {
    pub papel: u32,
    pub tipo: u32,
    pub material: u32,
    pub vertices: Vec<[f64; 3]>,
    pub triangulos: Vec<[u32; 3]>,
}

/// Uma instância de protótipo.
#[derive(Clone, Debug, PartialEq)]
pub struct Instancia {
    pub cortina: u32,
    pub proto: u32,
    pub papel: u32,
    pub ref_i: u32,
    pub ref_j: u32,
    pub transparente: u32,
    pub matriz: [f64; 12],
}

/// Peças avulsas de uma cortina e material (esquadria): malha no mundo.
#[derive(Clone, Debug, PartialEq)]
pub struct GrupoAv {
    pub cortina: u32,
    pub papel: u32,
    pub material: u32,
    pub transparente: u32,
    pub vertices: Vec<[f64; 3]>,
    pub triangulos: Vec<[u32; 3]>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Malha {
    pub protos: Vec<Proto>,
    pub instancias: Vec<Instancia>,
    pub grupos: Vec<GrupoAv>,
}

/// Lados do círculo de um perfil redondo: 8 no LOD grosso; senão 16, ou 24 acima de 80 mm de diâmetro.
pub fn lados_redondo(diametro: f64, lod: u32) -> usize {
    if lod == 0 {
        LADOS_REDONDO_GROSSO
    } else if diametro > DIAMETRO_GRANDE {
        LADOS_REDONDO_GRANDE
    } else {
        LADOS_REDONDO
    }
}

// ───────────── Faixas de profundidade ─────────────

/// Faixa de uma função da profundidade `y`: `valor(y) = a + b·y` em `[y0, y1]`. A lista cobre a reta toda (os extremos são ±`INF_FAIXA`); dois
/// vizinhos podem ter valores diferentes na fronteira (degrau, como o da face de um perfil L).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Faixa {
    pub y0: f64,
    pub y1: f64,
    pub a: f64,
    pub b: f64,
}

pub type Faixas = Vec<Faixa>;

const INF_FAIXA: f64 = 1e9;
/// Distância (m) da linha de corte em que se olha o lado de cima e o de baixo, para decidir de que lado está a seção.
const EPS_LINHA: f64 = 1e-9;

/// Limite constante em toda a profundidade (um prisma, ou um vizinho em plano).
pub fn faixa_plana(valor: f64) -> Faixas {
    vec![Faixa { y0: -INF_FAIXA, y1: INF_FAIXA, a: valor, b: 0.0 }]
}

fn banda(f: &[Faixa], y: f64) -> Faixa {
    *f.iter().find(|b| y < b.y1).unwrap_or_else(|| f.last().expect("faixas nunca vazias"))
}

pub fn valor_em(f: &[Faixa], y: f64) -> f64 {
    let b = banda(f, y);
    b.a + b.b * y
}

/// Diz se a função muda dentro de `[ymin, ymax]` (inclui degraus).
pub fn varia(f: &[Faixa], ymin: f64, ymax: f64) -> bool {
    let (mut mn, mut mx) = (f64::INFINITY, f64::NEG_INFINITY);
    for b in f {
        let (u, v) = (b.y0.max(ymin), b.y1.min(ymax));
        if u <= v {
            for y in [u, v] {
                let val = b.a + b.b * y;
                mn = mn.min(val);
                mx = mx.max(val);
            }
        }
    }
    mx - mn > 1e-12
}

// ───────────── Seção e sólido ─────────────

/// Seção de um perfil no plano local `(x, y)`: triângulos anti-horários que cobrem a área, e os anéis do contorno (o externo anti-horário, os furos
/// horários). `y` já tem o deslocamento do tipo.
pub struct Secao {
    pub tris: Vec<[[f64; 2]; 3]>,
    pub aneis: Vec<Vec<[f64; 2]>>,
}

fn leque(anel: &[[f64; 2]]) -> Vec<[[f64; 2]; 3]> {
    (1..anel.len() - 1).map(|k| [anel[0], anel[k], anel[k + 1]]).collect()
}

fn quadrilatero(a: [f64; 2], b: [f64; 2], c: [f64; 2], d: [f64; 2]) -> [[[f64; 2]; 3]; 2] {
    [[a, b, c], [a, c, d]]
}

/// Seção do perfil do montante. `lod` só afeta o redondo (o número de lados).
pub fn secao(m: &Montante, lod: u32) -> Secao {
    let (w, d, o) = (m.largura, m.prof(), m.desloc);
    let (h, y0, y1) = (w / 2.0, o - d / 2.0, o + d / 2.0);
    match m.forma {
        FORMA_REDONDA => {
            let (n, r) = (lados_redondo(w, lod), w / 2.0);
            let anel: Vec<[f64; 2]> = (0..n)
                .map(|k| {
                    let a = std::f64::consts::TAU * k as f64 / n as f64;
                    [r * a.cos(), o + r * a.sin()]
                })
                .collect();
            Secao { tris: leque(&anel), aneis: vec![anel] }
        }
        FORMA_L => {
            // Cantoneira como o TS (`curtainMullionProfile.ts`): aba de `w` na face interna (y baixo) e alma de `d` na borda esquerda, espessura `t`.
            let t = m.espessura;
            let anel = vec![[-h, y0], [h, y0], [h, y0 + t], [-h + t, y0 + t], [-h + t, y1], [-h, y1]];
            let p = |k: usize| anel[k];
            // Leque a partir do canto (-h, y0): convexo em cada triângulo, sem o vértice côncavo como apex.
            let tris = vec![[p(0), p(1), p(2)], [p(0), p(2), p(3)], [p(0), p(3), p(4)], [p(0), p(4), p(5)]];
            Secao { tris, aneis: vec![anel] }
        }
        FORMA_TRAPEZIO => {
            // Face interna `widthBack` (embaixo, y0), face externa `width` (em cima, y1).
            let hb = m.largura2 / 2.0;
            let anel = vec![[-hb, y0], [hb, y0], [h, y1], [-h, y1]];
            Secao { tris: leque(&anel), aneis: vec![anel] }
        }
        FORMA_CORNER => {
            // Tubo de chapa de espessura `t`: retângulo externo `w × d` menos o interno.
            let t = m.espessura;
            let fora = [[-h, y0], [h, y0], [h, y1], [-h, y1]];
            let dentro = [[-h + t, y0 + t], [-h + t, y1 - t], [h - t, y1 - t], [h - t, y0 + t]];
            let mut tris = Vec::with_capacity(8);
            tris.extend(quadrilatero(fora[0], fora[1], dentro[3], dentro[0]));
            tris.extend(quadrilatero(fora[1], fora[2], dentro[2], dentro[3]));
            tris.extend(quadrilatero(fora[2], fora[3], dentro[1], dentro[2]));
            tris.extend(quadrilatero(fora[3], fora[0], dentro[0], dentro[1]));
            Secao { tris, aneis: vec![fora.to_vec(), dentro.to_vec()] }
        }
        _ => {
            let anel = vec![[-h, y0], [h, y0], [h, y1], [-h, y1]];
            Secao { tris: leque(&anel), aneis: vec![anel] }
        }
    }
}

/// Área (m²) da seção pela soma dos triângulos: confere a fórmula de cada perfil.
pub fn area_da_secao(sec: &Secao) -> f64 {
    sec.tris.iter().map(|t| area2(t).abs() / 2.0).sum()
}

fn area2(t: &[[f64; 2]; 3]) -> f64 {
    (t[1][0] - t[0][0]) * (t[2][1] - t[0][1]) - (t[2][0] - t[0][0]) * (t[1][1] - t[0][1])
}

fn lerp(p: [f64; 2], q: [f64; 2], s: f64) -> [f64; 2] {
    [p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s]
}

/// Parte do polígono convexo abaixo (`y ≤ c`) ou acima (`y ≥ c`) da linha.
fn recorta(poli: &[[f64; 2]], c: f64, abaixo: bool) -> Vec<[f64; 2]> {
    let dentro = |p: &[f64; 2]| if abaixo { p[1] <= c } else { p[1] >= c };
    let cruza = |p: [f64; 2], q: [f64; 2]| [p[0] + (q[0] - p[0]) * (c - p[1]) / (q[1] - p[1]), c];
    let mut out = Vec::new();
    for k in 0..poli.len() {
        let (p, q) = (poli[k], poli[(k + 1) % poli.len()]);
        if dentro(&p) {
            out.push(p);
            if !dentro(&q) {
                out.push(cruza(p, q));
            }
        } else if dentro(&q) {
            out.push(cruza(p, q));
        }
    }
    out
}

/// Corta um polígono convexo por todas as linhas `cortes` que passam por dentro dele.
fn cortar(poli: Vec<[f64; 2]>, cortes: &[f64], saida: &mut Vec<Vec<[f64; 2]>>) {
    let ymin = poli.iter().map(|p| p[1]).fold(f64::INFINITY, f64::min);
    let ymax = poli.iter().map(|p| p[1]).fold(f64::NEG_INFINITY, f64::max);
    match cortes.iter().find(|&&c| c > ymin + 1e-12 && c < ymax - 1e-12) {
        None => saida.push(poli),
        Some(&c) => {
            for abaixo in [true, false] {
                let parte = recorta(&poli, c, abaixo);
                if parte.len() >= 3 {
                    cortar(parte, cortes, saida);
                }
            }
        }
    }
}

/// Os valores de `c + coef·x` sobre a seção na profundidade `y` (um por cruzamento da linha com as arestas).
fn xs_na_linha(tris: &[[[f64; 2]; 3]], y: f64) -> Vec<f64> {
    let mut xs = Vec::new();
    for t in tris {
        for k in 0..3 {
            let (p, q) = (t[k], t[(k + 1) % 3]);
            if (p[1] - y).abs() < 1e-12 {
                xs.push(p[0]);
            } else if (p[1] - y) * (q[1] - y) < 0.0 {
                xs.push(p[0] + (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]));
            }
        }
    }
    xs
}

fn dentro_secao(sub: &[[[f64; 2]; 3]], p: [f64; 2]) -> bool {
    sub.iter().any(|t| (0..3).all(|k| {
        let (a, b) = (t[k], t[(k + 1) % 3]);
        (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= -1e-15
    }))
}

/// Sólido da seção extrudada no eixo `z` entre a ponta `lo(y)` e a ponta `hi(y)`. Com `lo` e `hi` constantes é o prisma.
///
/// Peças: (1) as tampas, triângulos da seção cortada nas fronteiras das faixas, levantados em `lo` (horário) e em `hi`; (2) as paredes, uma por aresta
/// NÃO horizontal do contorno, cortada nas fronteiras e com a faixa do lado do sólido; (3) as faces horizontais (y constante), onde o sólido está de um
/// lado e não do outro, entre os dois limites: aqui saem os degraus de `lo`/`hi` e as bordas horizontais da seção. Triângulos anti-horários vistos de
/// fora. Nenhum vértice é compartilhado (soup); o teste solda a 1 µm.
pub fn solido(sec: &Secao, lo: &[Faixa], hi: &[Faixa]) -> Vec<[[f64; 3]; 3]> {
    // Linhas de corte: todo vértice da seção e toda fronteira de faixa. Cortar tudo nelas faz cada cruzamento de aresta com uma linha ser vértice dos dois
    // lados, então não há junta em T nas tampas, nas paredes nem nas faces horizontais.
    let mut linhas: Vec<f64> = sec.tris.iter().flat_map(|t| t.iter().map(|p| p[1])).chain(lo.iter().chain(hi.iter()).flat_map(|f| [f.y0, f.y1]).filter(|y| y.abs() < INF_FAIXA / 2.0)).collect();
    linhas.sort_by(f64::total_cmp);
    linhas.dedup_by(|a, b| (*a - *b).abs() < 1e-12);
    let mut sub: Vec<[[f64; 2]; 3]> = Vec::new();
    for t in &sec.tris {
        let mut polis = Vec::new();
        cortar(t.to_vec(), &linhas, &mut polis);
        for p in polis {
            let p = sem_repetidos(p);
            for k in 1..p.len().saturating_sub(1) {
                let tri = [p[0], p[k], p[k + 1]];
                if area2(&tri).abs() > 1e-18 {
                    sub.push(tri);
                }
            }
        }
    }
    let mut out: Vec<[[f64; 3]; 3]> = Vec::new();
    // (1) Tampas: a seção levantada em `lo` (horário, para baixo) e em `hi` (anti-horário, para cima).
    for t in &sub {
        let cy = (t[0][1] + t[1][1] + t[2][1]) / 3.0;
        let (fl, fh) = (banda(lo, cy), banda(hi, cy));
        let base: [[f64; 3]; 3] = [0, 1, 2].map(|k| [t[k][0], t[k][1], fl.a + fl.b * t[k][1]]);
        let topo: [[f64; 3]; 3] = [0, 1, 2].map(|k| [t[k][0], t[k][1], fh.a + fh.b * t[k][1]]);
        out.push([base[0], base[2], base[1]]);
        out.push(topo);
    }
    // (2) Paredes: arestas não horizontais do contorno, divididas nas linhas de corte e costuradas com as cotas de degrau de cada extremo. Cada trecho
    // é um polígono convexo (A em `lo`→`hi`, B em `lo`→`hi`), triangulado a partir do centróide.
    for anel in &sec.aneis {
        let n = anel.len();
        for k in 0..n {
            let (p, q) = (anel[k], anel[(k + 1) % n]);
            if (p[1] - q[1]).abs() < 1e-12 {
                continue;
            }
            let mut meio: Vec<f64> = linhas.iter().copied().filter(|&c| c > p[1].min(q[1]) + 1e-12 && c < p[1].max(q[1]) - 1e-12).collect();
            if q[1] < p[1] {
                meio.reverse();
            }
            let mut caminho = vec![p];
            caminho.extend(meio.iter().map(|&c| lerp(p, q, (c - p[1]) / (q[1] - p[1]))));
            caminho.push(q);
            for w in caminho.windows(2) {
                let (a, b) = (w[0], w[1]);
                let ym = (a[1] + b[1]) / 2.0;
                let (fl, fh) = (banda(lo, ym), banda(hi, ym));
                let za = costura(fl.a + fl.b * a[1], fh.a + fh.b * a[1], &zs_linha(lo, hi, a[1]));
                let zb = costura(fl.a + fl.b * b[1], fh.a + fh.b * b[1], &zs_linha(lo, hi, b[1]));
                let mut poli: Vec<[f64; 3]> = vec![[a[0], a[1], za[0]]];
                poli.extend(zb.iter().map(|&z| [b[0], b[1], z]));
                poli.extend(za[1..].iter().rev().map(|&z| [a[0], a[1], z]));
                let m = poli.len() as f64;
                let g = poli.iter().fold([0.0; 3], |s, v| [s[0] + v[0] / m, s[1] + v[1] / m, s[2] + v[2] / m]);
                for j in 0..poli.len() {
                    let (u, v) = (poli[j], poli[(j + 1) % poli.len()]);
                    if (u[2] - v[2]).abs() + (u[0] - v[0]).abs() + (u[1] - v[1]).abs() > 1e-12 {
                        out.push([g, u, v]);
                    }
                }
            }
        }
    }
    // (3) Faces horizontais: em cada linha y = c, cada trecho de x decide de que lado o sólido está entre os dois limites. Degraus de `lo`/`hi` e bordas
    // horizontais da seção saem daqui.
    for &c in &linhas {
        let mut xs = xs_na_linha(&sub, c);
        xs.sort_by(f64::total_cmp);
        xs.dedup_by(|a, b| (*a - *b).abs() < 1e-12);
        let zs = zs_linha(lo, hi, c);
        let (fa, fha) = (banda(lo, c + EPS_LINHA), banda(hi, c + EPS_LINHA));
        let (fb, fhb) = (banda(lo, c - EPS_LINHA), banda(hi, c - EPS_LINHA));
        let (la, ha) = (fa.a + fa.b * c, fha.a + fha.b * c);
        let (lb, hb) = (fb.a + fb.b * c, fhb.a + fhb.b * c);
        for w in xs.windows(2) {
            let (x1, x2) = (w[0], w[1]);
            let xm = (x1 + x2) / 2.0;
            let acima = dentro_secao(&sub, [xm, c + EPS_LINHA]);
            let abaixo = dentro_secao(&sub, [xm, c - EPS_LINHA]);
            if !acima && !abaixo {
                continue;
            }
            for v in zs.windows(2) {
                let (z1, z2) = (v[0], v[1]);
                let zm = (z1 + z2) / 2.0;
                let ma = acima && la.min(ha) <= zm && zm <= la.max(ha);
                let mb = abaixo && lb.min(hb) <= zm && zm <= lb.max(hb);
                if ma == mb {
                    continue;
                }
                let (p1, p2, p3, p4) = ([x1, c, z1], [x2, c, z1], [x2, c, z2], [x1, c, z2]);
                // Normal para −y quando o sólido está acima (a face olha para baixo); para +y quando está abaixo.
                if ma {
                    out.push([p1, p2, p3]);
                    out.push([p1, p3, p4]);
                } else {
                    out.push([p1, p3, p2]);
                    out.push([p1, p4, p3]);
                }
            }
        }
    }
    out
}

/// Cotas (z) das fronteiras de faixa numa linha `c`, vistas dos dois lados, em ordem crescente e sem repetição.
fn zs_linha(lo: &[Faixa], hi: &[Faixa], c: f64) -> Vec<f64> {
    let (fa, fha) = (banda(lo, c + EPS_LINHA), banda(hi, c + EPS_LINHA));
    let (fb, fhb) = (banda(lo, c - EPS_LINHA), banda(hi, c - EPS_LINHA));
    let mut zs = vec![fa.a + fa.b * c, fha.a + fha.b * c, fb.a + fb.b * c, fhb.a + fhb.b * c];
    zs.sort_by(f64::total_cmp);
    zs.dedup_by(|a, b| (*a - *b).abs() < 1e-12);
    zs
}

/// Costura de uma parede num extremo: `lo`, as cotas de degrau dentro do intervalo e `hi`, em ordem crescente.
fn costura(lo_v: f64, hi_v: f64, zs: &[f64]) -> Vec<f64> {
    let (l, h) = (lo_v.min(hi_v), lo_v.max(hi_v));
    let mut v = vec![lo_v, hi_v];
    v.extend(zs.iter().copied().filter(|&z| z > l + 1e-12 && z < h - 1e-12));
    v.sort_by(f64::total_cmp);
    v.dedup_by(|a, b| (*a - *b).abs() < 1e-12);
    v
}

/// Tira vértices repetidos (consecutivos, inclusive no fechamento) de um polígono.
fn sem_repetidos(mut p: Vec<[f64; 2]>) -> Vec<[f64; 2]> {
    p.dedup_by(|a, b| (a[0] - b[0]).abs() + (a[1] - b[1]).abs() < 1e-12);
    while p.len() > 1 && (p[0][0] - p[p.len() - 1][0]).abs() + (p[0][1] - p[p.len() - 1][1]).abs() < 1e-12 {
        p.pop();
    }
    p
}

/// Limite (`a + b·y`) de uma ponta contra um vizinho: `c + coef·x` máximo (`maximo`) ou mínimo sobre a seção do vizinho, em cada profundidade. As
/// faixas são as dos vértices da seção; fora da seção, o valor da borda mais próxima (constante).
pub fn faixas_do_vizinho(sec: &Secao, c: f64, coef: f64, maximo: bool) -> Faixas {
    let mut ys: Vec<f64> = sec.tris.iter().flat_map(|t| t.iter().map(|p| p[1])).collect();
    ys.sort_by(f64::total_cmp);
    ys.dedup_by(|a, b| (*a - *b).abs() < 1e-12);
    let ext = |y: f64| -> f64 {
        let xs = xs_na_linha(&sec.tris, y);
        let xmin = xs.iter().copied().fold(f64::INFINITY, f64::min);
        let xmax = xs.iter().copied().fold(f64::NEG_INFINITY, f64::max);
        // O x que dá o extremo de `c + coef·x`: o máximo de x se (maximo e coef > 0) ou (mínimo e coef < 0).
        let x = if maximo == (coef > 0.0) { xmax } else { xmin };
        c + coef * x
    };
    let mut bandas: Vec<Faixa> = Vec::with_capacity(ys.len());
    for w in ys.windows(2) {
        let (y0, y1) = (w[0], w[1]);
        let (u, v) = (y0 + (y1 - y0) / 3.0, y0 + 2.0 * (y1 - y0) / 3.0);
        let (fu, fv) = (ext(u), ext(v));
        let b = (fv - fu) / (v - u);
        bandas.push(Faixa { y0, y1, a: fu - b * u, b });
    }
    let (primeira, ultima) = (bandas[0], bandas[bandas.len() - 1]);
    let (y_ini, y_fim) = (ys[0], ys[ys.len() - 1]);
    let mut out = Vec::with_capacity(bandas.len() + 2);
    out.push(Faixa { y0: -INF_FAIXA, y1: y_ini, a: primeira.a + primeira.b * y_ini, b: 0.0 });
    out.extend(bandas);
    out.push(Faixa { y0: y_fim, y1: INF_FAIXA, a: ultima.a + ultima.b * y_fim, b: 0.0 });
    out
}

/// Volume (m³) de uma malha de triângulos (soma de tetraedros com a origem; valor absoluto, invariante a isometrias).
pub fn volume_malha(tris: &[[[f64; 3]; 3]]) -> f64 {
    tris.iter()
        .map(|t| {
            let (a, b, c) = (t[0], t[1], t[2]);
            (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6.0
        })
        .sum::<f64>()
        .abs()
}

// ───────────── Protótipos e instâncias ─────────────

/// Prisma de `poligono` (anti-horário em `(x, y)`) de `z = 0` a `z = 1`, com vértices próprios por face.
pub fn prisma(poligono: &[[f64; 2]]) -> (Vec<[f64; 3]>, Vec<[u32; 3]>) {
    let n = poligono.len();
    let mut v: Vec<[f64; 3]> = Vec::with_capacity(4 * n + 2 * n);
    let mut t: Vec<[u32; 3]> = Vec::new();
    for k in 0..n {
        let (p, q) = (poligono[k], poligono[(k + 1) % n]);
        let b = v.len() as u32;
        v.extend_from_slice(&[[p[0], p[1], 0.0], [q[0], q[1], 0.0], [q[0], q[1], 1.0], [p[0], p[1], 1.0]]);
        t.extend_from_slice(&[[b, b + 1, b + 2], [b, b + 2, b + 3]]);
    }
    // Tampas em leque (o perfil é convexo): a de baixo olha para -z, a de cima para +z.
    let base = v.len() as u32;
    for p in poligono {
        v.push([p[0], p[1], 0.0]);
    }
    for k in 1..n.saturating_sub(1) as u32 {
        t.push([base, base + k + 1, base + k]);
    }
    let topo = v.len() as u32;
    for p in poligono {
        v.push([p[0], p[1], 1.0]);
    }
    for k in 1..n.saturating_sub(1) as u32 {
        t.push([topo, topo + k, topo + k + 1]);
    }
    (v, t)
}

fn poligono_retangular(x0: f64, x1: f64, y0: f64, y1: f64) -> Vec<[f64; 2]> {
    vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
}

fn grade_proto(p: Proto) -> Proto {
    let q = |x: f64| na_grade(x);
    Proto { vertices: p.vertices.iter().map(|v| [q(v[0]), q(v[1]), q(v[2])]).collect(), ..p }
}

/// Protótipo de um montante. `rect` e `round` são prismas; `L`, `trapezoid` e `corner` são sólidos por faixas com limites constantes (de `z` 0 a 1).
pub fn proto_montante(m: &Montante, lod: u32) -> Proto {
    let (vertices, triangulos) = match m.forma {
        FORMA_L | FORMA_TRAPEZIO | FORMA_CORNER => {
            let tris = solido(&secao(m, lod), &faixa_plana(0.0), &faixa_plana(1.0));
            let vertices: Vec<[f64; 3]> = tris.iter().flat_map(|t| t.iter().copied()).collect();
            let triangulos: Vec<[u32; 3]> = (0..tris.len() as u32).map(|k| [3 * k, 3 * k + 1, 3 * k + 2]).collect();
            (vertices, triangulos)
        }
        _ => {
            let poligono = if m.forma == FORMA_REDONDA {
                let (n, r) = (lados_redondo(m.largura, lod), m.largura / 2.0);
                (0..n)
                    .map(|k| {
                        let a = std::f64::consts::TAU * k as f64 / n as f64;
                        [r * a.cos(), m.desloc + r * a.sin()]
                    })
                    .collect()
            } else {
                poligono_retangular(-m.largura / 2.0, m.largura / 2.0, m.desloc - m.profundidade / 2.0, m.desloc + m.profundidade / 2.0)
            };
            prisma(&poligono)
        }
    };
    grade_proto(Proto { papel: MALHA_MONTANTE, tipo: m.tipo, material: m.material, vertices, triangulos })
}

pub fn proto_painel(p: &PainelTipo) -> Proto {
    let (vertices, triangulos) = prisma(&poligono_retangular(-0.5, 0.5, p.desloc - p.espessura / 2.0, p.desloc + p.espessura / 2.0));
    let papel = if p.kind == PAINEL_VIDRO { MALHA_VIDRO } else { MALHA_SOLIDO };
    grade_proto(Proto { papel, tipo: p.tipo, material: p.material, vertices, triangulos })
}

/// Matriz 3 × 4 linha-maior a partir das três colunas da base e da translação.
fn matriz(x: [f64; 3], y: [f64; 3], z: [f64; 3], t: [f64; 3]) -> [f64; 12] {
    [x[0], y[0], z[0], na_grade(t[0]), x[1], y[1], z[1], na_grade(t[1]), x[2], y[2], z[2], na_grade(t[2])]
}

fn matriz_montante(g: &Geom, p: &PecaMont) -> [f64; 12] {
    let len = na_grade(p.comprimento());
    let (sx, sy) = (g.sigma * g.u[0], g.sigma * g.u[1]);
    let fora = [g.sigma * g.n[0], g.sigma * g.n[1], 0.0];
    if p.eixo == EIXO_U {
        matriz([sx, sy, 0.0], fora, [0.0, 0.0, len], g.mundo(p.pos, 0.0, p.de))
    } else {
        matriz([0.0, 0.0, -g.sigma], fora, [g.u[0] * len, g.u[1] * len, 0.0], g.mundo(p.de, 0.0, p.pos))
    }
}

fn matriz_painel(g: &Geom, p: &PainelPeca) -> [f64; 12] {
    let (s0, s1, z0, z1) = p.retangulo_bruto();
    let (w, h) = (na_grade(s1 - s0), na_grade(z1 - z0));
    matriz([g.sigma * g.u[0] * w, g.sigma * g.u[1] * w, 0.0], [g.sigma * g.n[0], g.sigma * g.n[1], 0.0], [0.0, 0.0, h], g.mundo((s0 + s1) / 2.0, 0.0, z0))
}

/// Ponto de uma peça de esquadria no mundo. Vertical: `(x, y, z)` local é `(t = pos + σ·x, y, z)`; horizontal: `(t = z, y, z = pos − σ·x)`, a mesma
/// convenção das matrizes dos protótipos.
fn ponto_esq(g: &Geom, p: &PecaEsq, v: [f64; 3]) -> [f64; 3] {
    let q = if p.eixo == EIXO_U { g.mundo(p.pos + g.sigma * v[0], v[1], v[2]) } else { g.mundo(v[2], v[1], p.pos - g.sigma * v[0]) };
    [na_grade(q[0]), na_grade(q[1]), na_grade(q[2])]
}

/// Protótipos e instâncias das cortinas resolvidas, e as peças de esquadria em `grupos`. `LIMITE` com mais de 20 000 instâncias.
pub fn montar(cortinas: &[CortinaR], lod: u32) -> Result<Malha, u32> {
    let geoms: Vec<(&CortinaR, &Geom)> = cortinas.iter().filter_map(|c| c.g.as_ref().map(|g| (c, g))).collect();
    let mut n = 0usize;
    let mut chaves: BTreeSet<(u32, u32)> = BTreeSet::new();
    let mut protos: BTreeMap<(u32, u32), Proto> = BTreeMap::new();
    for (_, g) in &geoms {
        n += g.pecas.len() + g.pecas_esq.len();
        for p in &g.pecas {
            if chaves.insert((MALHA_MONTANTE, p.m.tipo)) {
                protos.insert((MALHA_MONTANTE, p.m.tipo), proto_montante(&p.m, lod));
            }
        }
        for p in g.paineis.iter().filter(|p| p.p.kind != PAINEL_VAZIO && p.tem_area()) {
            n += 1;
            let proto = proto_painel(&p.p);
            if chaves.insert((proto.papel, p.p.tipo)) {
                protos.insert((proto.papel, p.p.tipo), proto);
            }
        }
    }
    if n > LIMITE_INSTANCIAS {
        return Err(LIMITE);
    }
    let ordem: Vec<(u32, u32)> = protos.keys().copied().collect();
    let id_de = |papel: u32, tipo: u32| ordem.iter().position(|&k| k == (papel, tipo)).unwrap_or(0) as u32;
    let mut instancias = Vec::with_capacity(n);
    for (c, g) in &geoms {
        for p in &g.pecas {
            instancias.push(Instancia {
                cortina: c.id,
                proto: id_de(MALHA_MONTANTE, p.m.tipo),
                papel: MALHA_MONTANTE,
                ref_i: p.linha,
                ref_j: (p.k << 1) | p.eixo as u32,
                transparente: 0,
                matriz: matriz_montante(g, p),
            });
        }
        for p in g.paineis.iter().filter(|p| p.p.kind != PAINEL_VAZIO && p.tem_area()) {
            let papel = if p.p.kind == PAINEL_VIDRO { MALHA_VIDRO } else { MALHA_SOLIDO };
            instancias.push(Instancia {
                cortina: c.id,
                proto: id_de(papel, p.p.tipo),
                papel,
                ref_i: p.i,
                ref_j: p.j,
                transparente: u32::from(p.p.kind == PAINEL_VIDRO),
                matriz: matriz_painel(g, p),
            });
        }
    }
    // Peças de esquadria: uma malha no mundo por cortina e material.
    let mut grupos: BTreeMap<(u32, u32), GrupoAv> = BTreeMap::new();
    for (c, g) in &geoms {
        for p in &g.pecas_esq {
            let tris = solido(&secao(&p.m, 2), &p.lo, &p.hi);
            let grupo = grupos.entry((c.id, p.m.material)).or_insert_with(|| GrupoAv { cortina: c.id, papel: MALHA_MONTANTE, material: p.m.material, transparente: 0, vertices: Vec::new(), triangulos: Vec::new() });
            for t in &tris {
                let b = grupo.vertices.len() as u32;
                grupo.vertices.extend(t.iter().map(|&v| ponto_esq(g, p, v)));
                grupo.triangulos.push([b, b + 1, b + 2]);
            }
        }
    }
    Ok(Malha { protos: ordem.iter().filter_map(|k| protos.remove(k)).collect(), instancias, grupos: grupos.into_values().collect() })
}

/// Saída plana (ver o JSON): `prototipos`, `vertices`, `indices`, `instancias`, `matrizes`, `grupos`, `vertices_av` e `indices_av`.
pub fn achatar(m: &Malha) -> Vec<Saida> {
    let (mut protos, mut vertices, mut indices) = (Vec::new(), Vec::new(), Vec::new());
    let (mut pv, mut pi) = (0u32, 0u32);
    for (k, p) in m.protos.iter().enumerate() {
        let (nv, ni) = (p.vertices.len() as u32, 3 * p.triangulos.len() as u32);
        protos.extend_from_slice(&[k as u32, p.papel, p.tipo, p.material, pv, nv, pi, ni]);
        for v in &p.vertices {
            vertices.extend_from_slice(v);
        }
        for t in &p.triangulos {
            indices.extend_from_slice(t);
        }
        pv += nv;
        pi += ni;
    }
    let mut inst = Vec::new();
    let mut mats = Vec::new();
    for i in &m.instancias {
        inst.extend_from_slice(&[i.cortina, i.proto, i.papel, i.ref_i, i.ref_j, i.transparente]);
        mats.extend_from_slice(&i.matriz);
    }
    let (mut grupos, mut vertices_av, mut indices_av) = (Vec::new(), Vec::new(), Vec::new());
    let (mut gv, mut gi) = (0u32, 0u32);
    for g in &m.grupos {
        let ni = 3 * g.triangulos.len() as u32;
        grupos.extend_from_slice(&[g.cortina, g.papel, g.material, gi, ni, g.transparente]);
        for v in &g.vertices {
            vertices_av.extend_from_slice(v);
        }
        for t in &g.triangulos {
            indices_av.extend_from_slice(&[t[0] + gv, t[1] + gv, t[2] + gv]);
        }
        gv += g.vertices.len() as u32;
        gi += ni;
    }
    vec![
        Saida::U32(protos),
        Saida::F64(vertices),
        Saida::U32(indices),
        Saida::U32(inst),
        Saida::F64(mats),
        Saida::U32(grupos),
        Saida::F64(vertices_av),
        Saida::U32(indices_av),
    ]
}

pub fn consulta_cortina_malha(cena: &crate::cena::Cena, nivel: u32, lod: u32) -> Result<Vec<Saida>, u32> {
    let cortinas = crate::cortina_pecas::resolver(cena, nivel)?;
    Ok(achatar(&montar(&cortinas, lod)?))
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::cortina_pecas::testes::*;
    use std::collections::HashMap;

    fn aplica(m: &[f64; 12], v: [f64; 3]) -> [f64; 3] {
        [
            m[0] * v[0] + m[1] * v[1] + m[2] * v[2] + m[3],
            m[4] * v[0] + m[5] * v[1] + m[6] * v[2] + m[7],
            m[8] * v[0] + m[9] * v[1] + m[10] * v[2] + m[11],
        ]
    }

    /// Volume com sinal da malha (positivo com as normais para fora).
    fn volume(v: &[[f64; 3]], t: &[[u32; 3]]) -> f64 {
        t.iter()
            .map(|t| {
                let (a, b, c) = (v[t[0] as usize], v[t[1] as usize], v[t[2] as usize]);
                (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6.0
            })
            .sum()
    }

    /// Solda os vértices a 1 µm e confere que toda aresta orientada aparece uma vez e a inversa também: fechada e orientada.
    pub(crate) fn fechada_e_orientada(v: &[[f64; 3]], t: &[[u32; 3]]) -> bool {
        let q = |x: f64| (x * 1e6).round() as i64;
        let mut ids: HashMap<[i64; 3], u32> = HashMap::new();
        let id: Vec<u32> = v
            .iter()
            .map(|p| {
                let n = ids.len() as u32;
                *ids.entry([q(p[0]), q(p[1]), q(p[2])]).or_insert(n)
            })
            .collect();
        let mut dir: HashMap<(u32, u32), u32> = HashMap::new();
        for t in t {
            for k in 0..3 {
                *dir.entry((id[t[k] as usize], id[t[(k + 1) % 3] as usize])).or_insert(0) += 1;
            }
        }
        dir.iter().all(|(&(a, b), &n)| n == 1 && dir.get(&(b, a)) == Some(&1))
    }

    fn malha_de(tris: &[[[f64; 3]; 3]]) -> (Vec<[f64; 3]>, Vec<[u32; 3]>) {
        let v: Vec<[f64; 3]> = tris.iter().flat_map(|t| t.iter().copied()).collect();
        let t: Vec<[u32; 3]> = (0..tris.len() as u32).map(|k| [3 * k, 3 * k + 1, 3 * k + 2]).collect();
        (v, t)
    }

    fn montante(forma: u8, w: f64, d: f64, esp: f64, wb: f64, desloc: f64) -> Montante {
        Montante { tipo: 9, forma, largura: w, profundidade: d, espessura: esp, largura2: wb, desloc, material: 7 }
    }

    #[test]
    fn prototipos_sao_solidos_fechados_com_normais_para_fora_e_volume_da_secao() {
        let ret = Montante { tipo: 1, forma: FORMA_RETANGULAR, largura: 0.05, profundidade: 0.1, espessura: 0.0, largura2: 0.0, desloc: 0.01, material: 7 };
        let p = proto_montante(&ret, 2);
        assert!(fechada_e_orientada(&p.vertices, &p.triangulos));
        assert!((volume(&p.vertices, &p.triangulos) - 0.005).abs() < 1e-9);
        let red = Montante { tipo: 2, forma: FORMA_REDONDA, largura: 0.05, profundidade: 0.05, espessura: 0.0, largura2: 0.0, desloc: 0.0, material: 7 };
        for (lod, lados) in [(0u32, 8usize), (1, 16), (2, 16)] {
            let p = proto_montante(&red, lod);
            assert!(fechada_e_orientada(&p.vertices, &p.triangulos), "lod {lod}");
            // O polígono inscrito tem área n/2 · r² · sen(2π/n).
            let area = lados as f64 / 2.0 * 0.025f64.powi(2) * (std::f64::consts::TAU / lados as f64).sin();
            assert!((volume(&p.vertices, &p.triangulos) - area).abs() < 1e-6, "lod {lod}");
        }
        assert_eq!(lados_redondo(0.1, 1), 24, "acima de 80 mm");
        let pn = proto_painel(&PainelTipo { tipo: 3, kind: PAINEL_VIDRO, espessura: 0.01, desloc: 0.0, encaixe: 0.012, material: 9 });
        assert!(fechada_e_orientada(&pn.vertices, &pn.triangulos));
        assert!((volume(&pn.vertices, &pn.triangulos) - 0.01).abs() < 1e-9);
        assert_eq!(pn.papel, MALHA_VIDRO);
    }

    #[test]
    fn perfis_novos_tem_area_da_formula_e_protótipo_fechado_com_volume_igual_a_area() {
        // L: t (w + d − t). Trapézio: (w + wb) / 2 · d. Canto: w·d − (w − 2t)(d − 2t).
        let casos = [
            (montante(FORMA_L, 0.08, 0.12, 0.01, 0.0, 0.0), 0.01 * (0.08 + 0.12 - 0.01)),
            (montante(FORMA_L, 0.08, 0.12, 0.01, 0.0, -0.02), 0.01 * (0.08 + 0.12 - 0.01)),
            (montante(FORMA_TRAPEZIO, 0.06, 0.10, 0.0, 0.03, 0.0), (0.06 + 0.03) / 2.0 * 0.10),
            (montante(FORMA_TRAPEZIO, 0.04, 0.10, 0.0, 0.07, 0.01), (0.04 + 0.07) / 2.0 * 0.10),
            (montante(FORMA_CORNER, 0.06, 0.08, 0.004, 0.0, 0.0), 0.06 * 0.08 - (0.06 - 0.008) * (0.08 - 0.008)),
        ];
        for (m, area) in casos {
            assert!((m.area_secao() - area).abs() < 1e-12, "forma {} área da fórmula", m.forma);
            let s = secao(&m, 2);
            assert!((area_da_secao(&s) - area).abs() < 1e-12, "forma {} área da seção", m.forma);
            let p = proto_montante(&m, 2);
            assert!(fechada_e_orientada(&p.vertices, &p.triangulos), "forma {} fechada", m.forma);
            assert!((volume(&p.vertices, &p.triangulos) - area).abs() < 1e-12, "forma {} volume = área × 1", m.forma);
        }
    }

    #[test]
    fn solido_com_ponta_inclinada_tem_volume_integrado_pela_profundidade() {
        // Seção retangular h × D (em z e y), ponta lo(y) = a + b·y: o volume é h · ∫ (hi − lo(y)) dy, com a integral em faixa.
        let m = montante(FORMA_RETANGULAR, 0.05, 0.10, 0.0, 0.0, 0.0);
        let sec = secao(&m, 2);
        let (y0, y1) = (-0.05, 0.05);
        let (a, b, hi) = (0.2, 0.5, 2.0);
        let lo = vec![Faixa { y0: -1e9, y1: 1e9, a, b }];
        let tris = solido(&sec, &lo, &faixa_plana(hi));
        let (v, t) = malha_de(&tris);
        assert!(fechada_e_orientada(&v, &t));
        let esperado = 0.05 * ((hi - a) * (y1 - y0) - b * (y1 * y1 - y0 * y0) / 2.0);
        assert!((volume(&v, &t) - esperado).abs() < 1e-12, "{} vs {esperado}", volume(&v, &t));
    }

    #[test]
    fn degrau_de_ponta_em_l_tem_volume_por_faixa_e_malha_fechada() {
        // Seção retangular (z, y) de altura h = 0,05 e profundidade D = 0,10 com a ponta em degrau: lo = p − 0,03 abaixo de y = 0, e lo = p + 0,04 acima.
        // Volume = h · [ (0 − y0)(hi − (p − 0,03)) + (y1 − 0)(hi − (p + 0,04)) ].
        let m = montante(FORMA_RETANGULAR, 0.05, 0.10, 0.0, 0.0, 0.0);
        let sec = secao(&m, 2);
        let p = 1.0;
        let lo = vec![Faixa { y0: -1e9, y1: 0.0, a: p - 0.03, b: 0.0 }, Faixa { y0: 0.0, y1: 1e9, a: p + 0.04, b: 0.0 }];
        let hi = faixa_plana(2.0);
        let tris = solido(&sec, &lo, &hi);
        let (v, t) = malha_de(&tris);
        assert!(fechada_e_orientada(&v, &t), "degrau: malha aberta");
        let esperado = 0.05 * (0.05 * (2.0 - (p - 0.03)) + 0.05 * (2.0 - (p + 0.04)));
        assert!((volume(&v, &t) - esperado).abs() < 1e-12, "{} vs {esperado}", volume(&v, &t));
    }

    #[test]
    fn faixas_do_vizinho_trapezio_e_linear_e_l_tem_degrau() {
        // Trapézio: x de −0,03 (em y = −0,05) a −0,04...: a face externa é a de cima. max de x é w/2 em y = d/2 e wb/2 em y = −d/2 (linear).
        let trap = montante(FORMA_TRAPEZIO, 0.08, 0.10, 0.0, 0.04, 0.0);
        let f = faixas_do_vizinho(&secao(&trap, 2), 1.0, 1.0, true);
        assert!((valor_em(&f, -0.05) - (1.0 + 0.02)).abs() < 1e-12, "embaixo: wb/2");
        assert!((valor_em(&f, 0.05) - (1.0 + 0.04)).abs() < 1e-12, "em cima: w/2");
        assert!((valor_em(&f, 0.0) - (1.0 + 0.03)).abs() < 1e-12, "no meio: linear");
        // L como o TS (w = 0,08, t = 0,01, d = 0,12): a aba fica em y ∈ [−0,06; −0,05] com x ∈ [−0,04; 0,04]; a alma, em x ∈ [−0,04; −0,03].
        let l = montante(FORMA_L, 0.08, 0.12, 0.01, 0.0, 0.0);
        let f = faixas_do_vizinho(&secao(&l, 2), 0.0, 1.0, true);
        assert!((valor_em(&f, 0.0) - (-0.04 + 0.01)).abs() < 1e-12, "na alma");
        assert!((valor_em(&f, -0.055) - 0.04).abs() < 1e-12, "na aba (face interna)");
        // Mínimo com coeficiente −1 (vizinho do outro lado): o máximo de −x é o −x mínimo de x.
        let f = faixas_do_vizinho(&secao(&l, 2), 0.0, -1.0, true);
        assert!((valor_em(&f, 0.0) - 0.04).abs() < 1e-12);
    }

    #[test]
    fn instancias_e_prototipos_da_grade_de_4_por_3() {
        let e = Espec::novo(EixoEfetivo::numero(4), EixoEfetivo::numero(3));
        let cena = cena_simples(&e, 6.0, 3.0);
        let m = montar(&crate::cortina_pecas::resolver(&cena, 0).expect("r"), 1).expect("malha");
        // 2 protótipos: o montante retangular e o painel de vidro.
        assert_eq!(m.protos.len(), 2);
        assert_eq!((m.protos[0].papel, m.protos[0].tipo), (MALHA_MONTANTE, M_RET));
        assert_eq!((m.protos[1].papel, m.protos[1].tipo), (MALHA_VIDRO, P_VIDRO));
        // 5 linhas verticais x 3 segmentos + 4 linhas horizontais x 4 segmentos + 12 painéis (as peças são por segmento).
        assert_eq!(m.instancias.len(), 15 + 16 + 12);
        assert_eq!(m.instancias.iter().filter(|i| i.transparente == 1).count(), 12);
        assert!(m.instancias.iter().filter(|i| i.papel == MALHA_MONTANTE).all(|i| i.transparente == 0));
        assert!(m.grupos.is_empty(), "perfil retangular não gera peça avulsa");
    }

    #[test]
    fn volume_das_instancias_bate_com_comprimento_vezes_secao_e_area_bruta_vezes_espessura() {
        // Parede girada e invertida: a base tem de continuar destra e as normais para fora.
        let mut e = Espec::novo(EixoEfetivo::numero(3), EixoEfetivo::distancia_fixa(1.2, JUSTIF_FIM));
        e.mont = [M_RET, M_RED, M_RET, M_RET, M_RED, M_RED];
        for prioridade in [PRIORIDADE_VERTICAL, PRIORIDADE_HORIZONTAL] {
            e.prioridade = prioridade;
            let mut cena = cena_simples(&e, 4.5, 3.0);
            let c = cena.cortina.cortinas.get_mut(&1).expect("c");
            c.a = [1.0, 2.0];
            c.b = [1.0 + 4.5 * 0.6, 2.0 + 4.5 * 0.8];
            c.invertida = true;
            c.z_base = 3.0;
            let cortinas = crate::cortina_pecas::resolver(&cena, 0).expect("r");
            let g = cortinas[0].g.as_ref().expect("g");
            let m = montar(&cortinas, 2).expect("malha");
            let mut vol_mont = 0.0;
            let mut vol_pnl = 0.0;
            for i in &m.instancias {
                let p = &m.protos[i.proto as usize];
                let v: Vec<[f64; 3]> = p.vertices.iter().map(|&v| aplica(&i.matriz, v)).collect();
                let vol = volume(&v, &p.triangulos);
                assert!(vol > 0.0, "instância com volume negativo (base canhota ou normais para dentro)");
                assert!(fechada_e_orientada(&v, &p.triangulos));
                if i.papel == MALHA_MONTANTE {
                    vol_mont += vol;
                } else {
                    vol_pnl += vol;
                }
            }
            // Volume dos montantes: o redondo é um polígono inscrito de 16 lados (lod 2), o resto é exato.
            let esperado_mont: f64 = g
                .pecas
                .iter()
                .map(|p| {
                    let area = if p.m.forma == FORMA_REDONDA { 16.0 / 2.0 * 0.025f64.powi(2) * (std::f64::consts::TAU / 16.0).sin() } else { p.m.area_secao() };
                    area * p.comprimento()
                })
                .sum();
            assert!((vol_mont - esperado_mont).abs() < 1e-6, "montantes {vol_mont} vs {esperado_mont}");
            let esperado_pnl: f64 = g.paineis.iter().map(|p| p.area_bruta() * p.p.espessura).sum();
            assert!((vol_pnl - esperado_pnl).abs() < 1e-6, "painéis {vol_pnl} vs {esperado_pnl}");
        }
    }

    #[test]
    fn painel_vazio_nao_gera_instancia_nem_prototipo() {
        let mut e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(1));
        e.painel = P_VAZIO;
        let m = montar(&crate::cortina_pecas::resolver(&cena_simples(&e, 4.0, 3.0), 0).expect("r"), 1).expect("malha");
        assert_eq!(m.protos.len(), 1);
        assert!(m.instancias.iter().all(|i| i.papel == MALHA_MONTANTE));
    }

    #[test]
    fn posicao_no_mundo_do_montante_e_do_painel() {
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(1));
        let cena = cena_simples(&e, 4.0, 3.0);
        let m = montar(&crate::cortina_pecas::resolver(&cena, 0).expect("r"), 1).expect("malha");
        // Vertical interior em s = 2 (segunda vertical, índice 1): origem em (2, 0, 0), comprimento 3 em z, largura em x, profundidade em y.
        let v = m.instancias.iter().find(|i| i.papel == MALHA_MONTANTE && i.ref_i == 1 && i.ref_j & 1 == EIXO_U as u32).expect("vertical");
        let o = aplica(&v.matriz, [0.0, 0.0, 0.0]);
        assert!((o[0] - 2.0).abs() < 1e-9 && o[1].abs() < 1e-9 && o[2].abs() < 1e-9);
        let topo = aplica(&v.matriz, [0.0, 0.0, 1.0]);
        assert!((topo[2] - 3.0).abs() < 1e-9);
        // Painel da primeira célula: livre de 0,05 (borda embutida) a 1,975; com o encaixe de 12 mm, de 0,038 a 1,987.
        let p = m.instancias.iter().find(|i| i.papel == MALHA_VIDRO && i.ref_i == 0).expect("painel");
        let (a, b) = (aplica(&p.matriz, [-0.5, 0.0, 0.0]), aplica(&p.matriz, [0.5, 0.0, 1.0]));
        assert!((a[0] - (0.05 - 0.012)).abs() < 1e-6, "borda esquerda do painel com encaixe: {}", a[0]);
        assert!((b[0] - (2.0 - 0.025 + 0.012)).abs() < 1e-6);
        assert!((a[2] - (0.05 - 0.012)).abs() < 1e-6 && (b[2] - (3.0 - 0.05 + 0.012)).abs() < 1e-6);
    }

    #[test]
    fn mais_de_vinte_mil_instancias_e_limite() {
        let e = Espec::novo(EixoEfetivo::numero(64), EixoEfetivo::numero(64));
        let mut cena = cena_simples(&e, 60.0, 60.0);
        for id in 2..8 {
            cena = com_cortina(cena, id, 60.0, 60.0);
        }
        let r = crate::cortina_pecas::resolver(&cena, 0).expect("r");
        assert_eq!(montar(&r, 1).err(), Some(LIMITE));
    }
}

#[cfg(test)]
mod testes_f3 {
    use super::*;
    use super::testes::fechada_e_orientada;
    use crate::cortina_pecas::resolver;
    use crate::cortina_pecas::testes::*;

    #[test]
    fn esquadria_vai_a_grupos_no_mundo_e_o_protótipo_do_l_e_fechado() {
        // Grade 2 × 2 com interior em L: as três horizontais à direita dele são esquadria e vão a `grupos` (mundo), não a instâncias.
        let mut e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(2));
        e.mont = [M_L, M_R12, M_R12, M_R12, M_R12, M_R12];
        let cortinas = resolver(&cena_simples(&e, 2.0, 2.0), 0).expect("r");
        let m = montar(&cortinas, 2).expect("malha");
        assert_eq!(m.grupos.len(), 1, "um grupo por cortina e material");
        let g = &m.grupos[0];
        assert_eq!((g.cortina, g.papel), (1, MALHA_MONTANTE));
        let esperado: usize = cortinas[0].g.as_ref().expect("g").pecas_esq.iter().map(|p| solido(&secao(&p.m, 2), &p.lo, &p.hi).len()).sum();
        assert_eq!(g.triangulos.len(), esperado, "um triângulo por face da malha de esquadria");
        assert!(g.vertices.iter().all(|v| v[0].is_finite() && v[1].is_finite() && v[2].is_finite()));
        // Os índices de grupo são válidos e cada triângulo tem três vértices distintos.
        assert!(g.triangulos.iter().all(|t| t.iter().all(|&i| (i as usize) < g.vertices.len())));
        // O protótipo do L (seção extrudada) é fechado e orientado.
        let p = proto_montante(&cortinas[0].g.as_ref().expect("g").pecas[0].m, 2);
        assert!(fechada_e_orientada(&p.vertices, &p.triangulos), "protótipo do L aberto");
        // A saída plana tem os oito blocos e `grupos` com 6 inteiros por grupo.
        let s = achatar(&m);
        let Saida::U32(gr) = &s[5] else { panic!("grupos") };
        assert_eq!(gr.len(), 6 * m.grupos.len());
        let Saida::U32(ia) = &s[7] else { panic!("indices_av") };
        assert_eq!(ia.len(), 3 * g.triangulos.len());
    }
}
