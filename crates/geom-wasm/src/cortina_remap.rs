//! Remapeamento das sobrescritas da parede cortina (decisão 0056, fase 2: §4.4 e §5.2). Recebe as entradas GRAVADAS (linhas extras, linhas geradas com
//! posição ou montante sobrescritos, segmentos removidos, painel por célula) e as confronta com a grade NOVA, na ordem de id crescente. Nada aqui grava no
//! modelo: as que não se aplicam saem como `Orfao` (aviso de projeto) e o TS as descarta na próxima edição (`normalizarSobrescritas`).
//!
//! Regras (ver também `cortina_pecas::resolver_uma`):
//! - **Linha gerada** (`mapear_gerada`): mesma contagem de células do eixo => mesmo índice; senão, a linha gerada nova mais próxima em posição normalizada
//!   (`pos / A`). Duas referências na mesma linha: vence a de menor distância (empate: menor id), a outra é órfã.
//! - **Linha extra e travada** (`posicao_resolvida`): `travada` mantém `pos` (m); senão a posição acompanha a fração `pos / comp` gravada, o que reproduz o
//!   "esticar com a parede". Fora do vão (`(0, A)`) a linha não se aplica e vira órfã. Extra e gerada na mesma posição (1e-6): vale a extra.
//! - **Célula** (`mapear_celulas`, §4.4): (1) mesma topologia (`nu`, `nv`) e centro novo a no máximo 0,5 da posição gravada em cada eixo => vale o índice;
//!   (2) senão, o ponto `(s·L', z·H')` é localizado na grade nova (ponto sobre uma linha: a célula de menor índice); (3) duas sobrescritas na mesma célula:
//!   vence a de menor distância entre o ponto e o centro; (4) ponto fora da grade: a célula vizinha mais próxima (até uma célula de distância), se livre; (5) o
//!   resto é órfão.
//! - **Segmento removido** (`mapear_segmentos`): a linha segue a regra acima; o `k` é o mesmo se a contagem de segmentos da linha for a mesma, senão o
//!   segmento de ponto médio mais próximo. Remoção repetida vale uma vez.
//! - **Região** (`fundir`, §5.2): as remoções valem em ordem canônica (eixo, linha, k); uma remoção que deixa a região não retangular é RECUSADA (aviso
//!   `cortina-celula-nao-retangular`). Região = componente ligada pelos segmentos removidos.

use crate::cortina_tipos::*;
use crate::esquema::ID_AUSENTE;

/// Identidade de uma linha final: a gerada (índice na grade gerada, 1 a n−1) ou a extra (id).
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Ident {
    Gerada(usize),
    Extra(u32),
}

/// Montante escolhido para uma linha: o padrão do eixo, nenhum (`null` no TS) ou um tipo próprio.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Escolha {
    Padrao,
    Sem,
    Tipo(u32),
}

/// Linha interior final de um eixo (crescente por `pos`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LinhaFinal {
    pub pos: f64,
    pub ident: Ident,
    /// `ORIGEM_GERADA`, `ORIGEM_EXTRA` ou `ORIGEM_MANUAL` (ver `cortina_tipos`).
    pub origem: u32,
    pub montante: Escolha,
    /// Travada (`locked`): mantém a posição absoluta. Vale para a extra e para a gerada com sobrescrita travada (flag bit 0 de `cortina_grade`).
    pub travada: bool,
}

/// Quem não se aplicou: a célula, a linha ou o segmento gravado. `s` e `z` são a posição aproximada no plano (m), para "Ir para".
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Alvo {
    Celula { i: u32, j: u32 },
    /// `indice` é o índice da linha gerada ou o id da linha extra.
    Linha { eixo: u8, indice: u32 },
    Segmento { eixo: u8, linha: u32, k: u32 },
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Orfao {
    pub id: u32,
    pub alvo: Alvo,
    pub s: f64,
    pub z: f64,
}

/// Linha GERADA sobrescrita (`lineOverrides`): `pos` (m, `NaN` = sem posição nova), `travada`, `comp` (A na gravação) e o montante (`modo` 0 herda,
/// 1 sem montante, 2 tipo `montante`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SobLinha {
    pub id: u32,
    pub linha: u32,
    pub pos_norm: f64,
    pub n: u32,
    pub travada: bool,
    pub pos: f64,
    pub comp: f64,
    pub modo: u8,
    pub montante: u32,
}

/// Linha extra (`addedLines`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ExtLinha {
    pub id: u32,
    pub pos: f64,
    pub travada: bool,
    pub comp: f64,
    pub montante: u32,
}

/// Sobrescrita de painel de uma célula, como gravada.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct CelSob {
    pub id: u32,
    pub i: u32,
    pub j: u32,
    pub s: f64,
    pub z: f64,
    pub nu: u32,
    pub nv: u32,
    pub painel: u32,
}

/// Segmento removido, como gravado. `extra`: a linha é extra (`linha` = o id dela); senão `linha` é o índice gerado gravado (1 a n−1).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SegRemovido {
    pub id: u32,
    pub eixo: u8,
    pub extra: bool,
    pub linha: u32,
    pub pos_norm: f64,
    pub n: u32,
    pub k: u32,
    pub nk: u32,
    pub mid: f64,
}

