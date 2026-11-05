//! Núcleo do CLI `render-native`.
//!
//! A implementação mora em `render-engine`. Aqui só se reexporta a API antiga para que
//! quem já usa `render_native::...` continue compilando.

pub use render_engine::{
    constantes, cor, erro, geometria, gpu, iluminacao, leitura, matrizes, pipeline, png_saida,
    renderizador, uniformes,
};

pub use render_engine::erro::ErroRender;
pub use render_engine::renderizador::{
    renderizar, renderizar_com_camera, renderizar_com_exposicao, ImagemRenderizada,
};
