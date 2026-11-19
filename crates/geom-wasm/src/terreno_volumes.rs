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

/// Um subtriângulo ativo (só para os volumes): região (posição em `regioes` ou `SEM_REGIAO`), área e diferenças `P − E` nos cantos.
struct Sub {
    regiao: u32,
    area: f64,
    d: [f64; 3],
}

/// Índices dos triângulos "ativos" de P (ver o cabeçalho do módulo), em ordem crescente. `planas`: posições das regiões planas.
fn triangulos_ativos(p: &Proposta, planas: &[usize]) -> Vec<usize> {
    let (e, m) = (&p.e, &p.malha);
    let dif_v: Vec<f64> = m.v.iter().map(|q| e.cota(q[0], q[1]).map_or(0.0, |z| q[2] - z)).collect();
    (0..m.t.len())
        .filter(|&k| {
            let c = m.t[k].map(|i| m.v[i as usize]);
            let centro = v((c[0][0] + c[1][0] + c[2][0]) / 3.0, (c[0][1] + c[1][1] + c[2][1]) / 3.0);
            let ao_alcance = planas.iter().any(|&i| p.regioes[i].perto(centro, p.regioes[i].alcance) && p.regioes[i].distancia(centro) <= p.regioes[i].alcance);
            ao_alcance || m.t[k].iter().any(|&i| dif_v[i as usize].abs() > TOL_ATIVO)
        })
        .collect()
}