/// Posição (m) de uma linha gravada com `pos` e `comp`: `travada` mantém; senão, a fração `pos / comp` vezes o comprimento novo `a`.
pub fn posicao_resolvida(pos: f64, travada: bool, comp: f64, a: f64) -> f64 {
    if travada || comp <= 0.0 {
        pos
    } else {
        pos / comp * a
    }
}

/// Dentro do vão (`TOL_POS < p < A − TOL_POS`), como em `cortina_grade`.
fn dentro(a: f64, p: f64) -> bool {
    p > TOL_POS && p < a - TOL_POS
}

/// Ponto no plano para uma linha de um eixo: U (vertical) em `s = pos`; V (horizontal) em `z = pos`.
fn ponto_da_linha(eixo: u8, p: f64) -> (f64, f64) {
    if eixo == EIXO_U {
        (p, 0.0)
    } else {
        (0.0, p)
    }
}

/// Índice (1 a n−1) da linha gerada nova que corresponde à gravada, e a distância normalizada entre as duas posições. `None` se não há linha gerada
/// nova (grade sem linha interna) ou a posição gravada é inválida.
pub fn mapear_gerada(n_rec: u32, idx: u32, pos_norm: f64, novas_norm: &[f64]) -> Option<(usize, f64)> {
    if !pos_norm.is_finite() || novas_norm.is_empty() {
        return None;
    }
    let n_novo = novas_norm.len() as u32 + 1;
    if n_rec == n_novo && idx >= 1 && idx <= novas_norm.len() as u32 {
        let k = idx as usize;
        return Some((k, (novas_norm[k - 1] - pos_norm).abs()));
    }
    let mut melhor: Option<(usize, f64)> = None;
    for (k0, &p) in novas_norm.iter().enumerate() {
        let d = (p - pos_norm).abs();
        if melhor.is_none_or(|(_, b)| d < b - EPS_CONTAGEM) {
            melhor = Some((k0 + 1, d));
        }
    }
    melhor
}

/// Linhas finais de um eixo: as geradas (com as sobrescritas aplicadas), as extras, ordenadas e soldadas, e as órfãs. `gerada` são as posições internas
/// que a grade gera (sem sobrescrita), `manual` diz se o eixo é do modo manual (origem 2).
#[derive(Clone, Debug, PartialEq)]
pub struct EixoFinal {
    pub linhas: Vec<LinhaFinal>,
    pub orfaos: Vec<Orfao>,
}

pub fn linhas_finais(eixo: u8, a: f64, gerada: &[f64], manual: bool, sob: &[SobLinha], ext: &[ExtLinha]) -> EixoFinal {
    let novas_norm: Vec<f64> = gerada.iter().map(|p| p / a).collect();
    let mut orfaos = Vec::new();
    let mut pos_geradas: Vec<f64> = gerada.to_vec();
    let mut escolhas: Vec<Escolha> = vec![Escolha::Padrao; gerada.len()];
    let mut travadas: Vec<bool> = vec![false; gerada.len()];
    // Linha gerada cuja sobrescrita leva a posição para fora do vão: a linha SOME (a referência TS faz o mesmo), e a sobrescrita vira órfã.
    let mut removidas: Vec<bool> = vec![false; gerada.len()];
    let origem_gerada = if manual { ORIGEM_MANUAL } else { ORIGEM_GERADA };

    // Linhas geradas: cada sobrescrita vai para uma linha nova; duas numa mesma linha => vence a mais próxima (empate: menor id).
    let mut cands: Vec<(usize, f64, u32, usize)> = Vec::new();
    for (x, s) in sob.iter().enumerate() {
        match mapear_gerada(s.n, s.linha, s.pos_norm, &novas_norm) {
            Some((k, d)) => cands.push((k, d, s.id, x)),
            None => {
                let (ps, pz) = ponto_da_linha(eixo, if s.pos.is_finite() { s.pos } else { 0.0 });
                orfaos.push(Orfao { id: s.id, alvo: Alvo::Linha { eixo, indice: s.linha }, s: ps, z: pz });
            }
        }
    }
    cands.sort_by(|p, q| p.0.cmp(&q.0).then(p.1.total_cmp(&q.1)).then(p.2.cmp(&q.2)));
    let mut ultimo_k = usize::MAX;
    for (k, _, _, x) in cands {
        let s = sob[x];
        if k == ultimo_k {
            // Segunda referência na mesma linha: órfã (a posição aproximada é a da linha gerada).
            let p = gerada[k - 1];
            let (ps, pz) = ponto_da_linha(eixo, p);
            orfaos.push(Orfao { id: s.id, alvo: Alvo::Linha { eixo, indice: s.linha }, s: ps, z: pz });
            continue;
        }
        ultimo_k = k;
        // Posição fora do vão: a sobrescrita inteira (posição e montante) não se aplica e vira órfã.
        if s.pos.is_finite() {
            let p = posicao_resolvida(s.pos, s.travada, s.comp, a);
            if !dentro(a, p) {
                let (ps, pz) = ponto_da_linha(eixo, p);
                orfaos.push(Orfao { id: s.id, alvo: Alvo::Linha { eixo, indice: s.linha }, s: ps, z: pz });
                removidas[k - 1] = true;
                continue;
            }
            pos_geradas[k - 1] = p;
        }
        escolhas[k - 1] = match s.modo {
            1 => Escolha::Sem,
            2 => Escolha::Tipo(s.montante),
            _ => Escolha::Padrao,
        };
        travadas[k - 1] = s.travada;
    }

    // Todas as linhas: geradas e extras. Ordena por posição; em empate (1e-6), vale a extra.
    let mut todas: Vec<LinhaFinal> = Vec::with_capacity(gerada.len() + ext.len());
    for k in 1..=gerada.len() {
        if removidas[k - 1] {
            continue;
        }
        todas.push(LinhaFinal { pos: pos_geradas[k - 1], ident: Ident::Gerada(k), origem: origem_gerada, montante: escolhas[k - 1], travada: travadas[k - 1] });
    }
    for e in ext {
        let p = posicao_resolvida(e.pos, e.travada, e.comp, a);
        if dentro(a, p) {
            let montante = if e.montante == ID_AUSENTE { Escolha::Padrao } else { Escolha::Tipo(e.montante) };
            todas.push(LinhaFinal { pos: p, ident: Ident::Extra(e.id), origem: ORIGEM_EXTRA, montante, travada: e.travada });
        } else {
            let (ps, pz) = ponto_da_linha(eixo, p);
            orfaos.push(Orfao { id: e.id, alvo: Alvo::Linha { eixo, indice: e.id }, s: ps, z: pz });
        }
    }
    todas.sort_by(|p, q| p.pos.total_cmp(&q.pos).then(q.origem.cmp(&p.origem)));
    let mut linhas: Vec<LinhaFinal> = Vec::with_capacity(todas.len());
    for l in todas {
        match linhas.last_mut() {
            Some(u) if l.pos - u.pos < TOL_POS => {
                // A extra vale sobre a gerada; entre duas da mesma origem, a primeira.
                if l.origem == ORIGEM_EXTRA && u.origem != ORIGEM_EXTRA {
                    *u = l;
                }
            }
            _ => linhas.push(l),
        }
    }
    EixoFinal { linhas, orfaos }
}

