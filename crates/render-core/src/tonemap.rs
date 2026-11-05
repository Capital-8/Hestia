//! Tone mapping ACES (aproximação de Narkowicz) e transferência sRGB.
//!
//! O render trabalha em radiança linear; a saída da ABI é RGBA8 já em sRGB, porque o contrato
//! diz que o tonemap fica no Rust, não no JS.

use crate::vetor::Vec3;

/// ACES filmic aproximado, entrada linear e saída em `[0, 1]`.
pub fn aces(x: f64) -> f64 {
    let x = x.max(0.0);
    let numerador = x * (2.51 * x + 0.03);
    let denominador = x * (2.43 * x + 0.59) + 0.14;
    if denominador.abs() < 1.0e-12 {
        0.0
    } else {
        (numerador / denominador).clamp(0.0, 1.0)
    }
}

/// Transferência linear → sRGB, a mesma da especificação.
pub fn linear_para_srgb(linear: f64) -> f64 {
    let c = linear.clamp(0.0, 1.0);
    if c <= 0.003_130_8 {
        12.92 * c
    } else {
        1.055 * c.powf(1.0 / 2.4) - 0.055
    }
}

/// Aplica exposição, ACES por canal e sRGB; devolve bytes `[r, g, b]`.
pub fn mapear_cor(cor: Vec3, exposicao: f64) -> [u8; 3] {
    let exposta = cor * exposicao;
    [
        byte(linear_para_srgb(aces(exposta.x))),
        byte(linear_para_srgb(aces(exposta.y))),
        byte(linear_para_srgb(aces(exposta.z))),
    ]
}

fn byte(valor: f64) -> u8 {
    (valor.clamp(0.0, 1.0) * 255.0 + 0.5) as u8
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn aces_mapeia_para_intervalo() {
        assert_eq!(aces(0.0), 0.0);
        assert!((aces(1.0) - 0.803_8).abs() < 1.0e-3);
        assert!(aces(1000.0) <= 1.0);
        assert_eq!(aces(-1.0), 0.0);
    }

    #[test]
    fn srgb_preserva_extremos() {
        assert_eq!(linear_para_srgb(0.0), 0.0);
        assert!((linear_para_srgb(1.0) - 1.0).abs() < 1.0e-12);
    }

    #[test]
    fn branco_mapeado_nao_estoura() {
        let cor = mapear_cor(crate::vetor::Vec3::splat(10.0), 1.0);
        assert_eq!(cor, [255, 255, 255]);
    }
}
