//! Tone mapping ACES e codificação sRGB para cores calculadas na CPU.
//!
//! Só o fundo usa este caminho: o shader aplica exatamente as mesmas curvas aos pixels cobertos
//! pela geometria, então o fundo e a cena terminam no mesmo espaço de cor.

/// Aproximação ACES filmic (a mesma curva do shader).
fn aces_canal(x: f64) -> f64 {
    let (a, b, c, d, e) = (2.51, 0.03, 2.43, 0.59, 0.14);
    ((x * (a * x + b)) / (x * (c * x + d) + e)).clamp(0.0, 1.0)
}

/// Codifica um canal linear já tonemapeado para sRGB.
fn srgb_canal(x: f64) -> f64 {
    let x = x.clamp(0.0, 1.0);
    if x <= 0.003_130_8 {
        x * 12.92
    } else {
        1.055 * x.powf(1.0 / 2.4) - 0.055
    }
}

/// Cor de fundo linear -> sRGB tonemapeado, componente a componente.
pub fn fundo_tonemapeado(cor_linear: [f64; 3], exposicao: f64) -> [f64; 3] {
    cor_linear.map(|canal| srgb_canal(aces_canal(canal * exposicao)))
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn preto_continua_preto_e_branco_quase_um() {
        let preto = fundo_tonemapeado([0.0, 0.0, 0.0], 1.0);
        assert_eq!(preto, [0.0, 0.0, 0.0]);
        let branco = fundo_tonemapeado([100.0, 100.0, 100.0], 1.0);
        assert!(branco.iter().all(|v| (0.0..=1.0).contains(v)));
        assert!(branco.iter().all(|v| *v > 0.95));
    }

    #[test]
    fn curva_e_monotonica() {
        let baixo = fundo_tonemapeado([0.05, 0.05, 0.05], 1.0)[0];
        let alto = fundo_tonemapeado([0.5, 0.5, 0.5], 1.0)[0];
        assert!(alto > baixo);
    }
}
