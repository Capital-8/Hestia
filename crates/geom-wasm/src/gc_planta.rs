//! Linhas de planta do guarda-corpo (decisão 0055, Fase 4a): consulta `guarda_planta` (ADR §6.2).
//!
//! Define também `PecaGC`, a peça lógica (poste, balaústre, trilho, corrimão, painel) que `gc_corte`, `gc_quant` e `gc_avisos` consomem. A Fase 3
//! produz as peças; até lá os testes usam peças sintéticas sobre as cadeias de `gc_tipos`.
//!
//! `corte_z` é a cota absoluta do plano de corte. Peça que o cruza sai CORTADA (estilo 0); inteira abaixo, PROJETADA (1); inteira acima, OCULTA (2).
//! `detalhe` 0 desenha só o eixo; 1 ou mais, o eixo e as peças. Saída determinística.

use crate::gc_tipos::{CadeiaGC, No3, DIAMETRO_CIRCULO_GRANDE, GRADE_SAIDA, LADOS_CIRCULO, LADOS_CIRCULO_GRANDE};

pub const PAPEL_POSTE: u32 = 0;
pub const PAPEL_BALAUSTRE: u32 = 1;
pub const PAPEL_TRILHO: u32 = 2;
pub const PAPEL_CORRIMAO: u32 = 3;
pub const PAPEL_SUPORTE: u32 = 4;
pub const PAPEL_PAINEL: u32 = 5;
pub const PAPEL_CABO: u32 = 6;
pub const PAPEL_TRAVESSA: u32 = 7;
/// Papel das linhas de eixo (não é peça).
pub const PAPEL_EIXO: u32 = 255;
pub const ESTILO_CORTADO: u32 = 0;
pub const ESTILO_PROJETADO: u32 = 1;
pub const ESTILO_OCULTO: u32 = 2;

/// Forma de uma peça. Metros; cotas absolutas.
#[derive(Clone, Debug, PartialEq)]
pub enum FormaGC {
    /// Prisma vertical de `z0` a `z1`. Circular: `largura` é o diâmetro; senão a seção é `largura` (x) por `profundidade` (y).
    Vertical { x: f64, y: f64, z0: f64, z1: f64, largura: f64, profundidade: f64, circular: bool },
    /// Varredura de seção `largura` por `altura`, centrada na polilinha `nos`.
    Varrida { nos: Vec<No3>, largura: f64, altura: f64 },
    /// Placa que vai de `a` a `b` (base), com `altura` e `espessura`.
    Painel { a: No3, b: No3, altura: f64, espessura: f64 },
}

#[derive(Clone, Debug, PartialEq)]
pub struct PecaGC {
    pub guarda: u32,
    pub papel: u32,
    pub perfil_num: u32,
    pub material_num: u32,
    /// Área da seção reta (m²).
    pub area_secao: f64,
    /// Perímetro da seção (m).
    pub perimetro: f64,
    pub forma: FormaGC,
}

