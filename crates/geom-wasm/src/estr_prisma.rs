//! Prisma da estrutura (docs/estrutura/PLANO.md, A.4.1 e A.4.2; ficha K2): triangulação de polígono com furos (pontes e orelhas, sem dependência) e
//! extrusão de um perfil (anel e furos) ao longo de um eixo, com as duas tampas. Usado pelo pilar e pela viga (K2) e pela fundação (K3).
//!
//! O sólido sai fechado e orientado para fora: cada aresta em exatamente dois triângulos, com sentidos opostos. Os vértices são compartilhados
//! (os da base e os do topo, um por vértice do perfil) e não passam pela grade de soldagem: o volume da malha é o do prisma até o arredondamento
//! do `f64`.

use crate::esquema::ENTRADA;
use crate::estr_perfil::P2;
use crate::gc_malha::PecaMalha;

pub type P3 = [f64; 3];

fn cruz(a: P2, b: P2, c: P2) -> f64 {
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

/// `p` dentro ou na borda do triângulo `abc` (qualquer orientação).
fn no_triangulo(a: P2, b: P2, c: P2, p: P2) -> bool {
    let (d1, d2, d3) = (cruz(a, b, p), cruz(b, c, p), cruz(c, a, p));
    let neg = d1 < 0.0 || d2 < 0.0 || d3 < 0.0;
    let pos = d1 > 0.0 || d2 > 0.0 || d3 > 0.0;
    !(neg && pos)
}

/// A direção `p → alvo` entra no interior do polígono (anti-horário) no vértice `p`, de vizinhos `a` (anterior) e `b` (seguinte).
fn localmente_dentro(a: P2, p: P2, b: P2, alvo: P2) -> bool {
    let d = [alvo[0] - p[0], alvo[1] - p[1]];
    let lado_b = (b[0] - p[0]) * d[1] - (b[1] - p[1]) * d[0];
    let lado_a = d[0] * (a[1] - p[1]) - d[1] * (a[0] - p[0]);
    if cruz(a, p, b) > 0.0 {
        lado_b > 0.0 && lado_a > 0.0
    } else {
        lado_b > 0.0 || lado_a > 0.0
    }
}

/// Vizinhos da posição `i` na lista circular.
fn viz(lista: &[usize], i: usize) -> (usize, usize) {
    let n = lista.len();
    (lista[(i + n - 1) % n], lista[(i + 1) % n])
}

/// Posição na lista do vértice que liga o furo cujo vértice de maior x é `m` (raio para +x; polígono anti-horário, furos já ligados inclusive).
fn ponte(pts: &[P2], lista: &[usize], m: P2) -> Option<usize> {
    let n = lista.len();
    let (mut qx, mut alvo) = (f64::INFINITY, None);
    for i in 0..n {
        let (p, q) = (pts[lista[i]], pts[lista[(i + 1) % n]]);
        // Do lado direito do interior a borda sobe (o interior fica à esquerda dela).
        if p[1] <= m[1] && m[1] <= q[1] && p[1] != q[1] {
            let x = p[0] + (m[1] - p[1]) * (q[0] - p[0]) / (q[1] - p[1]);
            if x >= m[0] && x < qx {
                qx = x;
                alvo = Some(if p[0] > q[0] { i } else { (i + 1) % n });
            }
        }
    }
    let mut melhor = alvo?;
    let pm = pts[lista[melhor]];
    let i_raio = [qx, m[1]];
    let mut tan_min = f64::INFINITY;
    // Vértices dentro do triângulo (m, ponto do raio, alvo) podem esconder o alvo: o de menor ângulo com o raio vence.
    for (i, &k) in lista.iter().enumerate() {
        let p = pts[k];
        if p[0] > m[0] && p[0] <= pm[0] && no_triangulo(m, i_raio, pm, p) {
            let (a, b) = viz(lista, i);
            if !localmente_dentro(pts[a], p, pts[b], m) {
                continue;
            }
            let tan = (m[1] - p[1]).abs() / (p[0] - m[0]);
            if tan < tan_min || (tan == tan_min && p[0] < pts[lista[melhor]][0]) {
                (melhor, tan_min) = (i, tan);
            }
        }
    }
    Some(melhor)
}

/// Triangulação do polígono de anéis `aneis` (o primeiro anti-horário, os furos horários; nenhum anel toca outro). Os índices são os da
/// concatenação dos anéis; os triângulos saem anti-horários. Entrada degenerada: `ENTRADA`, nunca pânico.
pub fn triangular(aneis: &[Vec<P2>]) -> Result<Vec<[u32; 3]>, u32> {
    let pts: Vec<P2> = aneis.iter().flatten().copied().collect();
    let externo = aneis.first().filter(|a| a.len() >= 3).ok_or(ENTRADA)?;
    if pts.iter().any(|p| !p[0].is_finite() || !p[1].is_finite()) || u32::try_from(pts.len()).is_err() {
        return Err(ENTRADA);
    }
    let mut lista: Vec<usize> = (0..externo.len()).collect();
    // Furos em ordem decrescente do maior x: cada um liga ao que já está na lista.
    let mut furos: Vec<(usize, usize, usize)> = Vec::new();
    let mut ini = externo.len();
    for f in &aneis[1..] {
        if f.len() < 3 {
            return Err(ENTRADA);
        }
        let m = (ini..ini + f.len()).fold(ini, |m, k| if pts[k][0] > pts[m][0] { k } else { m });
        furos.push((ini, f.len(), m));
        ini += f.len();
    }
    furos.sort_by(|a, b| pts[b.2][0].total_cmp(&pts[a.2][0]).then(a.2.cmp(&b.2)));
    for (ini, n, m) in furos {
        let pos = ponte(&pts, &lista, pts[m]).ok_or(ENTRADA)?;
        let p = lista[pos];
        let mut novo = Vec::with_capacity(lista.len() + n + 2);
        novo.extend_from_slice(&lista[..=pos]);
        novo.extend((0..=n).map(|k| ini + (m - ini + k) % n));
        novo.push(p);
        novo.extend_from_slice(&lista[pos + 1..]);
        lista = novo;
    }
    orelhas(&pts, lista)
}

/// Corte de orelhas sobre a lista (com os vértices duplicados das pontes).
fn orelhas(pts: &[P2], mut lista: Vec<usize>) -> Result<Vec<[u32; 3]>, u32> {
    let mut saida = Vec::with_capacity(lista.len());
    let t = |a: usize, b: usize, c: usize| [a as u32, b as u32, c as u32];
    while lista.len() > 3 {
        let n = lista.len();
        let reflexos: Vec<usize> = (0..n).filter(|&i| { let (a, b) = viz(&lista, i); cruz(pts[a], pts[lista[i]], pts[b]) <= 0.0 }).collect();
        let orelha = |i: usize| {
            let (a, b) = viz(&lista, i);
            let (pa, pb, pc) = (pts[a], pts[lista[i]], pts[b]);
            cruz(pa, pb, pc) > 0.0
                && !reflexos.iter().any(|&k| {
                    let q = pts[lista[k]];
                    q != pa && q != pb && q != pc && no_triangulo(pa, pb, pc, q)
                })
        };
        // Sem orelha (só por arredondamento): tira um vértice colinear, depois qualquer convexo.
        let i = (0..n)
            .find(|&i| orelha(i))
            .or_else(|| (0..n).find(|&i| { let (a, b) = viz(&lista, i); cruz(pts[a], pts[lista[i]], pts[b]) == 0.0 }))
            .or_else(|| (0..n).find(|&i| { let (a, b) = viz(&lista, i); cruz(pts[a], pts[lista[i]], pts[b]) > 0.0 }))
            .ok_or(ENTRADA)?;
        let (a, b) = viz(&lista, i);
        saida.push(t(a, lista[i], b));
        lista.remove(i);
    }
    if let [a, b, c] = lista[..] {
        saida.push(t(a, b, c));
    }
    Ok(saida)
}

/// Sistema do prisma: o ponto do perfil `(x, y)` na altura `s ∈ [0, 1]` vai para `origem + x·ex + y·ey + s·eixo`. `ex` e `ey` unitários e
/// perpendiculares ao `eixo` (que leva o comprimento). Com `(ex × ey)·eixo < 0` o sólido sai igualmente orientado para fora.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Quadro3 {
    pub origem: P3,
    pub ex: P3,
    pub ey: P3,
    pub eixo: P3,
}

