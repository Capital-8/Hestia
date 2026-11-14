//! Terreno (PLANO do terreno A.4 regras 8 e 16 e avisos 3, 4 e 6): a superfície proposta P de um terreno.
//!
//! Vértices de P, nesta ordem, todos com a cota `zP(p)` (regra 7, em `terreno_regioes`):
//! (a) os vértices de E que não estão estritamente dentro de plataforma ou região nivelada; (b) o contorno adensado de todas as regiões; (c) os "gêmeos" a
//! 0,01 m para fora de cada ponto do contorno das regiões planas (é o que faz a borda vertical); (d) a grade global de passo `h` com `0,02 < d ≤ D`. Os pontos
//! das fases (a), (c) e (d) estritamente dentro de OUTRA região plana saem, e os fora do domínio de E também. Dois pontos na mesma chave de fusão (1 mm) são
//! um só: vale o primeiro. Restrições: os trechos dos contornos adensados e depois as de E que ficaram; todas passam por `can_add_constraint` (as de E que
//! cruzarem são puladas sem aviso). Saem os triângulos fora do domínio de E (só importa com `borda`, que pode ser côncava).
//!
//! Sem nenhuma região, P é a própria E (mesmo objeto): as saídas de `superficie` 1 são byte a byte as de `superficie` 0.
//! A região de um triângulo é a de maior `ordem` (e `id_num`) cujo contorno contém o centroide.

use std::cell::OnceCell;
use std::collections::HashMap;
use std::rc::Rc;

use crate::cena::Cena;
use crate::esquema::ID_AUSENTE;
use crate::geo2d::{v, V};
use crate::terreno_avalia::Malha;
use crate::terreno_regioes::{aplicar, assinaturas_regioes, definir_alcances, gemeos, regioes_do_terreno, sobreposicao, Regiao, ALCANCE_MIN};
use crate::terreno_tin::triangular;
use crate::terreno_tipos::{chave, existente, AvisoTerreno, Existente, AVISO_PRECISAO_REDUZIDA, AVISO_REGIAO_FORA, AVISO_REGIOES_SOBREPOSTAS, SEMENTE};
use crate::terreno_volumes::Volumes;

/// Valor de `regiao_do_triangulo` para "sem região".
pub const SEM_REGIAO: u32 = u32::MAX;
/// Máximo de pontos da grade da fase (d), somando todas as regiões (acima disso o passo dobra e sai o aviso 4).
pub const MAX_PONTOS_GRADE: usize = 40_000;
/// Acima deste número de células candidatas o passo dobra sem nem contar os pontos (a contagem exata ficaria cara demais).
const CANDIDATAS_MAX: f64 = 1_000_000.0;

/// A superfície proposta de um terreno.
pub struct Proposta {
    /// A superfície existente (a mesma do cache de E).
    pub e: Rc<Malha>,
    /// P. Sem região, é `e`.
    pub malha: Rc<Malha>,
    /// Regiões do terreno, por `ordem` e `id_num`, com o alcance já definido.
    pub regioes: Vec<Regiao>,
    /// Por triângulo de `malha`: posição em `regioes` da região do triângulo, ou `SEM_REGIAO`.
    pub regiao_do_triangulo: Vec<u32>,
    /// Avisos 3, 4 e 6.
    pub avisos: Vec<AvisoTerreno>,
    /// Volumes de corte e aterro (calculados na primeira vez que alguém os pede).
    pub(crate) volumes: OnceCell<Rc<Volumes>>,
}

impl Proposta {
    /// `true` se alguma região altera a cota (há plataforma ou região nivelada).
    pub fn tem_plano(&self) -> bool {
        self.regioes.iter().any(Regiao::plana)
    }

    /// Menor e maior cota de E e de P juntas. `None` se não há triângulos.
    pub fn z_min_max(&self) -> Option<(f64, f64)> {
        let faixas = [&self.e, &self.malha].into_iter().filter(|m| !m.t.is_empty()).filter_map(|m| m.z_min_max());
        faixas.reduce(|a, b| (a.0.min(b.0), a.1.max(b.1)))
    }

    /// `id_num` da região do triângulo `k` de `malha`, ou `ID_AUSENTE`.
    pub fn id_da_regiao(&self, k: usize) -> u32 {
        match self.regiao_do_triangulo.get(k) {
            Some(&i) if i != SEM_REGIAO => self.regioes.get(i as usize).map_or(ID_AUSENTE, |r| r.id),
            _ => ID_AUSENTE,
        }
    }
}

