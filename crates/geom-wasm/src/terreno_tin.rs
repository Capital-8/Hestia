//! Terreno (PLANO do terreno A.4 regras 1 a 5): fusão de vértices, arestas obrigatórias, T0 (Delaunay com restrições) e a superfície existente E (recorte pela
//! borda).
//!
//! Este é o ÚNICO arquivo que fala com a `spade`. O WASM é compilado com `panic = "abort"`, então só entram chamadas que não entram em pânico: a inserção
//! devolve `Result` (erro vira `ENTRADA`), toda restrição passa por `can_add_constraint` antes de `add_constraint`, e nenhuma restrição é tentada numa
//! triangulação sem triângulos.

use std::collections::hash_map::Entry;
use std::collections::HashMap;
use std::rc::Rc;

use spade::{ConstrainedDelaunayTriangulation, Point2, Triangulation};

use crate::esquema::{ENTRADA, ID_AUSENTE, INTERNO};
use crate::geo2d::{dist, v, V};
use crate::terreno_avalia::{Malha, TOL_DENTRO};
use crate::terreno_tipos::{chave, dentro_ou_sobre, ponto_no_poligono, AvisoTerreno, Existente, Fontes, AVISO_COTAS_DIFERENTES, AVISO_LINHA_CRUZA, AVISO_SEM_TRIANGULOS, TOL_COTA_FUSAO};

/// Passo mínimo (m) do adensamento da borda e número de trechos que define o passo em bordas longas (regra 5a).
const PASSO_BORDA_MIN: f64 = 1.0;
const TRECHOS_BORDA: f64 = 2000.0;

/// Resultado de uma triangulação com restrições.
pub struct Triangulacao {
    /// Triângulos (índices dos pontos de entrada), anti-horários.
    pub t: Vec<[u32; 3]>,
    /// Para cada restrição pedida: `true` se entrou. Trecho com as duas pontas no mesmo ponto conta como `false`.
    pub aceitas: Vec<bool>,
}

/// Delaunay com restrições dos pontos `p` (distintos), com as `restricoes` tentadas na ordem dada (regra 2). Restrição que cruzaria outra já inserida é
/// pulada. Sem triângulos (menos de 3 pontos ou todos colineares), nenhuma restrição é tentada. Coordenada que a biblioteca recusa vira `ENTRADA`.
pub fn triangular(p: &[[f64; 2]], restricoes: &[[u32; 2]]) -> Result<Triangulacao, u32> {
    let mut cdt = ConstrainedDelaunayTriangulation::<Point2<f64>>::new();
    let mut alcas = Vec::with_capacity(p.len());
    // Índice de entrada de cada vértice da biblioteca (ela devolve a alça já existente quando a posição se repete).
    let mut de_alca: Vec<u32> = Vec::with_capacity(p.len());
    for (k, q) in p.iter().enumerate() {
        let h = cdt.insert(Point2::new(q[0], q[1])).map_err(|_| ENTRADA)?;
        match h.index().cmp(&de_alca.len()) {
            std::cmp::Ordering::Less => {}
            std::cmp::Ordering::Equal => de_alca.push(k as u32),
            std::cmp::Ordering::Greater => return Err(INTERNO),
        }
        alcas.push(h);
    }
    let mut aceitas = vec![false; restricoes.len()];
    if cdt.num_inner_faces() == 0 {
        return Ok(Triangulacao { t: Vec::new(), aceitas });
    }
    for (k, r) in restricoes.iter().enumerate() {
        let (a, b) = (*alcas.get(r[0] as usize).ok_or(INTERNO)?, *alcas.get(r[1] as usize).ok_or(INTERNO)?);
        if a != b && cdt.can_add_constraint(a, b) {
            cdt.add_constraint(a, b);
            aceitas[k] = true;
        }
    }
    let mut t = Vec::with_capacity(cdt.num_inner_faces());
    for face in cdt.inner_faces() {
        let mut tri = [0u32; 3];
        for (i, vert) in face.vertices().iter().enumerate() {
            tri[i] = *de_alca.get(vert.fix().index()).ok_or(INTERNO)?;
        }
        t.push(tri);
    }
    Ok(Triangulacao { t, aceitas })
}

fn aviso(codigo: u32, indice: u32, medido: f64, limite: f64, p: [f64; 3]) -> AvisoTerreno {
    AvisoTerreno { codigo, regiao: ID_AUSENTE, indice, medido, limite, x: p[0], y: p[1], z: p[2] }
}