impl Quadro3 {
    pub fn ponto(&self, p: P2, s: f64) -> P3 {
        let c = |k: usize| self.origem[k] + p[0] * self.ex[k] + p[1] * self.ey[k] + s * self.eixo[k];
        [c(0), c(1), c(2)]
    }

    /// `(ex × ey)·eixo`.
    pub fn orientacao(&self) -> f64 {
        let (a, b, e) = (self.ex, self.ey, self.eixo);
        (a[1] * b[2] - a[2] * b[1]) * e[0] + (a[2] * b[0] - a[0] * b[2]) * e[1] + (a[0] * b[1] - a[1] * b[0]) * e[2]
    }
}

/// Extrusão dos anéis (externo anti-horário, furos horários) pelo quadro, com as tampas `tampas` (de `triangular` sobre os mesmos anéis).
/// Quadro degenerado (eixo nulo ou paralelo ao perfil) ou coordenada não finita: `ENTRADA`.
pub fn extrudar(aneis: &[Vec<P2>], tampas: &[[u32; 3]], q: &Quadro3) -> Result<PecaMalha, u32> {
    let o = q.orientacao();
    if !o.is_finite() || o.abs() < 1e-12 {
        return Err(ENTRADA);
    }
    let n: usize = aneis.iter().map(Vec::len).sum();
    let nn = u32::try_from(n).map_err(|_| ENTRADA)?;
    if tampas.iter().flatten().any(|&k| k >= nn) {
        return Err(ENTRADA);
    }
    let mut peca = PecaMalha { vertices: Vec::with_capacity(2 * n), triangulos: Vec::with_capacity(2 * n + 2 * tampas.len()) };
    for s in [0.0, 1.0] {
        peca.vertices.extend(aneis.iter().flatten().map(|&p| q.ponto(p, s)));
    }
    if peca.vertices.iter().flatten().any(|c| !c.is_finite()) {
        return Err(ENTRADA);
    }
    let mut tri = |t: [u32; 3]| peca.triangulos.push(if o > 0.0 { t } else { [t[0], t[2], t[1]] });
    let mut ini = 0u32;
    for a in aneis {
        let k = a.len() as u32;
        for i in 0..k {
            let (p, r) = (ini + i, ini + (i + 1) % k);
            tri([p, r, r + nn]);
            tri([p, r + nn, p + nn]);
        }
        ini += k;
    }
    for t in tampas {
        tri([t[0] + nn, t[1] + nn, t[2] + nn]);
        tri([t[0], t[2], t[1]]);
    }
    Ok(peca)
}

