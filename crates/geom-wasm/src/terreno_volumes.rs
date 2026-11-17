//! Terreno (PLANO do terreno A.4 regras 12 e 13): volumes de corte e aterro, consulta 166 (`quant_terreno_regioes`) e o mapa de corte e aterro, consulta 167
//! (`terreno_corte_aterro`).
//!
//! Só os triângulos "ativos" de P entram: algum vértice com `|zP − E| > 1e-9`, ou centroide a no máximo `D` de alguma região plana. Cada um é dividido em
//! 16 subtriângulos iguais (malha 4 × 4); a diferença `P − E` é avaliada nos 3 cantos de cada subtriângulo (P é linear no triângulo; E é a regra 4) e as
//! partes positiva e negativa são integradas em forma fechada (função linear sobre triângulo, cortada na linha de zero). Corte = ∫ max(E − P, 0); aterro =
//! ∫ max(P − E, 0). O volume de um triângulo ativo vai para a região PLANA de menor distância ao centroide (empate: a de maior `ordem`); subdivisão não
//! recebe volume.

use std::rc::Rc;

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::geo2d::v;
use crate::terreno_proposta::{proposta, Proposta, SEM_REGIAO};
use crate::terreno_tipos::terrenos_do_nivel;

/// Diferença `|zP − E|` (m) acima da qual o vértice de P conta como alterado.
pub const TOL_ATIVO: f64 = 1e-9;
/// Diferença média (m) acima da qual um subtriângulo entra no mapa de corte e aterro.
pub const TOL_MAPA: f64 = 0.01;
/// Divisões de cada lado do triângulo ativo (16 subtriângulos).
const DIVISOES: usize = 4;

/// Volumes de uma superfície proposta.
#[derive(Debug, Default)]
pub struct Volumes {
    pub corte: f64,
    pub aterro: f64,
    /// `[corte, aterro]` por região de `Proposta::regioes` (subdivisão: zeros).
    pub por_regiao: Vec<[f64; 2]>,
}

/// Integral de `max(f, 0)` sobre um triângulo de área 1, com `f` linear de valores `d` nos cantos.
pub fn parte_positiva(d: [f64; 3]) -> f64 {
    let mut s = d;
    s.sort_by(f64::total_cmp);
    if s[0] >= 0.0 {
        return (s[0] + s[1] + s[2]) / 3.0;
    }
    if s[2] <= 0.0 {
        return 0.0;
    }
    if s[1] <= 0.0 {
        // Só o canto mais alto é positivo: um triângulo semelhante, de lados s2/(s2 − s0) e s2/(s2 − s1), com média s2/3.
        return s[2] / (s[2] - s[0]) * s[2] / (s[2] - s[1]) * s[2] / 3.0;
    }
    // Só o canto mais baixo é negativo: integral de f mais a parte negativa trocada de sinal.
    (s[0] + s[1] + s[2]) / 3.0 + (-s[0]) / (s[1] - s[0]) * (-s[0]) / (s[2] - s[0]) * (-s[0]) / 3.0
}

/// Um subtriângulo ativo: região (posição em `regioes` ou `SEM_REGIAO`), cantos em planta e diferenças `P − E` nos cantos.
struct Sub {
    regiao: u32,
    area: f64,
    p: [[f64; 2]; 3],
    d: [f64; 3],
}

