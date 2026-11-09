//! Quantidades do guarda-corpo (decisão 0055; consulta `quant_guarda`, id 64, ADR §6.2 e §7.1). FONTE ÚNICA: as peças são as mesmas que geram a malha e as
//! linhas de planta e corte (`gc_montagem::montar`: distribuição da 3c e varredura da 3b), então quantidade e desenho nunca divergem. Este módulo só
//! agrupa as peças lógicas (`PecaGC`) por `(guarda, papel, perfil, material)`: número de peças, comprimento, área lateral, volume e área projetada.
//! Nada aqui deriva peças por conta própria.

use std::collections::BTreeMap;

use crate::cena::Cena;
use crate::consultas::Saida;
use crate::gc_planta::{na_grade, FormaGC, PecaGC};

/// Uma linha agregada de `quant_guarda`.
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

/// Agrupa as peças por `(guarda, papel, perfil, material)`, em ordem de chave; números na grade de 1 µm.
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

pub fn consulta_quant_guarda(cena: &Cena, nivel: u32) -> Result<Vec<Saida>, u32> {
    let m = crate::gc_montagem::montar(cena, nivel, 1, crate::esquema::ID_AUSENTE, crate::consultas::TOL_JUNCAO_GC, false)?;
    let (a, v) = achatar_quant(&quant_guarda(&m.pecas));
    Ok(vec![Saida::U32(a), Saida::F64(v)])
}
