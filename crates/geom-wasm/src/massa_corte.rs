//! Corte e elevação da massa (plano de massa, A.4 regra 9; consulta 143 `massa_corte`).
//!
//! Plano vertical por `(ox, oy)` na direção `(dx, dy)`, como o `guarda_corte`: saída em `(s, z)`, `s` ao longo de `(dx, dy)` normalizada e `z` absoluto.
//! Enxerga-se para a normal esquerda `(-dy, dx)` (lado visível, `t > 0`) até `profundidade`. Tudo sai por cópia do arranjo, na ordem `massa_num`,
//! cópia, e em cada cópia: cortados, projetados, feições.
//!
//! - estilo 0 (cortado): interseção do plano com a malha `lod 2`. Vértice exatamente no plano conta como do lado positivo (`t >= 0`): é a regra
//!   única que faz todo triângulo misto ter exatamente duas arestas cruzadas e cada aresta cruzada ter dois triângulos, então os segmentos fecham em
//!   laços. O encadeamento usa a identidade da aresta da malha (exata, mais forte que a quantização em 1e-7 do plano); a quantização em 1e-7 só tira
//!   os pontos repetidos (vértice no plano) e os colineares saem com 1e-9 de folga. Cada laço sai anti-horário em `(s, z)`.
//! - estilo 1 (projetado): por anel da malha `lod 2`, a faixa entre `s_min(z)` e `s_max(z)` da parte do anel em `0 <= t <= profundidade` (vértices
//!   dentro da faixa mais os cruzamentos das arestas com `t = 0` e `t = profundidade`). Cada sequência de anéis com parte visível dá um contorno.
//!   LIMITAÇÃO ACEITA: a faixa é cheia entre `s_min` e `s_max`; anel côncavo cortado pelo plano pode ter a projeção um pouco maior que a real.
//! - estilo 3 (feição): uma linha horizontal em cada seção do usuário (a faixa visível do anel da seção) e a curva de cada quina de perfil (`t` de
//!   vértice do perfil), nos anéis em que a normal externa do vértice aponta para o observador (`normal . (-dy, dx) < 0`) e o ponto está na faixa
//!   visível. Sem oclusão entre feições: isso é da camada de desenho.
//!
//! Entrada com `NaN` ou infinito é `ENTRADA`; direção nula ou profundidade negativa não geram nada (como o guarda-corpo). Determinismo: nada aqui
//! depende de `HashMap` nem de relógio. Saída arredondada à grade de 1 µm (`na_grade`), como o `guarda_corte`.

use std::collections::{BTreeMap, BTreeSet};

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::{ENTRADA, LIMITE, LIMITE_BYTES_POR_CHAMADA};
use crate::gc_planta::na_grade;
use crate::massa_malha::{casca, malha_da_massa, MalhaMassa};
use crate::massa_perfil::Curva;
use crate::massa_pilha::Pilha;
use crate::massa_planta::{ESTILO_CORTADO, ESTILO_PROJETADO};
use crate::massa_tipos::{area_com_sinal, Massa, FUSAO_T};

/// `estilo` das linhas de feição (o 2 é o "acima" da planta e não existe no corte).
pub const ESTILO_FEICAO: u32 = 3;
/// Malha usada pelo corte (regra 9).
const LOD: u32 = 2;
/// Grade de quantização dos pontos repetidos.
const QUANTIZA: f64 = 1e-7;
/// Distância abaixo da qual um ponto é colinear com os vizinhos.
const TOL_COLINEAR: f64 = 1e-9;
/// Área mínima de um laço (m²); abaixo disso é degenerado.
const AREA_MIN: f64 = 1e-12;
/// Limite do cosseno da normal para a feição (normal rente ao plano não conta).
const NORMAL_MIN: f64 = 1e-9;

/// Uma linha do corte. Os pontos não repetem o primeiro no fim; os estilos 0 e 1 são fechados e o 3 é aberto.
#[derive(Clone, Debug, PartialEq)]
pub struct LinhaCorteMassa {
    pub massa: u32,
    pub copia: u32,
    pub estilo: u32,
    pub pontos: Vec<(f64, f64)>,
}