/// Percorre os subtriângulos dos triângulos ativos de P, na ordem dos triângulos.
fn percorrer(p: &Proposta, mut f: impl FnMut(&Sub)) {
    if !p.tem_plano() {
        return;
    }
    let (e, m) = (&p.e, &p.malha);
    let dif_v: Vec<f64> = m.v.iter().map(|q| e.cota(q[0], q[1]).map_or(0.0, |z| q[2] - z)).collect();
    let planas: Vec<usize> = (0..p.regioes.len()).filter(|&i| p.regioes[i].plana()).collect();
    for k in 0..m.t.len() {
        let t = m.t[k];
        let c = t.map(|i| m.v[i as usize]);
        let centro = v((c[0][0] + c[1][0] + c[2][0]) / 3.0, (c[0][1] + c[1][1] + c[2][1]) / 3.0);
        let ao_alcance = planas.iter().any(|&i| p.regioes[i].perto(centro, p.regioes[i].alcance) && p.regioes[i].distancia(centro) <= p.regioes[i].alcance);
        if !(ao_alcance || t.iter().any(|&i| dif_v[i as usize].abs() > TOL_ATIVO)) {
            continue;
        }
        let regiao = regiao_mais_proxima(p, &planas, centro);
        let area = m.area2(k) / 2.0;
        // Cantos da malha 4 × 4: `g[i][j]` com i + j ≤ 4, na combinação (4 − i − j, i, j) / 4 dos vértices.
        let mut xy = [[[0.0f64; 2]; DIVISOES + 1]; DIVISOES + 1];
        let mut dif = [[0.0f64; DIVISOES + 1]; DIVISOES + 1];
        for i in 0..=DIVISOES {
            for j in 0..=DIVISOES - i {
                let w = [(DIVISOES - i - j) as f64 / DIVISOES as f64, i as f64 / DIVISOES as f64, j as f64 / DIVISOES as f64];
                let (x, y, z) = (0..3).fold((0.0, 0.0, 0.0), |s, q| (s.0 + w[q] * c[q][0], s.1 + w[q] * c[q][1], s.2 + w[q] * c[q][2]));
                xy[i][j] = [x, y];
                dif[i][j] = e.cota(x, y).map_or(0.0, |ze| z - ze);
            }
        }
        let sub_area = area / (DIVISOES * DIVISOES) as f64;
        for i in 0..DIVISOES {
            for j in 0..DIVISOES - i {
                let cima = [(i, j), (i + 1, j), (i, j + 1)];
                f(&Sub { regiao, area: sub_area, p: cima.map(|(a, b)| xy[a][b]), d: cima.map(|(a, b)| dif[a][b]) });
                if i + j + 1 < DIVISOES {
                    let baixo = [(i + 1, j), (i + 1, j + 1), (i, j + 1)];
                    f(&Sub { regiao, area: sub_area, p: baixo.map(|(a, b)| xy[a][b]), d: baixo.map(|(a, b)| dif[a][b]) });
                }
            }
        }
    }
}

/// Posição da região plana de menor distância ao ponto (empate: a de maior `ordem`, que vem depois), ou `SEM_REGIAO` se não há região plana.
fn regiao_mais_proxima(p: &Proposta, planas: &[usize], centro: crate::geo2d::V) -> u32 {
    let mut melhor: Option<(usize, f64)> = None;
    for &i in planas {
        let d = p.regioes[i].distancia(centro);
        if melhor.is_none_or(|(_, dm)| d <= dm) {
            melhor = Some((i, d));
        }
    }
    melhor.map_or(SEM_REGIAO, |(i, _)| i as u32)
}

impl Proposta {
    /// Volumes de corte e aterro (regra 12), calculados uma vez por P.
    pub fn volumes(&self) -> Rc<Volumes> {
        Rc::clone(self.volumes.get_or_init(|| {
            let mut vol = Volumes { corte: 0.0, aterro: 0.0, por_regiao: vec![[0.0; 2]; self.regioes.len()] };
            percorrer(self, |s| {
                let corte = s.area * parte_positiva(s.d.map(|x| -x));
                let aterro = s.area * parte_positiva(s.d);
                vol.corte += corte;
                vol.aterro += aterro;
                if let Some(r) = vol.por_regiao.get_mut(s.regiao as usize) {
                    r[0] += corte;
                    r[1] += aterro;
                }
            });
            Rc::new(vol)
        }))
    }

    /// Área de superfície (3D) dos triângulos de P cuja região é a posição `i` de `regioes`.
    pub fn area_superficie_da_regiao(&self, i: usize) -> f64 {
        (0..self.malha.t.len()).filter(|&k| self.regiao_do_triangulo.get(k) == Some(&(i as u32))).map(|k| self.malha.area_triangulo(k)).sum()
    }
}

