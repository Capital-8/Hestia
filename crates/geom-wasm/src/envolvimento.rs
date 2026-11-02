//! Retornos de acabamento nas pontas livres, portados de `packages/engine/src/wrap.ts` (sub-etapa A2,
//! decisão 0047): `wrappingLayers`, `sidesOf`, `depthRange`, `ringRect` e `endReturns`. Os retornos de
//! vão (`insertReturns`) são da A3.

use crate::geo2d::V;
use crate::MultiPoligono;
use crate::quadro::{ponto_em, Quadro};

/// Dados do tipo que o envolvimento lê: `Layer.wraps` por camada e `WallType.wrapEnds`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Lado {
    Exterior,
    Interior,
}

/// `Wrapper`: camada envolvente com a soma das espessuras das envolventes entre ela e o núcleo.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Envolvente {
    pub indice: usize,
    pub off: f64,
    pub espessura: f64,
}

/// `coreRange` pelas funções das camadas (0 = structure): primeira e última camada de estrutura; sem
/// estrutura, do início ao fim (`last = max(0, n - 1)`).
pub fn faixa_do_nucleo(funcoes: &[u8]) -> (usize, usize) {
    let mut primeiro: Option<usize> = None;
    let mut ultimo = 0usize;
    for (i, &f) in funcoes.iter().enumerate() {
        if f == 0 {
            if primeiro.is_none() {
                primeiro = Some(i);
            }
            ultimo = i;
        }
    }
    match primeiro {
        Some(p) => (p, ultimo),
        None => (0, funcoes.len().saturating_sub(1)),
    }
}

/// `wrappingLayers(type, side)`: do núcleo para fora.
pub fn camadas_envolventes(funcoes: &[u8], espessuras: &[f64], envolve: &[bool], lado: Lado) -> Vec<Envolvente> {
    let (first, last) = faixa_do_nucleo(funcoes);
    let mut out = Vec::new();
    let mut off = 0.0f64;
    let mut visita = |i: usize, out: &mut Vec<Envolvente>| {
        let (Some(&e), Some(&w)) = (espessuras.get(i), envolve.get(i)) else { return };
        if !w || e < 1e-6 {
            return;
        }
        out.push(Envolvente { indice: i, off, espessura: e });
        off += e;
    };
    match lado {
        Lado::Exterior => {
            // for (i = core.first - 1; i >= 0; i--)
            let mut i = first as isize - 1;
            while i >= 0 {
                visita(i as usize, &mut out);
                i -= 1;
            }
        }
        Lado::Interior => {
            for i in (last + 1)..funcoes.len() {
                visita(i, &mut out);
            }
        }
    }
    out
}

/// `sidesOf(mode)`: 0 none, 1 exterior, 2 interior, 3 both.
pub fn lados_do_modo(modo: u8) -> Vec<Lado> {
    match modo {
        3 => vec![Lado::Exterior, Lado::Interior],
        1 => vec![Lado::Exterior],
        2 => vec![Lado::Interior],
        _ => Vec::new(),
    }
}

/// `depthRange`.
fn faixa_de_profundidade(f: &Quadro, lado: Lado, ambos: bool) -> (f64, f64) {
    let ext = f.s_ext;
    let int = f.s_int;
    if !ambos {
        return (ext.min(int), ext.max(int));
    }
    let (a, b) = match lado {
        Lado::Exterior => (f.s_mid, ext),
        Lado::Interior => (int, f.s_mid),
    };
    (a.min(b), a.max(b))
}

/// Retorno de uma camada na ponta: polígono (um anel).
pub struct RetornoDeCamada {
    pub indice: usize,
    pub poly: MultiPoligono,
}

/// `endReturns(f, which, mode)`.
pub fn retornos_de_ponta(f: &Quadro, funcoes: &[u8], espessuras: &[f64], envolve: &[bool], which: usize, modo: u8) -> Vec<RetornoDeCamada> {
    let lados = lados_do_modo(modo);
    let mut out = Vec::new();
    for &lado in &lados {
        let (s0, s1) = faixa_de_profundidade(f, lado, lados.len() == 2);
        for w in camadas_envolventes(funcoes, espessuras, envolve, lado) {
            let (t0, t1) = if which == 0 { (-(w.off + w.espessura), -w.off) } else { (f.length + w.off, f.length + w.off + w.espessura) };
            let anel: Vec<V> = vec![ponto_em(f, t0, s0), ponto_em(f, t1, s0), ponto_em(f, t1, s1), ponto_em(f, t0, s1)];
            out.push(RetornoDeCamada { indice: w.indice, poly: vec![vec![anel.iter().map(|p| [p.x, p.y]).collect()]] });
        }
    }
    out
}