/// Vértice da malha no sistema do plano: `s` ao longo, `t` distância com sinal (positiva = lado visível), `z` absoluto.
#[derive(Clone, Copy)]
pub(crate) struct Vert {
    pub s: f64,
    pub t: f64,
    pub z: f64,
}

struct Plano {
    ox: f64,
    oy: f64,
    ux: f64,
    uy: f64,
}

impl Plano {
    fn novo(ox: f64, oy: f64, dx: f64, dy: f64) -> Option<Plano> {
        let l = dx.hypot(dy);
        (l >= 1e-12).then(|| Plano { ox, oy, ux: dx / l, uy: dy / l })
    }

    fn st(&self, x: f64, y: f64) -> (f64, f64) {
        let (rx, ry) = (x - self.ox, y - self.oy);
        (rx * self.ux + ry * self.uy, -rx * self.uy + ry * self.ux)
    }

    /// Normal para o lado visível.
    fn normal(&self) -> (f64, f64) {
        (-self.uy, self.ux)
    }
}

/// Um laço do corte já limpo.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Laco {
    pub pontos: Vec<(f64, f64)>,
    /// `true` se o encadeamento voltou ao ponto de partida. Por construção é sempre verdadeiro; o campo existe para o teste conferir.
    pub fechado: bool,
}

impl Laco {
    pub fn area(&self) -> f64 {
        let p: Vec<[f64; 2]> = self.pontos.iter().map(|q| [q.0, q.1]).collect();
        area_com_sinal(&p)
    }

    /// Fechado, com 3 pontos ou mais e área acima do mínimo.
    pub fn valido(&self) -> bool {
        self.fechado && self.pontos.len() >= 3 && self.area().abs() > AREA_MIN
    }
}

fn quant(v: f64) -> i64 {
    (v / QUANTIZA).round() as i64
}

fn mesmo_ponto(a: (f64, f64), b: (f64, f64)) -> bool {
    quant(a.0) == quant(b.0) && quant(a.1) == quant(b.1)
}

/// Tira pontos repetidos (quantizados em 1e-7) e colineares (1e-9), começa no menor ponto `(s, z)` e deixa o laço anti-horário.
fn limpar(mut p: Vec<(f64, f64)>) -> Vec<(f64, f64)> {
    p.dedup_by(|a, b| mesmo_ponto(*a, *b));
    while p.len() > 1 && mesmo_ponto(p[0], p[p.len() - 1]) {
        p.pop();
    }
    if p.len() < 3 {
        return p;
    }
    let inicio = (0..p.len()).min_by(|&i, &j| p[i].0.total_cmp(&p[j].0).then(p[i].1.total_cmp(&p[j].1))).unwrap_or(0);
    p.rotate_left(inicio);
    let n = p.len();
    let mut out = vec![p[0]];
    for i in 1..n {
        let (a, b, c) = (out[out.len() - 1], p[i], p[(i + 1) % n]);
        let l = (c.0 - a.0).hypot(c.1 - a.1);
        let dist = if l < 1e-12 { (b.0 - a.0).hypot(b.1 - a.1) } else { ((c.0 - a.0) * (b.1 - a.1) - (c.1 - a.1) * (b.0 - a.0)).abs() / l };
        if dist > TOL_COLINEAR {
            out.push(b);
        }
    }
    let m: Vec<[f64; 2]> = out.iter().map(|q| [q.0, q.1]).collect();
    if out.len() >= 3 && area_com_sinal(&m) < 0.0 {
        out.reverse();
        out.rotate_right(1);
    }
    out
}

/// Ponto de cruzamento do plano com a aresta `(lo, hi)` da malha, sempre calculado de `lo` para `hi` (as duas faces da aresta dão os mesmos bytes).
fn cruzamento(v: &[Vert], (lo, hi): (u32, u32)) -> (f64, f64) {
    let (a, b) = (v[lo as usize], v[hi as usize]);
    let k = a.t / (a.t - b.t);
    (a.s + (b.s - a.s) * k, a.z + (b.z - a.z) * k)
}