/// Resultado do remapeamento das células: as adotadas (`(i, j, sobrescrita)`) e as órfãs.
#[derive(Clone, Debug, PartialEq)]
pub struct CelulasFinais {
    pub adotadas: Vec<(usize, usize, CelSob)>,
    pub orfaos: Vec<Orfao>,
}

/// Índice da célula que contém `p` numa grade de arestas `arestas` (já dentro de `[0, fim]`): o menor índice cuja aresta direita não fica antes de `p`
/// (um ponto sobre uma linha vai para a célula de menor índice).
fn localiza(p: f64, arestas: &[f64]) -> usize {
    let n = arestas.len() - 1;
    (0..n).find(|&i| p <= arestas[i + 1] + TOL_POS).unwrap_or(n - 1)
}

/// `true` se o ponto `p` (m) está a no máximo o lado da célula `(i, j)` de distância dela, em cada eixo (§4.4, passo 4).
fn perto_da_celula(p: (f64, f64), us: &[f64], vs: &[f64], i: usize, j: usize) -> bool {
    let fora = |x: f64, a: f64, b: f64| if x < a { a - x } else if x > b { x - b } else { 0.0 };
    let (dx, dz) = (fora(p.0, us[i], us[i + 1]), fora(p.1, vs[j], vs[j + 1]));
    dx <= (us[i + 1] - us[i]) + TOL_POS && dz <= (vs[j + 1] - vs[j]) + TOL_POS
}