/// Volume com sinal da peça (positivo quando as normais apontam para fora).
pub fn volume(p: &PecaMalha) -> f64 {
    let v = |k: u32| p.vertices.get(k as usize).copied();
    p.triangulos
        .iter()
        .filter_map(|t| Some((v(t[0])?, v(t[1])?, v(t[2])?)))
        .map(|(a, b, c)| (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6.0)
        .sum()
}

/// Área (soma dos triângulos) de uma triangulação 2D.
pub fn area_triangulada(aneis: &[Vec<P2>], tampas: &[[u32; 3]]) -> f64 {
    let pts: Vec<P2> = aneis.iter().flatten().copied().collect();
    let v = |k: u32| pts.get(k as usize).copied();
    tampas.iter().filter_map(|t| Some(cruz(v(t[0])?, v(t[1])?, v(t[2])?) / 2.0)).sum()
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::estr_malha::{quadro_pilar, PerfilMalha};
    use crate::estr_perfil::{area_com_sinal, orientados, validar_aneis};
    use crate::secoes_estr::PilarLinha;
    use crate::teste_util::Xorshift;

    const NAN: f64 = f64::NAN;

    fn rel(a: f64, b: f64) -> f64 {
        (a - b).abs() / b.abs().max(1e-300)
    }

    fn fechada(p: &PecaMalha) -> bool {
        let mut d = std::collections::BTreeMap::new();
        for t in &p.triangulos {
            for k in 0..3 {
                *d.entry((t[k], t[(k + 1) % 3])).or_insert(0) += 1;
            }
        }
        !d.is_empty() && d.iter().all(|(&(a, b), &n)| n == 1 && d.get(&(b, a)) == Some(&1))
    }

    fn pilar(_tipo: u32, altura: f64) -> PilarLinha {
        PilarLinha { nivel: 0, tipo: 1, disciplina: 1, pos: [1.0, 2.0], rotacao: 0.3, deslocamento_base: 0.0, nivel_topo: u32::MAX, deslocamento_topo: 0.0, altura, hosp: u32::MAX }
    }

    #[test]
    fn triangulacao_de_concavos_e_degenerados() {
        // Pente (muitos vértices reflexos) e o quadrado com furo encostado à direita.
        let mut pente = vec![[0.0, 0.0], [10.0, 0.0], [10.0, 3.0]];
        for k in (0..10).rev() {
            pente.extend([[k as f64 + 0.9, 3.0], [k as f64 + 0.5, 1.0], [k as f64 + 0.1, 3.0]]);
        }
        let t = triangular(&[pente.clone()]).expect("pente");
        assert_eq!(t.len(), pente.len() - 2);
        assert!(rel(area_triangulada(&[pente.clone()], &t), area_com_sinal(&pente)) < 1e-12);
        assert_eq!(triangular(&[]), Err(ENTRADA));
        assert_eq!(triangular(&[vec![[0.0, 0.0], [1.0, 0.0]]]), Err(ENTRADA));
        assert_eq!(triangular(&[vec![[0.0, 0.0], [NAN, 0.0], [0.0, 1.0]]]), Err(ENTRADA));
        // Furo fora do anel: sem ponte, ENTRADA.
        let q = vec![[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]];
        assert_eq!(triangular(&[q, vec![[3.0, 0.2], [3.0, 0.4], [2.5, 0.3]]]), Err(ENTRADA));
    }

    #[test]
    fn triangulacao_aleatoria_com_furos_alinhados() {
        let mut r = Xorshift::novo(7);
        for rodada in 0..60 {
            // Anel estrelado (simples) de raio entre 2 e 3 e furos numa grade (mesmo x máximo por coluna, o caso das pontes empatadas).
            let n = 3 + (r.proximo() % 40) as usize;
            let anel: Vec<P2> = (0..n)
                .map(|k| {
                    let (a, raio) = (std::f64::consts::TAU * k as f64 / n as f64, r.intervalo(2.0, 3.0));
                    [raio * a.cos(), raio * a.sin()]
                })
                .collect();
            let mut aneis = vec![anel];
            let lados = 3 + (r.proximo() % 6) as usize;
            for i in -1..=1 {
                for j in -1..=1 {
                    if !r.proximo().is_multiple_of(3) {
                        let (cx, cy, raio) = (i as f64 * 0.45, j as f64 * 0.45, 0.2);
                        aneis.push((0..lados).rev().map(|k| { let a = std::f64::consts::TAU * k as f64 / lados as f64; [cx + raio * a.cos(), cy + raio * a.sin()] }).collect());
                    }
                }
            }
            validar_aneis(&aneis).expect("anéis válidos");
            let c = orientados(&aneis, [0.0, 0.0]).expect("orientados");
            let pm = PerfilMalha::de(c).expect("triangula");
            let area = pm.contorno.area();
            assert!(rel(area_triangulada(&pm.aneis, &pm.tampas), area) < 1e-9, "rodada {rodada}");
            assert!(pm.tampas.iter().all(|t| { let p = |k: u32| pm.aneis.iter().flatten().nth(k as usize).copied().unwrap_or([0.0; 2]); let (a, b, c) = (p(t[0]), p(t[1]), p(t[2])); (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) >= 0.0 }), "triângulos anti-horários");
            let peca = pm.extrudar(&quadro_pilar(&pilar(1, 1.0), 0.0, 1.0)).expect("prisma");
            assert!(fechada(&peca), "rodada {rodada}");
            assert!(rel(volume(&peca), area) < 1e-9);
        }
    }
}
