//! Pintor por prioridade, portado de `paint` (`resolve.ts`) na sub-etapa A2 (decisão 0047): o menor número de
//! prioridade é aceito primeiro e corta os demais. As booleanas vêm de `ops.rs` (caminho Clipper, quantização
//! a 1 µm). O cache de `resolveMemo.ts` (`pinturasDoCluster`, `pintarCompartilhado`, `furosDe`) só guarda
//! resultados e não entra aqui.

use std::cmp::Ordering;

use crate::itens::{caixas_se_cruzam, Item};
use crate::ops::{diferenca_com_escala, ESCALA_FINA};
use crate::{Anel, MultiPoligono};

/// `MIN_AREA` de `resolve.ts`.
pub const AREA_MINIMA: f64 = 1e-9;

/// `ringArea`.
fn area_do_anel(a: &Anel) -> f64 {
    let mut s = 0.0;
    for i in 0..a.len() {
        let p = a[i];
        let q = a[(i + 1) % a.len()];
        s += p[0] * q[1] - q[0] * p[1];
    }
    s / 2.0
}

/// `polygonArea`: externo menos furos, cada um em módulo.
pub fn area_do_poligono(p: &[Anel]) -> f64 {
    let mut total = 0.0;
    for (i, r) in p.iter().enumerate() {
        let a = area_do_anel(r).abs();
        total += if i == 0 { a } else { -a };
    }
    total
}

/// `multiArea`.
pub fn area_da_forma(m: &MultiPoligono) -> f64 {
    m.iter().fold(0.0, |s, p| s + area_do_poligono(p))
}

fn cmp_f(a: f64, b: f64) -> Ordering {
    a.partial_cmp(&b).unwrap_or(Ordering::Equal)
}

/// Comparador do TS: `x.priority - y.priority || Number(y.through) - Number(x.through) || y.coreT - x.coreT ||
/// x.order - y.order || x.layerIndex - y.layerIndex`. Prioridade igual: a parede que atravessa um T vem primeiro;
/// só depois valem o núcleo mais robusto e a ordem de criação.
fn comparar(x: &Item, y: &Item) -> Ordering {
    cmp_f(x.prioridade, y.prioridade)
        .then_with(|| (y.atravessa as u8).cmp(&(x.atravessa as u8)))
        .then_with(|| cmp_f(y.nucleo_t, x.nucleo_t))
        .then_with(|| cmp_f(x.ordem, y.ordem))
        .then_with(|| x.camada().cmp(&y.camada()))
}

/// `paint(items)`: fragmento pintado de cada item, na ordem de `itens`. `Err` é o código do esquema.
pub fn pintar(itens: &[&Item]) -> Result<Vec<MultiPoligono>, u32> {
    // Ordenação estável, como `Array.prototype.sort`.
    let mut ordenados: Vec<usize> = (0..itens.len()).collect();
    ordenados.sort_by(|&i, &j| comparar(itens[i], itens[j]));
    let mut resultado: Vec<MultiPoligono> = vec![Vec::new(); itens.len()];
    let mut mais_fortes: Vec<usize> = Vec::new();
    let mut i = 0;
    while i < ordenados.len() {
        let mut j = i;
        while j < ordenados.len() && itens[ordenados[j]].prioridade == itens[ordenados[i]].prioridade {
            j += 1;
        }
        let grupo = &ordenados[i..j];
        let mut aceitos: Vec<usize> = Vec::new();
        for &k in grupo {
            let it = itens[k];
            let mut subs: Vec<&MultiPoligono> = Vec::new();
            for &h in &mais_fortes {
                if caixas_se_cruzam(&itens[h].caixa, &it.caixa) {
                    subs.push(&itens[h].forma);
                }
            }
            // Mesma prioridade: o mais antigo vence, então a camada nova não duplica a área do canto.
            for &g in &aceitos {
                if itens[g].parede != it.parede && caixas_se_cruzam(&itens[g].caixa, &it.caixa) {
                    subs.push(&itens[g].forma);
                }
            }
            let visivel: MultiPoligono = if subs.is_empty() {
                it.forma.clone()
            } else {
                let mut args: Vec<MultiPoligono> = Vec::with_capacity(subs.len() + 1);
                args.push(it.forma.clone());
                args.extend(subs.into_iter().cloned());
                diferenca_com_escala(&args, ESCALA_FINA).map_err(traduz)?
            };
            resultado[k] = visivel.into_iter().filter(|p| area_do_poligono(p) > AREA_MINIMA).collect();
            aceitos.push(k);
        }
        mais_fortes.extend_from_slice(grupo);
        i = j;
    }
    Ok(resultado)
}

/// Código de `ops.rs` (v1) para o do esquema.
fn traduz(c: u32) -> u32 {
    if c == crate::ERRO_ENTRADA {
        crate::esquema::ENTRADA
    } else {
        crate::esquema::INTERNO
    }
}
