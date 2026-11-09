//! Medidas geométricas para os avisos de norma do guarda-corpo (decisão 0055, Fase 4a): consulta `guarda_avisos` (ADR §6.2 e §8.1).
//!
//! O Rust só mede; o TS decide texto e severidade. Cada aviso é `[guarda_num, codigo, trecho, indice]` com `[medido, limite, x, y, z]`.
//! Desdobramento 2D (§8.1): `s` é o comprimento horizontal e `h` a altura sobre o hospedeiro. Balaústres e postes são faixas verticais em `s`,
//! trilhos são faixas horizontais em `h`. A maior esfera que passa por uma célula livre é `min(largura, altura)`.

use crate::gc_planta::na_grade;

/// Códigos de aviso (coluna `codigo`).
pub const AV_VAO_GRANDE: u32 = 1;
pub const AV_VAO_INFERIOR: u32 = 2;
pub const AV_CORRIMAO_ALTURA: u32 = 3;
pub const AV_CORRIMAO_EXTENSAO: u32 = 4;
pub const AV_ALTURA_BAIXA: u32 = 5;

#[derive(Clone, Debug, PartialEq)]
pub struct Aviso {
    pub guarda: u32,
    pub codigo: u32,
    pub trecho: u32,
    pub indice: u32,
    pub medido: f64,
    pub limite: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

/// Desenho 2D de um vão de guarda-corpo: obstáculos verticais (`s0, s1`) e horizontais (`h0, h1`), no retângulo `[0, comprimento] x [0, altura]`.
#[derive(Clone, Debug, Default)]
pub struct VaoGC {
    pub comprimento: f64,
    pub altura: f64,
    pub verticais: Vec<(f64, f64)>,
    pub horizontais: Vec<(f64, f64)>,
}

/// Une intervalos ocupados e devolve os livres dentro de `[a, b]`.
fn livres(ocupados: &[(f64, f64)], a: f64, b: f64) -> Vec<(f64, f64)> {
    let mut o: Vec<(f64, f64)> = ocupados.iter().copied().filter(|&(x, y)| y > a && x < b).collect();
    o.sort_by(|p, q| p.0.total_cmp(&q.0));
    let mut out = Vec::new();
    let mut cur = a;
    for (x, y) in o {
        if x > cur {
            out.push((cur, x.min(b)));
        }
        cur = cur.max(y);
    }
    if cur < b {
        out.push((cur, b));
    }
    out
}

/// Maior esfera (diâmetro, m) que passa por alguma célula livre de `v` na faixa de alturas `[h_min, h_max]`; devolve também o centro `(s, h)`.
pub fn maior_esfera(v: &VaoGC, h_min: f64, h_max: f64) -> Option<(f64, f64, f64)> {
    let hs = livres(&v.horizontais, h_min.max(0.0), h_max.min(v.altura));
    let ss = livres(&v.verticais, 0.0, v.comprimento);
    let mut melhor: Option<(f64, f64, f64)> = None;
    for &(s0, s1) in &ss {
        for &(h0, h1) in &hs {
            let d = (s1 - s0).min(h1 - h0);
            if d > 0.0 && melhor.is_none_or(|m| d > m.0) {
                melhor = Some((d, (s0 + s1) / 2.0, (h0 + h1) / 2.0));
            }
        }
    }
    melhor
}

/// `gc-vao-grande`: a maior esfera entre `folga_inferior` e `altura_min` passa por uma abertura maior que `esfera_max`?
pub fn aviso_vao_grande(guarda: u32, trecho: u32, v: &VaoGC, folga_inferior: f64, altura_min: f64, esfera_max: f64) -> Option<Aviso> {
    let (d, s, h) = maior_esfera(v, folga_inferior, altura_min)?;
    (d > esfera_max + 1e-9).then(|| Aviso { guarda, codigo: AV_VAO_GRANDE, trecho, indice: 0, medido: na_grade(d), limite: esfera_max, x: s, y: 0.0, z: h })
}

/// `gc-vao-inferior`: folga entre a base do preenchimento e o hospedeiro maior que o máximo.
pub fn aviso_vao_inferior(guarda: u32, trecho: u32, folga: f64, maximo: f64) -> Option<Aviso> {
    (folga > maximo + 1e-9).then(|| Aviso { guarda, codigo: AV_VAO_INFERIOR, trecho, indice: 0, medido: na_grade(folga), limite: maximo, x: 0.0, y: 0.0, z: 0.0 })
}

/// `gc-corrimao-altura`: topo do corrimão (medido da linha das quinas) fora de `[min, max]`.
pub fn aviso_corrimao_altura(guarda: u32, trecho: u32, indice: u32, altura: f64, min: f64, max: f64) -> Option<Aviso> {
    let limite = if altura < min { min } else if altura > max { max } else { return None };
    (((altura - limite).abs()) > 1e-9).then(|| Aviso { guarda, codigo: AV_CORRIMAO_ALTURA, trecho, indice, medido: na_grade(altura), limite, x: 0.0, y: 0.0, z: 0.0 })
}

/// `gc-corrimao-extensao`: extensão (m) menor que a mínima. `indice` 0 = início, 1 = fim.
pub fn aviso_corrimao_extensao(guarda: u32, trecho: u32, indice: u32, extensao: f64, minima: f64) -> Option<Aviso> {
    (extensao < minima - 1e-9).then(|| Aviso { guarda, codigo: AV_CORRIMAO_EXTENSAO, trecho, indice, medido: na_grade(extensao), limite: minima, x: 0.0, y: 0.0, z: 0.0 })
}

/// `gc-altura-baixa`: altura real do guarda-corpo menor que a mínima.
pub fn aviso_altura(guarda: u32, trecho: u32, altura: f64, minima: f64) -> Option<Aviso> {
    (altura < minima - 1e-9).then(|| Aviso { guarda, codigo: AV_ALTURA_BAIXA, trecho, indice: 0, medido: na_grade(altura), limite: minima, x: 0.0, y: 0.0, z: 0.0 })
}

/// Saída plana: `avisos` `[guarda_num, codigo, trecho, indice]` e `valores` `[medido, limite, x, y, z]`, ordenados por (guarda, trecho, codigo, indice).
pub fn achatar_avisos(av: &[Aviso]) -> (Vec<u32>, Vec<f64>) {
    let mut v: Vec<&Aviso> = av.iter().collect();
    v.sort_by_key(|a| (a.guarda, a.trecho, a.codigo, a.indice));
    let mut a = Vec::new();
    let mut m = Vec::new();
    for x in v {
        a.extend_from_slice(&[x.guarda, x.codigo, x.trecho, x.indice]);
        m.extend_from_slice(&[x.medido, x.limite, na_grade(x.x), na_grade(x.y), na_grade(x.z)]);
    }
    (a, m)
}

#[cfg(test)]
mod testes {
    use super::*;

