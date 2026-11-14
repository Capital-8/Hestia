//! Terreno (PLANO do terreno A.4 regra 11): corte vertical, consulta 164 (`terreno_corte`).
//!
//! Mesma convenção de `guarda_corte` (`gc_corte.rs`): plano vertical por `(ox, oy)` na direção `(dx, dy)`; saída em `(s, z)`, com `s` ao longo de `(dx, dy)`
//! normalizada; enxerga-se para a normal esquerda `(-dy, dx)` até `profundidade`. Direção nula ou profundidade negativa não geram nada.
//!
//! - **papel 0, cortado**: a interseção do plano com a superfície, ordenada por `s`, fechada por baixo em `z_base = min(z) − espessura_base`. Um polígono
//!   por trecho contínuo: os pontos do perfil em `s` crescente e, por fim, `(s_fim, z_base)` e `(s_início, z_base)`. Não repete o primeiro ponto.
//! - **papel 1, perfil existente**: só existe quando há plataforma ou região nivelada (ficha R3). Aqui nunca é emitido.
//! - **papel 2, silhueta**: envoltória superior da parte da superfície no lado visível até `profundidade`. `FAIXAS` faixas iguais de `s` na extensão do
//!   terreno; cada aresta, recortada à faixa visível, atualiza o máximo das faixas que cobre; sai uma polilinha por trecho contínuo de faixas com dado, com
//!   um ponto por faixa `(s do meio da faixa, z máximo)`. Trecho de uma faixa só não sai (não forma linha).
//!
//! Vértice exatamente sobre o plano conta como do lado visível (a mesma regra única das curvas de nível), e cada ponto do perfil é calculado sempre do
//! vértice de trás para o da frente da aresta: os dois triângulos de uma aresta chegam ao mesmo ponto, bit a bit.

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::terreno_avalia::Malha;
use crate::terreno_curvas::{QUANTO, SEGMENTO_MIN};
use crate::terreno_tipos::{existente, terrenos_do_nivel};

/// `papel` das linhas da consulta 164.
pub const PAPEL_CORTADO: u32 = 0;
pub const PAPEL_PERFIL_EXISTENTE: u32 = 1;
pub const PAPEL_SILHUETA: u32 = 2;

/// Número de faixas de `s` da silhueta.
pub const FAIXAS: usize = 2048;

/// Plano de corte, com a direção já normalizada.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Plano {
    ox: f64,
    oy: f64,
    ux: f64,
    uy: f64,
}

impl Plano {
    /// `None` se a direção é nula (menor que `1e-12`), como em `guarda_corte`.
    pub fn novo(ox: f64, oy: f64, dx: f64, dy: f64) -> Option<Plano> {
        let l = dx.hypot(dy);
        if l < 1e-12 || !l.is_finite() {
            return None;
        }
        Some(Plano { ox, oy, ux: dx / l, uy: dy / l })
    }

    /// `(s, t)`: posição ao longo do plano e distância com sinal a ele (positiva = lado visível).
    pub fn st(&self, x: f64, y: f64) -> (f64, f64) {
        let (rx, ry) = (x - self.ox, y - self.oy);
        (rx * self.ux + ry * self.uy, -rx * self.uy + ry * self.ux)
    }

    /// `[s, t, z]` de um vértice.
    fn stz(&self, p: [f64; 3]) -> [f64; 3] {
        let (s, t) = self.st(p[0], p[1]);
        [s, t, p[2]]
    }
}

/// Ponto `(s, z)` em que a aresta de `tras` (`t < 0`) a `frente` (`t ≥ 0`) fura o plano.
fn furo(tras: [f64; 3], frente: [f64; 3]) -> [f64; 2] {
    let k = ((0.0 - tras[1]) / (frente[1] - tras[1])).clamp(0.0, 1.0);
    if k >= 1.0 {
        return [frente[0], frente[2]];
    }
    [tras[0] + (frente[0] - tras[0]) * k, tras[2] + (frente[2] - tras[2]) * k]
}

