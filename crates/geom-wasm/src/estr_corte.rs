//! Seção de um prisma da estrutura por um plano e o corte/elevação (docs/estrutura/PLANO.md, A.4.4; consulta 202 `estr_corte`; ficha K4).
//!
//! [`secao`] corta o prisma (perfil × eixo) por um plano qualquer; a planta (A.4.3) usa o plano horizontal e o corte, o vertical. No espaço do perfil
//! `(x, y, s)` o plano é `αx + βy + γs = δ`. Girando o perfil para `(u, w)`, com `w` na direção de `(α, β)`, o plano fica `w = w0 - g·s`:
//! - `(α, β)` nulo (plano paralelo ao perfil: pilar na planta, viga atravessada no corte): a seção é o perfil inteiro na altura `s = δ/γ`;
//! - `|g|` abaixo de 1 µm (plano paralelo ao eixo: pilar no corte, viga horizontal na planta): as faixas da reta `w = w0 - g/2` dentro do perfil
//!   (par-ímpar sobre todos os anéis), cada uma varrida de `s = 0` a `s = 1` (um quadrilátero);
//! - senão (eixo oblíquo): o perfil levado ao plano por `s = (w0 - w)/g` e, se passar das pontas, recortado à faixa `0 ≤ s ≤ 1` (`ops::interseccao`, em
//!   `(u, w)` ou `(u, s)` conforme a escala, para a grade de 1 µm não achatar a faixa).
//!
//! Corte (A.4.4): plano vertical por `(ox, oy)` na direção `(dx, dy)`; olha-se para a normal esquerda `(-dy, dx)` até `profundidade` (como no guarda-corpo,
//! `gc_corte`). Saída em `(s, z)`, `s` ao longo da direção a partir da origem. Prisma cortado: os anéis da seção (estilo 0; papel 0 anel externo,
//! 1 furo; fechados, repetem o primeiro ponto). Projetado (estilo 1, papel 2, linhas de 2 pontos): as arestas do prisma que se veem, recortadas à faixa
//! `0 ≤ distância ≤ profundidade` (inclusive a parte de trás de um prisma cortado): silhueta (uma face de frente e a outra não) e vincos entre duas faces
//! de frente com mais de 20° entre as normais (a aresta do retângulo sai; as 96 faces do círculo não). Sem remoção de linhas ocultas entre elementos.
//! Direção nula ou profundidade negativa: saída vazia (como no guarda-corpo).

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::estr_perfil::{Contorno, P2};
use crate::estr_planta::{achatar, elementos_aparados, LinhaEstr, ESTILO_CHEIO, ESTILO_TRACEJADO, PAPEL_ANEL, PAPEL_FURO, PAPEL_PROJETADO};
use crate::estr_prisma::{Quadro3, P3};

/// Abaixo disto (m de `w` ao longo de todo o eixo) o plano é tratado como paralelo ao eixo.
const G_MINIMO: f64 = 1e-6;
/// Cosseno do ângulo mínimo de vinco entre duas faces de frente (20°).
const COS_VINCO: f64 = 0.939_692_620_785_908_4;

