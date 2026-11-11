//! Linhas de planta da parede cortina (decisão 0056, §5.6; consulta `cortina_planta`, id 102), em três níveis de detalhe.
//!
//! `corte_z` é a cota absoluta do plano de corte. A peça que o cruza sai CORTADA (estilo 0); inteira abaixo, PROJETADA (1); inteira acima, OCULTA (2).
//! Papéis das linhas: 0 contorno do sistema, 1 vidro, 2 montante, 3 painel sólido (o TS desenha a hachura do material). Contornos fechados repetem o
//! primeiro ponto no fim; a linha do eixo do vidro (detalhe 0) é aberta, de 2 pontos.
//!
//! - detalhe 0 (grosso): o contorno (duas faces e as pontas) e a linha no eixo do painel padrão. Nenhum montante;
//! - detalhe 1 (médio): o contorno, um retângulo por coluna e tipo de painel (com a espessura do painel; painel vazio sem linha) e o perfil de cada
//!   linha de montante vertical (interiores e de borda);
//! - detalhe 2 (fino): o contorno, um retângulo por painel e o perfil de TODAS as peças de montante: a vertical como o perfil exato na linha e a
//!   horizontal como o retângulo ao longo da peça, cada uma com o estilo da sua faixa de cotas.

use std::collections::BTreeMap;

use crate::consultas::Saida;
use crate::cortina_malha::lados_redondo;
use crate::cortina_pecas::{CortinaR, Geom, PecaMont};
use crate::cortina_tipos::*;

#[derive(Clone, Debug, PartialEq)]
pub struct LinhaPlanta {
    pub cortina: u32,
    pub papel: u32,
    pub estilo: u32,
    pub fechada: bool,
    pub pontos: Vec<[f64; 2]>,
}

fn estilo(lo: f64, hi: f64, corte_z: f64) -> u32 {
    if hi < corte_z {
        ESTILO_PROJETADO
    } else if lo > corte_z {
        ESTILO_OCULTO
    } else {
        ESTILO_CORTADO
    }
}

fn xy(g: &Geom, t: f64, yp: f64) -> [f64; 2] {
    let p = g.mundo(t, yp, 0.0);
    [p[0], p[1]]
}

/// Retângulo `t ∈ [t0, t1]`, `yp ∈ [y0, y1]`, em planta.
fn retangulo(g: &Geom, t0: f64, t1: f64, y0: f64, y1: f64) -> Vec<[f64; 2]> {
    vec![xy(g, t0, y0), xy(g, t1, y0), xy(g, t1, y1), xy(g, t0, y1)]
}

/// Perfil de uma peça vertical em planta (retângulo ou círculo) centrado em `t`.
fn perfil_vertical(g: &Geom, p: &PecaMont) -> Vec<[f64; 2]> {
    let m = &p.m;
    if m.forma == FORMA_REDONDA {
        let (n, r) = (lados_redondo(m.largura, 1), m.largura / 2.0);
        (0..n)
            .map(|k| {
                let a = std::f64::consts::TAU * k as f64 / n as f64;
                xy(g, p.pos + r * a.cos(), m.desloc + r * a.sin())
            })
            .collect()
    } else {
        retangulo(g, p.pos - m.largura / 2.0, p.pos + m.largura / 2.0, m.desloc - m.profundidade / 2.0, m.desloc + m.profundidade / 2.0)
    }
}

fn papel_painel(kind: u8) -> u32 {
    if kind == PAINEL_VIDRO {
        PLANTA_VIDRO
    } else {
        PLANTA_SOLIDO
    }
}

