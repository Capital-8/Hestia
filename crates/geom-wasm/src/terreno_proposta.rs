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
use crate::terreno_regioes::{aplicar, assinaturas_regioes, definir_alcances, gemeos, regioes_do_terreno, sobreposicao, Regiao, ALCANCE_MAX, ALCANCE_MIN};
use crate::terreno_tin::triangular;
use crate::terreno_tipos::{chave, existente, AvisoTerreno, Existente, AVISO_PRECISAO_REDUZIDA, AVISO_REGIAO_FORA, AVISO_REGIOES_SOBREPOSTAS, AVISO_TALUDE_NAO_ALCANCA, SEMENTE};
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

/// Erro de cota (m) tolerado da malha proposta em relação a `zP` na faixa dos taludes: 1 cm, a precisão de obra de uma cota de terraplenagem.
pub const TOL_PE: f64 = 0.01;
/// Teto de vértices acrescentados pelo refino do pé do talude (cruzamentos e refino adaptativo); passado o teto, o refino para e a malha fica como está.
pub const TETO_REFINO: usize = 10_000;
/// Distância (m) à reta dos vizinhos abaixo da qual um cruzamento da cadeia do pé do talude é dispensado (evita triângulos de sliver).
const COM_CADEIA: bool = true;
const ALINHADO: f64 = 1e-3;
/// Distância (m) ao contorno de uma região plana abaixo da qual o refino não mexe: ali ficam a parede dos "gêmeos" e seus triângulos estreitos.
const FOLGA_PAREDE: f64 = 0.05;
/// Rodadas de refino adaptativo depois da rodada dos cruzamentos.
const RODADAS_REFINO: usize = 6;

fn pt_de(p: &[[f64; 3]], i: u32) -> V {
    v(p[i as usize][0], p[i as usize][1])
}

