//! Terreno (PLANO do terreno A.4 regra 10): curvas de nível, consulta 161 (`terreno_curvas`).
//!
//! Cotas `k · intervalo` (k inteiro) entre o mínimo e o máximo da superfície. Vértice com cota IGUAL à da curva conta como ACIMA (regra única): por isso não
//! há curva na cota mínima, e na cota de um pico isolado os segmentos têm comprimento zero e são descartados. Cada triângulo atravessado dá um segmento, cujas
//! pontas são calculadas sempre do vértice de baixo para o de cima da aresta: os dois triângulos de uma aresta chegam ao mesmo ponto, bit a bit. O segmento
//! é orientado com o lado alto à esquerda. Segmento menor que `1e-9` é descartado; os demais são encadeados pela extremidade quantizada em `1e-7`.
//!
//! A consulta 161 devolve as curvas SUAVIZADAS (Chaikin, 2 rodadas; extremidades e pontos sobre a borda do terreno fixos; sem criar autointerseção) e, na superfície
//! proposta, sem as curvas que são artefato das regiões planas horizontais (dentro delas e na parede vertical de 1 cm). A comparação com a cota usa epsilon relativo.
//!
//! Saída: `linhas [terreno_num, mestra, fechada, n_pontos]`, `pontos [x, y]` e `cotas [z]` (uma por linha). Linha fechada NÃO repete o primeiro ponto.
//! Ordem: terreno, cota crescente e, na mesma cota, as abertas e depois as fechadas, cada grupo pela ordem dos triângulos.

use std::collections::HashMap;
use std::rc::Rc;

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::{ENTRADA, LIMITE};
use crate::terreno_avalia::Malha;
use crate::terreno_proposta::{proposta, superficie_do_terreno};
use crate::terreno_regioes::Regiao;
use crate::terreno_tipos::terrenos_do_nivel;

/// Máximo de cotas distintas por terreno (acima disso, `LIMITE`).
pub const MAX_COTAS: f64 = 2000.0;
/// Folga relativa na comparação de uma cota com o nível da curva.
pub const EPS_COTA: f64 = 1e-9;
/// Distância (m) ao contorno de região plana horizontal abaixo da qual um segmento é da parede vertical ("gêmeos" a 1 cm) e não vira curva.
pub const PAREDE: f64 = 0.02;
/// Segmento mais curto que isto é descartado.
pub const SEGMENTO_MIN: f64 = 1e-9;
/// Passo da quantização das extremidades no encadeamento.
pub const QUANTO: f64 = 1e-7;

/// Uma curva de nível encadeada.
#[derive(Clone, Debug, PartialEq)]
pub struct Curva {
    /// Índice da cota: `z = k · intervalo`.
    pub k: i64,
    pub z: f64,
    pub mestra: bool,
    pub fechada: bool,
    /// Pontos em planta. Fechada: o último liga no primeiro (sem repetir).
    pub pontos: Vec<[f64; 2]>,
}

/// Chave de encadeamento de um ponto (quantizado em `QUANTO`).
pub fn chave_ponto(p: [f64; 2]) -> (i64, i64) {
    ((p[0] / QUANTO).round() as i64, (p[1] / QUANTO).round() as i64)
}

/// Um segmento orientado, com as chaves das duas pontas.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Segmento {
    pub a: [f64; 2],
    pub b: [f64; 2],
}