/// Laços da interseção do plano com os triângulos `indices` (de uma única cópia). Regra: `t >= 0` é lado positivo.
pub(crate) fn lacos(v: &[Vert], indices: &[u32]) -> Vec<Laco> {
    let negativo = |i: u32| v[i as usize].t < 0.0;
    let mut vizinhas: BTreeMap<(u32, u32), Vec<(u32, u32)>> = BTreeMap::new();
    for t in indices.chunks_exact(3) {
        let cruzadas: Vec<(u32, u32)> = [(t[0], t[1]), (t[1], t[2]), (t[2], t[0])].iter().filter(|&&(p, q)| negativo(p) != negativo(q)).map(|&(p, q)| (p.min(q), p.max(q))).collect();
        if let [a, b] = cruzadas[..] {
            vizinhas.entry(a).or_default().push(b);
            vizinhas.entry(b).or_default().push(a);
        }
    }
    let mut visto: BTreeSet<(u32, u32)> = BTreeSet::new();
    let mut out = Vec::new();
    for &inicio in vizinhas.keys() {
        if visto.contains(&inicio) {
            continue;
        }
        visto.insert(inicio);
        let mut cadeia = vec![inicio];
        let (mut anterior, mut atual, mut fechado) = (None, inicio, false);
        loop {
            let proxima = vizinhas[&atual].iter().copied().find(|n| Some(*n) != anterior);
            match proxima {
                Some(n) if n == inicio && cadeia.len() > 2 => {
                    fechado = true;
                    break;
                }
                Some(n) if !visto.contains(&n) => {
                    visto.insert(n);
                    cadeia.push(n);
                    anterior = Some(atual);
                    atual = n;
                }
                _ => break,
            }
        }
        let pontos = limpar(cadeia.iter().map(|&e| cruzamento(v, e)).collect());
        out.push(Laco { pontos, fechado });
    }
    out
}

/// Faixa `(s_min, s_max)` da parte do anel em `0 <= t <= prof`, ou `None` se nada do anel cai nela.
fn faixa(anel: &[Vert], prof: f64) -> Option<(f64, f64)> {
    let (mut lo, mut hi) = (f64::INFINITY, f64::NEG_INFINITY);
    let n = anel.len();
    for i in 0..n {
        let (a, b) = (anel[i], anel[(i + 1) % n]);
        if a.t >= 0.0 && a.t <= prof {
            lo = lo.min(a.s);
            hi = hi.max(a.s);
        }
        for c in [0.0, prof] {
            if (a.t - c) * (b.t - c) < 0.0 {
                let s = a.s + (b.s - a.s) * (c - a.t) / (b.t - a.t);
                lo = lo.min(s);
                hi = hi.max(s);
            }
        }
    }
    (lo <= hi).then_some((lo, hi))
}

/// Índices (em `T`) dos vértices dos perfis de todas as seções: as quinas.
fn cantos(m: &Massa, p: &Pilha) -> Vec<usize> {
    let mut idx = BTreeSet::new();
    for s in &m.secoes {
        for q in Curva::nova(&s.perfil).quinas() {
            let q = if q > 1.0 - FUSAO_T { (q - 1.0).max(0.0) } else { q };
            let j = p.t.partition_point(|&t| t < q - 2.0 * FUSAO_T);
            if j < p.t.len() && (p.t[j] - q).abs() <= 2.0 * FUSAO_T {
                idx.insert(j);
            }
        }
    }
    idx.into_iter().collect()
}

fn empurrar(out: &mut Vec<LinhaCorteMassa>, bytes: &mut u64, l: LinhaCorteMassa) -> Result<(), u32> {
    // Limite da ABI: a saída inteira tem de caber numa chamada.
    *bytes += 16 * (l.pontos.len() as u64 + 1) + 16;
    if *bytes > LIMITE_BYTES_POR_CHAMADA {
        return Err(LIMITE);
    }
    out.push(l);
    Ok(())
}

/// Malha `lod 2` da massa com os vértices já no sistema do plano, mais o que as três partes do corte precisam.
struct Alvo {
    malha: MalhaMassa,
    v: Vec<Vert>,
    /// Anéis por cópia e pontos por anel.
    na: usize,
    nt: usize,
    /// Cota de cada anel.
    z: Vec<f64>,
    /// Anel de cada seção do usuário.
    aneis_das_secoes: Vec<usize>,
    cantos: Vec<usize>,
}

