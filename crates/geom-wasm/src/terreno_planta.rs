//! Terreno (PLANO do terreno A.5): a borda em planta, consulta 162 (`terreno_planta`).
//!
//! A borda é o contorno da malha: as arestas que pertencem a um triângulo só, encadeadas pelos vértices, com o interior à esquerda (laço externo
//! anti-horário). Com `borda` no modelo é a borda adensada da regra 5; sem ela, a envoltória das fontes.
//!
//! Saída: `linhas [terreno_num, papel (0 borda), fechada, n_pontos]` e `pontos [x, y]`. Laço fechado NÃO repete o primeiro ponto. Ordem: terreno e, nele,
//! a ordem das arestas de borda da malha.

use std::collections::HashMap;

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::terreno_avalia::Malha;
use crate::terreno_tipos::{existente, terrenos_do_nivel};

/// `papel` das linhas da consulta 162.
pub const PAPEL_BORDA: u32 = 0;

/// Laços da borda da malha: `(pontos, fechado)`. Em vértice com mais de uma saída segue a aresta de menor índice ainda não usada.
pub fn lacos_de_borda(m: &Malha) -> Vec<(Vec<[f64; 2]>, bool)> {
    let arestas = m.arestas_de_borda();
    let mut saidas: HashMap<u32, Vec<u32>> = HashMap::with_capacity(arestas.len());
    for (i, a) in arestas.iter().enumerate() {
        saidas.entry(a[0]).or_default().push(i as u32);
    }
    let mut usada = vec![false; arestas.len()];
    let ponto = |i: u32| m.v.get(i as usize).map_or([0.0, 0.0], |p| [p[0], p[1]]);
    let mut out = Vec::new();
    for inicio in 0..arestas.len() {
        if usada[inicio] {
            continue;
        }
        let v0 = arestas[inicio][0];
        let mut pontos = vec![ponto(v0)];
        let mut atual = inicio;
        let fechado = loop {
            usada[atual] = true;
            let fim = arestas[atual][1];
            if fim == v0 {
                break true;
            }
            pontos.push(ponto(fim));
            let prox = saidas.get(&fim).and_then(|l| l.iter().find(|&&j| !usada[j as usize]));
            match prox {
                Some(&j) => atual = j as usize,
                None => break false,
            }
        };
        out.push((pontos, fechado));
    }
    out
}

/// Consulta 162 (`terreno_planta`): terrenos do nível por `id_num` crescente. Até a ficha R3 a superfície proposta devolve o mesmo que a existente.
pub fn consulta_terreno_planta(cena: &Cena, nivel: u32, _superficie: u32) -> Result<Vec<Saida>, u32> {
    let (mut linhas, mut pontos) = (Vec::new(), Vec::new());
    for t in terrenos_do_nivel(&cena.terreno, nivel) {
        let e = existente(cena, t)?;
        for (p, fechado) in lacos_de_borda(&e.e) {
            linhas.extend_from_slice(&[t, PAPEL_BORDA, u32::from(fechado), p.len() as u32]);
            pontos.extend(p.iter().flatten());
        }
    }
    Ok(vec![Saida::U32(linhas), Saida::F64(pontos)])
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::esquema::ID_AUSENTE;

    #[test]
    fn laco_do_quadrado_e_dois_lacos_que_se_tocam() {
        let v = vec![[0.0, 0.0, 0.0], [2.0, 0.0, 0.0], [2.0, 2.0, 0.0], [0.0, 2.0, 0.0]];
        let m = Malha::nova(v, vec![0, 1, 2, 3], vec![[0, 1, 2], [0, 2, 3]], Vec::new());
        assert_eq!(lacos_de_borda(&m), vec![(vec![[0.0, 0.0], [2.0, 0.0], [2.0, 2.0], [0.0, 2.0]], true)]);
        assert!(lacos_de_borda(&Malha::default()).is_empty());
        // Dois triângulos que só se tocam no vértice 0: dois laços fechados.
        let v = vec![[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [1.0, 1.0, 0.0], [-1.0, 0.0, 0.0], [-1.0, -1.0, 0.0]];
        let m = Malha::nova(v, vec![ID_AUSENTE; 5], vec![[0, 1, 2], [0, 3, 4]], Vec::new());
        let l = lacos_de_borda(&m);
        assert_eq!(l.len(), 2);
        assert!(l.iter().all(|(p, f)| *f && p.len() == 3));
    }
}