/// Encadeia segmentos orientados pela extremidade quantizada. Devolve `(pontos, fechada)` por cadeia: primeiro as abertas (começam onde saem mais segmentos
/// do que chegam), depois as fechadas, cada grupo pela ordem dos segmentos. Em nó com mais de uma saída segue o segmento de menor índice ainda não usado.
/// Segmento cujas duas pontas caem na mesma chave não liga nada e é descartado.
pub fn encadear(segmentos: &[Segmento]) -> Vec<(Vec<[f64; 2]>, bool)> {
    let chaves: Vec<((i64, i64), (i64, i64))> = segmentos.iter().map(|s| (chave_ponto(s.a), chave_ponto(s.b))).collect();
    let mut saidas: HashMap<(i64, i64), Vec<u32>> = HashMap::with_capacity(segmentos.len());
    let mut saldo: HashMap<(i64, i64), i32> = HashMap::with_capacity(segmentos.len());
    let mut usado = vec![false; segmentos.len()];
    for (i, &(ka, kb)) in chaves.iter().enumerate() {
        if ka == kb {
            usado[i] = true;
            continue;
        }
        saidas.entry(ka).or_default().push(i as u32);
        *saldo.entry(ka).or_insert(0) += 1;
        *saldo.entry(kb).or_insert(0) -= 1;
    }
    // Próxima saída a tentar em cada nó (as listas estão em ordem crescente de índice).
    let mut cursor: HashMap<(i64, i64), usize> = HashMap::with_capacity(saidas.len());
    let mut out = Vec::new();
    for abertas in [true, false] {
        for inicio in 0..segmentos.len() {
            if usado[inicio] {
                continue;
            }
            let k0 = chaves[inicio].0;
            if abertas {
                match saldo.get_mut(&k0) {
                    Some(s) if *s > 0 => *s -= 1,
                    _ => continue,
                }
            }
            let mut pontos = vec![segmentos[inicio].a];
            let mut atual = inicio;
            let fechada = loop {
                usado[atual] = true;
                let fim = chaves[atual].1;
                if fim == k0 {
                    break true;
                }
                pontos.push(segmentos[atual].b);
                let lista = saidas.get(&fim).map_or(&[][..], |v| v.as_slice());
                let c = cursor.entry(fim).or_insert(0);
                while *c < lista.len() && usado[lista[*c] as usize] {
                    *c += 1;
                }
                match lista.get(*c) {
                    Some(&prox) => atual = prox as usize,
                    None => break false,
                }
            };
            out.push((pontos, fechada));
        }
    }
    out
}

/// Ponto da curva de cota `z` na aresta que vai de `baixo` (cota menor que `z`) a `cima` (cota maior ou igual).
fn cruzamento(baixo: [f64; 3], cima: [f64; 3], z: f64) -> [f64; 2] {
    let t = ((z - baixo[2]) / (cima[2] - baixo[2])).clamp(0.0, 1.0);
    if t >= 1.0 {
        return [cima[0], cima[1]];
    }
    [baixo[0] + (cima[0] - baixo[0]) * t, baixo[1] + (cima[1] - baixo[1]) * t]
}

/// Segmento da curva de cota `z` no triângulo `p` (anti-horário), com o lado alto à esquerda. `None` se o triângulo não é atravessado ou o segmento é
/// menor que `SEGMENTO_MIN`.
pub fn segmento_no_triangulo(p: [[f64; 3]; 3], z: f64) -> Option<Segmento> {
    // Epsilon relativo: uma cota que só difere de `z` por arredondamento (plataforma exatamente em k · intervalo) é a própria cota.
    let eps = EPS_COTA * (1.0 + z.abs());
    let acima = p.map(|q| q[2] >= z - eps);
    let (mut entra, mut sai) = (None, None);
    for i in 0..3 {
        let j = (i + 1) % 3;
        if !acima[i] && acima[j] {
            entra = Some(cruzamento(p[i], p[j], z));
        } else if acima[i] && !acima[j] {
            sai = Some(cruzamento(p[j], p[i], z));
        }
    }
    let (a, b) = (sai?, entra?);
    if crate::geo2d::hipot(b[0] - a[0], b[1] - a[1]) < SEGMENTO_MIN {
        return None;
    }
    Some(Segmento { a, b })
}

/// Curvas de nível de uma malha. `ENTRADA` se o intervalo não é positivo; `LIMITE` com mais de `MAX_COTAS` cotas entre o mínimo e o máximo.
pub fn curvas_da_malha(m: &Malha, intervalo: f64, mestra_cada: u32) -> Result<Vec<Curva>, u32> {
    curvas_filtradas(m, intervalo, mestra_cada, &[])
}

/// `true` se o segmento `s` do triângulo `p` é artefato de região plana horizontal: dentro dela, ou na parede vertical de 1 cm do seu contorno. Região
/// inclinada não suprime nada (as curvas do seu plano são reais).
fn suprimido(regioes: &[Regiao], p: [[f64; 3]; 3], s: &Segmento) -> bool {
    let c = crate::geo2d::v((p[0][0] + p[1][0] + p[2][0]) / 3.0, (p[0][1] + p[1][1] + p[2][1]) / 3.0);
    regioes.iter().filter(|r| r.plana() && r.inclinacao.abs() <= 1e-12).any(|r| {
        let perto = |q: [f64; 2]| {
            let q = crate::geo2d::v(q[0], q[1]);
            r.perto(q, PAREDE) && r.mais_proximo(q).1 <= PAREDE
        };
        r.dentro(c) || (perto(s.a) && perto(s.b))
    })
}