impl Alvo {
    fn novo(m: &Massa, pl: &Plano) -> Result<Alvo, u32> {
        let c = casca(m, LOD)?;
        let p = Pilha::nova(m)?;
        let mut malha = MalhaMassa::default();
        malha_da_massa(m, LOD, &mut malha)?;
        let v = malha.vertices.iter().map(|q| { let (s, t) = pl.st(q[0], q[1]); Vert { s, t, z: q[2] } }).collect();
        let aneis_das_secoes = p
            .z
            .iter()
            .map(|&zs| (0..c.z.len()).min_by(|&i, &j| (c.z[i] - (m.z_base + zs)).abs().total_cmp(&(c.z[j] - (m.z_base + zs)).abs())).unwrap_or(0))
            .collect();
        Ok(Alvo { malha, v, na: c.aneis.len(), nt: p.t.len(), z: c.z, aneis_das_secoes, cantos: cantos(m, &p) })
    }

    fn anel(&self, copia: usize, a: usize) -> &[Vert] {
        let ini = (copia * self.na + a) * self.nt;
        &self.v[ini..ini + self.nt]
    }

    /// Triângulos da cópia (lateral, base e topo são contíguos).
    fn indices(&self, copia: usize) -> &[u32] {
        let g = &self.malha.grupos[3 * copia..3 * copia + 3];
        &self.malha.indices[g[0][3] as usize..(g[2][3] + g[2][4]) as usize]
    }

    /// `true` se o vértice `j` do anel `a` está na faixa visível e a sua normal externa aponta para o observador.
    fn canto_visivel(&self, copia: usize, a: usize, j: usize, pl: &Plano, prof: f64) -> bool {
        let base = (copia * self.na + a) * self.nt;
        let (ant, prox) = (self.malha.vertices[base + (j + self.nt - 1) % self.nt], self.malha.vertices[base + (j + 1) % self.nt]);
        let (tx, ty) = (prox[0] - ant[0], prox[1] - ant[1]);
        let l = tx.hypot(ty);
        let t = self.v[base + j].t;
        let (nx, ny) = pl.normal();
        // Anel anti-horário: a normal externa de uma tangente (tx, ty) é (ty, -tx).
        l > 1e-12 && t >= 0.0 && t <= prof && (ty * nx - tx * ny) / l < -NORMAL_MIN
    }
}

/// As linhas de uma cópia: cortados, projetados e feições.
fn linhas_da_copia(m: &Massa, al: &Alvo, copia: usize, pl: &Plano, prof: f64, out: &mut Vec<LinhaCorteMassa>, bytes: &mut u64) -> Result<(), u32> {
    let nova = |estilo: u32, pontos: Vec<(f64, f64)>| LinhaCorteMassa { massa: m.num, copia: copia as u32, estilo, pontos };
    for l in lacos(&al.v, al.indices(copia)).into_iter().filter(Laco::valido) {
        empurrar(out, bytes, nova(ESTILO_CORTADO, l.pontos))?;
    }
    let faixas: Vec<Option<(f64, f64)>> = (0..al.na).map(|a| faixa(al.anel(copia, a), prof)).collect();
    let mut a = 0;
    while a < al.na {
        if faixas[a].is_none() {
            a += 1;
            continue;
        }
        let ini = a;
        while a < al.na && faixas[a].is_some() {
            a += 1;
        }
        let trecho: Vec<(f64, f64, f64)> = (ini..a).filter_map(|k| faixas[k].map(|(lo, hi)| (lo, hi, al.z[k]))).collect();
        if trecho.len() < 2 {
            continue;
        }
        let pontos: Vec<(f64, f64)> = trecho.iter().map(|q| (q.0, q.2)).chain(trecho.iter().rev().map(|q| (q.1, q.2))).collect();
        let laco = Laco { pontos: limpar(pontos), fechado: true };
        if laco.valido() {
            empurrar(out, bytes, nova(ESTILO_PROJETADO, laco.pontos))?;
        }
    }
    for &anel in &al.aneis_das_secoes {
        if let Some((lo, hi)) = faixas[anel] {
            if hi - lo > QUANTIZA {
                empurrar(out, bytes, nova(ESTILO_FEICAO, vec![(lo, al.z[anel]), (hi, al.z[anel])]))?;
            }
        }
    }
    for &j in &al.cantos {
        let mut corrida: Vec<(f64, f64)> = Vec::new();
        for a in 0..=al.na {
            if a < al.na && al.canto_visivel(copia, a, j, pl, prof) {
                let q = al.anel(copia, a)[j];
                corrida.push((q.s, q.z));
            } else {
                if corrida.len() >= 2 {
                    empurrar(out, bytes, nova(ESTILO_FEICAO, std::mem::take(&mut corrida)))?;
                }
                corrida.clear();
            }
        }
    }
    Ok(())
}

