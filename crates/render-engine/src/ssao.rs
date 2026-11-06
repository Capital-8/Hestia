//! Oclusão ambiente em espaço de tela (SSAO): uniforme extra com as matrizes da câmera, kernel
//! de amostras e a janela de cada passe.
//!
//! Fluxo por região (ver `Motor::renderizar_regiao`):
//! 1. pré-passe: normal de visão e profundidade linear (1 amostra, sem MSAA);
//! 2. SSAO: 16 amostras em hemisfério orientado pela normal, rotacionadas por ruído de Bayer 4x4;
//! 3. desfoque bilateral 4x4 que respeita descontinuidades de profundidade;
//! 4. passe principal: multiplica só o termo ambiente pela oclusão.
//!
//! Os três primeiros passes usam a janela da região com margem (`expandir`), e o alcance das
//! amostras é limitado pela mesma margem. Assim um pixel recebe a mesma oclusão, seja qual
//! for o tile que o desenhou.

use bytemuck::{Pod, Zeroable};
use render_core::camera::Camera;
use render_core::matematica::inverter;

use crate::constantes::{AMOSTRAS_AO, MARGEM_AO_PX, RAIO_AO_M, VIES_AO_M};
use crate::erro::ErroRender;
use crate::matrizes::{colunas_f32, projecao_wgpu};
use crate::motor::Retangulo;

/// Ângulo áureo em radianos, o mesmo espaçamento de Vogel usado no `shader.wgsl`.
const ANGULO_OURO: f64 = 2.399_963_229_728_653;

/// Uniforme extra dos passes de oclusão (buffer separado de `Uniformes`, que continua com 320
/// bytes). Layout espelhado em `shader.wgsl` (`CameraExtra`).
#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
pub struct CameraExtra {
    /// Projeção de visão para recorte no intervalo `0..1` do wgpu.
    pub projecao: [[f32; 4]; 4],
    /// Inversa da projeção acima, para reconstruir a posição de visão a partir da profundidade.
    pub projecao_inversa: [[f32; 4]; 4],
    /// Matriz de visão (mundo para visão).
    pub visao: [[f32; 4]; 4],
    /// (largura, altura, 1/largura, 1/altura) da imagem inteira.
    pub imagem: [f32; 4],
    /// (x, y, largura, altura) da janela do passe, em pixels da imagem.
    pub alvo: [f32; 4],
    /// Origem (x, y) da textura do pré-passe, em pixels da imagem.
    pub gbuffer_origem: [f32; 4],
    /// Origem (x, y) da textura de oclusão bruta, em pixels da imagem.
    pub ao_origem: [f32; 4],
    /// (raio em metros, margem em pixels, viés em metros, reservado).
    pub ssao: [f32; 4],
    /// Amostras do hemisfério unitário (xyz; w livre).
    pub kernel: [[f32; 4]; AMOSTRAS_AO],
}

/// Kernel determinístico de `AMOSTRAS_AO` vetores em hemisfério `z >= 0`, com comprimento
/// menor ou igual a 1.
///
/// Direção: distribuição cosseno (`z = sqrt(1 - u)`) com ângulo áureo, para cobrir o hemisfério
/// sem agrupar amostras. Comprimento: `escala = 0,1 + 0,9 s²`, com `s` em `(0, 1]`, de modo que
/// há mais amostras perto da superfície (como no SSAO de Crytek), onde a oclusão de cantos é
/// mais forte.
pub fn kernel_hemisferio() -> [[f32; 4]; AMOSTRAS_AO] {
    let mut kernel = [[0.0f32; 4]; AMOSTRAS_AO];
    for (i, amostra) in kernel.iter_mut().enumerate() {
        let n = AMOSTRAS_AO as f64;
        let u = (i as f64 + 0.5) / n;
        let angulo = i as f64 * ANGULO_OURO;
        let raio_xy = u.sqrt();
        let z = (1.0 - u).sqrt();
        let s = (i as f64 + 1.0) / n;
        let escala = 0.1 + 0.9 * s * s;
        *amostra = [
            (raio_xy * angulo.cos() * escala) as f32,
            (raio_xy * angulo.sin() * escala) as f32,
            (z * escala) as f32,
            0.0,
        ];
    }
    kernel
}

/// Janela `regiao` expandida em `margem` pixels em todas as direções, limitada à imagem.
/// A região precisa estar dentro da imagem (já validada por `Motor::renderizar_regiao`).
pub fn expandir(regiao: Retangulo, margem: u32, largura: u32, altura: u32) -> Retangulo {
    let x0 = regiao.x.saturating_sub(margem);
    let y0 = regiao.y.saturating_sub(margem);
    let x1 = regiao.x.saturating_add(regiao.w).saturating_add(margem).min(largura);
    let y1 = regiao.y.saturating_add(regiao.h).saturating_add(margem).min(altura);
    Retangulo {
        x: x0,
        y: y0,
        w: x1 - x0,
        h: y1 - y0,
    }
}