/// `curvas_da_malha` sem as curvas que são artefato das regiões planas horizontais de `regioes` (superfície proposta): ver `suprimido`.
pub fn curvas_filtradas(m: &Malha, intervalo: f64, mestra_cada: u32, regioes: &[Regiao]) -> Result<Vec<Curva>, u32> {
    let Some((z_min, z_max)) = m.z_min_max().filter(|_| !m.t.is_empty()) else { return Ok(Vec::new()) };
    if !(intervalo > 0.0 && intervalo.is_finite()) {
        return Err(ENTRADA);
    }
    let (k_min, k_max) = ((z_min / intervalo).ceil(), (z_max / intervalo).floor());
    // O teto de 1e15 mantém `k` exato em `f64` e longe do estouro de `i64`.
    if !(k_min.abs() <= 1e15 && k_max.abs() <= 1e15) || k_max - k_min + 1.0 > MAX_COTAS {
        return Err(LIMITE);
    }
    if k_max < k_min {
        return Ok(Vec::new());
    }
    let (k_min, n) = (k_min as i64, (k_max - k_min) as usize + 1);
    let mut por_cota: Vec<Vec<Segmento>> = vec![Vec::new(); n];
    for t in &m.t {
        let p = t.map(|i| m.v[i as usize]);
        let (lo, hi) = (p[0][2].min(p[1][2]).min(p[2][2]), p[0][2].max(p[1][2]).max(p[2][2]));
        // Folga de uma cota para cada lado: quem decide é a comparação exata com `k · intervalo` em `segmento_no_triangulo`.
        let de = (((lo / intervalo).floor() as i64) - 1).max(k_min);
        let ate = (((hi / intervalo).ceil() as i64) + 1).min(k_min + n as i64 - 1);
        for k in de..=ate {
            if let Some(s) = segmento_no_triangulo(p, k as f64 * intervalo).filter(|s| !suprimido(regioes, p, s)) {
                por_cota[(k - k_min) as usize].push(s);
            }
        }
    }
    let mut out = Vec::new();
    for (d, segs) in por_cota.iter().enumerate() {
        let k = k_min + d as i64;
        let mestra = mestra_cada > 0 && k.rem_euclid(i64::from(mestra_cada)) == 0;
        for (pontos, fechada) in encadear(segs) {
            out.push(Curva { k, z: k as f64 * intervalo, mestra, fechada, pontos });
        }
    }
    Ok(out)
}

/// Consulta 161 (`terreno_curvas`): terrenos do nível por `id_num` crescente. `superficie` 1 devolve as curvas da superfície proposta.
pub fn consulta_terreno_curvas(cena: &Cena, nivel: u32, superficie: u32) -> Result<Vec<Saida>, u32> {
    let (mut linhas, mut pontos, mut cotas) = (Vec::new(), Vec::new(), Vec::new());
    for t in terrenos_do_nivel(&cena.terreno, nivel) {
        let (m, regioes) = if superficie == 0 {
            (superficie_do_terreno(cena, t, 0)?, Vec::new())
        } else {
            let p = proposta(cena, t)?;
            (Rc::clone(&p.malha), p.regioes.clone())
        };
        let Some(def) = cena.terreno.terrenos.get(&t) else { continue };
        for c in curvas_suaves(&m, def.intervalo, def.mestra_cada, &regioes)? {
            linhas.extend_from_slice(&[t, u32::from(c.mestra), u32::from(c.fechada), c.pontos.len() as u32]);
            pontos.extend(c.pontos.iter().flatten());
            cotas.push(c.z);
        }
    }
    Ok(vec![Saida::U32(linhas), Saida::F64(pontos), Saida::F64(cotas)])
}


// ---- Suavização (Chaikin) das curvas de nível ----

/// Rodadas de Chaikin aplicadas às curvas da consulta 161 (a segunda só se a curva não ficar grande demais).
pub const CHAIKIN_RODADAS: usize = 2;
/// Acima deste número de pontos por curva a suavização faz uma rodada só (o dobro de pontos por rodada pesa na planta e no DXF).
pub const CHAIKIN_PONTOS_MAX: usize = 4000;
/// Distância (m) à borda do terreno abaixo da qual um ponto da curva não se move.
const TOL_BORDA: f64 = 1e-6;