/// Remapeamento das células sobrescritas (§4.4, passos 1 a 5) sobre a grade final `us` e `vs` (arestas, com 0 e o comprimento).
pub fn mapear_celulas(us: &[f64], vs: &[f64], sob: &[CelSob]) -> CelulasFinais {
    let (l, h) = (us[us.len() - 1], vs[vs.len() - 1]);
    let (nu, nv) = (us.len() - 1, vs.len() - 1);
    let mut orfaos = Vec::new();
    let mut adotadas: Vec<(usize, usize, CelSob)> = Vec::new();
    let mut ocupada = vec![false; nu * nv];
    let fora = |p: f64, lim: f64| p < -TOL_POS || p > lim + TOL_POS;
    let centro = |i: usize, j: usize| ((us[i] + us[i + 1]) / 2.0, (vs[j] + vs[j + 1]) / 2.0);
    let orfao = |o: &CelSob, p: (f64, f64)| Orfao { id: o.id, alvo: Alvo::Celula { i: o.i, j: o.j }, s: p.0, z: p.1 };

    // Passos 1 e 2: candidata direta. `diretas` = (i, j, distância, índice em `sob`); `pendentes` = o ponto caiu fora da grade (passo 4).
    let mut diretas: Vec<(usize, usize, f64, usize)> = Vec::new();
    let mut pendentes: Vec<usize> = Vec::new();
    for (x, o) in sob.iter().enumerate() {
        let p = (o.s * l, o.z * h);
        let mesma = o.nu as usize == nu && o.nv as usize == nv && (o.i as usize) < nu && (o.j as usize) < nv;
        let mut cand = None;
        if mesma {
            let (i, j) = (o.i as usize, o.j as usize);
            let (cs, cz) = (centro(i, j).0 / l, centro(i, j).1 / h);
            if (cs - o.s).abs() <= 0.5 && (cz - o.z).abs() <= 0.5 {
                cand = Some((i, j));
            }
        }
        if cand.is_none() {
            if fora(p.0, l) || fora(p.1, h) {
                pendentes.push(x);
                continue;
            }
            cand = Some((localiza(p.0, us), localiza(p.1, vs)));
        }
        let (i, j) = cand.unwrap_or((0, 0));
        let (cx, cy) = centro(i, j);
        diretas.push((i, j, (p.0 - cx).hypot(p.1 - cy), x));
    }
    // Passo 3: fusão. A menor distância vence (empate: menor id); as outras viram órfãs.
    diretas.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)).then(a.2.total_cmp(&b.2)).then(sob[a.3].id.cmp(&sob[b.3].id)));
    let mut ultimo: Option<(usize, usize)> = None;
    for (i, j, _, x) in diretas {
        let o = &sob[x];
        if ultimo == Some((i, j)) {
            orfaos.push(orfao(o, (o.s * l, o.z * h)));
            continue;
        }
        ultimo = Some((i, j));
        ocupada[i * nv + j] = true;
        adotadas.push((i, j, *o));
    }
    // Passo 4: ponto fora da grade. A célula livre mais próxima dentro de uma célula de distância do ponto (grudado na borda).
    for x in pendentes {
        let o = &sob[x];
        let p = (o.s * l, o.z * h);
        let (i0, j0) = (localiza(p.0.clamp(0.0, l), us), localiza(p.1.clamp(0.0, h), vs));
        let mut melhor: Option<(usize, usize, f64)> = None;
        for j in j0.saturating_sub(1)..=(j0 + 1).min(nv - 1) {
            for i in i0.saturating_sub(1)..=(i0 + 1).min(nu - 1) {
                let (cx, cy) = centro(i, j);
                let d = (p.0 - cx).hypot(p.1 - cy);
                if melhor.is_none_or(|(_, _, b)| d < b - EPS_CONTAGEM) {
                    melhor = Some((i, j, d));
                }
            }
        }
        // "Até uma célula de distância": o ponto pode ficar, no máximo, uma célula além da borda da célula escolhida em cada eixo.
        match melhor {
            Some((i, j, _)) if !ocupada[i * nv + j] && perto_da_celula(p, us, vs, i, j) => {
                ocupada[i * nv + j] = true;
                adotadas.push((i, j, *o));
            }
            _ => orfaos.push(orfao(o, p)),
        }
    }
    adotadas.sort_by_key(|a| a.2.id);
    orfaos.sort_by_key(|o| o.id);
    CelulasFinais { adotadas, orfaos }
}

/// Segmentos removidos remapeados: `(eixo, f, k)` com `f` o índice da linha FINAL (1 a n−1) e `k` o segmento ao longo dela, e as órfãos.
pub fn mapear_segmentos(refs: &[SegRemovido], finais: [&[LinhaFinal]; 2], gerada: [&[f64]; 2], arestas: [&[f64]; 2]) -> (Vec<(u8, usize, usize)>, Vec<Orfao>) {
    let mut ok = Vec::new();
    let mut orfaos = Vec::new();
    for r in refs {
        let e = usize::from(r.eixo);
        let outro = 1 - e;
        let a = arestas[e][arestas[e].len() - 1];
        let novas_norm: Vec<f64> = gerada[e].iter().map(|p| p / a).collect();
        // Borda (índice 0 ou o n gravado): a aresta de início ou de fim, que existe em qualquer grade.
        let borda = !r.extra && (r.linha == 0 || r.linha == r.n);
        let idx = if borda {
            Some(0)
        } else if r.extra {
            finais[e].iter().position(|f| f.ident == Ident::Extra(r.linha))
        } else {
            mapear_gerada(r.n, r.linha, r.pos_norm, &novas_norm).and_then(|(k, _)| finais[e].iter().position(|f| f.ident == Ident::Gerada(k)))
        };
        let nk_novo = arestas[outro].len() - 1;
        let comp_outro = arestas[outro][nk_novo];
        let (s, z) = {
            let mid = if r.mid.is_finite() { r.mid * comp_outro } else { 0.0 };
            let pn = if r.pos_norm.is_finite() { r.pos_norm * a } else { 0.0 };
            if e == usize::from(EIXO_U) {
                (pn, mid)
            } else {
                (mid, pn)
            }
        };
        let Some(pos) = idx else {
            orfaos.push(Orfao { id: r.id, alvo: Alvo::Segmento { eixo: r.eixo, linha: r.linha, k: r.k }, s, z });
            continue;
        };
        let k = if r.nk as usize == nk_novo && (r.k as usize) < nk_novo {
            r.k as usize
        } else {
            let mut melhor: Option<(usize, f64)> = None;
            for k0 in 0..nk_novo {
                let m = (arestas[outro][k0] + arestas[outro][k0 + 1]) / 2.0 / comp_outro;
                let d = (m - r.mid).abs();
                if melhor.is_none_or(|(_, b)| d < b - EPS_CONTAGEM) {
                    melhor = Some((k0, d));
                }
            }
            match melhor {
                Some((k0, _)) => k0,
                None => {
                    orfaos.push(Orfao { id: r.id, alvo: Alvo::Segmento { eixo: r.eixo, linha: r.linha, k: r.k }, s, z });
                    continue;
                }
            }
        };
        // Borda: o índice do segmento de borda é a própria aresta (0 ou o nº de linhas + 1); senão, a linha interna final + 1.
        let f = if borda {
            if r.linha == 0 {
                0
            } else {
                arestas[e].len() - 1
            }
        } else {
            pos + 1
        };
        ok.push((r.eixo, f, k));
    }
    ok.sort();
    ok.dedup();
    orfaos.sort_by_key(|o| o.id);
    (ok, orfaos)
}