/// Perfil da malha no plano: um trecho contínuo por item, cada um com os pontos `(s, z)` em `s` crescente.
pub fn perfil(m: &Malha, pl: &Plano) -> Vec<Vec<[f64; 2]>> {
    let mut segs: Vec<([f64; 2], [f64; 2])> = Vec::new();
    for t in &m.t {
        let p = t.map(|i| pl.stz(m.v[i as usize]));
        let frente = p.map(|q| q[1] >= 0.0);
        if frente[0] == frente[1] && frente[1] == frente[2] {
            continue;
        }
        let mut pontas = [[0.0; 2]; 2];
        let mut n = 0;
        for i in 0..3 {
            let j = (i + 1) % 3;
            if frente[i] != frente[j] && n < 2 {
                pontas[n] = if frente[j] { furo(p[i], p[j]) } else { furo(p[j], p[i]) };
                n += 1;
            }
        }
        let (a, b) = if pontas[0][0] <= pontas[1][0] { (pontas[0], pontas[1]) } else { (pontas[1], pontas[0]) };
        if n == 2 && b[0] - a[0] >= SEGMENTO_MIN {
            segs.push((a, b));
        }
    }
    segs.sort_by(|x, y| x.0[0].total_cmp(&y.0[0]).then(x.1[0].total_cmp(&y.1[0])));
    let mut out: Vec<Vec<[f64; 2]>> = Vec::new();
    for (a, b) in segs {
        match out.last_mut() {
            Some(trecho) if a[0] - trecho[trecho.len() - 1][0] <= QUANTO => {
                let fim = trecho[trecho.len() - 1][0];
                if a[0] > fim {
                    trecho.push(a);
                }
                if b[0] > fim {
                    trecho.push(b);
                }
            }
            _ => out.push(vec![a, b]),
        }
    }
    out
}

/// Silhueta (envoltória superior) da parte da malha com `0 ≤ t ≤ profundidade`: uma polilinha `(s, z)` por trecho contínuo de faixas com dado.
pub fn silhueta(m: &Malha, pl: &Plano, profundidade: f64) -> Vec<Vec<[f64; 2]>> {
    let (mut s_min, mut s_max) = (f64::INFINITY, f64::NEG_INFINITY);
    for t in &m.t {
        for &i in t {
            let s = pl.st(m.v[i as usize][0], m.v[i as usize][1]).0;
            s_min = s_min.min(s);
            s_max = s_max.max(s);
        }
    }
    let w = (s_max - s_min) / FAIXAS as f64;
    if !(w > 0.0 && w.is_finite()) {
        return Vec::new();
    }
    let faixa = |s: f64| (((s - s_min) / w).floor().max(0.0) as usize).min(FAIXAS - 1);
    let mut topo = vec![f64::NEG_INFINITY; FAIXAS];
    for t in &m.t {
        let p = t.map(|i| pl.stz(m.v[i as usize]));
        for i in 0..3 {
            let Some((a, b)) = recortar(p[i], p[(i + 1) % 3], profundidade) else { continue };
            let (a, b) = if a[0] <= b[0] { (a, b) } else { (b, a) };
            let ds = b[0] - a[0];
            // A interpolação é presa entre as cotas das pontas: o arredondamento não cria cota acima da maior do terreno.
            let (z_lo, z_hi) = (a[1].min(b[1]), a[1].max(b[1]));
            let z_em = |s: f64| if ds > 0.0 { (a[1] + (b[1] - a[1]) * ((s - a[0]) / ds).clamp(0.0, 1.0)).clamp(z_lo, z_hi) } else { z_hi };
            for (j, z) in topo.iter_mut().enumerate().take(faixa(b[0]) + 1).skip(faixa(a[0])) {
                let (esq, dir) = (s_min + j as f64 * w, s_min + (j + 1) as f64 * w);
                *z = z.max(z_em(esq.max(a[0]))).max(z_em(dir.min(b[0])));
            }
        }
    }
    let mut out: Vec<Vec<[f64; 2]>> = Vec::new();
    let mut atual: Vec<[f64; 2]> = Vec::new();
    for (j, &z) in topo.iter().enumerate() {
        if z > f64::NEG_INFINITY {
            atual.push([s_min + (j as f64 + 0.5) * w, z]);
        } else if !atual.is_empty() {
            out.push(std::mem::take(&mut atual));
        }
    }
    out.push(atual);
    out.retain(|l| l.len() >= 2);
    out
}

