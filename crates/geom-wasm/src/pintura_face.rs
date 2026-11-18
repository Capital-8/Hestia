//! Pintura de face e geração de painéis ripados (Face Art / Face Studio) em Rust puro.
//!
//! Implementa a geração de ripas orientadas e recortadas contra uma região arbitrária (com
//! otimização em lote quando há fresta entre ripas), o cálculo de fresta mínima em superfícies
//! côncavas e o recorte em camadas por prioridade para particionamento coplanar.

use crate::ops;
use crate::pintor;
use crate::{Anel, MultiPoligono, ERRO_ENTRADA};

const DIM_MINIMA: f64 = 1e-6;
const AREA_MINIMA: f64 = 1e-9;
const MAX_RIPAS: i64 = 20_000;

/// Parâmetros geométricos de um painel ripado em coordenadas da face (metros e graus).
#[derive(Debug, Clone, Copy)]
pub struct EspecificacaoRipas {
    pub largura: f64,
    pub fresta: f64,
    pub angulo_graus: f64,
}

fn construir_anel_ripa(
    cx: f64,
    cy: f64,
    dx: f64,
    dy: f64,
    px: f64,
    py: f64,
    half_along: f64,
    half_across: f64,
) -> Anel {
    vec![
        [cx - half_along * dx - half_across * px, cy - half_along * dy - half_across * py],
        [cx + half_along * dx - half_across * px, cy + half_along * dy - half_across * py],
        [cx + half_along * dx + half_across * px, cy + half_along * dy + half_across * py],
        [cx - half_along * dx + half_across * px, cy - half_along * dy + half_across * py],
    ]
}

fn caixa_regiao(regiao: &MultiPoligono) -> Result<Option<[f64; 4]>, u32> {
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    let mut tem_vertice = false;

    for poli in regiao {
        for anel in poli {
            for &[x, y] in anel {
                if !x.is_finite() || !y.is_finite() {
                    return Err(ERRO_ENTRADA);
                }
                tem_vertice = true;
                if x < min_x {
                    min_x = x;
                }
                if x > max_x {
                    max_x = x;
                }
                if y < min_y {
                    min_y = y;
                }
                if y > max_y {
                    max_y = y;
                }
            }
        }
    }

    if !tem_vertice {
        Ok(None)
    } else {
        Ok(Some([min_x, min_y, max_x, max_y]))
    }
}

/// Gera ripas paralelas orientadas e recortadas dentro de `regiao`.
pub fn gerar_ripas(regiao: &MultiPoligono, spec: EspecificacaoRipas) -> Result<MultiPoligono, u32> {
    if !spec.largura.is_finite() || !spec.fresta.is_finite() || !spec.angulo_graus.is_finite() {
        return Err(ERRO_ENTRADA);
    }
    if spec.largura <= DIM_MINIMA || spec.fresta < 0.0 {
        return Ok(Vec::new());
    }

    let Some([min_x, min_y, max_x, max_y]) = caixa_regiao(regiao)? else {
        return Ok(Vec::new());
    };

    let pitch = spec.largura + spec.fresta;
    let rad = spec.angulo_graus.to_radians();
    let dx = rad.cos();
    let dy = rad.sin();
    let px = -dy;
    let py = dx;

    let cantos = [
        [min_x, min_y],
        [max_x, min_y],
        [max_x, max_y],
        [min_x, max_y],
    ];
    let mut d_min = f64::INFINITY;
    let mut d_max = f64::NEG_INFINITY;
    let mut p_min = f64::INFINITY;
    let mut p_max = f64::NEG_INFINITY;
    for [x, y] in cantos {
        let dv = x * dx + y * dy;
        let pv = x * px + y * py;
        if dv < d_min {
            d_min = dv;
        }
        if dv > d_max {
            d_max = dv;
        }
        if pv < p_min {
            p_min = pv;
        }
        if pv > p_max {
            p_max = pv;
        }
    }

    let d_mid = (d_min + d_max) * 0.5;
    let half_along = (d_max - d_min) * 0.5 + 1.0;
    let half_across = spec.largura * 0.5;

    let k_start_f = (p_min / pitch).floor() - 1.0;
    let k_end_f = (p_max / pitch).ceil() + 1.0;
    if !k_start_f.is_finite() || !k_end_f.is_finite() || (k_end_f - k_start_f) > (MAX_RIPAS as f64) {
        return Err(ERRO_ENTRADA);
    }
    let k_start = k_start_f as i64;
    let k_end = k_end_f as i64;
    if k_end - k_start > MAX_RIPAS {
        return Err(ERRO_ENTRADA);
    }

    let bruto = if spec.fresta > DIM_MINIMA {
        let mut tiras: MultiPoligono = Vec::with_capacity((k_end - k_start + 1).max(0) as usize);
        for k in k_start..=k_end {
            let p_center = (k as f64) * pitch;
            let cx = d_mid * dx + p_center * px;
            let cy = d_mid * dy + p_center * py;
            tiras.push(vec![construir_anel_ripa(
                cx,
                cy,
                dx,
                dy,
                px,
                py,
                half_along,
                half_across,
            )]);
        }
        ops::interseccao(regiao, &tiras)?
    } else {
        let mut acumulado: MultiPoligono = Vec::new();
        for k in k_start..=k_end {
            let p_center = (k as f64) * pitch;
            let cx = d_mid * dx + p_center * px;
            let cy = d_mid * dy + p_center * py;
            let anel = construir_anel_ripa(cx, cy, dx, dy, px, py, half_along, half_across);
            let recorte = ops::interseccao(regiao, &vec![vec![anel]])?;
            acumulado.extend(recorte);
        }
        acumulado
    };

    Ok(bruto
        .into_iter()
        .filter(|p| pintor::area_do_poligono(p) > AREA_MINIMA)
        .collect())
}