    /// Balaústres de 12 mm com vão livre `vao` entre eles, trilho de base a `base` e de topo em `altura`.
    fn guarda(vao: f64, n: usize) -> VaoGC {
        let passo = vao + 0.012;
        let verticais = (0..n).map(|k| (k as f64 * passo, k as f64 * passo + 0.012)).collect();
        VaoGC { comprimento: (n - 1) as f64 * passo + 0.012, altura: 1.1, verticais, horizontais: vec![(0.0, 0.05), (1.05, 1.1)] }
    }

    #[test]
    fn vao_de_120_contra_limite_de_110_avisa() {
        let a = aviso_vao_grande(1, 0, &guarda(0.12, 6), 0.05, 1.05, 0.11).expect("aviso");
        assert!((a.medido - 0.12).abs() < 1e-9);
        assert_eq!(a.limite, 0.11);
        assert_eq!(a.codigo, AV_VAO_GRANDE);
    }

    #[test]
    fn vao_de_100_nao_avisa() {
        assert!(aviso_vao_grande(1, 0, &guarda(0.10, 6), 0.05, 1.05, 0.11).is_none());
    }

    #[test]
    fn trilho_intermediario_reduz_a_esfera_vertical() {
        // Vão largo (30 cm), mas trilho a cada 8 cm de altura: a esfera é limitada pela altura.
        let mut v = guarda(0.30, 4);
        v.horizontais = (0..14).map(|k| (0.05 + k as f64 * 0.09, 0.05 + k as f64 * 0.09 + 0.012)).collect();
        let (d, _, _) = maior_esfera(&v, 0.05, 1.05).expect("célula");
        assert!(d < 0.09);
    }

    #[test]
    fn corrimao_a_95_contra_faixa_80_92() {
        let a = aviso_corrimao_altura(2, 1, 0, 0.95, 0.80, 0.92).expect("aviso");
        assert_eq!((a.medido, a.limite), (0.95, 0.92));
        assert!(aviso_corrimao_altura(2, 1, 0, 0.90, 0.80, 0.92).is_none());
        assert!(aviso_corrimao_altura(2, 1, 0, 0.70, 0.80, 0.92).is_some());
    }

    #[test]
    fn extensao_curta_e_altura_baixa() {
        assert!(aviso_corrimao_extensao(1, 0, 1, 0.20, 0.30).is_some());
        assert!(aviso_corrimao_extensao(1, 0, 1, 0.30, 0.30).is_none());
        assert!(aviso_altura(1, 0, 0.90, 1.10).is_some());
        assert!(aviso_vao_inferior(1, 0, 0.15, 0.11).is_some());
        assert!(aviso_vao_inferior(1, 0, 0.05, 0.11).is_none());
    }

    #[test]
    fn saida_plana_ordenada() {
        let av = vec![aviso_altura(2, 0, 0.9, 1.1).unwrap(), aviso_altura(1, 0, 0.9, 1.1).unwrap()];
        let (a, m) = achatar_avisos(&av);
        assert_eq!(a, vec![1, AV_ALTURA_BAIXA, 0, 0, 2, AV_ALTURA_BAIXA, 0, 0]);
        assert_eq!(m.len(), 10);
    }
}