/// Consulta 166 (`quant_terreno_regioes`): por região, `[regiao_num, terreno_num]` e `[area_planta, area_superficie, volume_corte, volume_aterro]`. Terrenos do
/// nível por `id_num` crescente e, em cada um, as regiões por `id_num` crescente. `area_planta` é a área do polígono.
pub fn consulta_quant_terreno_regioes(cena: &Cena, nivel: u32) -> Result<Vec<Saida>, u32> {
    let (mut linhas, mut valores) = (Vec::new(), Vec::new());
    for t in terrenos_do_nivel(&cena.terreno, nivel) {
        let p = proposta(cena, t)?;
        let vol = p.volumes();
        let mut ordem: Vec<usize> = (0..p.regioes.len()).collect();
        ordem.sort_by_key(|&i| p.regioes[i].id);
        for i in ordem {
            linhas.extend_from_slice(&[p.regioes[i].id, t]);
            valores.extend_from_slice(&[p.regioes[i].area, p.area_superficie_da_regiao(i), vol.por_regiao[i][0], vol.por_regiao[i][1]]);
        }
    }
    Ok(vec![Saida::U32(linhas), Saida::F64(valores)])
}

/// Consulta 167 (`terreno_corte_aterro`): por terreno, um grupo de corte (tipo 0) e um de aterro (tipo 1), cada um só se tiver subtriângulos. Os pontos são
/// 3 por triângulo, anti-horários. Entram os subtriângulos com `|diferença média| > 0,01 m`.
pub fn consulta_terreno_corte_aterro(cena: &Cena, nivel: u32) -> Result<Vec<Saida>, u32> {
    let (mut grupos, mut pontos): (Vec<u32>, Vec<f64>) = (Vec::new(), Vec::new());
    for t in terrenos_do_nivel(&cena.terreno, nivel) {
        let p = proposta(cena, t)?;
        let mut por_tipo: [Vec<f64>; 2] = [Vec::new(), Vec::new()];
        percorrer(&p, |s| {
            let media = (s.d[0] + s.d[1] + s.d[2]) / 3.0;
            // Triângulo de P quase colinear (cruzamentos do pé do talude em fila) pode dar subtriângulo de área nula por arredondamento: fica fora do mapa.
            let area2 = (s.p[1][0] - s.p[0][0]) * (s.p[2][1] - s.p[0][1]) - (s.p[1][1] - s.p[0][1]) * (s.p[2][0] - s.p[0][0]);
            if media.abs() > TOL_MAPA && area2 > 0.0 {
                por_tipo[usize::from(media > 0.0)].extend(s.p.iter().flatten());
            }
        });
        for (tipo, l) in por_tipo.iter().enumerate() {
            if !l.is_empty() {
                grupos.extend_from_slice(&[t, tipo as u32, (pontos.len() / 2) as u32, (l.len() / 2) as u32]);
                pontos.extend_from_slice(l);
            }
        }
    }
    Ok(vec![Saida::U32(grupos), Saida::F64(pontos)])
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn parte_positiva_nos_quatro_casos() {
        assert!((parte_positiva([1.0, 2.0, 3.0]) - 2.0).abs() < 1e-15, "tudo positivo: a média");
        assert_eq!(parte_positiva([-1.0, -2.0, 0.0]), 0.0, "tudo negativo ou nulo");
        // Um canto positivo (3), os outros dois exatamente em −3 e 0: f vale 3 − 3·(u + v)... checado contra amostragem fina abaixo.
        let amostra = |d: [f64; 3]| -> f64 {
            let n = 800;
            let mut s = 0.0;
            for i in 0..n {
                for j in 0..n - i {
                    for (u, w) in [(i as f64 + 1.0 / 3.0, j as f64 + 1.0 / 3.0), (i as f64 + 2.0 / 3.0, j as f64 + 2.0 / 3.0)] {
                        if u + w <= n as f64 {
                            let (a, b) = (u / n as f64, w / n as f64);
                            s += (d[0] * (1.0 - a - b) + d[1] * a + d[2] * b).max(0.0);
                        }
                    }
                }
            }
            s / (n * n) as f64
        };
        for d in [[3.0, -3.0, 0.0], [3.0, -1.0, -2.0], [-2.0, 1.0, 4.0], [-1.0, 5.0, 0.5], [0.0, 0.0, 1.0], [-1.0, 0.0, 0.0]] {
            assert!((parte_positiva(d) - amostra(d)).abs() < 2e-3, "{d:?}: {} x {}", parte_positiva(d), amostra(d));
        }
        // ∫ max(f, 0) − ∫ max(−f, 0) = ∫ f.
        let d = [-2.0, 1.0, 4.0];
        assert!((parte_positiva(d) - parte_positiva(d.map(|x| -x)) - 1.0).abs() < 1e-12);
    }
}
