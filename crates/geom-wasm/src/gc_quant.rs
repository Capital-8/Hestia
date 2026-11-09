//! Quantidades do guarda-corpo (decisão 0055, Fase 4a): consulta `quant_guarda` (ADR §6.2 e §7.1).
//!
//! Agrupa as peças por `(guarda, papel, perfil, material)`; soma número de peças, comprimento (m), área lateral (m²), volume (m³) e área projetada em
//! elevação (m²). Comprimento: desenvolvido para trilho e corrimão, altura para peça vertical, vão para painel. Grade de 1 µm; ordem por chave.

use std::collections::BTreeMap;

use crate::gc_planta::{na_grade, FormaGC, PecaGC};

#[derive(Clone, Debug, PartialEq)]
pub struct LinhaQuant {
    pub guarda: u32,
    pub papel: u32,
    pub perfil_num: u32,
    pub material_num: u32,
    pub n_pecas: u32,
    pub comprimento: f64,
    pub area: f64,
    pub volume: f64,
    pub area_projetada: f64,
}

/// `(comprimento, largura em elevação, área lateral, volume)` de uma peça.
fn medidas(p: &PecaGC) -> (f64, f64, f64, f64) {
    match &p.forma {
        FormaGC::Vertical { z0, z1, largura, .. } => {
            let c = (z1 - z0).abs();
            (c, *largura, p.perimetro * c, p.area_secao * c)
        }
        FormaGC::Varrida { nos, largura, .. } => {
            let c: f64 = nos.windows(2).map(|w| ((w[1].x - w[0].x).powi(2) + (w[1].y - w[0].y).powi(2) + (w[1].z - w[0].z).powi(2)).sqrt()).sum();
            (c, *largura, p.perimetro * c, p.area_secao * c)
        }
        FormaGC::Painel { a, b, altura, espessura } => {
            let c = ((b.x - a.x).powi(2) + (b.y - a.y).powi(2)).sqrt();
            (c, *altura, 2.0 * c * altura, c * altura * espessura)
        }
    }
}

pub fn quant_guarda(pecas: &[PecaGC]) -> Vec<LinhaQuant> {
    let mut g: BTreeMap<(u32, u32, u32, u32), LinhaQuant> = BTreeMap::new();
    for p in pecas {
        let (c, w, area, vol) = medidas(p);
        let l = g.entry((p.guarda, p.papel, p.perfil_num, p.material_num)).or_insert(LinhaQuant {
            guarda: p.guarda,
            papel: p.papel,
            perfil_num: p.perfil_num,
            material_num: p.material_num,
            n_pecas: 0,
            comprimento: 0.0,
            area: 0.0,
            volume: 0.0,
            area_projetada: 0.0,
        });
        l.n_pecas += 1;
        l.comprimento += c;
        l.area += area;
        l.volume += vol;
        l.area_projetada += w * c;
    }
    g.into_values()
        .map(|mut l| {
            l.comprimento = na_grade(l.comprimento);
            l.area = na_grade(l.area);
            l.volume = na_grade(l.volume);
            l.area_projetada = na_grade(l.area_projetada);
            l
        })
        .collect()
}

/// Saída plana: `linhas` `[guarda_num, papel, perfil_num, material_num, n_pecas]`, `valores` `[comprimento, area, volume, area_projetada]`.
pub fn achatar_quant(l: &[LinhaQuant]) -> (Vec<u32>, Vec<f64>) {
    let mut a = Vec::new();
    let mut v = Vec::new();
    for x in l {
        a.extend_from_slice(&[x.guarda, x.papel, x.perfil_num, x.material_num, x.n_pecas]);
        v.extend_from_slice(&[x.comprimento, x.area, x.volume, x.area_projetada]);
    }
    (a, v)
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::gc_planta::{PAPEL_BALAUSTRE, PAPEL_CORRIMAO, PAPEL_POSTE};
    use crate::gc_tipos::No3;

    #[test]
    fn contagens_e_comprimentos_exatos() {
        let mut p: Vec<PecaGC> = (0..10).map(|k| PecaGC::vertical_redondo(1, PAPEL_BALAUSTRE, k as f64 * 0.11, 0.0, 0.0, 1.0, 0.012)).collect();
        p.push(PecaGC::vertical_retangular(1, PAPEL_POSTE, 0.0, 0.0, 0.0, 1.1, 0.05, 0.05));
        p.push(PecaGC::varrida_redonda(1, PAPEL_CORRIMAO, vec![No3 { x: 0.0, y: 0.0, z: 1.0 }, No3 { x: 3.0, y: 0.0, z: 5.0 }], 0.04));
        let q = quant_guarda(&p);
        assert_eq!(q.len(), 3);
        let bal = q.iter().find(|x| x.papel == PAPEL_BALAUSTRE).unwrap();
        assert_eq!(bal.n_pecas, 10);
        assert!((bal.comprimento - 10.0).abs() < 1e-9);
        assert!((bal.volume - 10.0 * std::f64::consts::PI * 0.012f64.powi(2) / 4.0).abs() < 1e-6);
        let cor = q.iter().find(|x| x.papel == PAPEL_CORRIMAO).unwrap();
        assert!((cor.comprimento - 5.0).abs() < 1e-9, "desenvolvido: 3-4-5");
        let poste = q.iter().find(|x| x.papel == PAPEL_POSTE).unwrap();
        assert!((poste.volume - 0.05 * 0.05 * 1.1).abs() < 1e-9);
        assert!((poste.area - 4.0 * 0.05 * 1.1).abs() < 1e-9);
    }

    #[test]
    fn painel_e_agrupamento_por_material() {
        let a = No3 { x: 0.0, y: 0.0, z: 0.1 };
        let b = No3 { x: 2.0, y: 0.0, z: 0.1 };
        let mut p1 = PecaGC::painel(7, a, b, 1.0, 0.012);
        let mut p2 = p1.clone();
        p2.material_num = 3;
        p1.material_num = 2;
        let q = quant_guarda(&[p1.clone(), p1, p2]);
        assert_eq!(q.len(), 2);
        assert_eq!(q[0].material_num, 2);
        assert_eq!(q[0].n_pecas, 2);
        assert!((q[0].area - 8.0).abs() < 1e-9, "duas faces, dois painéis");
        assert!((q[0].area_projetada - 4.0).abs() < 1e-9);
        assert!((q[0].volume - 2.0 * 2.0 * 1.0 * 0.012).abs() < 1e-9);
        let (l, v) = achatar_quant(&q);
        assert_eq!((l.len(), v.len()), (10, 8));
    }

    #[test]
    fn sem_pecas_sem_linhas() {
        assert!(quant_guarda(&[]).is_empty());
    }
}
