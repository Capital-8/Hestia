//! Avisos da massa (plano de massa, A.4 regra 12; consulta 145 `massa_avisos`). Não bloqueiam: o Rust só mede, o TS decide texto e severidade.
//!
//! Cada aviso é `[massa_num, codigo, copia, indice]` com `[medido, limite, x, y, z]` (z = cota absoluta):
//! - `1` anel autointersecta: testado no anel de cada seção do usuário e no anel do meio de cada trecho. `indice` = seção ou trecho (a cota `z`
//!   distingue: a da seção, ou a do meio do trecho); `medido` = número de cruzamentos de arestas; `limite` = 0; `(x, y)` = o primeiro cruzamento;
//!   `copia` = 0 (o anel é o mesmo em todas as cópias).
//! - `2` cópias do arranjo se sobrepõem numa cota de nível (a área por pavimento pode contar em dobro): um aviso por nível. `indice` = nível alvo;
//!   `medido` = número de pares de cópias que se sobrepõem; `limite` = 0; `copia` = a primeira cópia do primeiro par; `(x, y)` = um ponto comum.
//! - `3` limite atingido (a massa passa de um teto de A.4 e não gera a malha `lod 2`): `indice` 0 = `|T|` (teto 512; nesse caso nada mais é medido,
//!   porque nenhum anel existe), 1 = anéis num trecho (teto 256; `z` = cota da base do trecho), 2 = anéis por cópia (teto 2048).
//! - `4` face lateral inclinada mais de 5° da vertical em algum pavimento: um aviso por nível cuja cota cai dentro da massa. O pavimento vai da
//!   cota do nível até a do nível seguinte dentro da massa (ou até o topo) e é medido em 4 faixas iguais; em cada faixa, a inclinação de uma
//!   aresta é o ângulo cuja tangente é o deslocamento horizontal do meio da aresta, na direção da normal dela, dividido pela altura da faixa (girar
//!   um círculo em torno do próprio centro não inclina nada). `indice` = nível alvo; `medido` = maior inclinação em graus; `limite` = 5;
//!   `(x, y, z)` = meio da aresta mais inclinada, na base da faixa; `copia` = 0.
//!
//! Tudo vem direto das seções (`massa_fatia`), sem malha. Determinismo: ordem `massa_num`, código e, dentro do código, cota ou nível crescente.

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::{ENTRADA, LIMITE};
use crate::massa_fatia::{girar, niveis_da_cena, niveis_dentro, Fatiador};
use crate::massa_malha::{divisoes, orelhas};
use crate::massa_perfil::Curva;
use crate::massa_pilha::Pilha;
use crate::massa_tipos::{passos_do_lod, Massa, EPS, ANEIS_POR_COPIA_MAX, ANEIS_POR_TRECHO_MAX, FUSAO_T, T_MAX};

/// Códigos de aviso (coluna `codigo`).
pub const AV_ANEL_AUTOINTERSECTA: u32 = 1;
pub const AV_COPIAS_SOBREPOSTAS: u32 = 2;
pub const AV_LIMITE: u32 = 3;
pub const AV_FACE_INCLINADA: u32 = 4;

/// `indice` do aviso 3: qual teto foi atingido.
pub const LIMITE_T: u32 = 0;
pub const LIMITE_ANEIS_TRECHO: u32 = 1;
pub const LIMITE_ANEIS_COPIA: u32 = 2;

/// Inclinação máxima da face, em graus a partir da vertical, sem aviso.
pub const INCLINACAO_LIMITE: f64 = 5.0;
/// Faixas iguais em que cada pavimento é medido.
const FAIXAS_POR_PAVIMENTO: usize = 4;
/// Altura mínima de pavimento para medir a inclinação (m).
const PAVIMENTO_MIN: f64 = 1e-6;
/// Folga do `ceil` na contagem de anéis (a mesma de `massa_malha`).
const FOLGA_CEIL: f64 = 1e-9;