pub fn planta(cortinas: &[CortinaR], corte_z: f64, detalhe: u8) -> Vec<LinhaPlanta> {
    let mut out = Vec::new();
    for c in cortinas {
        let Some(g) = &c.g else { continue };
        let (zb, zt) = (g.z_base, g.z_base + g.h);
        let meio = g.d / 2.0;
        out.push(LinhaPlanta { cortina: c.id, papel: PLANTA_CONTORNO, estilo: estilo(zb, zt, corte_z), fechada: true, pontos: retangulo(g, 0.0, g.l, -meio, meio) });
        match detalhe {
            0 => {
                let p = g.painel_padrao;
                if p.kind != PAINEL_VAZIO {
                    out.push(LinhaPlanta { cortina: c.id, papel: papel_painel(p.kind), estilo: estilo(zb, zt, corte_z), fechada: false, pontos: vec![xy(g, 0.0, p.desloc), xy(g, g.l, p.desloc)] });
                }
            }
            1 => {
                // Um retângulo por coluna e tipo de painel, com a faixa de cotas de todos os painéis do grupo.
                let mut grupos: BTreeMap<(u32, u32), (crate::cortina_pecas::PainelPeca, f64, f64)> = BTreeMap::new();
                for p in g.paineis.iter().filter(|p| p.p.kind != PAINEL_VAZIO) {
                    let e = grupos.entry((p.i, p.p.tipo)).or_insert((*p, p.z0, p.z1));
                    e.1 = e.1.min(p.z0);
                    e.2 = e.2.max(p.z1);
                }
                for (p, lo, hi) in grupos.values() {
                    let (y0, y1) = (p.p.desloc - p.p.espessura / 2.0, p.p.desloc + p.p.espessura / 2.0);
                    out.push(LinhaPlanta { cortina: c.id, papel: papel_painel(p.p.kind), estilo: estilo(zb + lo, zb + hi, corte_z), fechada: true, pontos: retangulo(g, p.s0, p.s1, y0, y1) });
                }
                // Um perfil por linha de montante vertical, com a faixa de cotas das peças dela.
                let mut linhas: BTreeMap<u32, (PecaMont, f64, f64)> = BTreeMap::new();
                for p in g.pecas.iter().filter(|p| p.eixo == EIXO_U) {
                    let e = linhas.entry(p.linha).or_insert((*p, p.de, p.ate));
                    e.1 = e.1.min(p.de);
                    e.2 = e.2.max(p.ate);
                }
                for (p, lo, hi) in linhas.values() {
                    out.push(LinhaPlanta { cortina: c.id, papel: PLANTA_MONTANTE, estilo: estilo(zb + lo, zb + hi, corte_z), fechada: true, pontos: perfil_vertical(g, p) });
                }
            }
            _ => {
                for p in g.paineis.iter().filter(|p| p.p.kind != PAINEL_VAZIO) {
                    let (y0, y1) = (p.p.desloc - p.p.espessura / 2.0, p.p.desloc + p.p.espessura / 2.0);
                    out.push(LinhaPlanta { cortina: c.id, papel: papel_painel(p.p.kind), estilo: estilo(zb + p.z0, zb + p.z1, corte_z), fechada: true, pontos: retangulo(g, p.s0, p.s1, y0, y1) });
                }
                for p in &g.pecas {
                    if p.eixo == EIXO_U {
                        out.push(LinhaPlanta { cortina: c.id, papel: PLANTA_MONTANTE, estilo: estilo(zb + p.de, zb + p.ate, corte_z), fechada: true, pontos: perfil_vertical(g, p) });
                    } else {
                        let (lo, hi) = (p.pos - p.m.largura / 2.0, p.pos + p.m.largura / 2.0);
                        let pf = p.m.prof();
                        out.push(LinhaPlanta { cortina: c.id, papel: PLANTA_MONTANTE, estilo: estilo(zb + lo, zb + hi, corte_z), fechada: true, pontos: retangulo(g, p.de, p.ate, p.m.desloc - pf / 2.0, p.m.desloc + pf / 2.0) });
                    }
                }
            }
        }
    }
    out
}