fn aviso(codigo: u32, regiao: u32, indice: u32, medido: f64, limite: f64, p: [f64; 3]) -> AvisoTerreno {
    AvisoTerreno { codigo, regiao, indice, medido, limite, x: p[0], y: p[1], z: p[2] }
}

/// Vértices de P em construção, fundidos pela chave de 1 mm.
#[derive(Default)]
struct Vertices {
    pontos: Vec<[f64; 3]>,
    ids: Vec<u32>,
    por_chave: HashMap<(i64, i64), u32>,
}

impl Vertices {
    fn adicionar(&mut self, p: V, z: f64, id: u32) -> u32 {
        if let Some(&k) = self.por_chave.get(&chave(p.x, p.y)) {
            return k;
        }
        let k = self.pontos.len() as u32;
        self.por_chave.insert(chave(p.x, p.y), k);
        self.pontos.push([p.x, p.y, z]);
        self.ids.push(id);
        k
    }
}

/// Pontos da grade global de passo `passo` com `ALCANCE_MIN < d ≤ D` em torno de `r`, fora de `r`, dentro do domínio de E e fora das outras regiões planas.
/// `None` se passar de `restante` pontos.
fn grade_da_regiao(r: &Regiao, passo: f64, e: &Malha, outras: &[&Regiao], restante: usize) -> Option<Vec<V>> {
    let (i0, i1, j0, j1) = faixa_da_grade(r, passo);
    let mut out = Vec::new();
    for j in j0..=j1 {
        for i in i0..=i1 {
            let p = v(i as f64 * passo, j as f64 * passo);
            if !r.perto(p, r.alcance) || r.dentro(p) {
                continue;
            }
            let d = r.mais_proximo(p).1;
            if d > ALCANCE_MIN && d <= r.alcance && e.localizar(p.x, p.y).is_some() && !outras.iter().any(|o| o.estritamente_dentro(p)) {
                if out.len() >= restante {
                    return None;
                }
                out.push(p);
            }
        }
    }
    Some(out)
}

fn faixa_da_grade(r: &Regiao, passo: f64) -> (i64, i64, i64, i64) {
    let c = r.caixa();
    let f = |x: f64| (x / passo).floor() as i64;
    let g = |x: f64| (x / passo).ceil() as i64;
    (f(c[0] - r.alcance), g(c[2] + r.alcance), f(c[1] - r.alcance), g(c[3] + r.alcance))
}

fn celulas(r: &Regiao, passo: f64) -> f64 {
    let (i0, i1, j0, j1) = faixa_da_grade(r, passo);
    (i1 - i0 + 1) as f64 * (j1 - j0 + 1) as f64
}

/// Fase (d) para todas as regiões planas com `D > 0,02`: as listas de pontos e o fator de dobra do passo (0 = sem dobra).
fn grades(regioes: &[Regiao], planas: &[usize], e: &Malha) -> (Vec<Vec<V>>, u32) {
    let com_grade: Vec<usize> = planas.iter().copied().filter(|&i| regioes[i].alcance > ALCANCE_MIN).collect();
    let mut dobra = 0u32;
    loop {
        let passo = |i: usize| regioes[i].h * f64::from(1u32 << dobra.min(30));
        let candidatas: f64 = com_grade.iter().map(|&i| celulas(&regioes[i], passo(i))).sum();
        if candidatas > CANDIDATAS_MAX && dobra < 30 {
            dobra += 1;
            continue;
        }
        let mut listas = Vec::with_capacity(com_grade.len());
        let mut restante = MAX_PONTOS_GRADE;
        let mut coube = true;
        for &i in &com_grade {
            let outras: Vec<&Regiao> = planas.iter().filter(|&&k| k != i).map(|&k| &regioes[k]).collect();
            match grade_da_regiao(&regioes[i], passo(i), e, &outras, restante) {
                Some(l) => {
                    restante -= l.len();
                    listas.push(l);
                }
                None => {
                    coube = false;
                    break;
                }
            }
        }
        if coube || dobra >= 30 {
            return (if coube { listas } else { Vec::new() }, dobra);
        }
        dobra += 1;
    }
}

