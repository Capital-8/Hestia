//! Malha do guarda-corpo (decisão 0055, Fase 3b): grupos por peça lógica e soldagem de vértices na grade de 1 µm (ADR §5.8).
//!
//! Cada grupo é um sólido fechado e orientado para fora (normais para fora, regra da mão direita). A soldagem é global à malha e determinística:
//! os vértices ganham índice na ordem de inserção e o `HashMap` só serve de consulta.

use crate::gc_tipos::GRADE_SAIDA;
use std::collections::{BTreeMap, BTreeSet, HashMap};

/// `papel` dos grupos de `guarda_malha` (ADR §6.2).
pub const PAPEL_POSTE: u32 = 0;
pub const PAPEL_BALAUSTRE: u32 = 1;
pub const PAPEL_TRILHO: u32 = 2;
pub const PAPEL_CORRIMAO: u32 = 3;
pub const PAPEL_SUPORTE: u32 = 4;
pub const PAPEL_PAINEL: u32 = 5;
pub const PAPEL_CABO: u32 = 6;
pub const PAPEL_TRAVESSA: u32 = 7;

/// Peça solta, antes da soldagem.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct PecaMalha {
    pub vertices: Vec<[f64; 3]>,
    pub triangulos: Vec<[u32; 3]>,
}

/// Um grupo: `n` índices a partir de `primeiro` (`grupos u32 [guarda_num, papel, material_num, primeiro_indice, n_indices]`).
#[derive(Clone, Debug, PartialEq)]
pub struct GrupoMalha {
    pub guarda: u32,
    pub papel: u32,
    pub material: u32,
    pub primeiro: u32,
    pub n: u32,
}

/// Resultado de `MalhaGC::analisar`.
#[derive(Clone, Debug, PartialEq)]
pub struct Analise {
    pub vertices: usize,
    pub arestas: usize,
    pub faces: usize,
    pub euler: i64,
    /// Volume com sinal (positivo quando as normais apontam para fora).
    pub volume: f64,
    /// Toda aresta orientada aparece uma vez e a sua inversa também: fechada e orientada.
    pub fechada: bool,
}

#[derive(Default)]
pub struct MalhaGC {
    pub vertices: Vec<[f64; 3]>,
    pub indices: Vec<u32>,
    pub grupos: Vec<GrupoMalha>,
    mapa: HashMap<[i64; 3], u32>,
}

/// Arredondamento na grade de 1 µm, igual ao do TS (`Math.floor(v / g + 0.5)`).
pub fn quantizar(v: f64) -> i64 {
    (v / GRADE_SAIDA + 0.5).floor() as i64
}

impl MalhaGC {
    pub fn new() -> MalhaGC {
        MalhaGC::default()
    }

    fn vertice(&mut self, p: [f64; 3]) -> u32 {
        let k = [quantizar(p[0]), quantizar(p[1]), quantizar(p[2])];
        if let Some(&i) = self.mapa.get(&k) {
            return i;
        }
        let i = self.vertices.len() as u32;
        self.vertices.push([k[0] as f64 * GRADE_SAIDA, k[1] as f64 * GRADE_SAIDA, k[2] as f64 * GRADE_SAIDA]);
        self.mapa.insert(k, i);
        i
    }

    /// Solda a peça na malha e abre um grupo. Triângulos que degeneram na soldagem (dois índices iguais) são descartados.
    /// Devolve o índice do grupo.
    pub fn adicionar_grupo(&mut self, guarda: u32, papel: u32, material: u32, peca: &PecaMalha) -> usize {
        let ids: Vec<u32> = peca.vertices.iter().map(|&p| self.vertice(p)).collect();
        let primeiro = self.indices.len() as u32;
        for t in &peca.triangulos {
            let (a, b, c) = (ids[t[0] as usize], ids[t[1] as usize], ids[t[2] as usize]);
            if a != b && b != c && a != c {
                self.indices.extend_from_slice(&[a, b, c]);
            }
        }
        let n = self.indices.len() as u32 - primeiro;
        self.grupos.push(GrupoMalha { guarda, papel, material, primeiro, n });
        self.grupos.len() - 1
    }