impl PecaGC {
    pub fn vertical_redondo(guarda: u32, papel: u32, x: f64, y: f64, z0: f64, z1: f64, d: f64) -> PecaGC {
        PecaGC {
            guarda,
            papel,
            perfil_num: 0,
            material_num: 0,
            area_secao: std::f64::consts::PI * d * d / 4.0,
            perimetro: std::f64::consts::PI * d,
            forma: FormaGC::Vertical { x, y, z0, z1, largura: d, profundidade: d, circular: true },
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub fn vertical_retangular(guarda: u32, papel: u32, x: f64, y: f64, z0: f64, z1: f64, largura: f64, profundidade: f64) -> PecaGC {
        PecaGC {
            guarda,
            papel,
            perfil_num: 0,
            material_num: 0,
            area_secao: largura * profundidade,
            perimetro: 2.0 * (largura + profundidade),
            forma: FormaGC::Vertical { x, y, z0, z1, largura, profundidade, circular: false },
        }
    }

    pub fn varrida_redonda(guarda: u32, papel: u32, nos: Vec<No3>, d: f64) -> PecaGC {
        PecaGC {
            guarda,
            papel,
            perfil_num: 0,
            material_num: 0,
            area_secao: std::f64::consts::PI * d * d / 4.0,
            perimetro: std::f64::consts::PI * d,
            forma: FormaGC::Varrida { nos, largura: d, altura: d },
        }
    }

    pub fn painel(guarda: u32, a: No3, b: No3, altura: f64, espessura: f64) -> PecaGC {
        PecaGC { guarda, papel: PAPEL_PAINEL, perfil_num: 0, material_num: 0, area_secao: altura * espessura, perimetro: 2.0 * (altura + espessura), forma: FormaGC::Painel { a, b, altura, espessura } }
    }

    /// Faixa de cotas `(min, max)` ocupada.
    pub fn faixa_z(&self) -> (f64, f64) {
        match &self.forma {
            FormaGC::Vertical { z0, z1, .. } => (z0.min(*z1), z0.max(*z1)),
            FormaGC::Varrida { nos, altura, .. } => {
                let lo = nos.iter().map(|n| n.z).fold(f64::INFINITY, f64::min);
                let hi = nos.iter().map(|n| n.z).fold(f64::NEG_INFINITY, f64::max);
                (lo - altura / 2.0, hi + altura / 2.0)
            }
            FormaGC::Painel { a, b, altura, .. } => (a.z.min(b.z), a.z.max(b.z) + altura),
        }
    }

    /// Contornos fechados em planta (um por segmento da varredura).
    pub fn contornos_planta(&self) -> Vec<Vec<(f64, f64)>> {
        match &self.forma {
            FormaGC::Vertical { x, y, largura, profundidade, circular, .. } => {
                if *circular {
                    let n = if *largura > DIAMETRO_CIRCULO_GRANDE { LADOS_CIRCULO_GRANDE } else { LADOS_CIRCULO } as usize;
                    let r = largura / 2.0;
                    vec![(0..n)
                        .map(|k| {
                            let a = std::f64::consts::TAU * k as f64 / n as f64;
                            (x + r * a.cos(), y + r * a.sin())
                        })
                        .collect()]
                } else {
                    let (hx, hy) = (largura / 2.0, profundidade / 2.0);
                    vec![vec![(x - hx, y - hy), (x + hx, y - hy), (x + hx, y + hy), (x - hx, y + hy)]]
                }
            }
            FormaGC::Varrida { nos, largura, .. } => nos.windows(2).filter_map(|w| faixa_planta(w[0], w[1], *largura)).collect(),
            FormaGC::Painel { a, b, espessura, .. } => faixa_planta(*a, *b, *espessura).into_iter().collect(),
        }
    }
}

fn faixa_planta(a: No3, b: No3, w: f64) -> Option<Vec<(f64, f64)>> {
    let (dx, dy) = (b.x - a.x, b.y - a.y);
    let l = dx.hypot(dy);
    if l < 1e-12 {
        return None;
    }
    let (nx, ny) = (-dy / l * w / 2.0, dx / l * w / 2.0);
    Some(vec![(a.x + nx, a.y + ny), (b.x + nx, b.y + ny), (b.x - nx, b.y - ny), (a.x - nx, a.y - ny)])
}

#[derive(Clone, Debug, PartialEq)]
pub struct LinhaPlanta {
    pub guarda: u32,
    pub papel: u32,
    pub estilo: u32,
    pub pontos: Vec<(f64, f64)>,
}

/// Saída plana: `linhas` `[guarda_num, papel, estilo, n_pontos]` e `pontos` `[x, y]`.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SaidaPlanta {
    pub linhas: Vec<u32>,
    pub pontos: Vec<f64>,
}

/// Arredonda à grade de saída (1 µm).
pub fn na_grade(v: f64) -> f64 {
    (v / GRADE_SAIDA).round() * GRADE_SAIDA
}

pub fn guarda_planta(cadeia: &CadeiaGC, pecas: &[PecaGC], corte_z: f64, detalhe: u8) -> Vec<LinhaPlanta> {
    let mut out = Vec::new();
    for t in &cadeia.trechos {
        let mut pts: Vec<(f64, f64)> = t.nos.iter().map(|n| (n.x, n.y)).collect();
        if t.fechado {
            if let Some(&p) = pts.first() {
                pts.push(p);
            }
        }
        out.push(LinhaPlanta { guarda: t.guarda, papel: PAPEL_EIXO, estilo: ESTILO_PROJETADO, pontos: pts });
    }
    if detalhe >= 1 {
        for p in pecas {
            let (lo, hi) = p.faixa_z();
            let estilo = if hi < corte_z {
                ESTILO_PROJETADO
            } else if lo > corte_z {
                ESTILO_OCULTO
            } else {
                ESTILO_CORTADO
            };
            for c in p.contornos_planta() {
                out.push(LinhaPlanta { guarda: p.guarda, papel: p.papel, estilo, pontos: c });
            }
        }
    }
    out
}

/// Achata no formato do contrato; os contornos de peça saem fechados (o primeiro ponto se repete no fim).
pub fn achatar_planta(linhas: &[LinhaPlanta]) -> SaidaPlanta {
    let mut s = SaidaPlanta::default();
    for l in linhas {
        let fechar = l.papel != PAPEL_EIXO;
        s.linhas.extend_from_slice(&[l.guarda, l.papel, l.estilo, (l.pontos.len() + usize::from(fechar)) as u32]);
        for &(x, y) in l.pontos.iter().chain(if fechar { l.pontos.first() } else { None }) {
            s.pontos.extend_from_slice(&[na_grade(x), na_grade(y)]);
        }
    }
    s
}

#[cfg(test)]
mod testes {
    use super::*;