/// Monta o uniforme extra de um passe. `alvo`, `gbuffer` e `ao` são as janelas do passe, do
/// pré-passe e da oclusão bruta (em pixels da imagem).
pub fn camera_extra(
    camera: &Camera,
    largura: u32,
    altura: u32,
    alvo: Retangulo,
    gbuffer: Retangulo,
    ao: Retangulo,
) -> Result<CameraExtra, ErroRender> {
    let projecao = projecao_wgpu(&camera.projecao);
    let projecao_inversa = inverter(&projecao)
        .ok_or_else(|| ErroRender::Gpu("projeção da câmera não é invertível".into()))?;
    let janela = |r: Retangulo| [r.x as f32, r.y as f32, r.w as f32, r.h as f32];
    Ok(CameraExtra {
        projecao: colunas_f32(&projecao),
        projecao_inversa: colunas_f32(&projecao_inversa),
        visao: colunas_f32(&camera.view),
        imagem: [
            largura as f32,
            altura as f32,
            1.0 / largura as f32,
            1.0 / altura as f32,
        ],
        alvo: janela(alvo),
        gbuffer_origem: [gbuffer.x as f32, gbuffer.y as f32, 0.0, 0.0],
        ao_origem: [ao.x as f32, ao.y as f32, 0.0, 0.0],
        ssao: [RAIO_AO_M as f32, MARGEM_AO_PX as f32, VIES_AO_M as f32, 0.0],
        kernel: kernel_hemisferio(),
    })
}

#[cfg(test)]
mod testes {
    use super::*;

    const SHADER: &str = include_str!("shader.wgsl");

    fn r(x: u32, y: u32, w: u32, h: u32) -> Retangulo {
        Retangulo { x, y, w, h }
    }

    #[test]
    fn kernel_fica_no_hemisferio_superior_e_dentro_do_raio_unitario() {
        let kernel = kernel_hemisferio();
        assert_eq!(kernel.len(), 16);
        for (i, v) in kernel.iter().enumerate() {
            assert!(v[2] > 0.0, "amostra {i} não está no hemisfério (z = {})", v[2]);
            let comprimento = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
            assert!(comprimento <= 1.0 + 1.0e-6, "amostra {i} fora da esfera unitária: {comprimento}");
            assert!(comprimento > 0.0);
        }
    }

    #[test]
    fn kernel_e_determinístico_e_tem_mais_amostras_perto_da_origem() {
        assert_eq!(kernel_hemisferio(), kernel_hemisferio());
        let kernel = kernel_hemisferio();
        let comprimento = |v: [f32; 4]| (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
        // Escala crescente: a última amostra é mais longa que a primeira.
        assert!(comprimento(kernel[AMOSTRAS_AO - 1]) > comprimento(kernel[0]));
    }

    #[test]
    fn constantes_do_ssao_tem_os_valores_documentados() {
        // Raio de 0,5 m e viés de 3 cm: ver as justificativas em constantes.rs.
        assert_eq!(RAIO_AO_M, 0.5);
        assert_eq!(VIES_AO_M, 0.03);
        assert_eq!(AMOSTRAS_AO, 16);
    }

    #[test]
    fn tamanho_do_uniforme_extra_e_multiplo_de_16_e_separado_dos_256_bytes() {
        let tamanho = std::mem::size_of::<CameraExtra>();
        assert_eq!(tamanho % 16, 0);
        assert_eq!(tamanho, 528);
        assert_eq!(crate::uniformes::Uniformes::TAMANHO, 256);
    }

    #[test]
    fn constante_de_amostras_no_shader_bate_com_rust() {
        let trecho = "const AMOSTRAS_AO: u32 = ";
        let inicio = SHADER.find(trecho).expect("constante no shader") + trecho.len();
        let fim = inicio + SHADER[inicio..].find(';').expect("fim da constante");
        let valor = SHADER[inicio..fim].trim().trim_end_matches('u');
        assert_eq!(valor.parse::<usize>().expect("número"), AMOSTRAS_AO);
    }

    #[test]
    fn expandir_limita_a_imagem() {
        // Canto superior esquerdo: não passa de 0.
        assert_eq!(expandir(r(0, 0, 10, 10), 4, 100, 100), r(0, 0, 14, 14));
        // Canto inferior direito: não passa da borda.
        assert_eq!(expandir(r(90, 90, 10, 10), 4, 100, 100), r(86, 86, 14, 14));
        // Margem maior que a imagem cobre tudo.
        assert_eq!(expandir(r(5, 5, 10, 10), 1000, 100, 60), r(0, 0, 100, 60));
        // Margem zero devolve a própria região.
        assert_eq!(expandir(r(7, 3, 20, 9), 0, 100, 100), r(7, 3, 20, 9));
    }
}