/// Percorre os subtriângulos dos triângulos ativos de P, na ordem dos triângulos.
fn percorrer(p: &Proposta, mut f: impl FnMut(&Sub)) {
    if !p.tem_plano() {
        return;
    }
    let (e, m) = (&p.e, &p.malha);
    let planas: Vec<usize> = (0..p.regioes.len()).filter(|&i| p.regioes[i].plana()).collect();
    for k in triangulos_ativos(p, &planas) {
        let t = m.t[k];
        let c = t.map(|i| m.v[i as usize]);
        let centro = v((c[0][0] + c[1][0] + c[2][0]) / 3.0, (c[0][1] + c[1][1] + c[2][1]) / 3.0);
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
                f(&Sub { regiao, area: sub_area, d: cima.map(|(a, b)| dif[a][b]) });
                if i + j + 1 < DIVISOES {
                    let baixo = [(i + 1, j), (i + 1, j + 1), (i, j + 1)];
                    f(&Sub { regiao, area: sub_area, d: baixo.map(|(a, b)| dif[a][b]) });
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

/// Vértice de um polígono do mapa: posição em planta e diferença `zP − zE` (linear no polígono).
#[derive(Clone, Copy)]
struct Pt {
    x: f64,
    y: f64,
    d: f64,
}

/// Recorta o polígono convexo pelo semiplano `f ≥ 0` (Sutherland–Hodgman); `f` é linear. Os pontos novos têm `d` interpolado, ou 0 se `zero_d`.
fn recortar(poly: &[Pt], f: impl Fn(&Pt) -> f64, zero_d: bool) -> Vec<Pt> {
    let mut out = Vec::with_capacity(poly.len() + 2);
    for i in 0..poly.len() {
        let (s, e) = (poly[i], poly[(i + 1) % poly.len()]);
        let (fs, fe) = (f(&s), f(&e));
        if fs >= 0.0 {
            out.push(s);
        }
        if (fs > 0.0 && fe < 0.0) || (fs < 0.0 && fe > 0.0) {
            let t = fs / (fs - fe);
            out.push(Pt { x: s.x + (e.x - s.x) * t, y: s.y + (e.y - s.y) * t, d: if zero_d { 0.0 } else { s.d + (e.d - s.d) * t } });
        }
    }
    out
}

/// Dobro da área (assinada, positiva se anti-horário) de um polígono.
fn area2_poligono(poly: &[Pt]) -> f64 {
    (0..poly.len()).map(|i| poly[i].x * poly[(i + 1) % poly.len()].y - poly[(i + 1) % poly.len()].x * poly[i].y).sum()
}

/// Cota do plano de um triângulo `c` (cantos `[x, y, z]`) em `(x, y)`, por coordenadas baricêntricas.
fn cota_no_plano(c: &[[f64; 3]; 3], x: f64, y: f64) -> f64 {
    let (ux, uy, vx, vy) = (c[1][0] - c[0][0], c[1][1] - c[0][1], c[2][0] - c[0][0], c[2][1] - c[0][1]);
    let det = ux * vy - uy * vx;
    let (px, py) = (x - c[0][0], y - c[0][1]);
    let b1 = (px * vy - py * vx) / det;
    let b2 = (ux * py - uy * px) / det;
    c[0][2] + b1 * (c[1][2] - c[0][2]) + b2 * (c[2][2] - c[0][2])
}

/// Grade uniforme dos triângulos de E, só para achar rápido quais cobrem um triângulo de P.
struct GradeE {
    min: [f64; 2],
    tam: [f64; 2],
    n: [usize; 2],
    inicio: Vec<u32>,
    itens: Vec<u32>,
}

impl GradeE {
    fn nova(m: &crate::terreno_avalia::Malha) -> GradeE {
        let (mut min, mut max) = ([f64::INFINITY; 2], [f64::NEG_INFINITY; 2]);
        for q in &m.v {
            for a in 0..2 {
                min[a] = min[a].min(q[a]);
                max[a] = max[a].max(q[a]);
            }
        }
        let lado = ((m.t.len() as f64).sqrt().ceil() as usize).clamp(1, 512);
        let tam = [((max[0] - min[0]) / lado as f64).max(1e-12), ((max[1] - min[1]) / lado as f64).max(1e-12)];
        let mut g = GradeE { min, tam, n: [lado, lado], inicio: vec![0; lado * lado + 1], itens: Vec::new() };
        let faixas: Vec<([usize; 2], [usize; 2])> = (0..m.t.len()).map(|k| g.faixa(&m.t[k].map(|i| m.v[i as usize]))).collect();
        for f in &faixas {
            for j in f.0[1]..=f.1[1] {
                for i in f.0[0]..=f.1[0] {
                    g.inicio[j * lado + i + 1] += 1;
                }
            }
        }
        for c in 0..lado * lado {
            g.inicio[c + 1] += g.inicio[c];
        }
        g.itens = vec![0; g.inicio[lado * lado] as usize];
        let mut cursor = g.inicio.clone();
        for (k, f) in faixas.iter().enumerate() {
            for j in f.0[1]..=f.1[1] {
                for i in f.0[0]..=f.1[0] {
                    g.itens[cursor[j * lado + i] as usize] = k as u32;
                    cursor[j * lado + i] += 1;
                }
            }
        }
        g
    }

    /// Faixa de células `[i0, j0]..[i1, j1]` que o retângulo envolvente do triângulo toca.
    fn faixa(&self, c: &[[f64; 3]; 3]) -> ([usize; 2], [usize; 2]) {
        let (mut lo, mut hi) = ([0usize; 2], [0usize; 2]);
        for a in 0..2 {
            let (mn, mx) = c.iter().fold((f64::INFINITY, f64::NEG_INFINITY), |s, q| (s.0.min(q[a]), s.1.max(q[a])));
            let cel = |x: f64| (((x - self.min[a]) / self.tam[a]).floor().max(0.0) as usize).min(self.n[a] - 1);
            lo[a] = cel(mn);
            hi[a] = cel(mx);
        }
        (lo, hi)
    }
}

/// Fração do dobro da área de um triângulo de P abaixo da qual um pedaço é fiapo (sem área visível) e some do mapa.
const FIAPO_REL: f64 = 1e-9;

/// Pedaços do mapa de corte e aterro de um triângulo de P: P é linear no triângulo e E é linear em cada triângulo de E, então o triângulo é recortado
/// pelos triângulos de E que o cobrem (só onde E existe) e, em cada pedaço, `zP − zE` é linear: o pedaço é dividido exatamente na linha de zero e cada
/// metade (convexa) entra inteira no tipo do seu sinal. `f(tipo, polígono)`, tipo 0 = corte (`d < 0`) e 1 = aterro. A metade some se `max |d| ≤ TOL_MAPA` ou
/// se a área for fiapo.
fn pedacos_do_triangulo(c: &[[f64; 3]; 3], e: &crate::terreno_avalia::Malha, grade: &GradeE, marca: &mut [u32], rodada: u32, f: &mut impl FnMut(usize, &[Pt])) {
    let area2_p = (c[1][0] - c[0][0]) * (c[2][1] - c[0][1]) - (c[1][1] - c[0][1]) * (c[2][0] - c[0][0]);
    if area2_p.is_nan() || area2_p <= 0.0 {
        return;
    }
    let (lo, hi) = grade.faixa(c);
    let mut candidatos: Vec<u32> = Vec::new();
    for j in lo[1]..=hi[1] {
        for i in lo[0]..=hi[0] {
            let cel = j * grade.n[0] + i;
            for &k in &grade.itens[grade.inicio[cel] as usize..grade.inicio[cel + 1] as usize] {
                if marca[k as usize] != rodada {
                    marca[k as usize] = rodada;
                    candidatos.push(k);
                }
            }
        }
    }
    candidatos.sort_unstable();
    for k in candidatos {
        let ce = e.t[k as usize].map(|i| e.v[i as usize]);
        let mut poly: Vec<Pt> = c.iter().map(|q| Pt { x: q[0], y: q[1], d: 0.0 }).collect();
        for a in 0..3 {
            let (p, q) = (ce[a], ce[(a + 1) % 3]);
            poly = recortar(&poly, |s| (q[0] - p[0]) * (s.y - p[1]) - (q[1] - p[1]) * (s.x - p[0]), true);
            if poly.len() < 3 {
                break;
            }
        }
        if poly.len() < 3 || area2_poligono(&poly) <= FIAPO_REL * area2_p {
            continue;
        }
        for q in &mut poly {
            q.d = cota_no_plano(c, q.x, q.y) - cota_no_plano(&ce, q.x, q.y);
        }
        for (tipo, sinal) in [(0usize, -1.0f64), (1, 1.0)] {
            let metade = recortar(&poly, |s| sinal * s.d, true);
            if metade.len() < 3 || area2_poligono(&metade) <= FIAPO_REL * area2_p {
                continue;
            }
            if metade.iter().map(|q| q.d.abs()).fold(0.0, f64::max) > TOL_MAPA {
                f(tipo, &metade);
            }
        }
    }
}

/// Consulta 167 (`terreno_corte_aterro`): por terreno, um grupo de corte (tipo 0) e um de aterro (tipo 1), cada um só se tiver triângulos. Os pontos são 3 por
/// triângulo, anti-horários. O mapa é exato: cada triângulo ativo de P é recortado pelos triângulos de E e dividido na linha de zero de `zP − zE` (a mesma
/// que a tabela de volumes integra); fora do domínio de E não há pintura; pedaço com `|diferença| ≤ 0,01 m` em todo ele ou fiapo não entra.
pub fn consulta_terreno_corte_aterro(cena: &Cena, nivel: u32) -> Result<Vec<Saida>, u32> {
    let (mut grupos, mut pontos): (Vec<u32>, Vec<f64>) = (Vec::new(), Vec::new());
    for t in terrenos_do_nivel(&cena.terreno, nivel) {
        let p = proposta(cena, t)?;
        let mut por_tipo: [Vec<f64>; 2] = [Vec::new(), Vec::new()];
        if p.tem_plano() && !p.e.t.is_empty() {
            let planas: Vec<usize> = (0..p.regioes.len()).filter(|&i| p.regioes[i].plana()).collect();
            let grade = GradeE::nova(&p.e);
            let mut marca = vec![0u32; p.e.t.len()];
            for (rodada, k) in triangulos_ativos(&p, &planas).into_iter().enumerate() {
                let c = p.malha.t[k].map(|i| p.malha.v[i as usize]);
                pedacos_do_triangulo(&c, &p.e, &grade, &mut marca, rodada as u32 + 1, &mut |tipo, poly| {
                    // Leque a partir do primeiro vértice (o pedaço é convexo); triângulo de área nula não entra.
                    for i in 1..poly.len() - 1 {
                        let (a, b, d) = (poly[0], poly[i], poly[i + 1]);
                        if (b.x - a.x) * (d.y - a.y) - (b.y - a.y) * (d.x - a.x) > 0.0 {
                            por_tipo[tipo].extend_from_slice(&[a.x, a.y, b.x, b.y, d.x, d.y]);
                        }
                    }
                });
            }
        }
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

    use crate::terreno_fixture::{cena_com, t3, t5, t6, t7, RegiaoFx, TerrenoFx};
    use crate::terreno_testes_regioes::{area_tri, mapa, quant_regioes};

    /// T3 (pirâmide, z de 0 a 5) com região nivelada na cota 4 e taludes 1,5 (corte) e 2 (aterro): corte e aterro, E com vértice interno.
    fn t3_nivelada(id: u32) -> TerrenoFx {
        let r = RegiaoFx { talude_corte: 1.5, talude_aterro: 2.0, ..RegiaoFx::quadrado(1, 2, 5.0, 5.0, 10.0, 4.0) };
        TerrenoFx { regioes: vec![r], ..t3(id) }
    }

    /// `zP − zE` em um ponto (`None` fora de E ou de P).
    fn dif(p: &Proposta, x: f64, y: f64) -> Option<f64> {
        Some(p.malha.cota(x, y)? - p.e.cota(x, y)?)
    }

    fn casos() -> Vec<(&'static str, TerrenoFx)> {
        vec![("t5", t5(1)), ("t6", t6(1)), ("t7", t7(1)), ("t3_nivelada", t3_nivelada(1))]
    }

    #[test]
    fn mapa_exato_fronteira_dominio_e_volume() {
        for (nome, t) in casos() {
            let mut cena = cena_com(&[t]);
            let prop = proposta(&cena, 1).expect("proposta");
            let m = mapa(&mut cena, 0);
            let vol = prop.volumes();
            let (mut v_corte, mut v_aterro, mut a_corte, mut a_aterro) = (0.0, 0.0, 0.0, 0.0);
            for (_, tipo, tris) in &m {
                for tri in tris {
                    let area = area_tri(tri);
                    assert!(area > 0.0, "{nome}: anti-horário");
                    let ds: Vec<f64> = tri.iter().map(|q| dif(&prop, q[0], q[1]).unwrap_or_else(|| panic!("{nome}: vértice {q:?} fora de E ou de P"))).collect();
                    // Fronteira exata: nenhum canto do lado errado da linha de zero.
                    let sinal = if *tipo == 1 { 1.0 } else { -1.0 };
                    assert!(ds.iter().all(|d| sinal * d >= -1e-9), "{nome}: tipo {tipo} com cantos {ds:?}");
                    let media = ds.iter().sum::<f64>() / 3.0;
                    if *tipo == 1 {
                        v_aterro += area * media;
                        a_aterro += area;
                    } else {
                        v_corte -= area * media;
                        a_corte += area;
                    }
                }
            }
            // Consistência com a tabela de volumes (a diferença é só o que fica abaixo de 1 cm e o que a malha 4 × 4 aproxima onde E dobra).
            assert!((v_corte - vol.corte).abs() <= 0.01 * vol.corte.max(1.0), "{nome}: corte do mapa {v_corte} x tabela {}", vol.corte);
            assert!((v_aterro - vol.aterro).abs() <= 0.01 * vol.aterro.max(1.0), "{nome}: aterro do mapa {v_aterro} x tabela {}", vol.aterro);
            // Área: amostragem fina da região com |P − E| > 1 cm (a banda de ±1 cm em volta da linha de zero é tolerada).
            let (mut s_corte, mut s_aterro, mut s_banda, n) = (0.0, 0.0, 0.0, 400);
            let (x0, y0, lado) = (0.0, 0.0, 20.0);
            for i in 0..n {
                for j in 0..n {
                    let (x, y) = (x0 + (i as f64 + 0.5) * lado / n as f64, y0 + (j as f64 + 0.5) * lado / n as f64);
                    let a = (lado / n as f64).powi(2);
                    match dif(&prop, x, y) {
                        Some(d) if d > 0.01 => s_aterro += a,
                        Some(d) if d < -0.01 => s_corte += a,
                        Some(d) if d.abs() <= 0.01 => s_banda += a,
                        _ => {}
                    }
                }
            }
            assert!(a_corte >= s_corte - 0.5 && a_corte <= s_corte + s_banda + 0.5, "{nome}: área de corte {a_corte} x amostra {s_corte} (+ banda {s_banda})");
            assert!(a_aterro >= s_aterro - 0.5 && a_aterro <= s_aterro + s_banda + 0.5, "{nome}: área de aterro {a_aterro} x amostra {s_aterro} (+ banda {s_banda})");
            // Corte e aterro não se sobrepõem: a soma das áreas é a área de cada metade somada (testado pela fronteira); aqui, só que algo foi pintado.
            assert!(a_corte + a_aterro > 1.0, "{nome}: mapa vazio");
        }
    }

    #[test]
    fn mapa_com_corte_e_aterro_e_deterministico() {
        let mut cena = cena_com(&[t3_nivelada(1)]);
        let m = mapa(&mut cena, 0);
        assert_eq!(m.iter().map(|g| g.1).collect::<Vec<_>>(), vec![0, 1], "a pirâmide nivelada tem corte e aterro");
        let regioes = quant_regioes(&mut cena, 0);
        assert!(regioes.iter().any(|r| r.2[2] > 0.0 && r.2[3] > 0.0));
        let bits = |m: &Vec<(u32, u32, Vec<[[f64; 2]; 3]>)>| -> Vec<u64> { m.iter().flat_map(|g| g.2.iter().flatten().flatten().map(|x| x.to_bits())).collect() };
        let outra = mapa(&mut cena_com(&[t3_nivelada(1)]), 0);
        assert_eq!(bits(&m), bits(&outra), "byte a byte");
    }
}
