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

/// Fresnel de Schlick escalar, `F0 + (1 - F0)(1 - cos)^5`, com `cos` limitado a `[0, 1]`.
/// Espelho de `schlick_escalar` em `shader.wgsl` (passe de vidro, F0 = 0,04 para ior 1,5).
pub fn schlick_escalar(cos_theta: f64, f0: f64) -> f64 {
    let x = (1.0 - cos_theta).clamp(0.0, 1.0);
    f0 + (1.0 - f0) * x.powi(5)
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn schlick_incidencia_normal_e_f0_e_rasante_e_um() {
        // Vidro (ior 1,5): F0 = ((n - 1) / (n + 1))^2 = 0,04.
        assert!((schlick_escalar(1.0, 0.04) - 0.04).abs() < 1.0e-12);
        assert!((schlick_escalar(0.0, 0.04) - 1.0).abs() < 1.0e-12);
        // Cosseno fora de [0, 1] é limitado: nada de F fora de [F0, 1].
        assert!((schlick_escalar(1.5, 0.04) - 0.04).abs() < 1.0e-12);
        assert!((schlick_escalar(-0.5, 0.04) - 1.0).abs() < 1.0e-12);
        // Meia incidência: 0,04 + 0,96 * 0,5^5 = 0,07.
        assert!((schlick_escalar(0.5, 0.04) - 0.07).abs() < 1.0e-12);
    }

    #[test]
    fn schlick_cresce_quando_o_angulo_abre() {
        let mut anterior = schlick_escalar(1.0, 0.04);
        for i in 1..=100 {
            let cos = 1.0 - f64::from(i) / 100.0;
            let f = schlick_escalar(cos, 0.04);
            assert!(f >= anterior - 1.0e-12, "F caiu em cos = {cos}");
            assert!((0.04..=1.0).contains(&f));
            anterior = f;
        }
    }

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
