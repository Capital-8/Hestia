//! Malha da massa (plano de massa, A.4 regras 5 a 7 e 13; consulta 140 `massa_malha`).
//!
//! Cada cópia é uma casca fechada: os anéis (um por seção mais os intermediários de cada trecho) têm todos os mesmos `|T|` pontos; a lateral é um
//! quadrilátero por par de anéis e par de `t` vizinhos, dividido sempre pela mesma diagonal; as tampas são a triangulação por orelhas do anel da base
//! (normal para baixo) e do topo (normal para cima), sem vértice novo. Assim cada aresta fica em exatamente 2 triângulos, por construção.
//! As cópias do arranjo são a casca da cópia 0 girada (mesmos índices, deslocados): sem booleana.
//!
//! Determinismo: nada aqui depende de ordem de `HashMap` nem de relógio. Ordem de saída: `massa_num`, cópia, anel, `t`.

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::{ENTRADA, LIMITE, LIMITE_BYTES_POR_CHAMADA};
use crate::massa_pilha::Pilha;
use crate::massa_tipos::{passos_do_lod, validar, Massa, ANEIS_POR_COPIA_MAX, ANEIS_POR_TRECHO_MAX, PAPEL_BASE, PAPEL_LATERAL, PAPEL_TOPO};

/// Folga do `ceil` na contagem de anéis (30 m / 0,5 m tem de dar 60, não 61).
const FOLGA_CEIL: f64 = 1e-9;

/// Anéis da cópia 0 de uma massa, de baixo para cima.
#[derive(Clone, Debug, PartialEq)]
pub struct Casca {
    /// Cota absoluta de cada anel.
    pub z: Vec<f64>,
    /// Pontos de cada anel, em planta no mundo; todos com o mesmo número de pontos, anti-horário.
    pub aneis: Vec<Vec<[f64; 2]>>,
}

/// Saída de `massa_malha`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct MalhaMassa {
    /// `[massa_num, copia, papel, primeiro_indice, n_indices]`.
    pub grupos: Vec<[u32; 5]>,
    pub vertices: Vec<[f64; 3]>,
    pub indices: Vec<u32>,
}

fn teto(v: f64) -> usize {
    (v - FOLGA_CEIL).ceil().max(0.0) as usize
}

/// Divisões de cada trecho (regra 5): `n = max(1, ceil(|Δrot| / passoRot), n_forma)`, com `n_forma = ceil(Δz / passoZ)` se a interpolação é suave
/// ou os perfis diferem, senão 1. Mais de 256 num trecho ou mais de 2048 anéis na cópia é `LIMITE`.
pub fn divisoes(p: &Pilha, lod: u32) -> Result<Vec<usize>, u32> {
    let (passo_rot, passo_z) = passos_do_lod(lod).ok_or(ENTRADA)?;
    let mut total = 1usize;
    let mut out = Vec::with_capacity(p.trechos());
    for k in 0..p.trechos() {
        let n_forma = if p.suave || p.perfil_difere[k] { teto((p.z[k + 1] - p.z[k]) / passo_z) } else { 1 };
        let n = teto(p.delta_rot(k) / passo_rot).max(n_forma).max(1);
        total += n;
        if n > ANEIS_POR_TRECHO_MAX || total > ANEIS_POR_COPIA_MAX {
            return Err(LIMITE);
        }
        out.push(n);
    }
    Ok(out)
}

/// Anéis da cópia 0 no `lod` pedido. Valida a massa (`ENTRADA`) e os limites (`LIMITE`).
pub fn casca(m: &Massa, lod: u32) -> Result<Casca, u32> {
    validar(m)?;
    let p = Pilha::nova(m)?;
    let div = divisoes(&p, lod)?;
    let mut c = Casca { z: vec![m.z_base + p.z[0]], aneis: vec![p.anel(0, 0.0)] };
    for (k, &n) in div.iter().enumerate() {
        for i in 1..=n {
            let u = if i == n { 1.0 } else { i as f64 / n as f64 };
            c.z.push(m.z_base + if i == n { p.z[k + 1] } else { p.z[k] + (p.z[k + 1] - p.z[k]) * u });
            c.aneis.push(p.anel(k, u));
        }
    }
    Ok(c)
}

fn cruz(a: [f64; 2], b: [f64; 2], c: [f64; 2]) -> f64 {
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
}