/// Compacta uma triangulação: só ficam os vértices usados, na ordem de entrada.
fn compactar(pontos: &[[f64; 3]], ids: &[u32], t: &[[u32; 3]], restricoes: &[[u32; 2]]) -> Malha {
    let mut novo: Vec<Option<u32>> = vec![None; pontos.len()];
    for &i in t.iter().flatten() {
        novo[i as usize] = Some(0);
    }
    let (mut vs, mut is) = (Vec::new(), Vec::new());
    for (i, n) in novo.iter_mut().enumerate() {
        if n.is_some() {
            *n = Some(vs.len() as u32);
            vs.push(pontos[i]);
            is.push(ids[i]);
        }
    }
    let nova = |i: u32| novo[i as usize].unwrap_or(0);
    let tri = t.iter().map(|x| [nova(x[0]), nova(x[1]), nova(x[2])]).collect();
    let rs = restricoes.iter().filter_map(|r| novo[r[0] as usize].zip(novo[r[1] as usize])).map(|(a, b)| [a, b]).collect();
    Malha::nova(vs, is, tri, rs)
}

/// Posição em `regioes` da região de maior `(ordem, id)` que contém o ponto, ou `SEM_REGIAO`.
fn regiao_do_ponto(regioes: &[Regiao], p: V) -> u32 {
    regioes.iter().rposition(|r| r.dentro(p)).map_or(SEM_REGIAO, |i| i as u32)
}

/// Superfície proposta de um terreno a partir de E e das suas regiões (já ordenadas). Erro (`ENTRADA`) só se a biblioteca de triangulação recusar uma
/// coordenada.
pub fn calcular(ex: &Existente, mut regioes: Vec<Regiao>) -> Result<Proposta, u32> {
    let e = &ex.e;
    if regioes.is_empty() || e.t.is_empty() {
        let n = if regioes.is_empty() { e.t.len() } else { 0 };
        return Ok(Proposta { e: Rc::clone(e), malha: Rc::clone(e), regioes, regiao_do_triangulo: vec![SEM_REGIAO; n], avisos: Vec::new(), volumes: OnceCell::new() });
    }
    definir_alcances(&mut regioes, e);
    let densos: Vec<Vec<V>> = regioes.iter().map(Regiao::contorno_denso).collect();
    let planas: Vec<usize> = (0..regioes.len()).filter(|&i| regioes[i].plana()).collect();
    let (mut a3, mut a4, mut a6) = (Vec::new(), Vec::new(), Vec::new());
    for (i, r) in regioes.iter().enumerate() {
        let fora: Vec<V> = densos[i].iter().copied().filter(|q| e.localizar(q.x, q.y).is_none()).collect();
        if let Some(p) = fora.first() {
            a6.push(aviso(AVISO_REGIAO_FORA, r.id, ID_AUSENTE, fora.len() as f64 / densos[i].len() as f64, 0.0, [p.x, p.y, 0.0]));
        }
    }
    for (a, &i) in planas.iter().enumerate() {
        for &j in &planas[a + 1..] {
            if let Some(p) = sobreposicao(&regioes[i], &regioes[j]) {
                a3.push(aviso(AVISO_REGIOES_SOBREPOSTAS, regioes[j].id, regioes[i].id, 0.0, 0.0, [p.x, p.y, e.cota(p.x, p.y).unwrap_or(0.0)]));
            }
        }
    }
    let dentro_de_plana = |p: V| planas.iter().any(|&k| regioes[k].estritamente_dentro(p));
    let mut vs = Vertices::default();
    // (a) vértices de E fora das regiões planas.
    let mut de_e: Vec<Option<u32>> = vec![None; e.v.len()];
    for (k, p) in e.v.iter().enumerate() {
        let q = v(p[0], p[1]);
        if !dentro_de_plana(q) {
            de_e[k] = Some(vs.adicionar(q, aplicar(&regioes, q, p[2]), e.ids[k]));
        }
    }
    // (b) contorno adensado de todas as regiões.
    let aneis: Vec<Vec<Option<u32>>> = densos.iter().map(|d| d.iter().map(|&q| e.cota(q.x, q.y).map(|z| vs.adicionar(q, aplicar(&regioes, q, z), ID_AUSENTE))).collect()).collect();
    // (c) gêmeos das regiões planas.
    for &i in &planas {
        for t in gemeos(&densos[i]) {
            if let Some(z) = e.cota(t.x, t.y).filter(|_| !dentro_de_plana(t)) {
                vs.adicionar(t, aplicar(&regioes, t, z), ID_AUSENTE);
            }
        }
    }
    // (d) grade global em volta das regiões planas com talude.
    let (listas, dobra) = grades(&regioes, &planas, e);
    for l in &listas {
        for &p in l {
            if let Some(z) = e.cota(p.x, p.y) {
                vs.adicionar(p, aplicar(&regioes, p, z), ID_AUSENTE);
            }
        }
    }
    if dobra > 0 {
        for &i in planas.iter().filter(|&&i| regioes[i].alcance > ALCANCE_MIN) {
            a4.push(aviso(AVISO_PRECISAO_REDUZIDA, regioes[i].id, ID_AUSENTE, regioes[i].h * f64::from(1u32 << dobra.min(30)), regioes[i].h, [0.0; 3]));
        }
    }
    // Restrições: contornos das regiões e depois as de E que ficaram.
    let mut trechos: Vec<[u32; 2]> = Vec::new();
    for anel in &aneis {
        for k in 0..anel.len() {
            if let Some((a, b)) = anel[k].zip(anel[(k + 1) % anel.len()]).filter(|(a, b)| a != b) {
                trechos.push([a, b]);
            }
        }
    }
    trechos.extend(e.restricoes.iter().filter_map(|r| de_e[r[0] as usize].zip(de_e[r[1] as usize])).filter(|(a, b)| a != b).map(|(a, b)| [a, b]));
    let xy: Vec<[f64; 2]> = vs.pontos.iter().map(|p| [p[0], p[1]]).collect();
    let tri = triangular(&xy, &trechos)?;
    let aceitos: Vec<[u32; 2]> = trechos.iter().zip(&tri.aceitas).filter(|(_, &ok)| ok).map(|(t, _)| *t).collect();
    let triangulos: Vec<[u32; 3]> = if ex.borda.is_some() {
        tri.t
            .into_iter()
            .filter(|t| {
                let c = t.map(|i| vs.pontos[i as usize]);
                e.localizar((c[0][0] + c[1][0] + c[2][0]) / 3.0, (c[0][1] + c[1][1] + c[2][1]) / 3.0).is_some()
            })
            .collect()
    } else {
        tri.t
    };
    let malha = compactar(&vs.pontos, &vs.ids, &triangulos, &aceitos);
    let regiao_do_triangulo = (0..malha.t.len())
        .map(|k| {
            let c = malha.t[k].map(|i| malha.v[i as usize]);
            regiao_do_ponto(&regioes, v((c[0][0] + c[1][0] + c[2][0]) / 3.0, (c[0][1] + c[1][1] + c[2][1]) / 3.0))
        })
        .collect();
    let avisos = a3.into_iter().chain(a4).chain(a6).collect();
    Ok(Proposta { e: Rc::clone(e), malha: Rc::new(malha), regioes, regiao_do_triangulo, avisos, volumes: OnceCell::new() })
}

