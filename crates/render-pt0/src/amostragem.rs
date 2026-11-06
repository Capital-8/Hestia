//! Números pseudoaleatórios determinísticos e amostragem por cosseno, espelho de `pt0.wgsl`.
//!
//! O hash PCG e a amostragem têm a mesma aritmética do WGSL. Cada pixel e cada passe partem de um
//! estado derivado de (x, y, passe, semente), então o resultado não depende da ordem de execução.

use std::f32::consts::PI;

/// Hash PCG de uma linha (igual a `pcg` do WGSL).
pub fn pcg(valor: u32) -> u32 {
    let estado = valor.wrapping_mul(747_796_405).wrapping_add(2_891_336_453);
    let palavra = ((estado >> ((estado >> 28) + 4)) ^ estado).wrapping_mul(277_803_737);
    (palavra >> 22) ^ palavra
}

/// Próximo número em [0, 1) a partir do estado (igual a `aleatorio` do WGSL).
pub fn uniforme(estado: &mut u32) -> f32 {
    *estado = pcg(*estado);
    *estado as f32 * (1.0 / 4_294_967_296.0)
}

/// Direção amostrada com densidade cos θ / π, em coordenadas locais (Z é a normal).
///
/// `u1` e `u2` em [0, 1). Método do disco de Malley: o disco é amostrado uniformemente e erguido
/// até a esfera. A média de cos θ é 2/3.
pub fn cosseno_local(u1: f32, u2: f32) -> [f32; 3] {
    let raio = u1.sqrt();
    let phi = 2.0 * PI * u2;
    [raio * phi.cos(), raio * phi.sin(), (1.0 - u1).max(0.0).sqrt()]
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn uniforme_fica_em_zero_um_e_e_deterministico() {
        let mut a = 42u32;
        let mut b = 42u32;
        for _ in 0..1000 {
            let x = uniforme(&mut a);
            assert!((0.0..1.0).contains(&x));
            assert_eq!(x, uniforme(&mut b));
        }
    }

    #[test]
    fn cosseno_local_fica_no_hemisferio_de_cima() {
        let mut estado = 7u32;
        for _ in 0..1000 {
            let d = cosseno_local(uniforme(&mut estado), uniforme(&mut estado));
            let comprimento = (d[0] * d[0] + d[1] * d[1] + d[2] * d[2]).sqrt();
            assert!((comprimento - 1.0).abs() < 1.0e-5);
            assert!(d[2] >= 0.0);
        }
    }
}
