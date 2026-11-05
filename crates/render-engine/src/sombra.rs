//! Sombra com penumbra física (PCSS) do Sol: constantes e conversão de profundidade.
//!
//! O cálculo roda no `shader.wgsl` (`fator_sombra`). Este módulo guarda os valores de referência
//! em Rust e os testes confere que o shader usa o mesmo tamanho de luz e a mesma conversão de
//! profundidade que a câmera ortográfica de `iluminacao::matriz_da_luz`.

/// Diâmetro angular do disco solar em radianos. O Sol real tem cerca de 0,0093 rad; o valor
/// usado é maior para tornar a penumbra visível na escala da cena (ver o relatório da S1).
pub const TAMANHO_LUZ_SOL_RAD: f64 = 0.02;

/// Distâncias da câmera ortográfica da luz, em múltiplos do raio da cena (mesmos valores de
/// `iluminacao::matriz_da_luz`: perto = raio * 0.5, longe = raio * 3.5).
pub const PERTO_FATOR_RAIO: f64 = 0.5;
pub const LONGE_FATOR_RAIO: f64 = 3.5;

/// Distância, em metros a partir do olho da luz, de uma profundidade NDC (0..1) do mapa de
/// sombra. A projeção é ortográfica, então a profundidade é linear nessa distância.
pub fn distancia_da_luz_m(z_ndc: f64, raio: f64) -> f64 {
    let perto = raio * PERTO_FATOR_RAIO;
    let longe = raio * LONGE_FATOR_RAIO;
    z_ndc * (longe - perto) + perto
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::matrizes::ortografica_wgpu;
    use render_core::matematica::transformar;

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

    #[test]
    fn conversao_bate_com_a_projecao_da_luz() {
        let raio = 7.3;
        let projecao = ortografica_wgpu(
            raio * 1.05,
            raio * 1.05,
            raio * PERTO_FATOR_RAIO,
            raio * LONGE_FATOR_RAIO,
        );
        for distancia in [raio * 0.5, raio, raio * 2.0, raio * 3.5] {
            let clip = transformar(&projecao, [0.0, 0.0, -distancia, 1.0]);
            let z_ndc = clip[2] / clip[3];
            let recuperada = distancia_da_luz_m(z_ndc, raio);
            assert!(
                (recuperada - distancia).abs() < 1.0e-9,
                "d={distancia}: recuperada {recuperada}"
            );
        }
    }
}