/// Triangulação por orelhas de um anel anti-horário: `n - 2` triângulos anti-horários, só com os índices do anel (serve a perfil côncavo).
///
/// Orelha: vértice convexo cujo triângulo com os vizinhos não contém nenhum outro vértice (borda inclusive). Se nenhum vértice passa no teste (anel
/// que se cruza ou resíduo numérico), corta-se o de maior convexidade: a triangulação continua com `n - 2` triângulos e a casca continua fechada.
pub fn orelhas(p: &[[f64; 2]]) -> Vec<[u32; 3]> {
    let n = p.len();
    let mut tri = Vec::with_capacity(n.saturating_sub(2));
    if n < 3 {
        return tri;
    }
    let mut ant: Vec<usize> = (0..n).map(|i| (i + n - 1) % n).collect();
    let mut prox: Vec<usize> = (0..n).map(|i| (i + 1) % n).collect();
    let e_orelha = |ant: &[usize], prox: &[usize], j: usize| -> bool {
        let (a, b, c) = (p[ant[j]], p[j], p[prox[j]]);
        if cruz(a, b, c) <= 0.0 {
            return false;
        }
        let mut q = prox[prox[j]];
        while q != ant[j] {
            let v = p[q];
            if v != a && v != b && v != c && cruz(a, b, v) >= 0.0 && cruz(b, c, v) >= 0.0 && cruz(c, a, v) >= 0.0 {
                return false;
            }
            q = prox[q];
        }
        true
    };
    let (mut i, mut vivos) = (0usize, n);
    while vivos > 3 {
        let mut j = i;
        let mut achou = None;
        let mut reserva = (i, f64::NEG_INFINITY);
        for _ in 0..vivos {
            if e_orelha(&ant, &prox, j) {
                achou = Some(j);
                break;
            }
            let c = cruz(p[ant[j]], p[j], p[prox[j]]);
            if c > reserva.1 {
                reserva = (j, c);
            }
            j = prox[j];
        }
        let j = achou.unwrap_or(reserva.0);
        tri.push([ant[j] as u32, j as u32, prox[j] as u32]);
        let (a, c) = (ant[j], prox[j]);
        prox[a] = c;
        ant[c] = a;
        vivos -= 1;
        // Salta um vértice: os triângulos saem mais equilibrados do que num leque.
        i = if vivos > 3 { prox[c] } else { c };
    }
    tri.push([ant[i] as u32, i as u32, prox[i] as u32]);
    tri
}

/// Acrescenta a `out` a casca de cada cópia da massa (regras 6 e 7), com três grupos por cópia: lateral, base e topo.
pub fn malha_da_massa(m: &Massa, lod: u32, out: &mut MalhaMassa) -> Result<(), u32> {
    let c = casca(m, lod)?;
    let (na, nt) = (c.aneis.len(), c.aneis[0].len());
    let copias = m.copias() as usize;
    let tampa_base = orelhas(&c.aneis[0]);
    let tampa_topo = orelhas(&c.aneis[na - 1]);
    // Limite da ABI: a saída inteira tem de caber numa chamada (e os índices em u32).
    let n_vertices = out.vertices.len() + copias * na * nt;
    let n_indices = out.indices.len() + copias * 3 * (2 * (na - 1) * nt + tampa_base.len() + tampa_topo.len());
    if (n_vertices as u64) * 24 + (n_indices as u64) * 4 > LIMITE_BYTES_POR_CHAMADA {
        return Err(LIMITE);
    }
    for copia in 0..copias {
        let base = out.vertices.len() as u32;
        // Cópia i = a massa girada i · anguloTotal / n em torno de (cx, cy); a cópia 0 sai sem tocar nos pontos.
        let giro = m.arranjo.filter(|_| copia > 0).map(|a| { let (s, co) = (copia as f64 * a.ang / a.n as f64).sin_cos(); (a.cx, a.cy, s, co) });
        for (anel, &z) in c.aneis.iter().zip(&c.z) {
            for q in anel {
                let (x, y) = match giro {
                    Some((cx, cy, s, co)) => (cx + (q[0] - cx) * co - (q[1] - cy) * s, cy + (q[0] - cx) * s + (q[1] - cy) * co),
                    None => (q[0], q[1]),
                };
                if !(x.is_finite() && y.is_finite() && z.is_finite()) {
                    return Err(ENTRADA);
                }
                out.vertices.push([x, y, z]);
            }
        }
        let v = |anel: usize, j: usize| base + (anel * nt + j % nt) as u32;
        let mut grupo = |papel: u32, primeiro: usize, fim: usize| out.grupos.push([m.num, copia as u32, papel, primeiro as u32, (fim - primeiro) as u32]);
        let i0 = out.indices.len();
        for a in 0..na - 1 {
            for j in 0..nt {
                // Sempre a diagonal (a, j) -> (a + 1, j + 1).
                out.indices.extend_from_slice(&[v(a, j), v(a, j + 1), v(a + 1, j + 1), v(a, j), v(a + 1, j + 1), v(a + 1, j)]);
            }
        }
        let i1 = out.indices.len();
        grupo(PAPEL_LATERAL, i0, i1);
        for t in &tampa_base {
            out.indices.extend_from_slice(&[base + t[0], base + t[2], base + t[1]]);
        }
        let i2 = out.indices.len();
        grupo(PAPEL_BASE, i1, i2);
        let topo = base + ((na - 1) * nt) as u32;
        for t in &tampa_topo {
            out.indices.extend_from_slice(&[topo + t[0], topo + t[1], topo + t[2]]);
        }
        grupo(PAPEL_TOPO, i2, out.indices.len());
    }
    Ok(())
}

/// Malha de várias massas, na ordem dada (a consulta passa `massa_num` crescente).
pub fn massa_malha(massas: &[Massa], lod: u32) -> Result<MalhaMassa, u32> {
    let mut out = MalhaMassa::default();
    for m in massas {
        malha_da_massa(m, lod, &mut out)?;
    }
    Ok(out)
}

/// Consulta 140: `grupos u32 [massa_num, copia, papel, primeiro_indice, n_indices]`, `vertices f64 [x, y, z]`, `indices u32`.
pub fn consulta_massa_malha(cena: &Cena, nivel: u32, lod: u32) -> Result<Vec<Saida>, u32> {
    if passos_do_lod(lod).is_none() {
        return Err(ENTRADA);
    }
    let m = massa_malha(&cena.massa.massas_do_nivel(nivel)?, lod)?;
    Ok(vec![
        Saida::U32(m.grupos.iter().flat_map(|g| g.iter().copied()).collect()),
        Saida::F64(m.vertices.iter().flat_map(|p| p.iter().copied()).collect()),
        Saida::U32(m.indices),
    ])
}
