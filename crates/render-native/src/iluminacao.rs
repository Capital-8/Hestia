//! Uniformes da cena e matriz ortográfica da luz solar.

use render_core::cena::Cena;
use render_core::matematica::{multiplicar, olhar_para};
use render_core::vetor::Vec3;

use crate::constantes::{CEU_PADRAO, CHAO_AMBIENTE, LADO_SOMBRA};
use crate::erro::ErroRender;
use crate::matrizes::{colunas_f32, matriz_vp_wgpu, ortografica_wgpu};
use crate::uniformes::Uniformes;

/// Monta o bloco de uniformes a partir da câmera, do Sol e do fundo do HSTR.
pub fn montar_uniformes(
    cena: &Cena,
    camera: &render_core::camera::Camera,
    largura: u32,
    altura: u32,
    raio: f64,
    exposicao: f64,
) -> Uniformes {
    let direcao_sol = cena.sol.direcao().normalizado();
    let direcao_sol = if direcao_sol.comprimento() < 1.0e-9 {
        Vec3::novo(0.0, 0.0, 1.0)
    } else {
        direcao_sol
    };
    let intensidade = if cena.sol.elevacao > 0.0 {
        cena.sol.intensidade as f32
    } else {
        0.0
    };
    let fundo_linear = cena.fundo.unwrap_or(CEU_PADRAO);
    let ceu = fundo_linear.map(|v| (v.max(0.0) as f32).min(4.0));

    Uniformes {
        view_proj: colunas_f32(&matriz_vp_wgpu(&camera.view, &camera.projecao)),
        luz_vp: [[0.0; 4]; 4],
        camera: [
            camera.posicao.x as f32,
            camera.posicao.y as f32,
            camera.posicao.z as f32,
            1.0,
        ],
        sol: [
            direcao_sol.x as f32,
            direcao_sol.y as f32,
            direcao_sol.z as f32,
            intensidade,
        ],
        sol_cor: [1.0, 0.96, 0.90, 1.0],
        ceu: [ceu[0], ceu[1], ceu[2], 1.0],
        chao: [
            CHAO_AMBIENTE[0] as f32,
            CHAO_AMBIENTE[1] as f32,
            CHAO_AMBIENTE[2] as f32,
            1.0,
        ],
        parametros: [
            exposicao as f32,
            0.55,
            1.0 / LADO_SOMBRA as f32,
            raio as f32,
        ],
        resolucao: [
            largura as f32,
            altura as f32,
            1.0 / largura as f32,
            1.0 / altura as f32,
        ],
    }
}

/// Câmera ortográfica do Sol, dimensionada pela esfera envolvente da cena.
pub fn matriz_da_luz(cena: &Cena, centro: [f64; 3], raio: f64) -> Result<[f64; 16], ErroRender> {
    let centro = Vec3::de_array(centro);
    let direcao = cena.sol.direcao().normalizado();
    let direcao = if direcao.comprimento() < 1.0e-9 {
        Vec3::novo(0.0, 0.0, 1.0)
    } else {
        direcao
    };
    let posicao_luz = centro + direcao * (raio * 2.0);
    let cima = if direcao.z.abs() > 0.98 {
        Vec3::novo(0.0, 1.0, 0.0)
    } else {
        Vec3::novo(0.0, 0.0, 1.0)
    };
    let vista = olhar_para(posicao_luz, centro, cima)
        .ok_or_else(|| ErroRender::Gpu("não foi possível montar a câmera do Sol".into()))?;
    let projecao = ortografica_wgpu(raio * 1.05, raio * 1.05, raio * 0.5, raio * 3.5);
    Ok(multiplicar(&projecao, &vista))
}
