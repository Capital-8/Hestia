//! Sombra com penumbra física (PCSS) do Sol: constantes de referência.
//!
//! O cálculo roda no `shader.wgsl` (`fator_sombra` e `sombra_cascata`) sobre as cascatas de
//! `cascatas.rs`. Este módulo guarda o valor de referência em Rust, e o teste confere que o shader
//! usa o mesmo tamanho angular de luz.

/// Diâmetro angular do disco solar em radianos. O Sol real tem cerca de 0,0093 rad; o valor
/// usado é maior para tornar a penumbra visível na escala da cena (ver o relatório da S1).
pub const TAMANHO_LUZ_SOL_RAD: f64 = 0.02;

#[cfg(test)]
mod testes {
    use super::*;

    const SHADER: &str = include_str!("shader.wgsl");

    #[test]
    fn constante_do_shader_bate_com_rust() {
        let trecho = "const TAMANHO_LUZ_SOL: f32 = ";
        let inicio = SHADER.find(trecho).expect("constante no shader") + trecho.len();
        let fim = inicio + SHADER[inicio..].find(';').expect("fim da constante");
        let valor: f64 = SHADER[inicio..fim].trim().parse().expect("número");
        assert!((valor - TAMANHO_LUZ_SOL_RAD).abs() < 1.0e-12);
        assert!(valor > 0.0 && valor < 0.1, "tamanho angular fora de 0..0,1 rad: {valor}");
    }
}