/// P do terreno, do cache ou calculada agora (regra 16): vale enquanto E é o mesmo objeto do cache e a assinatura das regiões do terreno não muda. Mover uma
/// região não refaz E. Erro não fica no cache.
pub fn proposta(cena: &Cena, terreno: u32) -> Result<Rc<Proposta>, u32> {
    let e = existente(cena, terreno)?;
    let mut guarda = cena.cache_terreno.borrow_mut();
    let cache = &mut *guarda;
    let geracao = cena.terreno.geracao_regioes();
    if cache.geracao_regioes != Some(geracao) {
        cache.assinaturas_regioes = assinaturas_regioes(&cena.terreno);
        cache.geracao_regioes = Some(geracao);
    }
    let assinatura = cache.assinaturas_regioes.get(&terreno).copied().unwrap_or(SEMENTE);
    if let Some((e0, a, p)) = cache.propostas.get(&terreno) {
        if Rc::ptr_eq(e0, &e) && *a == assinatura {
            return Ok(Rc::clone(p));
        }
    }
    let p = Rc::new(calcular(&e, regioes_do_terreno(&cena.terreno, terreno))?);
    #[cfg(test)]
    {
        cache.propostas_calculadas += 1;
    }
    cache.propostas.insert(terreno, (e, assinatura, Rc::clone(&p)));
    Ok(p)
}

/// A superfície pedida de um terreno: `superficie` 0 = E, 1 = P.
pub fn superficie_do_terreno(cena: &Cena, terreno: u32, superficie: u32) -> Result<Rc<Malha>, u32> {
    if superficie == 0 {
        Ok(Rc::clone(&existente(cena, terreno)?.e))
    } else {
        Ok(Rc::clone(&proposta(cena, terreno)?.malha))
    }
}
