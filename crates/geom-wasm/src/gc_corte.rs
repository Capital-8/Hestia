//! Linhas de corte e de elevação do guarda-corpo (decisão 0055, Fase 4a): consulta `guarda_corte` (ADR §6.2).
//!
//! Plano vertical por `(ox, oy)` na direção `(dx, dy)`. Saída em `(s, z)`: `s` ao longo de `(dx, dy)` normalizada. Enxerga-se para a normal esquerda
//! `(-dy, dx)` até `profundidade`. Peça que cruza o plano sai CORTADA (estilo 0, polígono também em `poligonos`); peça na faixa visível sai PROJETADA
//! (estilo 1). Plano fora da edificação com profundidade grande dá a elevação.
//!
//! `poligonos`: por polígono cortado `[guarda_num, papel, n_pontos, s0, z0, s1, z1, ...]` (sem repetir o primeiro ponto).

use crate::gc_planta::{na_grade, FormaGC, PecaGC, ESTILO_CORTADO, ESTILO_PROJETADO};
use crate::gc_tipos::No3;

#[derive(Clone, Debug, PartialEq)]
pub struct LinhaCorte {
    pub guarda: u32,
    pub papel: u32,
    pub estilo: u32,
    pub pontos: Vec<(f64, f64)>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct SaidaCorte {
    pub linhas: Vec<u32>,
    pub pontos: Vec<f64>,
    pub poligonos: Vec<f64>,
}

struct Plano {
    ox: f64,
    oy: f64,
    ux: f64,
    uy: f64,
}

impl Plano {
    /// `(s, t)`: posição ao longo do plano e distância com sinal a ele (positiva = lado visível).
    fn st(&self, x: f64, y: f64) -> (f64, f64) {
        let (rx, ry) = (x - self.ox, y - self.oy);
        (rx * self.ux + ry * self.uy, -rx * self.uy + ry * self.ux)
    }
}

fn retangulo(s0: f64, s1: f64, z0: f64, z1: f64) -> Vec<(f64, f64)> {
    vec![(s0, z0), (s1, z0), (s1, z1), (s0, z1)]
}

pub fn guarda_corte(pecas: &[PecaGC], ox: f64, oy: f64, dx: f64, dy: f64, profundidade: f64) -> Vec<LinhaCorte> {
    let l = dx.hypot(dy);
    if l < 1e-12 || profundidade < 0.0 {
        return Vec::new();
    }
    let pl = Plano { ox, oy, ux: dx / l, uy: dy / l };
    let mut out = Vec::new();
    for p in pecas {
        match &p.forma {
            FormaGC::Vertical { z0, z1, .. } => {
                let (zi, zf) = (z0.min(*z1), z0.max(*z1));
                let pts: Vec<(f64, f64)> = p.contornos_planta().remove(0).iter().map(|&(x, y)| pl.st(x, y)).collect();
                let (tmin, tmax) = pts.iter().fold((f64::INFINITY, f64::NEG_INFINITY), |(a, b), &(_, t)| (a.min(t), b.max(t)));
                if tmin <= 0.0 && tmax >= 0.0 {
                    let mut ss = Vec::new();
                    for i in 0..pts.len() {
                        let (a, b) = (pts[i], pts[(i + 1) % pts.len()]);
                        if (a.1 <= 0.0 && b.1 >= 0.0) || (a.1 >= 0.0 && b.1 <= 0.0) {
                            ss.push(if (b.1 - a.1).abs() < 1e-15 { a.0 } else { a.0 + (b.0 - a.0) * (0.0 - a.1) / (b.1 - a.1) });
                        }
                    }
                    let lo = ss.iter().copied().fold(f64::INFINITY, f64::min);
                    let hi = ss.iter().copied().fold(f64::NEG_INFINITY, f64::max);
                    out.push(LinhaCorte { guarda: p.guarda, papel: p.papel, estilo: ESTILO_CORTADO, pontos: retangulo(lo, hi, zi, zf) });
                } else if tmin > 0.0 && tmin <= profundidade {
                    let lo = pts.iter().map(|q| q.0).fold(f64::INFINITY, f64::min);
                    let hi = pts.iter().map(|q| q.0).fold(f64::NEG_INFINITY, f64::max);
                    out.push(LinhaCorte { guarda: p.guarda, papel: p.papel, estilo: ESTILO_PROJETADO, pontos: retangulo(lo, hi, zi, zf) });
                }
            }
            FormaGC::Varrida { nos, largura, altura } => {
                for w in nos.windows(2) {
                    segmento(&mut out, &pl, p, w[0], w[1], *largura, *altura, profundidade, true);
                }
            }
            FormaGC::Painel { a, b, altura, espessura } => segmento(&mut out, &pl, p, *a, *b, *espessura, *altura, profundidade, false),
        }
    }
    out
}

/// Um segmento de varredura (`centrado`: z do eixo no meio da seção) ou de painel (z na base).
#[allow(clippy::too_many_arguments)]
fn segmento(out: &mut Vec<LinhaCorte>, pl: &Plano, p: &PecaGC, a: No3, b: No3, largura: f64, altura: f64, prof: f64, centrado: bool) {
    let (sa, ta) = pl.st(a.x, a.y);
    let (sb, tb) = pl.st(b.x, b.y);
    let (za0, za1) = if centrado { (a.z - altura / 2.0, a.z + altura / 2.0) } else { (a.z, a.z + altura) };
    let (zb0, zb1) = if centrado { (b.z - altura / 2.0, b.z + altura / 2.0) } else { (b.z, b.z + altura) };
    if (ta < 0.0 && tb < 0.0) || (ta > 0.0 && tb > 0.0) {
        if ta.min(tb) > 0.0 && ta.min(tb) <= prof {
            out.push(LinhaCorte { guarda: p.guarda, papel: p.papel, estilo: ESTILO_PROJETADO, pontos: vec![(sa, za0), (sb, zb0), (sb, zb1), (sa, za1)] });
        }
        return;
    }
    if (ta - tb).abs() < 1e-15 {
        out.push(LinhaCorte { guarda: p.guarda, papel: p.papel, estilo: ESTILO_CORTADO, pontos: vec![(sa, za0), (sb, zb0), (sb, zb1), (sa, za1)] });
        return;
    }
    let k = (0.0 - ta) / (tb - ta);
    let s = sa + (sb - sa) * k;
    let zc = if centrado { a.z + (b.z - a.z) * k } else { a.z + (b.z - a.z) * k + altura / 2.0 };
    let seno = ((tb - ta) / (b.x - a.x).hypot(b.y - a.y)).abs().max(0.05);
    let meio = largura / seno / 2.0;
    out.push(LinhaCorte { guarda: p.guarda, papel: p.papel, estilo: ESTILO_CORTADO, pontos: retangulo(s - meio, s + meio, zc - altura / 2.0, zc + altura / 2.0) });
}

pub fn achatar_corte(linhas: &[LinhaCorte]) -> SaidaCorte {
    let mut s = SaidaCorte::default();
    for l in linhas {
        s.linhas.extend_from_slice(&[l.guarda, l.papel, l.estilo, (l.pontos.len() + 1) as u32]);
        for &(a, z) in l.pontos.iter().chain(l.pontos.first()) {
            s.pontos.extend_from_slice(&[na_grade(a), na_grade(z)]);
        }
        if l.estilo == ESTILO_CORTADO {
            s.poligonos.extend_from_slice(&[f64::from(l.guarda), f64::from(l.papel), l.pontos.len() as f64]);
            for &(a, z) in &l.pontos {
                s.poligonos.extend_from_slice(&[na_grade(a), na_grade(z)]);
            }
        }
    }
    s
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::gc_planta::{PAPEL_BALAUSTRE, PAPEL_CORRIMAO, PAPEL_POSTE};

    #[test]
    fn corte_no_meio_de_um_vao_nao_corta_balaustre() {
        let b: Vec<PecaGC> = (0..4).map(|k| PecaGC::vertical_redondo(1, PAPEL_BALAUSTRE, 0.11 * (k as f64 + 0.5), 0.0, 0.0, 1.0, 0.012)).collect();
        // Plano ao longo de y em x = 0,11 (entre dois balaústres).
        let l = guarda_corte(&b, 0.11, -1.0, 0.0, 1.0, 5.0);
        assert!(l.iter().all(|x| x.estilo != ESTILO_CORTADO));
    }

    #[test]
    fn plano_sobre_o_poste_o_corta() {
        let p = [PecaGC::vertical_retangular(1, PAPEL_POSTE, 2.0, 0.0, 0.0, 1.1, 0.06, 0.04)];
        let l = guarda_corte(&p, 2.0, -3.0, 0.0, 1.0, 1.0);
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].estilo, ESTILO_CORTADO);
        assert!((l[0].pontos[1].0 - l[0].pontos[0].0 - 0.04).abs() < 1e-9, "corda = profundidade do poste");
        assert!((l[0].pontos[2].1 - 1.1).abs() < 1e-12);
    }

    #[test]
    fn elevacao_projeta_so_o_que_esta_na_profundidade() {
        let b = [
            PecaGC::vertical_redondo(1, PAPEL_BALAUSTRE, 0.5, 0.0, 0.0, 1.0, 0.012),
            PecaGC::vertical_redondo(1, PAPEL_BALAUSTRE, 1.5, 9.0, 0.0, 1.0, 0.012),
            PecaGC::vertical_redondo(1, PAPEL_BALAUSTRE, 2.5, -3.0, 0.0, 1.0, 0.012),
        ];
        let l = guarda_corte(&b, 0.0, -1.0, 1.0, 0.0, 2.0);
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].estilo, ESTILO_PROJETADO);
        assert!((l[0].pontos[0].0 - 0.494).abs() < 1e-3);
    }

    #[test]
    fn trilho_inclinado_cortado_perpendicularmente() {
        let nos = vec![No3 { x: 0.0, y: 0.0, z: 1.0 }, No3 { x: 4.0, y: 0.0, z: 3.0 }];
        let t = [PecaGC::varrida_redonda(1, PAPEL_CORRIMAO, nos, 0.04)];
        let l = guarda_corte(&t, 2.0, -1.0, 0.0, 1.0, 1.0);
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].estilo, ESTILO_CORTADO);
        let zc: f64 = l[0].pontos.iter().map(|q| q.1).sum::<f64>() / 4.0;
        assert!((zc - 2.0).abs() < 1e-9);
        let s = achatar_corte(&l);
        assert_eq!(s.linhas, vec![1, PAPEL_CORRIMAO, 0, 5]);
        assert_eq!(s.pontos.len(), 10);
        assert_eq!(s.poligonos.len(), 3 + 8);
    }

    #[test]
    fn entrada_invalida_nao_gera_nada() {
        let b = [PecaGC::vertical_redondo(1, PAPEL_BALAUSTRE, 0.0, 0.0, 0.0, 1.0, 0.012)];
        assert!(guarda_corte(&b, 0.0, 0.0, 0.0, 0.0, 1.0).is_empty());
        assert!(guarda_corte(&b, 0.0, 0.0, 1.0, 0.0, -1.0).is_empty());
    }
}