/// Região fundida (§5.2): retângulo de células `[i0, i1] x [j0, j1]` (índices inclusivos), com o CellKey canônico (a célula de menor `(j, i)`).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Regiao {
    pub i0: usize,
    pub i1: usize,
    pub j0: usize,
    pub j1: usize,
    pub canon: (usize, usize),
}

/// Remoção recusada porque a região deixaria de ser retângulo: a célula de referência e as medidas (área da região e do retângulo que a envolve).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Recusa {
    pub i: usize,
    pub j: usize,
    pub medido: f64,
    pub limite: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Fusao {
    /// Para cada célula (`i · nv + j`), a região a que pertence (índice em `regioes`).
    pub regiao_de: Vec<usize>,
    /// Regiões ordenadas pelo CellKey canônico.
    pub regioes: Vec<Regiao>,
    /// Remoções que valeram: `(eixo, f, k)`.
    pub aceitos: Vec<(u8, usize, usize)>,
    pub recusados: Vec<Recusa>,
}

fn raiz(pai: &[usize], mut x: usize) -> usize {
    while pai[x] != x {
        x = pai[x];
    }
    x
}

/// Aplica as remoções (`(eixo, f, k)` já remapeadas) numa grade de `nu x nv` células e calcula as regiões. Uma remoção que deixa a região não
/// retangular é recusada; as demais valem. A ordem é canônica (eixo, f, k), então o resultado não depende da ordem dos ids.
pub fn fundir(nu: usize, nv: usize, pedidos: &[(u8, usize, usize)]) -> Fusao {
    let n = nu * nv;
    let mut pai: Vec<usize> = (0..n).collect();
    let mut ordem = pedidos.to_vec();
    ordem.sort();
    ordem.dedup();
    let mut aceitos = Vec::new();
    let mut recusados = Vec::new();
    for &(eixo, f, k) in &ordem {
        // Células a e b que a remoção une; só segmento interno (f de 1 a n−1) funde.
        let (nlinhas, nseg) = if eixo == EIXO_U { (nu, nv) } else { (nv, nu) };
        if f > nlinhas || k >= nseg {
            continue;
        }
        if f == 0 || f == nlinhas {
            // Borda: não une células. O segmento some (sem montante) e a borda não tem vizinha do outro lado.
            aceitos.push((eixo, f, k));
            continue;
        }
        let par = if eixo == EIXO_U {
            ((f - 1) * nv + k, f * nv + k)
        } else {
            (k * nv + f - 1, k * nv + f)
        };
        let mut t = pai.clone();
        let (ra, rb) = (raiz(&t, par.0), raiz(&t, par.1));
        if ra != rb {
            t[ra] = rb;
        }
        let r = raiz(&t, par.0);
        let membros: Vec<usize> = (0..n).filter(|&c| raiz(&t, c) == r).collect();
        let (mut i0, mut i1, mut j0, mut j1) = (usize::MAX, 0, usize::MAX, 0);
        for &c in &membros {
            let (i, j) = (c / nv, c % nv);
            i0 = i0.min(i);
            i1 = i1.max(i);
            j0 = j0.min(j);
            j1 = j1.max(j);
        }
        let area = (i1 - i0 + 1) * (j1 - j0 + 1);
        if membros.len() == area {
            pai = t;
            aceitos.push((eixo, f, k));
        } else {
            recusados.push(Recusa { i: par.0 / nv, j: par.0 % nv, medido: membros.len() as f64, limite: area as f64 });
        }
    }
    // Componentes: a raiz de cada célula; a região recebe o CellKey canônico (menor j, depois menor i).
    let mut regioes: Vec<Regiao> = Vec::new();
    let mut indice_raiz: Vec<Option<usize>> = vec![None; n];
    let mut regiao_de = vec![0usize; n];
    for c in 0..n {
        let r = raiz(&pai, c);
        let idx = match indice_raiz[r] {
            Some(x) => x,
            None => {
                regioes.push(Regiao { i0: usize::MAX, i1: 0, j0: usize::MAX, j1: 0, canon: (c / nv, c % nv) });
                indice_raiz[r] = Some(regioes.len() - 1);
                regioes.len() - 1
            }
        };
        regiao_de[c] = idx;
        let reg = &mut regioes[idx];
        let (i, j) = (c / nv, c % nv);
        reg.i0 = reg.i0.min(i);
        reg.i1 = reg.i1.max(i);
        reg.j0 = reg.j0.min(j);
        reg.j1 = reg.j1.max(j);
        if (j, i) < (reg.canon.1, reg.canon.0) {
            reg.canon = (i, j);
        }
    }
    // Ordem canônica: a das células de referência (i · nv + j), que é a da saída.
    let mut ordem_reg: Vec<usize> = (0..regioes.len()).collect();
    ordem_reg.sort_by_key(|&x| regioes[x].canon.0 * nv + regioes[x].canon.1);
    let mut novo_indice = vec![0usize; regioes.len()];
    for (novo, &velho) in ordem_reg.iter().enumerate() {
        novo_indice[velho] = novo;
    }
    let regioes: Vec<Regiao> = ordem_reg.iter().map(|&x| regioes[x]).collect();
    for x in regiao_de.iter_mut() {
        *x = novo_indice[*x];
    }
    Fusao { regiao_de, regioes, aceitos, recusados }
}