/// Recorta a aresta `a`–`b` (`[s, t, z]`) à faixa `0 ≤ t ≤ profundidade`. Devolve as pontas `(s, z)` do que sobra.
fn recortar(a: [f64; 3], b: [f64; 3], profundidade: f64) -> Option<([f64; 2], [f64; 2])> {
    let dt = b[1] - a[1];
    let (u0, u1) = if dt == 0.0 {
        if a[1] < 0.0 || a[1] > profundidade {
            return None;
        }
        (0.0, 1.0)
    } else {
        let (x, y) = ((0.0 - a[1]) / dt, (profundidade - a[1]) / dt);
        (x.min(y).max(0.0), x.max(y).min(1.0))
    };
    if u0 > u1 || u0.is_nan() || u1.is_nan() {
        return None;
    }
    let em = |u: f64| [a[0] + (b[0] - a[0]) * u, (a[2] + (b[2] - a[2]) * u).clamp(a[2].min(b[2]), a[2].max(b[2]))];
    Some((em(u0), em(u1)))
}

/// Linhas do corte de uma malha: `(papel, fechada, pontos)`, os polígonos cortados (por `s`) e depois as silhuetas.
pub fn corte_da_malha(m: &Malha, pl: &Plano, profundidade: f64, espessura_base: f64) -> Vec<(u32, bool, Vec<[f64; 2]>)> {
    let Some((z_min, _)) = m.z_min_max().filter(|_| !m.t.is_empty()) else { return Vec::new() };
    let z_base = z_min - espessura_base;
    let mut out = Vec::new();
    for mut p in perfil(m, pl) {
        let (s0, s1) = (p[0][0], p[p.len() - 1][0]);
        p.push([s1, z_base]);
        p.push([s0, z_base]);
        out.push((PAPEL_CORTADO, true, p));
    }
    out.extend(silhueta(m, pl, profundidade).into_iter().map(|p| (PAPEL_SILHUETA, false, p)));
    out
}

/// Consulta 164 (`terreno_corte`): terrenos do nível por `id_num` crescente.
pub fn consulta_terreno_corte(cena: &Cena, nivel: u32, plano: [f64; 4], profundidade: f64) -> Result<Vec<Saida>, u32> {
    let (mut linhas, mut pontos) = (Vec::new(), Vec::new());
    if let Some(pl) = Plano::novo(plano[0], plano[1], plano[2], plano[3]).filter(|_| profundidade >= 0.0) {
        for t in terrenos_do_nivel(&cena.terreno, nivel) {
            let e = existente(cena, t)?;
            let espessura = cena.terreno.terrenos.get(&t).map_or(0.0, |l| l.espessura_base);
            for (papel, fechada, p) in corte_da_malha(&e.e, &pl, profundidade, espessura) {
                linhas.extend_from_slice(&[t, papel, u32::from(fechada), p.len() as u32]);
                pontos.extend(p.iter().flatten());
            }
        }
    }
    Ok(vec![Saida::U32(linhas), Saida::F64(pontos)])
}

#[cfg(test)]
mod testes {
    use super::*;

    /// Quadrado 0..2 em dois triângulos, com z = x.
    fn quadrado() -> Malha {
        let v = vec![[0.0, 0.0, 0.0], [2.0, 0.0, 2.0], [2.0, 2.0, 2.0], [0.0, 2.0, 0.0]];
        Malha::nova(v, vec![0, 1, 2, 3], vec![[0, 1, 2], [0, 2, 3]], Vec::new())
    }

    #[test]
    fn plano_tem_a_convencao_de_guarda_corte() {
        let pl = Plano::novo(1.0, 2.0, 0.0, 3.0).expect("plano");
        assert_eq!(pl.st(1.0, 5.0), (3.0, 0.0), "s ao longo da direção normalizada");
        assert_eq!(pl.st(0.0, 2.0), (0.0, 1.0), "a normal esquerda de +y é −x: lado visível");
        assert_eq!(pl.st(4.0, 2.0).1, -3.0);
        assert_eq!(Plano::novo(0.0, 0.0, 0.0, 0.0), None);
        assert_eq!(Plano::novo(0.0, 0.0, 1e-13, 0.0), None);
        assert_eq!(pl.stz([1.0, 5.0, 7.0]), [3.0, 0.0, 7.0]);
    }

