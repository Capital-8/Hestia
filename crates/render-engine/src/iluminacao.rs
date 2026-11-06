//! Uniformes da cena e matriz ortográfica da luz solar.

use render_core::cena::{Cena, Sol};
use render_core::matematica::{inverter, multiplicar, olhar_para};
use render_core::vetor::Vec3;

use crate::constantes::{CEU_PADRAO, CHAO_AMBIENTE, LADO_SOMBRA};
use crate::erro::ErroRender;
use crate::geometria::Caixa;
use crate::matrizes::{colunas_f32, matriz_vp_wgpu, ortografica_wgpu};
use crate::sombra::{LONGE_FATOR_RAIO, PERTO_FATOR_RAIO};
use crate::uniformes::Uniformes;

/// Parte dos uniformes que só depende da cena (Sol, céu e chão). A câmera, a exposição e a
/// resolução entram depois, em `aplicar_camera`, a cada região renderizada.
pub fn uniformes_fixos(cena: &Cena) -> Uniformes {
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
        view_proj: [[0.0; 4]; 4],
        luz_vp: [[0.0; 4]; 4],
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
    raio: f64,
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
        raio as f32,
    ];
    uniformes.resolucao = [
        largura as f32,
        altura as f32,
        1.0 / largura as f32,
        1.0 / altura as f32,
    ];
    Ok(())
}

/// Centro e raio da esfera que dimensiona a câmera ortográfica do Sol.
///
/// O raio cobre a caixa dos projetores (`Malha::caixa_sombra`), e não a cena com o chão de render:
/// com o chão de 200 m, o mapa de 2048 px ficaria 13 vezes mais grosso que a casa. A esfera de raio R
/// projeta numa janela de 2 * R * 1,05 em torno do centro, e todo projetor dentro dela cai dentro
/// da janela. A profundidade vai de 0,5 R a 3,5 R do olho da luz, que fica a 2 R do centro: vai de
/// -1,5 R a +1,5 R em torno do centro. Um receptor sombreado pode estar mais fundo que isso, até
/// (z_max - nível) / sen(elevação) além do centro, então R é no mínimo esse valor / 1,5. Sol baixo
/// faz o R crescer; sol alto deixa o R na casa.
pub fn esfera_da_sombra(caixa_sombra: Caixa, nivel: f64, sol: Sol) -> ([f64; 3], f64) {
    let mut raio = caixa_sombra.raio();
    let seno = sol.direcao().z;
    if seno > 1.0e-3 {
        let alcance = (caixa_sombra.maximo[2] - nivel).max(0.0) / seno;
        let meio_alcance = (LONGE_FATOR_RAIO - 2.0).min(2.0 - PERTO_FATOR_RAIO);
        raio = raio.max(alcance / meio_alcance);
    }
    (caixa_sombra.centro(), raio)
}

/// Câmera ortográfica do Sol, dimensionada pela esfera de `esfera_da_sombra`.
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

#[cfg(test)]
mod testes {
    use super::*;

    fn sol_em(elevacao: f64) -> Sol {
        Sol {
            azimute: 40.0,
            elevacao,
            intensidade: 1.0,
        }
    }

    /// Casa de 10 m x 10 m x 8 m sobre o nível Z=0 (só a caixa dos projetores).
    fn casa() -> Caixa {
        Caixa {
            minimo: [0.0, 0.0, 0.0],
            maximo: [10.0, 10.0, 8.0],
        }
    }

    #[test]
    fn sol_alto_usa_so_a_caixa_dos_projetores() {
        let (centro, raio) = esfera_da_sombra(casa(), 0.0, sol_em(60.0));
        assert_eq!(centro, [5.0, 5.0, 4.0]);
        assert!((raio - casa().raio()).abs() < 1.0e-12);
    }

    #[test]
    fn sol_baixo_aumenta_o_raio_para_a_profundidade_caber() {
        // Sol a 5 graus: o chão a 8 m de altura do topo fica a 8 / sen(5) m do topo, além do centro.
        let sol = sol_em(5.0);
        let (_, raio) = esfera_da_sombra(casa(), 0.0, sol);
        let alcance = 8.0 / sol.direcao().z;
        assert!(raio > casa().raio());
        // A profundidade vai de -1,5 R a +1,5 R em torno do centro: o receptor mais fundo cabe.
        assert!(alcance <= 1.5 * raio + 1.0e-9, "alcance {alcance} raio {raio}");
    }

    #[test]
    fn sol_abaixo_do_horizonte_nao_aumenta_o_raio() {
        let (_, raio) = esfera_da_sombra(casa(), 0.0, sol_em(-10.0));
        assert!((raio - casa().raio()).abs() < 1.0e-12);
    }
}
