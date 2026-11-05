//! Conversões de matrizes entre o contrato HSTR (coluna maior, recorte WebGL) e o wgpu.
//!
//! O snapshot traz `projection * view` no recorte WebGL (`z` em `-1..1`). O wgpu usa,
//! em todos os backends nativos, o recorte `0..1` em profundidade. A conversão é feita uma vez
//! na CPU, com a mesma convenção de coluna maior do núcleo, e não no shader.

use render_core::matematica::{multiplicar, Mat4};

/// `C * P`, onde `C` leva `z_ndc_webgl` para `z_ndc_wgpu = 0.5 * z + 0.5`.
fn correcao_profundidade(projecao: &Mat4) -> Mat4 {
    let correcao: Mat4 = [
        1.0, 0.0, 0.0, 0.0, //
        0.0, 1.0, 0.0, 0.0, //
        0.0, 0.0, 0.5, 0.0, //
        0.0, 0.0, 0.5, 1.0,
    ];
    multiplicar(&correcao, projecao)
}

/// `view_projection` pronta para o shader: `C * P * V`, coluna maior.
pub fn matriz_vp_wgpu(view: &Mat4, projecao: &Mat4) -> Mat4 {
    multiplicar(&correcao_profundidade(projecao), view)
}

/// Ortográfica de mão direita com profundidade em `0..1`, coluna maior.
///
/// Usada só pelo mapa de sombra: a câmera do snapshot continua intocada.
pub fn ortografica_wgpu(meia_largura: f64, meia_altura: f64, perto: f64, longe: f64) -> Mat4 {
    let profundidade = longe - perto;
    [
        1.0 / meia_largura,
        0.0,
        0.0,
        0.0,
        0.0,
        1.0 / meia_altura,
        0.0,
        0.0,
        0.0,
        0.0,
        -1.0 / profundidade,
        0.0,
        0.0,
        0.0,
        -perto / profundidade,
        1.0,
    ]
}

/// Converte uma matriz de `f64` em colunas `[[f32; 4]; 4]`, o layout do uniforme WGSL.
pub fn colunas_f32(m: &Mat4) -> [[f32; 4]; 4] {
    let mut saida = [[0.0f32; 4]; 4];
    for (coluna, destino) in saida.iter_mut().enumerate() {
        for (linha, valor) in destino.iter_mut().enumerate() {
            *valor = m[coluna * 4 + linha] as f32;
        }
    }
    saida
}

#[cfg(test)]
mod testes {
    use super::*;
    use render_core::matematica::{perspectiva, transformar, IDENTIDADE};

    fn profundidade_ndc(projecao: &Mat4, z_vista: f64) -> f64 {
        let clip = transformar(projecao, [0.0, 0.0, z_vista, 1.0]);
        clip[2] / clip[3]
    }

    #[test]
    fn recorte_webgl_vira_zero_um() {
        let (perto, longe) = (0.1, 100.0);
        let projecao = perspectiva(0.9, 16.0 / 9.0, perto, longe).expect("projeção");
        let wgpu = matriz_vp_wgpu(&IDENTIDADE, &projecao);
        assert!((profundidade_ndc(&wgpu, -perto) - 0.0).abs() < 1.0e-9);
        assert!((profundidade_ndc(&wgpu, -longe) - 1.0).abs() < 1.0e-9);
    }

    #[test]
    fn ortografica_mapeia_perto_e_longe() {
        let (perto, longe) = (1.0, 5.0);
        let m = ortografica_wgpu(2.0, 2.0, perto, longe);
        assert!((profundidade_ndc(&m, -perto) - 0.0).abs() < 1.0e-9);
        assert!((profundidade_ndc(&m, -longe) - 1.0).abs() < 1.0e-9);
    }

    #[test]
    fn colunas_preservam_a_ordem_da_matriz() {
        let mut m = IDENTIDADE;
        m[12] = 7.0;
        m[13] = 8.0;
        m[14] = 9.0;
        let colunas = colunas_f32(&m);
        assert_eq!(colunas[3][0], 7.0);
        assert_eq!(colunas[3][1], 8.0);
        assert_eq!(colunas[3][2], 9.0);
        assert_eq!(colunas[2][2], 1.0);
    }
}