#[cfg(test)]
mod testes {
    use super::*;

    fn igual(a: f64, b: f64) {
        assert!((a - b).abs() < 1e-9, "{a} != {b}");
    }

    /// Grade uniforme de `n` células de `c` metros: arestas `0, c, 2c, …, n·c`.
    fn grade(n: usize, c: f64) -> Vec<f64> {
        (0..=n).map(|k| k as f64 * c).collect()
    }

    fn cel(id: u32, i: u32, j: u32, s: f64, z: f64, nu: u32, nv: u32, painel: u32) -> CelSob {
        CelSob { id, i, j, s, z, nu, nv, painel }
    }

    fn lin(id: u32, linha: u32, pos_norm: f64, n: u32, pos: f64, travada: bool, comp: f64, modo: u8, montante: u32) -> SobLinha {
        SobLinha { id, linha, pos_norm, n, travada, pos, comp, modo, montante }
    }

    fn ext(id: u32, pos: f64, travada: bool, comp: f64) -> ExtLinha {
        ExtLinha { id, pos, travada, comp, montante: ID_AUSENTE }
    }

    // ───── linhas ─────

    #[test]
    fn linha_extra_destravada_acompanha_a_fracao_e_travada_fica() {
        // Parede de 6 m com linha extra em 3 m (fração 0,5). Esticada para 8 m: 4 m se destravada, 3 m se travada.
        let a = 8.0;
        igual(posicao_resolvida(3.0, false, 6.0, a), 4.0);
        igual(posicao_resolvida(3.0, true, 6.0, a), 3.0);
        let f = linhas_finais(EIXO_U, a, &[], false, &[], &[ext(7, 3.0, false, 6.0)]);
        igual(f.linhas[0].pos, 4.0);
        assert_eq!(f.linhas[0].ident, Ident::Extra(7));
        assert_eq!(f.linhas[0].origem, ORIGEM_EXTRA);
        let f = linhas_finais(EIXO_U, a, &[], false, &[], &[ext(7, 3.0, true, 6.0)]);
        igual(f.linhas[0].pos, 3.0);
    }

    #[test]
    fn linha_extra_fora_do_vao_e_orfa_e_empate_vale_a_extra() {
        // Travada em 5 m numa parede de 4 m: órfã.
        let f = linhas_finais(EIXO_U, 4.0, &[], false, &[], &[ext(3, 5.0, true, 4.0)]);
        assert!(f.linhas.is_empty());
        assert_eq!(f.orfaos.len(), 1);
        assert_eq!(f.orfaos[0].id, 3);
        assert_eq!(f.orfaos[0].alvo, Alvo::Linha { eixo: EIXO_U, indice: 3 });
        // Extra a 1e-7 de uma gerada: uma linha só, a extra.
        let f = linhas_finais(EIXO_U, 4.0, &[2.0], false, &[], &[ext(9, 2.0 + 1e-7, true, 4.0)]);
        assert_eq!(f.linhas.len(), 1);
        assert_eq!(f.linhas[0].ident, Ident::Extra(9));
    }

    #[test]
    fn linha_gerada_com_mesma_contagem_mantem_o_indice_e_com_contagem_diferente_vai_a_mais_proxima() {
        // Grade gerada de 3 células em 6 m: linhas 2 e 4 (posições normalizadas 1/3 e 2/3). A linha 1 foi sobrescrita para 2,5 m (travada).
        let gerada = [2.0, 4.0];
        let f = linhas_finais(EIXO_U, 6.0, &gerada, false, &[lin(1, 1, 1.0 / 3.0, 3, 2.5, true, 6.0, 0, 0)], &[]);
        igual(f.linhas[0].pos, 2.5);
        assert_eq!(f.linhas[0].ident, Ident::Gerada(1));
        // Agora a grade tem 4 células de 1,5 m (linhas 1,5; 3; 4,5). A referência gravada (índice 1 de 3, posição 1/3) vai à linha mais próxima: 1,5 (0,25).
        let novas = [1.5 / 6.0, 3.0 / 6.0, 4.5 / 6.0];
        let (k, d) = mapear_gerada(3, 1, 1.0 / 3.0, &novas).expect("mapeia");
        assert_eq!(k, 1);
        igual(d, (novas[0] - 1.0 / 3.0).abs());
        // Mesma contagem (2 linhas novas, 3 células): o índice vale mesmo que a posição normalizada tenha mudado.
        let mesma = [0.3, 0.7];
        let (k, _) = mapear_gerada(3, 2, 0.9, &mesma).expect("mapeia");
        assert_eq!(k, 2);
        // Sem linha gerada nova não há o que mapear.
        assert!(mapear_gerada(3, 1, 0.5, &[]).is_none());
    }

    #[test]
    fn duas_sobrescritas_na_mesma_linha_gerada_vence_a_mais_proxima_e_a_outra_e_orfa() {
        let gerada = [3.0];
        let a = lin(10, 1, 0.5, 2, 3.5, false, 6.0, 0, 0);
        let b = lin(11, 1, 0.45, 3, 2.9, false, 6.0, 0, 0); // n diferente: vai à linha mais próxima (0,5) com distância 0,05
        let f = linhas_finais(EIXO_U, 6.0, &gerada, false, &[a, b], &[]);
        // a: mesma contagem (2 = 1 + 1): índice 1, distância 0. b: distância 0,05. Vence a.
        assert_eq!(f.linhas.len(), 1);
        igual(f.linhas[0].pos, 3.5);
        assert_eq!(f.orfaos.iter().map(|o| o.id).collect::<Vec<_>>(), vec![11]);
    }

