//! Núcleo do CLI `render-native`.
//!
//! Lê HSTR v1 pelo `render-core`, expande a cena em triângulos com material e renderiza
//! em GPU nativa (wgpu/DX12/Vulkan/Metal). Não existe caminho de CPU.

pub mod constantes;
pub mod cor;
pub mod erro;
pub mod geometria;
pub mod gpu;
pub mod iluminacao;
pub mod leitura;
pub mod matrizes;
pub mod pipeline;
pub mod png_saida;
pub mod renderizador;
pub mod uniformes;

pub use erro::ErroRender;
pub use renderizador::{renderizar, renderizar_com_camera, renderizar_com_exposicao, ImagemRenderizada};