    /// Euler, volume com sinal e fechamento/orientação de um grupo.
    pub fn analisar(&self, g: usize) -> Analise {
        let gr = &self.grupos[g];
        let idx = &self.indices[gr.primeiro as usize..(gr.primeiro + gr.n) as usize];
        let mut usados = BTreeSet::new();
        let mut dirigidas: BTreeMap<(u32, u32), u32> = BTreeMap::new();
        let mut volume = 0.0;
        for t in idx.chunks_exact(3) {
            for k in 0..3 {
                usados.insert(t[k]);
                *dirigidas.entry((t[k], t[(k + 1) % 3])).or_insert(0) += 1;
            }
            let (a, b, c) = (self.vertices[t[0] as usize], self.vertices[t[1] as usize], self.vertices[t[2] as usize]);
            volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6.0;
        }
        let nao_dirigidas: BTreeSet<(u32, u32)> = dirigidas.keys().map(|&(a, b)| (a.min(b), a.max(b))).collect();
        let fechada = dirigidas.iter().all(|(&(a, b), &n)| n == 1 && dirigidas.get(&(b, a)) == Some(&1));
        let (v, e, f) = (usados.len(), nao_dirigidas.len(), idx.len() / 3);
        Analise { vertices: v, arestas: e, faces: f, euler: v as i64 - e as i64 + f as i64, volume, fechada }
    }

    /// Soma das coordenadas dos vértices usados por um grupo (assinatura para a paridade com o TS).
    pub fn soma_coordenadas(&self, g: usize) -> [f64; 3] {
        let gr = &self.grupos[g];
        let usados: BTreeSet<u32> = self.indices[gr.primeiro as usize..(gr.primeiro + gr.n) as usize].iter().copied().collect();
        let mut s = [0.0; 3];
        for i in usados {
            for (k, v) in s.iter_mut().enumerate() {
                *v += self.vertices[i as usize][k];
            }
        }
        s
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    fn cubo(l: f64, ox: f64) -> PecaMalha {
        let v = |x: f64, y: f64, z: f64| [ox + x * l, y * l, z * l];
        PecaMalha {
            vertices: vec![v(0., 0., 0.), v(1., 0., 0.), v(1., 1., 0.), v(0., 1., 0.), v(0., 0., 1.), v(1., 0., 1.), v(1., 1., 1.), v(0., 1., 1.)],
            triangulos: vec![[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]],
        }
    }

    #[test]
    fn cubo_fechado_euler_2_volume_positivo() {
        let mut m = MalhaGC::new();
        let g = m.adicionar_grupo(1, PAPEL_POSTE, 0, &cubo(2.0, 0.0));
        let a = m.analisar(g);
        assert_eq!((a.vertices, a.arestas, a.faces, a.euler), (8, 18, 12, 2));
        assert!(a.fechada);
        assert!((a.volume - 8.0).abs() < 1e-12);
    }

    #[test]
    fn solda_na_grade_de_1_micrometro() {
        let mut m = MalhaGC::new();
        let mut c = cubo(1.0, 0.0);
        c.vertices[0][0] += 4e-7; // dentro da mesma célula de 1 µm
        m.adicionar_grupo(1, PAPEL_POSTE, 0, &c);
        let ant = m.vertices.len();
        // um segundo cubo encostado: os 4 vértices da face comum são reaproveitados
        m.adicionar_grupo(1, PAPEL_BALAUSTRE, 0, &cubo(1.0, 1.0));
        assert_eq!(ant, 8);
        assert_eq!(m.vertices.len(), 12);
        assert_eq!(m.grupos.len(), 2);
        assert_eq!(m.grupos[1].primeiro, m.grupos[0].n);
    }

    #[test]
    fn triangulo_degenerado_e_descartado_e_malha_aberta_detectada() {
        let mut m = MalhaGC::new();
        let mut c = cubo(1.0, 0.0);
        c.triangulos.push([0, 0, 1]);
        c.triangulos.pop();
        c.triangulos.pop(); // tira uma face: fica aberta
        let g = m.adicionar_grupo(1, PAPEL_POSTE, 0, &c);
        assert!(!m.analisar(g).fechada);
    }

    #[test]
    fn deterministica() {
        let (mut a, mut b) = (MalhaGC::new(), MalhaGC::new());
        for m in [&mut a, &mut b] {
            m.adicionar_grupo(1, PAPEL_POSTE, 3, &cubo(0.3, 0.0));
            m.adicionar_grupo(2, PAPEL_TRILHO, 4, &cubo(0.7, 0.3));
        }
        assert_eq!(a.vertices, b.vertices);
        assert_eq!(a.indices, b.indices);
        assert_eq!(a.grupos, b.grupos);
    }
}