fn esc(a: P3, b: P3) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn vetorial(a: P3, b: P3) -> P3 {
    [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/// Anéis `(furo, pontos no mundo)` da seção do prisma pelo plano `{p : n·p = c}` (`n` unitário). Sem seção: vazio.
pub fn secao(contorno: &Contorno, q: &Quadro3, n: P3, c: f64) -> Vec<(bool, Vec<P3>)> {
    let (al, be, ga) = (esc(n, q.ex), esc(n, q.ey), esc(n, q.eixo));
    let de = c - esc(n, q.origem);
    let k = al.hypot(be);
    if ![al, be, ga, de].iter().all(|x| x.is_finite()) {
        return Vec::new();
    }
    let perfil_em = |s: &dyn Fn(P2) -> f64| -> Vec<(bool, Vec<P3>)> {
        contorno.aneis().enumerate().map(|(i, a)| (i > 0, a.iter().map(|&p| q.ponto(p, s(p))).collect())).collect()
    };
    if k < 1e-12 {
        if ga.abs() < 1e-15 {
            return Vec::new();
        }
        let s = de / ga;
        return if (-1e-12..=1.0 + 1e-12).contains(&s) { perfil_em(&|_| s.clamp(0.0, 1.0)) } else { Vec::new() };
    }
    let (g, w0) = (ga / k, de / k);
    let w_de = |p: P2| (al * p[0] + be * p[1]) / k;
    let u_de = |p: P2| (-be * p[0] + al * p[1]) / k;
    let xy_de = |u: f64, w: f64| [(al * w - be * u) / k, (be * w + al * u) / k];
    if g.abs() < G_MINIMO {
        return faixas(contorno, w0 - g / 2.0, &u_de, &w_de)
            .into_iter()
            .map(|(u0, u1)| {
                let canto = |u: f64, s: f64| q.ponto(xy_de(u, w0 - g * s), s);
                (false, vec![canto(u0, 0.0), canto(u1, 0.0), canto(u1, 1.0), canto(u0, 1.0)])
            })
            .collect();
    }
    let s_de = |p: P2| (w0 - w_de(p)) / g;
    let (smin, smax) = contorno.anel.iter().map(|&p| s_de(p)).fold((f64::INFINITY, f64::NEG_INFINITY), |a, s| (a.0.min(s), a.1.max(s)));
    if smax < 0.0 || smin > 1.0 {
        return Vec::new();
    }
    if smin >= 0.0 && smax <= 1.0 {
        return perfil_em(&s_de);
    }
    // Recorte à faixa 0 ≤ s ≤ 1: em (u, w) se a faixa é larga, em (u, s) se é estreita.
    let largo = g.abs() >= 1.0;
    let v = |p: P2| if largo { w_de(p) } else { s_de(p) };
    let (umin, umax) = contorno.anel.iter().map(|&p| u_de(p)).fold((f64::INFINITY, f64::NEG_INFINITY), |a, u| (a.0.min(u), a.1.max(u)));
    let (v0, v1) = if largo { ((w0 - g).min(w0), (w0 - g).max(w0)) } else { (0.0, 1.0) };
    let caixa = vec![vec![vec![[umin - 1.0, v0], [umax + 1.0, v0], [umax + 1.0, v1], [umin - 1.0, v1]]]];
    let perfil: Vec<Vec<[f64; 2]>> = contorno.aneis().map(|a| a.iter().map(|&p| [u_de(p), v(p)]).collect()).collect();
    let Ok(res) = crate::ops::interseccao(&vec![perfil], &caixa) else { return Vec::new() };
    let mut out = Vec::new();
    for poligono in res {
        for (i, anel) in poligono.iter().enumerate() {
            let pts = anel
                .iter()
                .map(|&[u, t]| {
                    let (s, w) = if largo { ((w0 - t) / g, t) } else { (t, w0 - g * t) };
                    q.ponto(xy_de(u, w), s)
                })
                .collect();
            out.push((i > 0, pts));
        }
    }
    out
}

/// Intervalos `[u0, u1]` da reta `w = w_corte` dentro do perfil (par-ímpar sobre todos os anéis).
fn faixas(contorno: &Contorno, w_corte: f64, u_de: &dyn Fn(P2) -> f64, w_de: &dyn Fn(P2) -> f64) -> Vec<(f64, f64)> {
    let mut us = Vec::new();
    for anel in contorno.aneis() {
        let n = anel.len();
        for i in 0..n {
            let (a, b) = (anel[i], anel[(i + 1) % n]);
            let (wa, wb) = (w_de(a), w_de(b));
            if (wa > w_corte) != (wb > w_corte) {
                let t = (w_corte - wa) / (wb - wa);
                us.push(u_de(a) + (u_de(b) - u_de(a)) * t);
            }
        }
    }
    us.retain(|u| u.is_finite());
    us.sort_by(f64::total_cmp);
    us.chunks_exact(2).filter(|c| c[1] - c[0] > 1e-12).map(|c| (c[0], c[1])).collect()
}

/// Plano do corte: origem, direção unitária `d` e normal esquerda `n` (lado visível).
struct Plano {
    o: P2,
    d: P2,
    n: P2,
}

impl Plano {
    fn sz(&self, p: P3) -> P2 {
        [(p[0] - self.o[0]) * self.d[0] + (p[1] - self.o[1]) * self.d[1], p[2]]
    }

    fn t(&self, p: P3) -> f64 {
        (p[0] - self.o[0]) * self.n[0] + (p[1] - self.o[1]) * self.n[1]
    }
}

/// Arestas visíveis do prisma, recortadas a `0 ≤ t ≤ prof`, como segmentos em `(s, z)`.
fn arestas(contorno: &Contorno, q: &Quadro3, pl: &Plano, prof: f64) -> Vec<[P2; 2]> {
    let vista = [pl.n[0], pl.n[1], 0.0];
    let unit = |v: P3| {
        let m = esc(v, v).sqrt();
        if m > 0.0 { [v[0] / m, v[1] / m, v[2] / m] } else { v }
    };
    let frente = |m: P3| esc(m, vista) < -1e-9;
    let mostra = |a: P3, b: P3| frente(a) != frente(b) || (frente(a) && frente(b) && esc(a, b) < COS_VINCO);
    let tampas = [unit([-q.eixo[0], -q.eixo[1], -q.eixo[2]]), unit(q.eixo)];
    let mut out = Vec::new();
    let mut recorta = |a: P3, b: P3| {
        let (ta, tb) = (pl.t(a), pl.t(b));
        let (mut k0, mut k1) = (0.0f64, 1.0f64);
        for (lim, sinal) in [(0.0, 1.0), (prof, -1.0)] {
            // sinal·(t - lim) >= 0 é o lado que fica.
            let (fa, fb) = (sinal * (ta - lim), sinal * (tb - lim));
            if fa < 0.0 && fb < 0.0 {
                return;
            }
            if fa < 0.0 {
                k0 = k0.max(fa / (fa - fb));
            } else if fb < 0.0 {
                k1 = k1.min(fa / (fa - fb));
            }
        }
        if k1 - k0 > 1e-12 {
            let em = |k: f64| [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
            out.push([pl.sz(em(k0)), pl.sz(em(k1))]);
        }
    };
    for anel in contorno.aneis() {
        let n = anel.len();
        // Normal para fora da face lateral de cada aresta do perfil (à direita do sentido do anel, nos dois sentidos de anel).
        let normais: Vec<P3> = (0..n)
            .map(|i| {
                let (a, b) = (anel[i], anel[(i + 1) % n]);
                let (dx, dy) = (b[0] - a[0], b[1] - a[1]);
                let e = [dx * q.ex[0] + dy * q.ey[0], dx * q.ex[1] + dy * q.ey[1], dx * q.ex[2] + dy * q.ey[2]];
                let fora = [dy * q.ex[0] - dx * q.ey[0], dy * q.ex[1] - dx * q.ey[1], dy * q.ex[2] - dx * q.ey[2]];
                let m = vetorial(e, q.eixo);
                unit(if esc(m, fora) < 0.0 { [-m[0], -m[1], -m[2]] } else { m })
            })
            .collect();
        for i in 0..n {
            if mostra(normais[(i + n - 1) % n], normais[i]) {
                recorta(q.ponto(anel[i], 0.0), q.ponto(anel[i], 1.0));
            }
            for (s, tampa) in [(0.0, tampas[0]), (1.0, tampas[1])] {
                if mostra(normais[i], tampa) {
                    recorta(q.ponto(anel[i], s), q.ponto(anel[(i + 1) % n], s));
                }
            }
        }
    }
    out
}

/// Consulta 202 `estr_corte`.
pub fn consulta_estr_corte(cena: &Cena, nivel: u32, o: P2, d: P2, profundidade: f64) -> Result<Vec<Saida>, u32> {
    let l = d[0].hypot(d[1]);
    if l < 1e-12 || profundidade < 0.0 {
        return Ok(achatar(&[]));
    }
    let d = [d[0] / l, d[1] / l];
    let pl = Plano { o, d, n: [-d[1], d[0]] };
    let normal = [pl.n[0], pl.n[1], 0.0];
    let c = pl.n[0] * o[0] + pl.n[1] * o[1];
    let mut out = Vec::new();
    for e in elementos_aparados(cena, nivel, 2) {
        for p in &e.pecas {
            let ts = [0.0, 1.0].iter().flat_map(|&s| p.contorno.anel.iter().map(move |&v| (v, s))).map(|(v, s)| pl.t(p.quadro.ponto(v, s)));
            let (tmin, tmax) = ts.fold((f64::INFINITY, f64::NEG_INFINITY), |a, t| (a.0.min(t), a.1.max(t)));
            if tmax < 0.0 || tmin > profundidade {
                continue;
            }
            let linha = |estilo: u32, papel: u32, fechada: bool, pontos: Vec<P2>| LinhaEstr { elemento: e.num, categoria: e.categoria, estilo, papel, fechada, pontos };
            if tmin <= 0.0 {
                for (furo, anel) in secao(&p.contorno, &p.quadro, normal, c) {
                    out.push(linha(ESTILO_CHEIO, if furo { PAPEL_FURO } else { PAPEL_ANEL }, true, anel.iter().map(|&w| pl.sz(w)).collect()));
                }
            }
            for [a, b] in arestas(&p.contorno, &p.quadro, &pl, profundidade) {
                out.push(linha(ESTILO_TRACEJADO, PAPEL_PROJETADO, false, vec![a, b]));
            }
        }
    }
    Ok(achatar(&out))
}