/// Fresta mínima entre ripas em superfície côncava para evitar colisão das bordas frontais.
pub fn fresta_minima_concava(raio: f64, largura_ripa: f64, profundidade: f64) -> f64 {
    if !largura_ripa.is_finite()
        || !profundidade.is_finite()
        || raio.is_nan()
        || profundidade <= 0.0
        || largura_ripa <= 0.0
    {
        return 0.0;
    }
    if raio <= profundidade + DIM_MINIMA {
        return f64::INFINITY;
    }
    ((largura_ripa * profundidade) / (raio - profundidade)).max(0.0)
}

/// Recorta `regioes` (já ordenadas da maior prioridade para a menor) sobre `base` sem sobreposição,
/// devolvendo um `MultiPoligono` visível por região seguido da área restante descoberta de `base`.
pub fn recortar_camadas_prioridade(
    base: &MultiPoligono,
    regioes: &[MultiPoligono],
) -> Result<Vec<MultiPoligono>, u32> {
    let mut restante = base.clone();
    let mut saida = Vec::with_capacity(regioes.len() + 1);

    for regiao in regioes {
        let vis = ops::interseccao(&restante, regiao)?;
        if !restante.is_empty() && !vis.is_empty() {
            restante = ops::diferenca(&[restante, regiao.clone()])?;
        }
        saida.push(vis);
    }

    saida.push(restante);
    Ok(saida)
}

#[cfg(test)]
mod testes {
    use super::*;

    fn retangulo(x0: f64, y0: f64, x1: f64, y1: f64) -> MultiPoligono {
        vec![vec![vec![[x0, y0], [x1, y0], [x1, y1], [x0, y1]]]]
    }

    #[test]
    fn gerar_ripas_alinhadas_retangulo_2x1() {
        let regiao = retangulo(0.0, 0.0, 2.0, 1.0);
        let ripas = gerar_ripas(
            &regiao,
            EspecificacaoRipas {
                largura: 0.05,
                fresta: 0.05,
                angulo_graus: 0.0,
            },
        )
        .expect("ripas alinhadas devem ser geradas");

        assert!(ripas.len() >= 10, "esperava múltiplas ripas, obteve {}", ripas.len());
        let area = pintor::area_da_forma(&ripas);
        assert!((area - 1.0).abs() < 1e-2, "área esperada ~1.0, obteve {area}");
    }

    #[test]
    fn gerar_ripas_rotacionadas_45_graus() {
        let regiao = retangulo(0.0, 0.0, 2.0, 1.0);
        let ripas = gerar_ripas(
            &regiao,
            EspecificacaoRipas {
                largura: 0.05,
                fresta: 0.05,
                angulo_graus: 45.0,
            },
        )
        .expect("ripas a 45 graus devem ser geradas");

        assert!(ripas.len() > 5);
        let area = pintor::area_da_forma(&ripas);
        assert!(area > 0.5 && area <= 2.0 + 1e-6, "área recortada inválida: {area}");
    }

    #[test]
    fn gerar_ripas_fresta_zero_mantem_ripas_separadas() {
        let regiao = retangulo(0.0, 0.0, 1.0, 0.5);
        let ripas = gerar_ripas(
            &regiao,
            EspecificacaoRipas {
                largura: 0.1,
                fresta: 0.0,
                angulo_graus: 0.0,
            },
        )
        .expect("ripas sem fresta devem permanecer separadas");

        assert!(ripas.len() >= 5, "esperava pelo menos 5 ripas separadas, obteve {}", ripas.len());
        let area = pintor::area_da_forma(&ripas);
        assert!((area - 0.5).abs() < 1e-6, "área total esperada 0.5, obteve {area}");
    }

    #[test]
    fn fresta_minima_concava_calculo_exato() {
        let esperado = (0.05 * 0.04) / 0.96;
        let obtido = fresta_minima_concava(1.0, 0.05, 0.04);
        assert!((obtido - esperado).abs() < 1e-12);
        assert_eq!(fresta_minima_concava(0.03, 0.05, 0.04), f64::INFINITY);
        assert_eq!(fresta_minima_concava(1.0, 0.0, 0.04), 0.0);
    }

    #[test]
    fn recortar_camadas_prioridade_soma_exata_e_sem_sobreposicao() {
        let base = retangulo(0.0, 0.0, 4.0, 4.0);
        let r1 = retangulo(0.0, 0.0, 2.0, 4.0); // área 8
        let r2 = retangulo(1.0, 0.0, 3.0, 4.0); // sobrepõe [1,2]x[0,4], visível [2,3]x[0,4] área 4
        let camadas = recortar_camadas_prioridade(&base, &[r1, r2])
            .expect("recorte por prioridade deve funcionar");

        assert_eq!(camadas.len(), 3);
        let a0 = pintor::area_da_forma(&camadas[0]);
        let a1 = pintor::area_da_forma(&camadas[1]);
        let a_rest = pintor::area_da_forma(&camadas[2]);
        assert!((a0 - 8.0).abs() < 1e-6, "camada 0 esperada 8.0, obteve {a0}");
        assert!((a1 - 4.0).abs() < 1e-6, "camada 1 esperada 4.0, obteve {a1}");
        assert!((a_rest - 4.0).abs() < 1e-6, "restante esperado 4.0, obteve {a_rest}");
        assert!((a0 + a1 + a_rest - 16.0).abs() < 1e-6);

        let sobreposicao = ops::interseccao(&camadas[0], &camadas[1]).unwrap();
        assert!(pintor::area_da_forma(&sobreposicao) < 1e-9);
    }
}