#[derive(Clone, Debug, PartialEq)]
pub struct AvisoMassa {
    pub massa: u32,
    pub codigo: u32,
    pub copia: u32,
    pub indice: u32,
    pub medido: f64,
    pub limite: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

fn cruz(a: [f64; 2], b: [f64; 2], c: [f64; 2]) -> f64 {
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

/// Ponto em que os segmentos `ab` e `cd` se cruzam no interior dos dois (tocar na ponta ou ficar colinear não conta).
pub fn cruzamento(a: [f64; 2], b: [f64; 2], c: [f64; 2], d: [f64; 2]) -> Option<[f64; 2]> {
    let (o1, o2) = (cruz(a, b, c), cruz(a, b, d));
    if !((o1 > 0.0 && o2 < 0.0) || (o1 < 0.0 && o2 > 0.0)) {
        return None;
    }
    let (o3, o4) = (cruz(c, d, a), cruz(c, d, b));
    if !((o3 > 0.0 && o4 < 0.0) || (o3 < 0.0 && o4 > 0.0)) {
        return None;
    }
    let u = o3 / (o3 - o4);
    Some([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u])
}

/// Cruzamentos entre arestas não vizinhas do anel: `(quantos, o primeiro)`.
pub fn autointersecoes(anel: &[[f64; 2]]) -> (u32, Option<[f64; 2]>) {
    let n = anel.len();
    let (mut quantos, mut primeiro) = (0u32, None);
    for i in 0..n {
        let (a, b) = (anel[i], anel[(i + 1) % n]);
        let (x0, x1) = (a[0].min(b[0]), a[0].max(b[0]));
        for j in i + 2..n {
            // A última aresta é vizinha da primeira.
            if i == 0 && j == n - 1 {
                continue;
            }
            let (c, d) = (anel[j], anel[(j + 1) % n]);
            if c[0].max(d[0]) < x0 || c[0].min(d[0]) > x1 {
                continue;
            }
            if let Some(p) = cruzamento(a, b, c, d) {
                quantos += 1;
                primeiro = primeiro.or(Some(p));
            }
        }
    }
    (quantos, primeiro)
}

/// Caixa `[minx, miny, maxx, maxy]` do anel.
fn caixa(anel: &[[f64; 2]]) -> [f64; 4] {
    anel.iter().fold([f64::INFINITY, f64::INFINITY, f64::NEG_INFINITY, f64::NEG_INFINITY], |c, p| [c[0].min(p[0]), c[1].min(p[1]), c[2].max(p[0]), c[3].max(p[1])])
}

fn caixas_se_tocam(a: &[f64; 4], b: &[f64; 4]) -> bool {
    a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]
}

/// `true` se `p` está dentro do anel (regra par-ímpar).
fn dentro(anel: &[[f64; 2]], p: [f64; 2]) -> bool {
    let n = anel.len();
    let mut ok = false;
    for i in 0..n {
        let (a, b) = (anel[i], anel[(i + 1) % n]);
        if (a[1] > p[1]) != (b[1] > p[1]) && p[0] < a[0] + (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) {
            ok = !ok;
        }
    }
    ok
}

/// Distância de `p` ao segmento `ab`.
fn distancia_ao_segmento(p: [f64; 2], a: [f64; 2], b: [f64; 2]) -> f64 {
    let (ex, ey) = (b[0] - a[0], b[1] - a[1]);
    let c2 = ex * ex + ey * ey;
    let u = if c2 > 0.0 { (((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / c2).clamp(0.0, 1.0) } else { 0.0 };
    (p[0] - a[0] - ex * u).hypot(p[1] - a[1] - ey * u)
}

/// O primeiro vértice ou meio de aresta de `a` que está dentro de `b` (caixa `cb`) e a mais de `EPS` da borda dele. Pega os anéis que se cruzam só
/// em vértices comuns (cópias de um perfil simétrico), que o teste de arestas não vê; quem só encosta pela borda não passa.
fn bem_dentro(a: &[[f64; 2]], cb: &[f64; 4], b: &[[f64; 2]]) -> Option<[f64; 2]> {
    let (na, nb) = (a.len(), b.len());
    for i in 0..na {
        for p in [a[i], [(a[i][0] + a[(i + 1) % na][0]) / 2.0, (a[i][1] + a[(i + 1) % na][1]) / 2.0]] {
            if p[0] > cb[0] && p[0] < cb[2] && p[1] > cb[1] && p[1] < cb[3] && dentro(b, p) && (0..nb).all(|j| distancia_ao_segmento(p, b[j], b[(j + 1) % nb]) > EPS) {
                return Some(p);
            }
        }
    }
    None
}

/// Um ponto do interior do anel: o centro da primeira orelha da triangulação (a mesma das tampas da malha).
pub fn ponto_interior(anel: &[[f64; 2]]) -> Option<[f64; 2]> {
    orelhas(anel).first().map(|t| {
        let (a, b, c) = (anel[t[0] as usize], anel[t[1] as usize], anel[t[2] as usize]);
        [(a[0] + b[0] + c[0]) / 3.0, (a[1] + b[1] + c[1]) / 3.0]
    })
}

/// Um ponto comum a dois anéis que se sobrepõem, ou `None`. `pa` e `pb` são pontos do interior de `a` e de `b`.
///
/// Sobrepõem-se se duas arestas se cruzam ou, sem cruzamento, se o ponto interior de um está dentro do outro (um anel dentro do outro, ou os dois
/// coincidentes) ou se um vértice ou meio de aresta de um está bem dentro do outro. Anéis que só se encostam pela borda não contam.
fn sobreposicao_com(a: &[[f64; 2]], pa: [f64; 2], b: &[[f64; 2]], pb: [f64; 2]) -> Option<[f64; 2]> {
    let (ca, cb) = (caixa(a), caixa(b));
    if !caixas_se_tocam(&ca, &cb) {
        return None;
    }
    let (na, nb) = (a.len(), b.len());
    for i in 0..na {
        let (p, q) = (a[i], a[(i + 1) % na]);
        let cp = [p[0].min(q[0]), p[1].min(q[1]), p[0].max(q[0]), p[1].max(q[1])];
        if !caixas_se_tocam(&cp, &cb) {
            continue;
        }
        for j in 0..nb {
            let (r, s) = (b[j], b[(j + 1) % nb]);
            if r[0].max(s[0]) < cp[0] || r[0].min(s[0]) > cp[2] || r[1].max(s[1]) < cp[1] || r[1].min(s[1]) > cp[3] {
                continue;
            }
            if let Some(x) = cruzamento(p, q, r, s) {
                return Some(x);
            }
        }
    }
    // Sem cruzamento no interior das arestas: um anel dentro do outro, coincidentes, cruzados só em vértices comuns, ou separados.
    if dentro(b, pa) {
        return Some(pa);
    }
    if dentro(a, pb) {
        return Some(pb);
    }
    bem_dentro(a, &cb, b).or_else(|| bem_dentro(b, &ca, a))
}

/// Um ponto comum a dois anéis que se sobrepõem (ver `sobreposicao_com`), ou `None` se não se sobrepõem.
pub fn sobreposicao(a: &[[f64; 2]], b: &[[f64; 2]]) -> Option<[f64; 2]> {
    sobreposicao_com(a, ponto_interior(a)?, b, ponto_interior(b)?)
}

/// Maior inclinação (graus a partir da vertical) entre o anel `a` e o anel `b`, `dz` acima, com o meio da aresta de `a` em que ela ocorre.
pub fn inclinacao(a: &[[f64; 2]], b: &[[f64; 2]], dz: f64) -> Option<(f64, [f64; 2])> {
    let n = a.len();
    let mut pior: Option<(f64, [f64; 2])> = None;
    for j in 0..n {
        let k = (j + 1) % n;
        let (ex, ey) = (a[k][0] - a[j][0], a[k][1] - a[j][1]);
        let comprimento = ex.hypot(ey);
        if comprimento <= 1e-12 {
            continue;
        }
        let meio = [(a[j][0] + a[k][0]) / 2.0, (a[j][1] + a[k][1]) / 2.0];
        let d = [(b[j][0] + b[k][0]) / 2.0 - meio[0], (b[j][1] + b[k][1]) / 2.0 - meio[1]];
        // Normal da aresta (anel anti-horário: para fora).
        let graus = ((d[0] * ey - d[1] * ex).abs() / comprimento / dz).atan().to_degrees();
        if pior.is_none_or(|p| graus > p.0) {
            pior = Some((graus, meio));
        }
    }
    pior
}

/// `|T|` da massa sem o teto (a mesma fusão de `massa_pilha::parametros`), para o aviso 3.
fn contar_t(m: &Massa) -> usize {
    let mut c: Vec<f64> = (0..m.resolucao).map(|k| k as f64 / m.resolucao as f64).collect();
    for s in &m.secoes {
        c.extend(Curva::nova(&s.perfil).quinas().into_iter().map(|t| if t > 1.0 - FUSAO_T { t - 1.0 } else { t }));
    }
    c.sort_by(|a, b| a.total_cmp(b));
    let (mut n, mut i) = (0, 0);
    while i < c.len() {
        let inicio = c[i];
        while i < c.len() && c[i] - inicio < FUSAO_T {
            i += 1;
        }
        n += 1;
    }
    n
}

/// Qual teto de anéis a malha `lod 2` estoura (A.4 regra 5): `(indice, medido, limite, z acima da base)`.
fn limite_de_aneis(p: &Pilha) -> (u32, f64, f64, f64) {
    let (passo_rot, passo_z) = passos_do_lod(2).unwrap_or((f64::INFINITY, f64::INFINITY));
    let teto = |v: f64| (v - FOLGA_CEIL).ceil().max(0.0) as usize;
    let mut total = 1usize;
    for k in 0..p.trechos() {
        let n_forma = if p.suave || p.perfil_difere[k] { teto((p.z[k + 1] - p.z[k]) / passo_z) } else { 1 };
        let n = teto(p.delta_rot(k) / passo_rot).max(n_forma).max(1);
        if n > ANEIS_POR_TRECHO_MAX {
            return (LIMITE_ANEIS_TRECHO, n as f64, ANEIS_POR_TRECHO_MAX as f64, p.z[k]);
        }
        total += n;
    }
    (LIMITE_ANEIS_COPIA, total as f64, ANEIS_POR_COPIA_MAX as f64, 0.0)
}

/// Aviso 1 nos anéis das seções do usuário e do meio de cada trecho, de baixo para cima.
fn anel_autointersecta(f: &Fatiador, out: &mut Vec<AvisoMassa>) {
    let mut testar = |anel: Vec<[f64; 2]>, indice: usize, z: f64| {
        if let (quantos, Some(p)) = autointersecoes(&anel) {
            out.push(AvisoMassa { massa: f.m.num, codigo: AV_ANEL_AUTOINTERSECTA, copia: 0, indice: indice as u32, medido: quantos as f64, limite: 0.0, x: p[0], y: p[1], z });
        }
    };
    for k in 0..f.pilha.z.len() {
        testar(f.anel_da_secao(k), k, f.cota_da_secao(k));
        if k < f.pilha.trechos() {
            testar(f.pilha.anel(k, 0.5), k, f.m.z_base + (f.pilha.z[k] + f.pilha.z[k + 1]) / 2.0);
        }
    }
}

/// Aviso 2: pares de cópias que se sobrepõem na cota de cada nível dentro da massa.
fn copias_sobrepostas(f: &Fatiador, niveis: &[(u32, f64)], out: &mut Vec<AvisoMassa>) {
    let Some(arr) = f.m.arranjo else { return };
    for (nivel, cota) in niveis_dentro(f, niveis) {
        let Some(anel0) = f.anel(cota) else { continue };
        let Some(interior0) = ponto_interior(&anel0) else { continue };
        // O anel e o ponto interior de cada cópia são os da cópia 0 girados.
        let aneis: Vec<(Vec<[f64; 2]>, [f64; 2])> = (0..arr.n).map(|i| (girar(&anel0, f.m.arranjo, i), girar(&[interior0], f.m.arranjo, i)[0])).collect();
        let (mut pares, mut primeiro) = (0u32, None);
        for i in 0..aneis.len() {
            for j in i + 1..aneis.len() {
                if let Some(p) = sobreposicao_com(&aneis[i].0, aneis[i].1, &aneis[j].0, aneis[j].1) {
                    pares += 1;
                    primeiro = primeiro.or(Some((i as u32, p)));
                }
            }
        }
        if let Some((copia, p)) = primeiro {
            out.push(AvisoMassa { massa: f.m.num, codigo: AV_COPIAS_SOBREPOSTAS, copia, indice: nivel, medido: pares as f64, limite: 0.0, x: p[0], y: p[1], z: cota });
        }
    }
}

/// Aviso 4: maior inclinação da face lateral em cada pavimento (do nível ao nível seguinte dentro da massa, ou ao topo).
fn face_inclinada(f: &Fatiador, niveis: &[(u32, f64)], out: &mut Vec<AvisoMassa>) {
    let (base, topo) = (f.m.z_base, f.m.z_base + f.altura());
    let dentro = niveis_dentro(f, niveis);
    for &(nivel, cota) in &dentro {
        let z0 = cota.clamp(base, topo);
        let z1 = dentro.iter().map(|n| n.1).filter(|&c| c > z0 + PAVIMENTO_MIN).fold(topo, f64::min);
        let h = (z1 - z0) / FAIXAS_POR_PAVIMENTO as f64;
        if z1 - z0 <= PAVIMENTO_MIN {
            continue;
        }
        let aneis: Vec<Option<Vec<[f64; 2]>>> = (0..=FAIXAS_POR_PAVIMENTO).map(|i| f.anel(if i == FAIXAS_POR_PAVIMENTO { z1 } else { z0 + h * i as f64 })).collect();
        let mut pior: Option<(f64, [f64; 2], f64)> = None;
        for i in 0..FAIXAS_POR_PAVIMENTO {
            if let (Some(a), Some(b)) = (&aneis[i], &aneis[i + 1]) {
                if let Some((graus, meio)) = inclinacao(a, b, h) {
                    if pior.is_none_or(|p| graus > p.0) {
                        pior = Some((graus, meio, z0 + h * i as f64));
                    }
                }
            }
        }
        if let Some((graus, meio, z)) = pior.filter(|p| p.0 > INCLINACAO_LIMITE) {
            out.push(AvisoMassa { massa: f.m.num, codigo: AV_FACE_INCLINADA, copia: 0, indice: nivel, medido: graus, limite: INCLINACAO_LIMITE, x: meio[0], y: meio[1], z });
        }
    }
}

/// Acrescenta a `out` os avisos de uma massa. Massa inválida é `ENTRADA` (não é aviso); limite atingido vira o aviso 3, sem erro.
pub fn avisos_da_massa(m: &Massa, niveis: &[(u32, f64)], out: &mut Vec<AvisoMassa>) -> Result<(), u32> {
    let inicio = out.len();
    let f = match Fatiador::novo(m) {
        Ok(f) => f,
        Err(LIMITE) => {
            out.push(AvisoMassa { massa: m.num, codigo: AV_LIMITE, copia: 0, indice: LIMITE_T, medido: contar_t(m) as f64, limite: T_MAX as f64, x: m.ox, y: m.oy, z: m.z_base });
            return Ok(());
        }
        Err(e) => return Err(e),
    };
    anel_autointersecta(&f, out);
    copias_sobrepostas(&f, niveis, out);
    match divisoes(&f.pilha, 2) {
        Ok(_) => {}
        Err(LIMITE) => {
            let (indice, medido, limite, z) = limite_de_aneis(&f.pilha);
            out.push(AvisoMassa { massa: m.num, codigo: AV_LIMITE, copia: 0, indice, medido, limite, x: m.ox, y: m.oy, z: m.z_base + z });
        }
        Err(e) => return Err(e),
    }
    face_inclinada(&f, niveis, out);
    if out[inicio..].iter().any(|a| ![a.medido, a.limite, a.x, a.y, a.z].iter().all(|v| v.is_finite())) {
        return Err(ENTRADA);
    }
    Ok(())
}

/// Avisos de várias massas, na ordem dada (a consulta passa `massa_num` crescente).
pub fn massa_avisos(massas: &[Massa], niveis: &[(u32, f64)]) -> Result<Vec<AvisoMassa>, u32> {
    let mut out = Vec::new();
    for m in massas {
        avisos_da_massa(m, niveis, &mut out)?;
    }
    Ok(out)
}

/// Saída plana: `avisos u32 [massa_num, codigo, copia, indice]`, `valores f64 [medido, limite, x, y, z]`.
pub fn achatar_avisos(avisos: &[AvisoMassa]) -> (Vec<u32>, Vec<f64>) {
    (avisos.iter().flat_map(|a| [a.massa, a.codigo, a.copia, a.indice]).collect(), avisos.iter().flat_map(|a| [a.medido, a.limite, a.x, a.y, a.z]).collect())
}

/// Consulta 145.
pub fn consulta_massa_avisos(cena: &Cena, nivel: u32) -> Result<Vec<Saida>, u32> {
    let (a, v) = achatar_avisos(&massa_avisos(&cena.massa.massas_do_nivel(nivel)?, &niveis_da_cena(cena))?);
    Ok(vec![Saida::U32(a), Saida::F64(v)])
}