/// Uma rodada de Chaikin: cada trecho `a–b` vira `0,75a+0,25b` e `0,25a+0,75b`. Ponto fixo não se move: nenhum canto é cortado ali (extremidade de curva
/// aberta e ponto sobre a borda do terreno). Devolve os pontos e as marcas de fixo.
fn chaikin_uma(pts: &[[f64; 2]], fixo: &[bool], fechada: bool) -> (Vec<[f64; 2]>, Vec<bool>) {
    let n = pts.len();
    let trechos = if fechada { n } else { n - 1 };
    let mut out = Vec::with_capacity(2 * n);
    let mut f = Vec::with_capacity(2 * n);
    if !fechada {
        out.push(pts[0]);
        f.push(true);
    }
    for i in 0..trechos {
        let (j, a, b) = ((i + 1) % n, pts[i], pts[(i + 1) % n]);
        if !fixo[i] {
            out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
            f.push(false);
        }
        if fixo[j] {
            out.push(b);
            f.push(true);
        } else {
            out.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
            f.push(false);
        }
    }
    (out, f)
}

fn cruza_propriamente(a: [f64; 2], b: [f64; 2], c: [f64; 2], d: [f64; 2]) -> bool {
    let o = |p: [f64; 2], q: [f64; 2], r: [f64; 2]| (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    let (o1, o2, o3, o4) = (o(a, b, c), o(a, b, d), o(c, d, a), o(c, d, b));
    o1 * o2 < 0.0 && o3 * o4 < 0.0
}

/// `true` se a curva se cruza (dois trechos não vizinhos se cortam no interior). Grade uniforme de trechos: `O(n)` nos casos usuais.
pub fn se_cruza(pts: &[[f64; 2]], fechada: bool) -> bool {
    let n = pts.len();
    let trechos = if fechada { n } else { n - 1 };
    if trechos < 4 {
        return false;
    }
    let compr: f64 = (0..trechos).map(|i| (pts[(i + 1) % n][0] - pts[i][0]).hypot(pts[(i + 1) % n][1] - pts[i][1])).sum::<f64>() / trechos as f64;
    let celula = (2.0 * compr).max(1e-6);
    let mut grade: HashMap<(i64, i64), Vec<u32>> = HashMap::new();
    for i in 0..trechos {
        let (a, b) = (pts[i], pts[(i + 1) % n]);
        let (x0, x1) = ((a[0].min(b[0]) / celula).floor() as i64, (a[0].max(b[0]) / celula).floor() as i64);
        let (y0, y1) = ((a[1].min(b[1]) / celula).floor() as i64, (a[1].max(b[1]) / celula).floor() as i64);
        if (x1 - x0 + 1).saturating_mul(y1 - y0 + 1) > 4096 {
            continue;
        }
        for cx in x0..=x1 {
            for cy in y0..=y1 {
                grade.entry((cx, cy)).or_default().push(i as u32);
            }
        }
    }
    for lista in grade.values() {
        for (k, &i) in lista.iter().enumerate() {
            for &j in &lista[k + 1..] {
                let (i, j) = (i as usize, j as usize);
                let vizinhos = j == i + 1 || (fechada && i == 0 && j == trechos - 1);
                if !vizinhos && cruza_propriamente(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]) {
                    return true;
                }
            }
        }
    }
    false
}

/// Suaviza uma curva por Chaikin com até `rodadas` rodadas, sem criar autointerseção: se uma rodada cruzar a curva (que já não cruzava), fica a anterior.
/// Extremidades de curva aberta e pontos `fixo` (sobre a borda do terreno) não se movem.
pub fn suavizar(pts: &[[f64; 2]], fixo: &[bool], fechada: bool, rodadas: usize) -> Vec<[f64; 2]> {
    if pts.len() < 3 || (fechada && pts.len() < 3) {
        return pts.to_vec();
    }
    let ja_cruzava = se_cruza(pts, fechada);
    let (mut atual, mut f) = (pts.to_vec(), fixo.to_vec());
    for r in 0..rodadas {
        if r > 0 && atual.len() > CHAIKIN_PONTOS_MAX {
            break;
        }
        let (prox, fp) = chaikin_uma(&atual, &f, fechada);
        if !ja_cruzava && se_cruza(&prox, fechada) {
            break;
        }
        (atual, f) = (prox, fp);
    }
    atual
}