/// Saída plana: `linhas` `[cortina_num, papel, estilo, n_pontos]` e `pontos` `[x, y]` (grade de 1 µm). Os contornos fechados repetem o primeiro ponto.
pub fn achatar(linhas: &[LinhaPlanta]) -> Vec<Saida> {
    let (mut l, mut p) = (Vec::new(), Vec::new());
    for x in linhas {
        let extra = usize::from(x.fechada);
        l.extend_from_slice(&[x.cortina, x.papel, x.estilo, (x.pontos.len() + extra) as u32]);
        for q in x.pontos.iter().chain(if x.fechada { x.pontos.first() } else { None }) {
            p.extend_from_slice(&[na_grade(q[0]), na_grade(q[1])]);
        }
    }
    vec![Saida::U32(l), Saida::F64(p)]
}

pub fn consulta_cortina_planta(cena: &crate::cena::Cena, nivel: u32, corte_z: f64, detalhe: u8) -> Result<Vec<Saida>, u32> {
    let cortinas = crate::cortina_pecas::resolver(cena, nivel)?;
    Ok(achatar(&planta(&cortinas, corte_z, detalhe)))
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::cortina_pecas::resolver;
    use crate::cortina_pecas::testes::*;

    fn linhas(e: &Espec, corte: f64, detalhe: u8) -> Vec<LinhaPlanta> {
        planta(&resolver(&cena_simples(e, 4.0, 3.0), 0).expect("r"), corte, detalhe)
    }

    fn conta(l: &[LinhaPlanta], papel: u32) -> usize {
        l.iter().filter(|x| x.papel == papel).count()
    }

    #[test]
    fn grosso_tem_so_o_contorno_e_a_linha_do_vidro() {
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(2));
        let l = linhas(&e, 1.5, 0);
        assert_eq!(l.len(), 2);
        assert_eq!((l[0].papel, l[0].estilo, l[0].fechada, l[0].pontos.len()), (PLANTA_CONTORNO, ESTILO_CORTADO, true, 4));
        assert_eq!((l[1].papel, l[1].fechada, l[1].pontos.len()), (PLANTA_VIDRO, false, 2));
        // O contorno tem a profundidade do sistema (0,12) e o comprimento da cortina (4).
        let (a, b, c) = (l[0].pontos[0], l[0].pontos[1], l[0].pontos[2]);
        assert!(((b[0] - a[0]).hypot(b[1] - a[1]) - 4.0).abs() < 1e-9);
        assert!(((c[0] - b[0]).hypot(c[1] - b[1]) - 0.12).abs() < 1e-9);
        // Sem montantes e, com painel vazio, sem linha de vidro.
        let mut v = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(2));
        v.painel = P_VAZIO;
        assert_eq!(linhas(&v, 1.5, 0).len(), 1);
    }

    #[test]
    fn medio_tem_um_retangulo_por_coluna_e_um_perfil_por_linha_vertical() {
        let e = Espec::novo(EixoEfetivo::numero(4), EixoEfetivo::numero(3));
        let l = linhas(&e, 1.5, 1);
        assert_eq!(conta(&l, PLANTA_CONTORNO), 1);
        assert_eq!(conta(&l, PLANTA_VIDRO), 4, "uma por coluna, não por célula");
        assert_eq!(conta(&l, PLANTA_MONTANTE), 5, "5 linhas verticais: 3 interiores e 2 de borda");
        assert!(l.iter().all(|x| x.estilo == ESTILO_CORTADO), "tudo cruza o corte a 1,5 m");
        // O retângulo do vidro tem a espessura do painel (0,01) e a largura livre da primeira coluna (1,0 - 0,05 - 0,025 = 0,925).
        let v = l.iter().find(|x| x.papel == PLANTA_VIDRO).expect("vidro");
        let (a, b, c) = (v.pontos[0], v.pontos[1], v.pontos[2]);
        assert!(((b[0] - a[0]).hypot(b[1] - a[1]) - 0.925).abs() < 1e-9, "a primeira coluna perde a borda inteira de 50 mm");
        assert!(((c[0] - b[0]).hypot(c[1] - b[1]) - 0.01).abs() < 1e-9);
    }

    #[test]
    fn fino_desenha_cada_painel_e_cada_peca() {
        let e = Espec::novo(EixoEfetivo::numero(4), EixoEfetivo::numero(3));
        let l = linhas(&e, 1.5, 2);
        assert_eq!(conta(&l, PLANTA_VIDRO), 12);
        // 5 linhas verticais x 3 segmentos + 4 horizontais x 4 segmentos.
        assert_eq!(conta(&l, PLANTA_MONTANTE), 15 + 16);
        // Cortados a 1,5 m: só o segmento do meio das 5 verticais (de 1 a 2 m). Abaixo (projetado): o segmento de baixo das verticais e as horizontais da base
        // e de z = 1; acima (oculto): o segmento de cima das verticais e as horizontais de z = 2 e do topo.
        let por = |estilo| l.iter().filter(|x| x.papel == PLANTA_MONTANTE && x.estilo == estilo).count();
        assert_eq!((por(ESTILO_CORTADO), por(ESTILO_PROJETADO), por(ESTILO_OCULTO)), (5, 5 + 8, 5 + 8));
    }

    #[test]
    fn estilo_depende_da_cota_de_corte() {
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(1));
        // Cortina de 0 a 3 m.
        assert_eq!(linhas(&e, 1.0, 0)[0].estilo, ESTILO_CORTADO);
        assert_eq!(linhas(&e, 3.5, 0)[0].estilo, ESTILO_PROJETADO, "o corte passa acima do topo: a cortina está embaixo");
        assert_eq!(linhas(&e, -0.5, 0)[0].estilo, ESTILO_OCULTO, "o corte passa abaixo da base");
    }

    #[test]
    fn perfil_redondo_vira_circulo_e_o_horizontal_redondo_vira_retangulo() {
        let mut e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(2));
        e.mont = [M_RED; 6];
        let l = linhas(&e, 1.5, 2);
        let aneis: Vec<&LinhaPlanta> = l.iter().filter(|x| x.papel == PLANTA_MONTANTE).collect();
        assert_eq!(aneis.iter().filter(|x| x.pontos.len() == 16).count(), 3 * 2, "círculo de 16 lados em cada segmento das 3 verticais");
        assert_eq!(aneis.iter().filter(|x| x.pontos.len() == 4).count(), 6, "retângulo nas horizontais");
    }

    #[test]
    fn achatar_fecha_os_aneis_e_nao_a_linha_do_vidro() {
        let e = Espec::novo(EixoEfetivo::numero(2), EixoEfetivo::numero(1));
        let s = achatar(&linhas(&e, 1.5, 0));
        let (Saida::U32(l), Saida::F64(p)) = (&s[0], &s[1]) else { panic!() };
        assert_eq!(l, &vec![1, PLANTA_CONTORNO, ESTILO_CORTADO, 5, 1, PLANTA_VIDRO, ESTILO_CORTADO, 2]);
        assert_eq!(p.len(), 2 * (5 + 2));
        assert_eq!(&p[0..2], &p[8..10], "o contorno repete o primeiro ponto");
    }

    #[test]
    fn parede_girada_leva_o_contorno_junto() {
        let e = Espec::novo(EixoEfetivo::numero(1), EixoEfetivo::numero(1));
        let mut cena = cena_simples(&e, 4.0, 3.0);
        let c = cena.cortina.cortinas.get_mut(&1).expect("c");
        c.a = [0.0, 0.0];
        c.b = [0.0, 4.0]; // ao longo de +y: a normal à esquerda é -x
        let l = planta(&resolver(&cena, 0).expect("r"), 1.5, 0);
        let xs: Vec<f64> = l[0].pontos.iter().map(|p| p[0]).collect();
        assert!(xs.iter().all(|x| (x.abs() - 0.06).abs() < 1e-9), "faces em x = ±0,06: {xs:?}");
    }
}
