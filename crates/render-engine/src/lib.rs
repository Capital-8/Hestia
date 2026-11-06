//! Núcleo de renderização do Hestia.
//!
//! Lê a cena já decodificada pelo `render-core`, expande em triângulos com material e renderiza
//! em GPU (wgpu/DX12/Vulkan/Metal). Não existe caminho de CPU. Não faz HTTP nem lê arquivo.

pub mod ceu;
pub mod cascatas;
pub mod constantes;
pub mod cor;
pub mod erro;
pub mod geometria;
pub mod gpu;
pub mod iluminacao;
pub mod leitura;
pub mod matrizes;
pub mod motor;
pub mod perfil;
pub mod pipeline;
pub mod png_saida;
pub mod renderizador;
pub mod sombra;
pub mod ssao;
pub mod texturas;
pub mod tiles;
pub mod uniformes;

pub use erro::ErroRender;
pub use motor::{CenaGpu, InfoAdaptador, Motor, Retangulo};
pub use renderizador::{
    renderizar, renderizar_com_camera, renderizar_com_exposicao, renderizar_com_exposicao_automatica,
    ImagemRenderizada,
};
pub use tiles::ordenar_tiles_espiral;