/// Pontos da curva que ficam sobre a borda da malha (aresta de um só triângulo).
fn marcar_borda(pts: &[[f64; 2]], borda: &HashMap<(i64, i64), Vec<[[f64; 2]; 2]>>) -> Vec<bool> {
    pts.iter()
        .map(|p| {
            let c = ((p[0] / CELULA_BORDA).floor() as i64, (p[1] / CELULA_BORDA).floor() as i64);
            (-1..=1).any(|dx| {
                (-1..=1).any(|dy| {
                    borda.get(&(c.0 + dx, c.1 + dy)).is_some_and(|l| {
                        l.iter().any(|s| {
                            let (dx, dy) = (s[1][0] - s[0][0], s[1][1] - s[0][1]);
                            let l2 = dx * dx + dy * dy;
                            let t = if l2 > 0.0 { (((p[0] - s[0][0]) * dx + (p[1] - s[0][1]) * dy) / l2).clamp(0.0, 1.0) } else { 0.0 };
                            (p[0] - (s[0][0] + dx * t)).hypot(p[1] - (s[0][1] + dy * t)) <= TOL_BORDA
                        })
                    })
                })
            })
        })
        .collect()
}

const CELULA_BORDA: f64 = 2.0;

/// Arestas de borda da malha (um só triângulo), indexadas numa grade de `CELULA_BORDA` m (cada aresta entra em todas as células que a caixa toca).
fn grade_da_borda(m: &Malha) -> HashMap<(i64, i64), Vec<[[f64; 2]; 2]>> {
    let mut cont: HashMap<(u32, u32), u8> = HashMap::new();
    for t in &m.t {
        for k in 0..3 {
            let (a, b) = (t[k], t[(k + 1) % 3]);
            *cont.entry((a.min(b), a.max(b))).or_insert(0) += 1;
        }
    }
    let mut grade: HashMap<(i64, i64), Vec<[[f64; 2]; 2]>> = HashMap::new();
    for (&(a, b), &c) in &cont {
        if c != 1 {
            continue;
        }
        let (pa, pb) = ([m.v[a as usize][0], m.v[a as usize][1]], [m.v[b as usize][0], m.v[b as usize][1]]);
        let (x0, x1) = ((pa[0].min(pb[0]) / CELULA_BORDA).floor() as i64, (pa[0].max(pb[0]) / CELULA_BORDA).floor() as i64);
        let (y0, y1) = ((pa[1].min(pb[1]) / CELULA_BORDA).floor() as i64, (pa[1].max(pb[1]) / CELULA_BORDA).floor() as i64);
        if (x1 - x0 + 1).saturating_mul(y1 - y0 + 1) > 10_000 {
            continue;
        }
        for cx in x0..=x1 {
            for cy in y0..=y1 {
                grade.entry((cx, cy)).or_default().push([pa, pb]);
            }
        }
    }
    grade
}

/// Curvas de nível suavizadas: `curvas_filtradas` e depois Chaikin em cada uma (ver `suavizar`).
pub fn curvas_suaves(m: &Malha, intervalo: f64, mestra_cada: u32, regioes: &[Regiao]) -> Result<Vec<Curva>, u32> {
    let mut curvas = curvas_filtradas(m, intervalo, mestra_cada, regioes)?;
    if curvas.is_empty() {
        return Ok(curvas);
    }
    let borda = grade_da_borda(m);
    for c in &mut curvas {
        let mut fixo = marcar_borda(&c.pontos, &borda);
        if !c.fechada {
            let n = fixo.len();
            fixo[0] = true;
            fixo[n - 1] = true;
        }
        c.pontos = suavizar(&c.pontos, &fixo, c.fechada, CHAIKIN_RODADAS);
    }
    Ok(curvas)
}

#[cfg(test)]
mod testes {
    use super::*;

    fn seg(a: [f64; 2], b: [f64; 2]) -> Segmento {
        Segmento { a, b }
    }

    #[test]
    fn chave_quantiza_em_1e_7() {
        assert_eq!(chave_ponto([1.0, -2.0]), (10_000_000, -20_000_000));
        assert_eq!(chave_ponto([1.0 + 4e-8, 0.0]), chave_ponto([1.0, 0.0]));
        assert_ne!(chave_ponto([1.0 + 6e-8, 0.0]), chave_ponto([1.0, 0.0]));
    }

