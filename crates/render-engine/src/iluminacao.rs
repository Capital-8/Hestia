//! Uniformes da cena: Sol, céu, chão e, por região, câmera, exposição e resolução.
//!
//! As matrizes do mapa de sombra não moram aqui: as cascatas de sombra (ver `cascatas.rs`) dependem
//! da câmera e vão no buffer próprio de cascatas.

use render_core::cena::Cena;
use render_core::matematica::inverter;

use crate::constantes::{CEU_PADRAO, CHAO_AMBIENTE, LADO_SOMBRA};
use crate::erro::ErroRender;
use crate::matrizes::{colunas_f32, matriz_vp_wgpu};
use crate::uniformes::Uniformes;

/// Parte dos uniformes que só depende da cena (Sol, céu e chão). A câmera, a exposição e a
/// resolução entram depois, em `aplicar_camera`, a cada região renderizada.
pub fn uniformes_fixos(cena: &Cena) -> Uniformes {
    let direcao_sol = cena.sol.direcao().normalizado();
    let direcao_sol = if direcao_sol.comprimento() < 1.0e-9 {
        render_core::vetor::Vec3::novo(0.0, 0.0, 1.0)
    } else {
        direcao_sol
    };
    // Sol abaixo do horizonte: intensidade zero. O passe principal não consulta o mapa de sombra
    // nesse caso (ver `fator_sombra` em shader.wgsl), então não há custo extra.
    let intensidade = if cena.sol.elevacao > 0.0 {
        cena.sol.intensidade as f32
    } else {
        0.0
    };
    let fundo_linear = cena.fundo.unwrap_or(CEU_PADRAO);
    let ceu = fundo_linear.map(|v| (v.max(0.0) as f32).min(4.0));

    Uniformes {
        view_proj: [[0.0; 4]; 4],
        camera: [0.0; 4],
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
        parametros: [0.0; 4],
        resolucao: [0.0; 4],
        inversa_vp: [[0.0; 4]; 4],
        balanco: [1.0, 1.0, 1.0, 0.0],
    }
}

/// Preenche os campos de câmera, exposição, balanço de branco e resolução sobre os uniformes fixos
/// da cena. `ganhos` são os RGB de `cor::ganhos_balanco_branco` (1, 1, 1 = neutro).
pub fn aplicar_camera(
    uniformes: &mut Uniformes,
    camera: &render_core::camera::Camera,
    largura: u32,
    altura: u32,
    exposicao: f64,
    ganhos: [f64; 3],
) -> Result<(), ErroRender> {
    uniformes.balanco = [ganhos[0] as f32, ganhos[1] as f32, ganhos[2] as f32, 0.0];
    let vp = matriz_vp_wgpu(&camera.view, &camera.projecao);
    let vp_inversa = inverter(&vp)
        .ok_or_else(|| ErroRender::Gpu("matriz de vista-projeção da câmera não é invertível".into()))?;
    uniformes.view_proj = colunas_f32(&vp);
    uniformes.inversa_vp = colunas_f32(&vp_inversa);
    uniformes.camera = [
        camera.posicao.x as f32,
        camera.posicao.y as f32,
        camera.posicao.z as f32,
        1.0,
    ];
    uniformes.parametros = [
        exposicao as f32,
        0.55,
        1.0 / LADO_SOMBRA as f32,
        0.0,
    ];
    uniformes.resolucao = [
        largura as f32,
        altura as f32,
        1.0 / largura as f32,
        1.0 / altura as f32,
    ];
    Ok(())
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn view_projection_da_camera_e_inversivel() {
        // Garante que `aplicar_camera` aceita uma câmera de teste normal e preenche a inversa.
        let camera = render_core::camera::Camera::olhando_para(
            render_core::vetor::Vec3::novo(0.0, -5.0, 2.0),
            render_core::vetor::Vec3::novo(0.0, 0.0, 2.0),
            render_core::vetor::Vec3::novo(0.0, 0.0, 1.0),
            45.0_f64.to_radians(),
            16.0 / 9.0,
            0.1,
            100.0,
        )
        .expect("câmera de teste");
        let mut uniformes = Uniformes {
            view_proj: [[0.0; 4]; 4],
            camera: [0.0; 4],
            sol: [0.0; 4],
            sol_cor: [0.0; 4],
            ceu: [0.0; 4],
            chao: [0.0; 4],
            parametros: [0.0; 4],
            resolucao: [0.0; 4],
            inversa_vp: [[0.0; 4]; 4],
            balanco: [0.0; 4],
        };
        aplicar_camera(&mut uniformes, &camera, 640, 360, 1.0, [1.0, 1.0, 1.0]).unwrap();
        assert!(uniformes.inversa_vp.iter().flatten().all(|v| v.is_finite()));
    }
}
