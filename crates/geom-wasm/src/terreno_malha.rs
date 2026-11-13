//! Terreno (PLANO do terreno A.4 regra 9): a malha de desenho da consulta 160 (`terreno_malha`).
//!
//! Por terreno, três grupos: a **superfície** (triângulos com a normal para cima), a **saia** (um quadrilátero vertical por aresta de borda, da superfície até
//! `z_base`, com a normal para fora) e a **base** (os mesmos triângulos na cota `z_base`, com a orientação invertida). `z_base = min(z) − espessura_base`.
//! Os vértices de um terreno são os da superfície seguidos das suas cópias na cota `z_base`; a saia reusa esses vértices. Até a ficha R3 não há regiões
//! (um grupo de superfície por terreno, `regiao_num = ID_AUSENTE`) e a superfície proposta devolve o mesmo que a existente.

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::esquema::ID_AUSENTE;
use crate::terreno_avalia::Malha;
use crate::terreno_tipos::{existente, terrenos_do_nivel};

/// `papel` dos grupos da consulta 160.
pub const PAPEL_SUPERFICIE: u32 = 0;
pub const PAPEL_SAIA: u32 = 1;
pub const PAPEL_BASE: u32 = 2;

/// Acumulador das três saídas da consulta 160.
#[derive(Default)]
pub struct MalhaDesenho {
    /// `[terreno_num, regiao_num, papel, primeiro_indice, n_indices]` por grupo.
    pub grupos: Vec<u32>,
    /// `[x, y, z]` por vértice.
    pub vertices: Vec<f64>,
    pub indices: Vec<u32>,
}

impl MalhaDesenho {
    fn fechar_grupo(&mut self, terreno: u32, papel: u32, primeiro: usize) {
        self.grupos.extend_from_slice(&[terreno, ID_AUSENTE, papel, primeiro as u32, (self.indices.len() - primeiro) as u32]);
    }

    /// Acrescenta a superfície, a saia e a base de um terreno. Malha sem triângulos não acrescenta nada.
    pub fn acrescentar(&mut self, terreno: u32, m: &Malha, espessura_base: f64) {
        let Some((z_min, _)) = m.z_min_max().filter(|_| !m.t.is_empty()) else { return };
        let z_base = z_min - espessura_base;
        let topo = (self.vertices.len() / 3) as u32;
        let base = topo + m.v.len() as u32;
        for p in &m.v {
            self.vertices.extend_from_slice(p);
        }
        for p in &m.v {
            self.vertices.extend_from_slice(&[p[0], p[1], z_base]);
        }
        let primeiro = self.indices.len();
        for t in &m.t {
            self.indices.extend_from_slice(&[topo + t[0], topo + t[1], topo + t[2]]);
        }
        self.fechar_grupo(terreno, PAPEL_SUPERFICIE, primeiro);
        let primeiro = self.indices.len();
        for [a, b] in m.arestas_de_borda() {
            // O interior fica à esquerda de a→b; os dois triângulos do quadrilátero olham para a direita (para fora).
            self.indices.extend_from_slice(&[topo + a, base + a, base + b, topo + a, base + b, topo + b]);
        }
        self.fechar_grupo(terreno, PAPEL_SAIA, primeiro);
        let primeiro = self.indices.len();
        for t in &m.t {
            self.indices.extend_from_slice(&[base + t[0], base + t[2], base + t[1]]);
        }
        self.fechar_grupo(terreno, PAPEL_BASE, primeiro);
    }
}

/// Consulta 160 (`terreno_malha`): terrenos do nível (`NIVEL_TODOS` = todos) por `id_num` crescente.
pub fn consulta_terreno_malha(cena: &Cena, nivel: u32, _superficie: u32) -> Result<Vec<Saida>, u32> {
    let mut d = MalhaDesenho::default();
    for t in terrenos_do_nivel(&cena.terreno, nivel) {
        let e = existente(cena, t)?;
        let espessura = cena.terreno.terrenos.get(&t).map_or(0.0, |l| l.espessura_base);
        d.acrescentar(t, &e.e, espessura);
    }
    Ok(vec![Saida::U32(d.grupos), Saida::F64(d.vertices), Saida::U32(d.indices)])
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn um_triangulo_gera_superficie_saia_e_base() {
        let m = Malha::nova(vec![[0.0, 0.0, 5.0], [2.0, 0.0, 6.0], [0.0, 2.0, 7.0]], vec![0, 1, 2], vec![[0, 1, 2]], Vec::new());
        let mut d = MalhaDesenho::default();
        d.acrescentar(9, &Malha::default(), 3.0);
        assert!(d.grupos.is_empty() && d.vertices.is_empty(), "malha vazia não gera grupo");
        d.acrescentar(9, &m, 3.0);
        assert_eq!(d.grupos, vec![9, ID_AUSENTE, 0, 0, 3, 9, ID_AUSENTE, 1, 3, 18, 9, ID_AUSENTE, 2, 21, 3]);
        assert_eq!(d.vertices.len(), 18);
        assert_eq!(&d.vertices[9..], &[0.0, 0.0, 2.0, 2.0, 0.0, 2.0, 0.0, 2.0, 2.0], "base em z_min − espessura");
        assert_eq!(&d.indices[..3], &[0, 1, 2]);
        assert_eq!(&d.indices[3..9], &[0, 3, 4, 0, 4, 1], "aresta 0→1: normal para −y");
        assert_eq!(&d.indices[21..], &[3, 5, 4], "base invertida");
        d.acrescentar(10, &m, 1.0);
        assert_eq!(d.grupos[15..20], [10, ID_AUSENTE, 0, 24, 3]);
        assert_eq!(&d.indices[24..27], &[6, 7, 8], "índices do segundo terreno são globais");
    }
}
