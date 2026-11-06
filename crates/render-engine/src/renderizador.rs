//! Funções de conveniência (API antiga). Cada chamada cria um `Motor` temporário, então são
//! lentas para uso repetido. O serviço deve usar `Motor` + `CenaGpu` + `renderizar_regiao`.

use std::time::Instant;

use render_core::cena::Cena;

use crate::cor;
use crate::erro::ErroRender;
use crate::motor::{validar_imagem, Motor, Retangulo};

/// Imagem pronta em memória, no espaço sRGB (o mesmo que o PNG espera).
pub struct ImagemRenderizada {
    pub largura: u32,
    pub altura: u32,
    pub rgba: Vec<u8>,
    pub backend: String,
    pub adaptador: String,
    pub tipo_adaptador: String,
    pub vertices: usize,
    pub duracao_ms: u128,
}

/// Renderiza a cena inteira com a exposição padrão (1.0).
pub fn renderizar(cena: &Cena, largura: u32, altura: u32) -> Result<ImagemRenderizada, ErroRender> {
    renderizar_com_exposicao(cena, largura, altura, 1.0)
}

/// Renderiza a cena inteira e devolve os pixels já tonemapeados em sRGB.
/// `exposicao` é o multiplicador aplicado antes do tone mapping AgX (2^EV no chamador).
pub fn renderizar_com_exposicao(
    cena: &Cena,
    largura: u32,
    altura: u32,
    exposicao: f64,
) -> Result<ImagemRenderizada, ErroRender> {
    renderizar_com_camera(cena, &cena.camera, largura, altura, exposicao)
}

/// Renderiza com exposição automática (opcional, desligada por padrão): uma passada com exposição
/// 1, estimativa da luminância média da cena (`cor::luminancia_media_da_cena`) e uma segunda
/// passada com a exposição que leva essa média ao cinza médio (`cor::exposicao_automatica`). Custa
/// duas renderizações. O controle manual (`renderizar_com_exposicao`) continua valendo.
pub fn renderizar_com_exposicao_automatica(
    cena: &Cena,
    largura: u32,
    altura: u32,
) -> Result<ImagemRenderizada, ErroRender> {
    let primeira = renderizar_com_exposicao(cena, largura, altura, 1.0)?;
    let media = cor::luminancia_media_da_cena(&primeira.rgba);
    renderizar_com_exposicao(cena, largura, altura, cor::exposicao_automatica(media))
}

/// Renderiza usando uma câmera explícita. Cria um `Motor` a cada chamada (lento).
pub fn renderizar_com_camera(
    cena: &Cena,
    camera: &render_core::camera::Camera,
    largura: u32,
    altura: u32,
    exposicao: f64,
) -> Result<ImagemRenderizada, ErroRender> {
    let inicio = Instant::now();
    validar_imagem(largura, altura)?;

    let motor = Motor::nativo()?;
    let cena_gpu = motor.carregar_cena(cena)?;
    let regiao = Retangulo {
        x: 0,
        y: 0,
        w: largura,
        h: altura,
    };
    let rgba = motor.renderizar_regiao(&cena_gpu, camera, largura, altura, regiao, exposicao)?;

    Ok(ImagemRenderizada {
        largura,
        altura,
        rgba,
        backend: format!("{:?}", motor.backend()),
        adaptador: motor.adaptador().to_string(),
        tipo_adaptador: format!("{:?}", motor.tipo()),
        vertices: cena_gpu.vertices(),
        duracao_ms: inicio.elapsed().as_millis(),
    })
}