    #[test]
    fn furo_e_recorte() {
        assert_eq!(furo([0.0, -1.0, 0.0], [4.0, 1.0, 8.0]), [2.0, 4.0]);
        assert_eq!(furo([0.0, -1.0, 0.0], [4.0, 0.0, 8.0]), [4.0, 8.0], "vértice sobre o plano: o próprio vértice");
        let (a, b) = ([0.0, -1.0, 0.0], [4.0, 3.0, 8.0]);
        assert_eq!(recortar(a, b, 1.0), Some(([1.0, 2.0], [2.0, 4.0])));
        assert_eq!(recortar(b, a, 1.0), Some(([2.0, 4.0], [1.0, 2.0])));
        assert_eq!(recortar(a, b, 10.0), Some(([1.0, 2.0], [4.0, 8.0])));
        assert_eq!(recortar([0.0, 2.0, 0.0], [1.0, 3.0, 0.0], 1.0), None, "além da profundidade");
        assert_eq!(recortar([0.0, -2.0, 0.0], [1.0, -1.0, 0.0], 1.0), None, "atrás do plano");
        assert_eq!(recortar([0.0, 0.5, 1.0], [1.0, 0.5, 2.0], 1.0), Some(([0.0, 1.0], [1.0, 2.0])), "paralela ao plano, dentro");
        assert_eq!(recortar([0.0, 1.5, 1.0], [1.0, 1.5, 2.0], 1.0), None, "paralela ao plano, fora");
    }

    #[test]
    fn perfil_e_poligono_do_quadrado() {
        let m = quadrado();
        let pl = Plano::novo(-1.0, 0.5, 1.0, 0.0).expect("plano");
        assert_eq!(perfil(&m, &pl), vec![vec![[1.0, 0.0], [1.5, 0.5], [3.0, 2.0]]], "s = x + 1; quebra na diagonal");
        let c = corte_da_malha(&m, &pl, 0.0, 1.0);
        assert_eq!(c[0], (PAPEL_CORTADO, true, vec![[1.0, 0.0], [1.5, 0.5], [3.0, 2.0], [3.0, -1.0], [1.0, -1.0]]));
        assert!(perfil(&m, &Plano::novo(0.0, 5.0, 1.0, 0.0).expect("plano")).is_empty(), "plano fora da malha");
        assert!(corte_da_malha(&Malha::default(), &pl, 1.0, 1.0).is_empty());
        // Dois triângulos separados na linha do corte: dois trechos.
        let v = vec![[0.0, 0.0, 1.0], [1.0, 0.0, 1.0], [0.0, 1.0, 1.0], [5.0, 0.0, 2.0], [6.0, 0.0, 2.0], [5.0, 1.0, 2.0]];
        let dois = Malha::nova(v, vec![0; 6], vec![[0, 1, 2], [3, 4, 5]], Vec::new());
        let p = perfil(&dois, &Plano::novo(0.0, 0.5, 1.0, 0.0).expect("plano"));
        assert_eq!(p, vec![vec![[0.0, 1.0], [0.5, 1.0]], vec![[5.0, 2.0], [5.5, 2.0]]]);
    }

    #[test]
    fn silhueta_do_quadrado() {
        let m = quadrado();
        let pl = Plano::novo(0.0, -1.0, 1.0, 0.0).expect("plano");
        let s = silhueta(&m, &pl, 10.0);
        assert_eq!(s.len(), 1);
        assert_eq!(s[0].len(), FAIXAS);
        let w = 2.0 / FAIXAS as f64;
        assert!((s[0][0][0] - w / 2.0).abs() < 1e-12 && (s[0][0][1] - w).abs() < 1e-12, "meio da faixa e o máximo dela");
        assert!((s[0][FAIXAS - 1][1] - 2.0).abs() < 1e-12);
        assert!(silhueta(&m, &pl, 0.5).is_empty(), "o terreno começa além da profundidade");
        assert!(silhueta(&m, &Plano::novo(0.0, -1.0, -1.0, 0.0).expect("plano"), 10.0).is_empty(), "olhando para o outro lado");
        assert!(silhueta(&Malha::default(), &pl, 10.0).is_empty());
        // Profundidade que pega só a metade de baixo (y de 0 a 1): a envoltória é a mesma, porque z = x.
        let meia = silhueta(&m, &pl, 2.0);
        assert_eq!(meia.len(), 1);
        assert!((meia[0][FAIXAS - 1][1] - 2.0).abs() < 1e-12);
        let c = corte_da_malha(&m, &pl, 10.0, 1.0);
        assert_eq!(c.iter().map(|l| (l.0, l.1)).collect::<Vec<_>>(), vec![(PAPEL_SILHUETA, false)]);
    }
}