/// Triangula P e refina em volta do pé do talude (onde o talude encontra E, quina de `zP`): a rodada 0 acha, em cada aresta cujas pontas têm o talude
/// ativo e inativo, o ponto de transição (bisseção) e liga os dois pontos de cada triângulo por uma restrição (breakline), de modo que talude e terreno
/// compartilham vértices na borda e a quina fica exata; as rodadas seguintes inserem o ponto de pior erro `|zP − interpolação|` de cada triângulo (centro
/// e meios das arestas) acima de `TOL_PE`. Determinístico: só percorre triângulos na ordem da triangulação. Devolve a triangulação final.
fn refinar_pe_do_talude(regioes: &[Regiao], planas: &[usize], e: &Malha, vs: &mut Vertices, trechos: &mut Vec<[u32; 2]>) -> Result<crate::terreno_tin::Triangulacao, u32> {
    let xy_de = |vs: &Vertices| -> Vec<[f64; 2]> { vs.pontos.iter().map(|p| [p[0], p[1]]).collect() };
    let com_talude: Vec<&Regiao> = planas.iter().map(|&i| &regioes[i]).filter(|r| r.alcance > ALCANCE_MIN && (r.talude_corte > 0.0 || r.talude_aterro > 0.0)).collect();
    let mut tri = triangular(&xy_de(vs), trechos)?;
    if com_talude.is_empty() {
        return Ok(tri);
    }
    let base = vs.pontos.len();
    let zp_de = |p: V| e.cota(p.x, p.y).map(|z| aplicar(regioes, p, z));
    let ativo = |p: V| e.cota(p.x, p.y).is_some_and(|z| (aplicar(regioes, p, z) - z).abs() > 1e-9);
    let dentro_de_plana = |p: V| planas.iter().any(|&k| regioes[k].estritamente_dentro(p));
    let na_parede = |p: V| planas.iter().any(|&k| regioes[k].perto(p, FOLGA_PAREDE) && regioes[k].mais_proximo(p).1 < FOLGA_PAREDE);
    let no_alcance = |p: V| com_talude.iter().any(|r| r.perto(p, r.alcance));
    for rodada in 0..=RODADAS_REFINO {
        let antes = vs.pontos.len();
        // Arestas presas (restrições aceitas): um vértice novo sobre elas, por arredondamento, só geraria triângulo-lasca; ficam como estão.
        let presas: std::collections::HashSet<(u32, u32)> = trechos.iter().zip(&tri.aceitas).filter(|(_, &ok)| ok).map(|(r, _)| (r[0].min(r[1]), r[0].max(r[1]))).collect();
        if rodada == 0 {
            let flags: Vec<bool> = (0..vs.pontos.len()).map(|i| ativo(pt_de(&vs.pontos, i as u32))).collect();
            let mut cruz: HashMap<(u32, u32), u32> = HashMap::new();
            let mut novos: Vec<(V, f64)> = Vec::new();
            let mut ligas: Vec<[(u32, u32); 2]> = Vec::new();
            for t in &tri.t {
                let mut achados: Vec<(u32, u32)> = Vec::new();
                for k in 0..3 {
                    let (a, b) = (t[k], t[(k + 1) % 3]);
                    if flags[a as usize] != flags[b as usize] && !presas.contains(&(a.min(b), a.max(b))) {
                        achados.push((a.min(b), a.max(b)));
                    }
                }
                if achados.len() == 2 {
                    for &ar in &achados {
                        if !cruz.contains_key(&ar) {
                            let (ia, ib) = if flags[ar.0 as usize] { (pt_de(&vs.pontos, ar.1), pt_de(&vs.pontos, ar.0)) } else { (pt_de(&vs.pontos, ar.0), pt_de(&vs.pontos, ar.1)) };
                            let (mut lo, mut hi) = (ia, ib);
                            for _ in 0..40 {
                                let m = v((lo.x + hi.x) / 2.0, (lo.y + hi.y) / 2.0);
                                if ativo(m) {
                                    hi = m;
                                } else {
                                    lo = m;
                                }
                            }
                            let m = v((lo.x + hi.x) / 2.0, (lo.y + hi.y) / 2.0);
                            cruz.insert(ar, novos.len() as u32);
                            novos.push((m, 0.0));
                        }
                    }
                    ligas.push([achados[0], achados[1]]);
                }
            }
            // Vizinhos de cada cruzamento ao longo da curva (cada triângulo liga dois).
            let mut viz: Vec<Vec<usize>> = vec![Vec::new(); novos.len()];
            for l in &ligas {
                let (a, b) = (cruz[&l[0]] as usize, cruz[&l[1]] as usize);
                if a != b {
                    viz[a].push(b);
                    viz[b].push(a);
                }
            }
            let mut visto = vec![false; novos.len()];
            let inicios: Vec<usize> = (0..novos.len()).filter(|&k| viz[k].len() <= 1).chain(0..novos.len()).collect();
            for ini in inicios {
                if visto[ini] {
                    continue;
                }
                // Percorre a corrente a partir de `ini`.
                let mut cadeia = vec![ini];
                visto[ini] = true;
                while let Some(&prox) = viz[*cadeia.last().unwrap_or(&ini)].iter().find(|&&k| !visto[k]) {
                    visto[prox] = true;
                    cadeia.push(prox);
                }
                // Tira os pontos alinhados (a menos de 1 mm da reta dos vizinhos): triângulos de sliver não valem os vértices extras.
                let mut mantidos: Vec<usize> = vec![cadeia[0]];
                for k in 1..cadeia.len() {
                    let (a, p) = (novos[*mantidos.last().unwrap_or(&cadeia[0])].0, novos[cadeia[k]].0);
                    let alinhado = k + 1 < cadeia.len() && {
                        let b = novos[cadeia[k + 1]].0;
                        let (dx, dy) = (b.x - a.x, b.y - a.y);
                        let l = crate::geo2d::hipot(dx, dy);
                        l > 0.0 && ((p.x - a.x) * dy - (p.y - a.y) * dx).abs() / l < ALINHADO
                    };
                    if !alinhado {
                        mantidos.push(cadeia[k]);
                    }
                }
                let idx: Vec<Option<u32>> = mantidos
                    .iter()
                    .map(|&k| {
                        let m = novos[k].0;
                        if dentro_de_plana(m) || na_parede(m) {
                            None
                        } else {
                            zp_de(m).filter(|_| vs.pontos.len() - base < TETO_REFINO).map(|z| vs.adicionar(m, z, ID_AUSENTE))
                        }
                    })
                    .collect();
                for w in idx.windows(2) {
                    if let Some((a, b)) = w[0].zip(w[1]).filter(|(a, b)| a != b) {
                        if COM_CADEIA {
                            trechos.push([a, b]);
                        }
                    }
                }
            }
        } else {
            for t in &tri.t {
                if vs.pontos.len() - base >= TETO_REFINO {
                    break;
                }
                let c = t.map(|i| pt_de(&vs.pontos, i));
                let z = t.map(|i| vs.pontos[i as usize][2]);
                let maior = (0..3).map(|k| crate::geo2d::hipot(c[(k + 1) % 3].x - c[k].x, c[(k + 1) % 3].y - c[k].y)).fold(0.0, f64::max);
                if maior < 0.02 {
                    continue;
                }
                let mut amostras = vec![(v((c[0].x + c[1].x + c[2].x) / 3.0, (c[0].y + c[1].y + c[2].y) / 3.0), (z[0] + z[1] + z[2]) / 3.0)];
                for k in 0..3 {
                    let j = (k + 1) % 3;
                    if !presas.contains(&(t[k].min(t[j]), t[k].max(t[j]))) {
                        amostras.push((v((c[k].x + c[j].x) / 2.0, (c[k].y + c[j].y) / 2.0), (z[k] + z[j]) / 2.0));
                    }
                }
                let pior = amostras
                    .into_iter()
                    .filter(|&(p, _)| no_alcance(p) && !dentro_de_plana(p) && !na_parede(p))
                    .filter_map(|(p, zi)| zp_de(p).map(|zt| (p, zt, (zt - zi).abs())))
                    .filter(|x| x.2 > TOL_PE)
                    .fold(None, |m: Option<(V, f64, f64)>, x| if m.is_none_or(|y| x.2 > y.2) { Some(x) } else { m });
                if let Some((p, zt, _)) = pior {
                    vs.adicionar(p, zt, ID_AUSENTE);
                }
            }
        }
        if vs.pontos.len() == antes && rodada > 0 {
            break;
        }
        if rodada == RODADAS_REFINO || vs.pontos.len() - base >= TETO_REFINO && rodada > 0 {
            tri = triangular(&xy_de(vs), trechos)?;
            break;
        }
        tri = triangular(&xy_de(vs), trechos)?;
    }
    Ok(tri)
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
    let curtos = definir_alcances(&mut regioes, e);
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
    let tri = refinar_pe_do_talude(&regioes, &planas, e, &mut vs, &mut trechos)?;
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
    let a7: Vec<AvisoTerreno> = curtos.iter().map(|&(id, d)| aviso(AVISO_TALUDE_NAO_ALCANCA, id, ID_AUSENTE, d, ALCANCE_MAX, [0.0; 3])).collect();
    let avisos = a3.into_iter().chain(a4).chain(a6).chain(a7).collect();
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
