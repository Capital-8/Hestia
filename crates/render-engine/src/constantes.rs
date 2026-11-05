//! Constantes compartilhadas pelo renderizador (formato, sombra e ambiente).

/// Lado do mapa de sombra direcional.
pub const LADO_SOMBRA: u32 = 2048;

/// Formato da textura final; a codificação sRGB é feita no shader.
pub const FORMATO_COR: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// Formato de profundidade principal e do mapa de sombra.
pub const FORMATO_PROFUNDIDADE: wgpu::TextureFormat = wgpu::TextureFormat::Depth32Float;

/// Exposição fixa desta primeira versão (o HSTR não carrega exposição).
pub const EXPOSICAO: f64 = 1.0;

/// Céu linear usado quando `Cena.fundo` é `None`.
pub const CEU_PADRAO: [f64; 3] = [0.36, 0.52, 0.75];

/// Luz refletida do chão no ambiente hemisférico.
pub const CHAO_AMBIENTE: [f64; 3] = [0.18, 0.16, 0.13];

/// Pré-passe de oclusão: normal de visão em xyz e profundidade linear em metros em w (w = 0
/// onde não há geometria). Meia precisão: a 30 m o passo é de ~0,016 m, bem abaixo do raio.
pub const FORMATO_NORMAIS: wgpu::TextureFormat = wgpu::TextureFormat::Rgba16Float;

/// Oclusão ambiente de 1 canal (1 = sem oclusão).
pub const FORMATO_OCLUSAO: wgpu::TextureFormat = wgpu::TextureFormat::R8Unorm;

/// Raio da esfera de amostragem do SSAO, em metros. Meio metro é da ordem da espessura de
/// um rodapé, de um peitoril ou de um beiral, e pequeno o bastante para não escurecer a parede
/// inteira por causa de um canto (a casa de referência tem ~10 m de largura).
pub const RAIO_AO_M: f64 = 0.5;

/// Amostras do SSAO por pixel (kernel de hemisfério, rotacionado por ruído de Bayer 4x4).
pub const AMOSTRAS_AO: usize = 16;

/// Margem, em pixels, em volta da região para o pré-passe e a amostragem. Também é o alcance
/// máximo das amostras do SSAO: um oclusor mais longe que isso em pixels é ignorado. Com a
/// margem, o resultado de um tile é igual ao da imagem inteira, pixel a pixel.
pub const MARGEM_AO_PX: u32 = 32;

/// Raio do desfoque bilateral (caixa de 4x4 em torno do pixel), em pixels.
pub const MARGEM_DESFOQUE_PX: u32 = 2;

/// Viés de profundidade do SSAO, em metros: evita que a própria parede se ocluda por causa da
/// discretização do pixel em superfícies oblíquas.
pub const VIES_AO_M: f64 = 0.03;

/// Deslocamento máximo da refração do vidro, em fração da altura da imagem inteira. A normal de
/// visão tem módulo 1, então o deslocamento em pixels é no máximo este valor vezes a altura (0,02
/// de 360 px dá ~7 px). Espelho de `FRACAO_REFRACAO` em shader.wgsl; o teste de sincronia lê de lá.
pub const FRACAO_REFRACAO: f64 = 0.02;

#[cfg(test)]
mod testes {
    use super::FRACAO_REFRACAO;

    const SHADER: &str = include_str!("shader.wgsl");

    #[test]
    fn fracao_de_refracao_bate_com_o_shader() {
        let trecho = "const FRACAO_REFRACAO: f32 = ";
        let inicio = SHADER.find(trecho).expect("constante no shader") + trecho.len();
        let fim = inicio + SHADER[inicio..].find(';').expect("fim da constante");
        let valor: f64 = SHADER[inicio..fim].trim().parse().expect("número");
        assert!((valor - FRACAO_REFRACAO).abs() < 1.0e-12);
    }
}