    #[test]
    fn encadeia_aberta_e_fechada_fora_de_ordem() {
        let p = [[0.0, 0.0], [1.0, 0.0], [2.0, 0.0], [3.0, 0.0]];
        let q = [[0.0, 5.0], [1.0, 5.0], [1.0, 6.0]];
        let segs = [seg(q[1], q[2]), seg(p[2], p[3]), seg(q[2], q[0]), seg(p[0], p[1]), seg(q[0], q[1]), seg(p[1], [2.0 + 3e-8, 0.0])];
        let c = encadear(&segs);
        assert_eq!(c.len(), 2);
        assert_eq!(c[0], (vec![p[0], p[1], [2.0 + 3e-8, 0.0], p[3]], false), "a aberta primeiro, do começo ao fim, colada pela chave");
        assert_eq!(c[1], (vec![q[1], q[2], q[0]], true), "a fechada não repete o primeiro ponto");
        assert!(encadear(&[]).is_empty());
        assert!(encadear(&[seg(p[0], [2e-8, 0.0])]).is_empty(), "pontas na mesma chave: descartado");
    }

    #[test]
    fn no_com_duas_saidas_segue_o_menor_indice() {
        // Dois laços que se tocam em O.
        let o = [0.0, 0.0];
        let segs = [seg(o, [1.0, 0.0]), seg([1.0, 0.0], o), seg(o, [-1.0, 0.0]), seg([-1.0, 0.0], o)];
        let c = encadear(&segs);
        assert_eq!(c, vec![(vec![o, [1.0, 0.0]], true), (vec![o, [-1.0, 0.0]], true)]);
    }

    #[test]
    fn segmento_com_o_lado_alto_a_esquerda_e_cota_igual_conta_como_acima() {
        let t = [[0.0, 0.0, 0.0], [2.0, 0.0, 2.0], [0.0, 2.0, 0.0]];
        let s = segmento_no_triangulo(t, 1.0).expect("atravessado");
        assert_eq!((s.a, s.b), ([1.0, 1.0], [1.0, 0.0]), "desce em y com o lado alto (x maior) à esquerda");
        assert_eq!(segmento_no_triangulo(t, 0.0), None, "tudo acima ou igual: sem curva");
        assert_eq!(segmento_no_triangulo(t, 2.0), None, "só um vértice na cota: segmento de comprimento zero");
        assert_eq!(segmento_no_triangulo(t, 3.0), None);
        // Aresta inteira na cota, com o terceiro vértice abaixo: a própria aresta.
        let u = [[0.0, 0.0, 1.0], [2.0, 0.0, 1.0], [0.0, 2.0, 0.0]];
        let s = segmento_no_triangulo(u, 1.0).expect("aresta");
        assert_eq!((s.a, s.b), ([2.0, 0.0], [0.0, 0.0]));
    }

    #[test]
    fn curvas_de_um_triangulo_intervalo_invalido_e_limite() {
        let m = Malha::nova(vec![[0.0, 0.0, -1.0], [4.0, 0.0, 3.0], [0.0, 4.0, -1.0]], vec![0, 1, 2], vec![[0, 1, 2]], Vec::new());
        let c = curvas_da_malha(&m, 1.0, 2).expect("curvas");
        assert_eq!(c.iter().map(|c| (c.k, c.z, c.mestra, c.fechada, c.pontos.len())).collect::<Vec<_>>(), vec![(0, 0.0, true, false, 2), (1, 1.0, false, false, 2), (2, 2.0, true, false, 2)]);
        assert_eq!(c[0].pontos, vec![[1.0, 3.0], [1.0, 0.0]]);
        assert!(curvas_da_malha(&m, 1.0, 0).expect("curvas").iter().all(|c| !c.mestra), "mestra_cada 0: nenhuma mestra");
        assert_eq!(curvas_da_malha(&m, 0.0, 5), Err(ENTRADA));
        assert_eq!(curvas_da_malha(&m, -1.0, 5), Err(ENTRADA));
        assert_eq!(curvas_da_malha(&m, f64::NAN, 5), Err(ENTRADA));
        assert_eq!(curvas_da_malha(&m, 0.001, 5), Err(LIMITE));
        assert_eq!(curvas_da_malha(&m, 1e-320, 5), Err(LIMITE));
        assert_eq!(curvas_da_malha(&m, 0.002, 5), Err(LIMITE), "de −500 a 1500 são 2001 cotas");
        assert!(curvas_da_malha(&m, 0.0025, 5).is_ok_and(|c| (1598..=1601).contains(&c.len())), "1601 cotas cabem");
        assert_eq!(curvas_da_malha(&Malha::default(), 0.0, 5), Ok(Vec::new()), "sem triângulos não há o que conferir");
        assert_eq!(curvas_da_malha(&m, 10.0, 5).map(|c| c.len()), Ok(1), "só a cota 0");
    }
}