    #[test]
    fn linha_gerada_com_modo_sem_montante_e_com_tipo() {
        let gerada = [2.0, 4.0];
        let f = linhas_finais(EIXO_U, 6.0, &gerada, false, &[lin(1, 1, 1.0 / 3.0, 3, f64::NAN, false, 6.0, 1, 0), lin(2, 2, 2.0 / 3.0, 3, f64::NAN, false, 6.0, 2, 77)], &[]);
        assert_eq!(f.linhas[0].montante, Escolha::Sem);
        assert_eq!(f.linhas[1].montante, Escolha::Tipo(77));
        // Sem posição nova, a linha continua na grade.
        igual(f.linhas[0].pos, 2.0);
    }

    // ───── células ─────

    #[test]
    fn mesma_topologia_vale_o_indice_mesmo_com_dimensoes_novas() {
        // Gravada numa grade 4 x 2; a parede esticou de 4 m para 8 m (as células dobraram). Célula (1, 0) mantém o índice.
        let us = grade(4, 2.0);
        let vs = grade(2, 1.0);
        let o = cel(1, 1, 0, 0.375, 0.25, 4, 2, 5);
        let r = mapear_celulas(&us, &vs, &[o]);
        assert_eq!(r.adotadas.len(), 1);
        assert_eq!((r.adotadas[0].0, r.adotadas[0].1), (1, 0));
        assert!(r.orfaos.is_empty());
    }

    #[test]
    fn topologia_diferente_vale_a_posicao_e_ponto_sobre_linha_vai_a_celula_de_menor_indice() {
        // Gravada com 4 colunas e centro em s = 0,5. Na grade nova (2 colunas de 1 m, L' = 2) o ponto (s·L' = 1,0) está sobre a aresta entre as
        // colunas 0 e 1: vai à coluna de menor índice, a 0.
        let us = grade(2, 1.0);
        let vs = grade(1, 1.0);
        let r = mapear_celulas(&us, &vs, &[cel(1, 1, 0, 0.5, 0.5, 4, 1, 5)]);
        assert_eq!((r.adotadas[0].0, r.adotadas[0].1), (0, 0));
        // E 0,75 cai na coluna 1.
        let r = mapear_celulas(&us, &vs, &[cel(1, 2, 0, 0.75, 0.5, 4, 1, 5)]);
        assert_eq!(r.adotadas[0].0, 1);
    }

    #[test]
    fn fusao_de_duas_sobrescritas_na_mesma_celula_vence_a_de_menor_distancia() {
        // Duas sobrescritas caem na coluna 0 de uma grade de 2 m (centro em 0,5 m). A de id 1 está em 0,1 m (distância 0,4); a de id 2, em 0,2 m (0,3).
        let us = grade(2, 1.0);
        let vs = grade(1, 1.0);
        let longe = cel(1, 0, 0, 0.05, 0.5, 6, 1, 5);
        let perto = cel(2, 0, 0, 0.1, 0.5, 6, 1, 6);
        let r = mapear_celulas(&us, &vs, &[longe, perto]);
        assert_eq!(r.adotadas.len(), 1);
        assert_eq!(r.adotadas[0].2.id, 2);
        assert_eq!(r.orfaos.iter().map(|o| o.id).collect::<Vec<_>>(), vec![1]);
    }

    #[test]
    fn ponto_fora_da_grade_adota_a_vizinha_livre_ou_fica_orfa() {
        // Chave com s = 1,2 (fora de [0, 1]): o ponto (2,4 m; 0,5) fica além da última coluna (L' = 2). A vizinha mais próxima é a coluna 1.
        let us = grade(2, 1.0);
        let vs = grade(1, 1.0);
        let r = mapear_celulas(&us, &vs, &[cel(4, 9, 0, 1.2, 0.5, 6, 1, 5)]);
        assert_eq!((r.adotadas[0].0, r.adotadas[0].1), (1, 0));
        // Se a vizinha já está ocupada por uma sobrescrita direta, a de fora vira órfã.
        let ocupa = cel(5, 1, 0, 0.75, 0.5, 2, 1, 5);
        let r = mapear_celulas(&us, &vs, &[ocupa, cel(4, 9, 0, 1.2, 0.5, 6, 1, 5)]);
        assert_eq!(r.adotadas.len(), 1);
        assert_eq!(r.orfaos.iter().map(|o| o.id).collect::<Vec<_>>(), vec![4]);
        assert_eq!(r.orfaos[0].alvo, Alvo::Celula { i: 9, j: 0 });
    }

    // ───── segmentos e regiões ─────