    fn no(x: f64, y: f64, z: f64) -> No3 {
        No3 { x, y, z }
    }

    #[test]
    fn planta_de_guarda_reta_tem_o_eixo() {
        let c = CadeiaGC::reta(1, (0.0, 0.0), (4.0, 0.0), 0.0);
        let l = guarda_planta(&c, &[], 1.0, 0);
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].papel, PAPEL_EIXO);
        assert_eq!(l[0].pontos, vec![(0.0, 0.0), (4.0, 0.0)]);
    }

    #[test]
    fn detalhe_zero_nao_desenha_pecas() {
        let c = CadeiaGC::reta(1, (0.0, 0.0), (4.0, 0.0), 0.0);
        let p = [PecaGC::vertical_redondo(1, PAPEL_POSTE, 0.0, 0.0, 0.0, 1.1, 0.05)];
        assert_eq!(guarda_planta(&c, &p, 1.0, 0).len(), 1);
        assert_eq!(guarda_planta(&c, &p, 1.0, 1).len(), 2);
    }

    #[test]
    fn poste_cortado_a_1_metro_gera_retangulo() {
        let c = CadeiaGC::reta(1, (0.0, 0.0), (4.0, 0.0), 0.0);
        let p = [PecaGC::vertical_retangular(1, PAPEL_POSTE, 2.0, 0.0, 0.0, 1.1, 0.06, 0.04)];
        let l = guarda_planta(&c, &p, 1.0, 1);
        assert_eq!(l[1].estilo, ESTILO_CORTADO);
        assert_eq!(l[1].pontos.len(), 4);
        let s = achatar_planta(&l);
        assert_eq!(&s.linhas[4..8], &[1, PAPEL_POSTE, ESTILO_CORTADO, 5]);
        assert_eq!(s.pontos.len(), 2 * 2 + 2 * 5);
        assert!((l[1].pontos[0].0 - 1.97).abs() < 1e-12 && (l[1].pontos[0].1 + 0.02).abs() < 1e-12);
    }

    #[test]
    fn estilo_depende_da_cota_de_corte() {
        let baixa = PecaGC::vertical_redondo(1, PAPEL_BALAUSTRE, 0.0, 0.0, 0.0, 0.5, 0.012);
        let alta = PecaGC::vertical_redondo(1, PAPEL_BALAUSTRE, 1.0, 0.0, 1.2, 1.7, 0.012);
        let l = guarda_planta(&CadeiaGC::default(), &[baixa, alta], 1.0, 1);
        assert_eq!(l[0].estilo, ESTILO_PROJETADO);
        assert_eq!(l[1].estilo, ESTILO_OCULTO);
        assert_eq!(l[0].pontos.len(), 16);
    }

    #[test]
    fn trilho_inclinado_e_cadeia_fechada() {
        let c = CadeiaGC::lance_inclinado(1, 3.0, 0.0, 2.0, 1.0);
        let t = PecaGC::varrida_redonda(1, PAPEL_CORRIMAO, vec![no(0.0, 0.0, 0.9), no(3.0, 0.0, 2.9), no(4.0, 0.0, 2.9)], 0.04);
        let l = guarda_planta(&c, &[t], 1.0, 1);
        assert_eq!(l.len(), 4);
        assert_eq!(l[2].estilo, ESTILO_CORTADO);
        assert_eq!(l[3].estilo, ESTILO_CORTADO, "estilo por peça, não por segmento");
        let mut f = CadeiaGC::em_l(2, 1.0, 0.0);
        f.trechos[0].fechado = true;
        let l = guarda_planta(&f, &[], 0.0, 0);
        assert_eq!(l[0].pontos.len(), 4);
        assert_eq!(l[0].pontos.first(), l[0].pontos.last());
    }
}