/// Corte de várias massas, na ordem dada (a consulta passa `massa_num` crescente). Massa inválida é `ENTRADA`; limites, `LIMITE`.
pub fn massa_corte(massas: &[Massa], ox: f64, oy: f64, dx: f64, dy: f64, profundidade: f64) -> Result<Vec<LinhaCorteMassa>, u32> {
    if ![ox, oy, dx, dy, profundidade].iter().all(|v| v.is_finite()) {
        return Err(ENTRADA);
    }
    let mut out = Vec::new();
    let Some(pl) = Plano::novo(ox, oy, dx, dy).filter(|_| profundidade >= 0.0) else {
        return Ok(out);
    };
    let mut bytes = 0u64;
    for m in massas {
        let al = Alvo::novo(m, &pl)?;
        for copia in 0..m.copias() as usize {
            linhas_da_copia(m, &al, copia, &pl, profundidade, &mut out, &mut bytes)?;
        }
    }
    Ok(out)
}

/// Laços cortados de cada cópia de uma massa (sem filtro de validade), para o teste conferir que todos fecham. `(copia, laço)`.
#[cfg(test)]
pub(crate) fn lacos_da_massa(m: &Massa, ox: f64, oy: f64, dx: f64, dy: f64) -> Result<Vec<(u32, Laco)>, u32> {
    let Some(pl) = Plano::novo(ox, oy, dx, dy) else {
        return Ok(Vec::new());
    };
    let al = Alvo::novo(m, &pl)?;
    Ok((0..m.copias() as usize).flat_map(|c| lacos(&al.v, al.indices(c)).into_iter().map(move |l| (c as u32, l))).collect())
}

/// Achata as linhas: `linhas u32 [massa_num, copia, estilo, n_pontos]` e `pontos f64 [s, z]` na grade de 1 µm. Os estilos 0 e 1 repetem o primeiro
/// ponto no fim (laço fechado, como o `guarda_corte`).
pub fn achatar(linhas: &[LinhaCorteMassa]) -> (Vec<u32>, Vec<f64>) {
    let (mut l, mut p) = (Vec::with_capacity(4 * linhas.len()), Vec::new());
    for x in linhas {
        let fecho = if x.estilo == ESTILO_FEICAO { None } else { x.pontos.first() };
        l.extend_from_slice(&[x.massa, x.copia, x.estilo, (x.pontos.len() + usize::from(fecho.is_some())) as u32]);
        for &(s, z) in x.pontos.iter().chain(fecho) {
            p.extend_from_slice(&[na_grade(s), na_grade(z)]);
        }
    }
    (l, p)
}

/// Consulta 143: `linhas u32 [massa_num, copia, estilo, n_pontos]`, `pontos f64 [s, z]`.
pub fn consulta_massa_corte(cena: &Cena, nivel: u32, ox: f64, oy: f64, dx: f64, dy: f64, profundidade: f64) -> Result<Vec<Saida>, u32> {
    let linhas = massa_corte(&cena.massa.massas_do_nivel(nivel)?, ox, oy, dx, dy, profundidade)?;
    let (l, p) = achatar(&linhas);
    Ok(vec![Saida::U32(l), Saida::F64(p)])
}