    #[test]
    fn remocao_une_duas_celulas_num_retangulo() {
        // Grade 3 x 2; remove o segmento da linha V 1 (horizontal) na coluna 0 e na coluna 1: as células (0,0)+(0,1) e (1,0)+(1,1) viram duas regiões 1x2.
        let f = fundir(3, 2, &[(EIXO_V, 1, 0), (EIXO_V, 1, 1)]);
        assert!(f.recusados.is_empty());
        // 6 células: duas regiões 1x2 e as duas células da coluna 2 separadas => 4 regiões.
        assert_eq!(f.regioes.len(), 4);
        let r = f.regioes.iter().find(|r| r.canon == (0, 0)).expect("região");
        assert_eq!((r.i0, r.i1, r.j0, r.j1), (0, 0, 0, 1));
        assert_eq!(f.regioes.iter().filter(|r| (r.i0, r.i1, r.j0, r.j1) == (1, 1, 0, 1)).count(), 1);
        assert_eq!(f.regiao_de[0], f.regiao_de[1], "as duas células de (0, ·) são a mesma região");
    }

    #[test]
    fn remocao_que_deixa_regiao_em_l_e_recusada() {
        // Grade 2 x 2. Remover (U, 1, 0) une (0,0)+(1,0) (ok). Remover (V, 1, 1) une (1,0)+(1,1): a região {(0,0),(1,0),(1,1)} é em L, recusada.
        let f = fundir(2, 2, &[(EIXO_U, 1, 0), (EIXO_V, 1, 1)]);
        assert_eq!(f.aceitos, vec![(EIXO_U, 1, 0)]);
        assert_eq!(f.recusados.len(), 1);
        assert_eq!((f.recusados[0].i, f.recusados[0].j), (1, 0));
        assert_eq!((f.recusados[0].medido, f.recusados[0].limite), (3.0, 4.0));
        // Sem a remoção recusada, (1,1) continua sozinha.
        assert_eq!(f.regioes.len(), 3);
    }

    #[test]
    fn quadrado_de_quatro_celulas_e_retangular_e_fechar_o_anel_nao_quebra_nada() {
        // 2 x 2 inteiro fundido: três remoções formam o retângulo; a quarta remoção (dentro dele) não muda a região e vale.
        let f = fundir(2, 2, &[(EIXO_U, 1, 0), (EIXO_U, 1, 1), (EIXO_V, 1, 0), (EIXO_V, 1, 1)]);
        assert!(f.recusados.is_empty());
        assert_eq!(f.regioes.len(), 1);
        assert_eq!(f.regioes[0].canon, (0, 0));
        assert_eq!(f.aceitos.len(), 4);
    }

    #[test]
    fn remocao_repetida_vale_uma_vez_e_borda_nao_funde() {
        // A borda (U, 0, 0) vale como remoção (segmento sem montante) e não funde; a repetida vale uma vez.
        let f = fundir(2, 1, &[(EIXO_U, 1, 0), (EIXO_U, 1, 0), (EIXO_U, 0, 0)]);
        assert_eq!(f.aceitos, vec![(EIXO_U, 0, 0), (EIXO_U, 1, 0)]);
        assert_eq!(f.regioes.len(), 1);
    }

    #[test]
    fn a_ordem_das_remocoes_nao_depende_da_ordem_de_entrada() {
        let a = fundir(2, 2, &[(EIXO_U, 1, 0), (EIXO_V, 1, 1)]);
        let b = fundir(2, 2, &[(EIXO_V, 1, 1), (EIXO_U, 1, 0)]);
        assert_eq!(a, b);
    }

    #[test]
    fn segmento_de_linha_extra_segue_o_id_e_o_k_pela_contagem_ou_pelo_ponto_medio() {
        // Linha extra V de id 4 com um segmento removido (k = 1 de 2 colunas). A grade ganhou uma coluna: 3 colunas, então o k muda para o ponto médio mais perto.
        let us = grade(3, 1.0);
        let vs = grade(2, 1.0);
        let fin_u: Vec<LinhaFinal> = vec![];
        let fin_v = vec![LinhaFinal { pos: 1.0, ident: Ident::Extra(4), origem: ORIGEM_EXTRA, montante: Escolha::Padrao, travada: false }];
        let gerada_u: &[f64] = &[];
        let gerada_v: &[f64] = &[1.0];
        let r = SegRemovido { id: 1, eixo: EIXO_V, extra: true, linha: 4, pos_norm: f64::NAN, n: ID_AUSENTE, k: 1, nk: 2, mid: 0.75 };
        let (ok, orf) = mapear_segmentos(&[r], [fin_u.as_slice(), fin_v.as_slice()], [gerada_u, gerada_v], [&us, &vs]);
        assert!(orf.is_empty());
        // Nº de segmentos mudou (2 => 3, pelas colunas): o k vale pelo ponto médio. Meios de 0,1667; 0,5; 0,8333 do comprimento: 0,75 cai no último.
        assert_eq!(ok, vec![(EIXO_V, 1, 2)]);
    }

    #[test]
    fn segmento_de_linha_que_nao_existe_mais_e_orfao() {
        let us = grade(2, 1.0);
        let vs = grade(2, 1.0);
        let r = SegRemovido { id: 8, eixo: EIXO_U, extra: true, linha: 99, pos_norm: f64::NAN, n: ID_AUSENTE, k: 0, nk: 2, mid: 0.25 };
        let vazio: &[LinhaFinal] = &[];
        let gerada: &[f64] = &[];
        let (ok, orf) = mapear_segmentos(&[r], [vazio, vazio], [gerada, gerada], [&us, &vs]);
        assert!(ok.is_empty());
        assert_eq!(orf.len(), 1);
        assert_eq!(orf[0].alvo, Alvo::Segmento { eixo: EIXO_U, linha: 99, k: 0 });
    }
}