fn meio(a: [f64; 3], b: [f64; 3]) -> [f64; 3] {
    [(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0, (a[2] + b[2]) / 2.0]
}

/// Regras 1 a 5 para um terreno: T0, E e os avisos 1, 2 e 5.
pub fn calcular_existente(f: &Fontes) -> Result<Existente, u32> {
    let mut avisos = Vec::new();
    // Regra 1: fusão pela chave; vale o primeiro na ordem canônica.
    let mut por_chave: HashMap<(i64, i64), u32> = HashMap::with_capacity(f.vertices.len());
    let mut de_id: HashMap<u32, u32> = HashMap::with_capacity(f.vertices.len());
    let mut pontos: Vec<[f64; 3]> = Vec::with_capacity(f.vertices.len());
    let mut ids: Vec<u32> = Vec::with_capacity(f.vertices.len());
    for p in &f.vertices {
        match por_chave.entry(chave(p.x, p.y)) {
            Entry::Occupied(e) => {
                let k = *e.get();
                de_id.insert(p.id, k);
                let dz = (pontos[k as usize][2] - p.z).abs();
                if dz > TOL_COTA_FUSAO {
                    avisos.push(aviso(AVISO_COTAS_DIFERENTES, p.id, dz, TOL_COTA_FUSAO, pontos[k as usize]));
                }
            }
            Entry::Vacant(e) => {
                let k = pontos.len() as u32;
                e.insert(k);
                de_id.insert(p.id, k);
                pontos.push([p.x, p.y, p.z]);
                ids.push(p.id);
            }
        }
    }
    // Regra 2: trechos das curvas e das quebras, na ordem canônica.
    let mut trechos: Vec<[u32; 2]> = Vec::new();
    let mut dono: Vec<u32> = Vec::new();
    for l in &f.linhas {
        let idx: Vec<u32> = l.vertices.iter().filter_map(|id| de_id.get(id).copied()).collect();
        let fecho = if l.fechada && idx.len() > 2 { idx.first().copied().zip(idx.last().copied()).map(|(a, b)| [b, a]) } else { None };
        for par in idx.windows(2).map(|w| [w[0], w[1]]).chain(fecho) {
            if par[0] != par[1] {
                trechos.push(par);
                dono.push(l.id);
            }
        }
    }
    // Regra 3: T0.
    let xy: Vec<[f64; 2]> = pontos.iter().map(|p| [p[0], p[1]]).collect();
    let tri = triangular(&xy, &trechos)?;
    if tri.t.is_empty() {
        avisos.push(aviso(AVISO_SEM_TRIANGULOS, ID_AUSENTE, 0.0, 0.0, [0.0; 3]));
        let vazia = Rc::new(Malha::default());
        return Ok(Existente { t0: Rc::clone(&vazia), e: vazia, avisos, borda: f.borda.clone() });
    }
    let mut aceitos = Vec::with_capacity(trechos.len());
    for (k, par) in trechos.iter().enumerate() {
        if tri.aceitas[k] {
            aceitos.push(*par);
        } else {
            avisos.push(aviso(AVISO_LINHA_CRUZA, dono[k], 0.0, 0.0, meio(pontos[par[0] as usize], pontos[par[1] as usize])));
        }
    }
    let t0 = Rc::new(Malha::nova(pontos, ids, tri.t, aceitos));
    // Regra 5: E.
    let e = match &f.borda {
        None => Rc::clone(&t0),
        Some(borda) => Rc::new(recortar(&t0, borda, &mut avisos)?),
    };
    if e.t.is_empty() {
        avisos.push(aviso(AVISO_SEM_TRIANGULOS, ID_AUSENTE, 0.0, 0.0, [0.0; 3]));
    }
    Ok(Existente { t0, e, avisos, borda: f.borda.clone() })
}

/// Adensa um polígono fechado: cada lado é dividido em partes iguais de no máximo `passo`; os cantos ficam.
pub fn adensar(poligono: &[V], passo: f64) -> Vec<V> {
    let mut out = Vec::new();
    for k in 0..poligono.len() {
        let (a, b) = (poligono[k], poligono[(k + 1) % poligono.len()]);
        let n = (dist(a, b) / passo).ceil().max(1.0) as usize;
        for i in 0..n {
            let t = i as f64 / n as f64;
            out.push(v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
        }
    }
    out
}

/// Cota de um ponto da borda (regra 5b): a de T0 ali; fora de T0, a do vértice de T0 mais próximo em planta (empate: o de menor `id_num`, que é o primeiro).
fn cota_da_borda(t0: &Malha, q: V) -> f64 {
    if let Some(z) = t0.cota(q.x, q.y) {
        return z;
    }
    let mut melhor = (f64::INFINITY, 0.0);
    for p in &t0.v {
        let d = (p[0] - q.x) * (p[0] - q.x) + (p[1] - q.y) * (p[1] - q.y);
        if d < melhor.0 {
            melhor = (d, p[2]);
        }
    }
    melhor.1
}

/// Regra 5 com borda: nova triangulação com os vértices de T0 dentro ou sobre a borda, os pontos da borda adensada, os trechos da borda e as restrições de
/// T0 que ficaram; depois saem os triângulos de centroide fora da borda e os vértices sem triângulo.
fn recortar(t0: &Malha, borda: &[V], avisos: &mut Vec<AvisoTerreno>) -> Result<Malha, u32> {
    let perimetro: f64 = (0..borda.len()).map(|k| dist(borda[k], borda[(k + 1) % borda.len()])).sum();
    let adensada = adensar(borda, PASSO_BORDA_MIN.max(perimetro / TRECHOS_BORDA));
    let mut pontos: Vec<[f64; 3]> = Vec::new();
    let mut ids: Vec<u32> = Vec::new();
    let mut por_chave: HashMap<(i64, i64), u32> = HashMap::new();
    let mut de_t0: Vec<Option<u32>> = vec![None; t0.v.len()];
    for (k, p) in t0.v.iter().enumerate() {
        if dentro_ou_sobre(v(p[0], p[1]), borda, TOL_DENTRO) {
            de_t0[k] = Some(pontos.len() as u32);
            por_chave.insert(chave(p[0], p[1]), pontos.len() as u32);
            pontos.push(*p);
            ids.push(t0.ids[k]);
        }
    }
    let mut anel: Vec<u32> = Vec::with_capacity(adensada.len());
    for q in &adensada {
        let k = *por_chave.entry(chave(q.x, q.y)).or_insert_with(|| {
            pontos.push([q.x, q.y, cota_da_borda(t0, *q)]);
            ids.push(ID_AUSENTE);
            pontos.len() as u32 - 1
        });
        anel.push(k);
    }
    let mut trechos: Vec<[u32; 2]> = (0..anel.len()).map(|k| [anel[k], anel[(k + 1) % anel.len()]]).filter(|t| t[0] != t[1]).collect();
    trechos.extend(t0.restricoes.iter().filter_map(|r| de_t0[r[0] as usize].zip(de_t0[r[1] as usize])).map(|(a, b)| [a, b]));
    let xy: Vec<[f64; 2]> = pontos.iter().map(|p| [p[0], p[1]]).collect();
    let tri = triangular(&xy, &trechos)?;
    if tri.t.is_empty() {
        return Ok(Malha::default());
    }
    let mut aceitos = Vec::with_capacity(trechos.len());
    for (k, par) in trechos.iter().enumerate() {
        if tri.aceitas[k] {
            aceitos.push(*par);
        } else {
            avisos.push(aviso(AVISO_LINHA_CRUZA, ID_AUSENTE, 0.0, 0.0, meio(pontos[par[0] as usize], pontos[par[1] as usize])));
        }
    }
    let dentro: Vec<[u32; 3]> = tri
        .t
        .into_iter()
        .filter(|t| {
            let c = t.map(|i| pontos[i as usize]);
            ponto_no_poligono(v((c[0][0] + c[1][0] + c[2][0]) / 3.0, (c[0][1] + c[1][1] + c[2][1]) / 3.0), borda)
        })
        .collect();
    // Compacta: só ficam os vértices usados por algum triângulo.
    // A ordem dos vértices é a de entrada (T0 e depois a borda), não a de aparição nos triângulos.
    let mut usado = vec![false; pontos.len()];
    for &i in dentro.iter().flatten() {
        usado[i as usize] = true;
    }
    let mut novo: Vec<Option<u32>> = vec![None; pontos.len()];
    let (mut v2, mut ids2) = (Vec::new(), Vec::new());
    for i in (0..pontos.len()).filter(|&i| usado[i]) {
        novo[i] = Some(v2.len() as u32);
        v2.push(pontos[i]);
        ids2.push(ids[i]);
    }
    let mut t2 = Vec::with_capacity(dentro.len());
    for t in &dentro {
        let mut tri = [0u32; 3];
        for (i, &k) in t.iter().enumerate() {
            tri[i] = novo[k as usize].ok_or(INTERNO)?;
        }
        t2.push(tri);
    }
    let r2 = aceitos.iter().filter_map(|r| novo[r[0] as usize].zip(novo[r[1] as usize])).map(|(a, b)| [a, b]).collect();
    Ok(Malha::nova(v2, ids2, t2, r2))
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn triangula_quadrado_e_pula_restricao_que_cruza() {
        let p = [[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0]];
        let r = triangular(&p, &[[0, 2], [1, 3], [2, 2], [0, 1]]).expect("ok");
        assert_eq!(r.t.len(), 2);
        assert_eq!(r.aceitas, vec![true, false, false, true], "a diagonal que cruza e o trecho nulo ficam de fora; a aresta do contorno entra");
        for t in &r.t {
            let c = t.map(|i| p[i as usize]);
            assert!((c[1][0] - c[0][0]) * (c[2][1] - c[0][1]) - (c[1][1] - c[0][1]) * (c[2][0] - c[0][0]) > 0.0, "anti-horário");
            assert!(t.contains(&0) && t.contains(&2), "a diagonal obrigatória é aresta dos dois triângulos");
        }
    }

    #[test]
    fn sem_triangulos_nao_tenta_restricao_e_nan_e_entrada() {
        let colineares = [[0.0, 0.0], [1.0, 0.0], [2.0, 0.0]];
        let r = triangular(&colineares, &[[0, 2]]).expect("ok");
        assert!(r.t.is_empty());
        assert_eq!(r.aceitas, vec![false]);
        assert!(triangular(&[], &[]).expect("vazio").t.is_empty());
        assert_eq!(triangular(&[[0.0, 0.0], [f64::NAN, 1.0]], &[]).err(), Some(ENTRADA));
        assert_eq!(triangular(&[[0.0, 0.0], [f64::INFINITY, 1.0]], &[]).err(), Some(ENTRADA));
        assert_eq!(triangular(&p3(), &[[0, 7]]).err(), Some(INTERNO), "índice de restrição fora da lista");
    }

    fn p3() -> [[f64; 2]; 3] {
        [[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]]
    }

    #[test]
    fn restricao_que_passa_por_vertice_e_restricao_repetida_entram() {
        let p = [[0.0, 0.0], [5.0, 5.0], [10.0, 10.0], [10.0, 0.0], [0.0, 10.0]];
        let r = triangular(&p, &[[0, 2], [2, 0], [0, 1]]).expect("ok");
        assert_eq!(r.aceitas, vec![true, true, true]);
        assert_eq!(r.t.len(), 4);
    }

    #[test]
    fn adensa_mantendo_os_cantos() {
        let q = [v(0.0, 0.0), v(2.5, 0.0), v(2.5, 1.0)];
        let a = adensar(&q, 1.0);
        assert_eq!(&a[..4], &[v(0.0, 0.0), v(2.5 * (1.0 / 3.0), 0.0), v(2.5 * (2.0 / 3.0), 0.0), v(2.5, 0.0)]);
        assert_eq!(a[4], v(2.5, 1.0));
        assert_eq!(a.len(), 3 + 1 + 3, "3 partes, 1 parte e 3 partes na hipotenusa");
        assert_eq!(adensar(&q, 100.0), q.to_vec());
    }

    #[test]
    fn cota_da_borda_fora_de_t0_vem_do_vertice_mais_proximo() {
        let t0 = Malha::nova(vec![[0.0, 0.0, 1.0], [4.0, 0.0, 2.0], [0.0, 4.0, 3.0], [8.0, 0.0, 9.0]], vec![0, 1, 2, 3], vec![[0, 1, 2]], Vec::new());
        assert_eq!(cota_da_borda(&t0, v(1.0, 1.0)), 1.0 + 0.25 + 0.5);
        assert_eq!(cota_da_borda(&t0, v(5.0, -3.0)), 2.0);
        assert_eq!(cota_da_borda(&t0, v(6.0, -1.0)), 2.0, "empate em distância: vale o primeiro (menor id_num)");
    }
}
