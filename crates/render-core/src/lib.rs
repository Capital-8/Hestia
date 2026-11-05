//! Núcleo de renderização offline do Hestia.
//!
//! O crate não conhece DOM, WebGL, worker nem JS: recebe uma cena em arrays, um trabalho
//! (resolução/exposição) e renderiza blocos em RGBA8 sRGB. A ponte com o navegador fica em
//! `crates/render-wasm` (ABI `extern "C"` do CONTRATO.md §7).
//!
//! ## Unidades e convenções
//!
//! - Metros, **Z para cima**, igual ao 3D do Hestia.
//! - Matrizes 4x4 em **coluna maior**, `projection * view`, recorte WebGL (`z` em `[-1, 1]`).
//! - Cores de material em linear; a saída passa por exposição, ACES e sRGB.
//!
//! ## Determinismo
//!
//! Nada depende de relógio ou de estado global: a semente de cada amostra é derivada de
//! `(seed, x, y, amostra)`, com `x`/`y` absolutos na imagem. Por isso um bloco renderizado
//! isoladamente é idêntico ao recorte da imagem inteira e o mesmo `seed` produz o mesmo PNG.
//!
//! ## Cancelamento
//!
//! Quem chama passa um `AtomicBool`; `renderizar_bloco` confere a flag a cada linha e devolve
//! `Erro::Cancelado` (código 4 na ABI). A ABI chama `cancelar()` de fora do render.

mod bvh;
pub mod camera;
pub mod cena;
pub mod erro;
pub mod imagem;
pub mod leitor;
pub mod matematica;
pub mod ruido;
pub mod tonemap;
pub mod trabalho;
pub mod tracer;
pub mod vetor;

pub use camera::Camera;
pub use cena::{Cena, Lote, Material, PartesCena, Sol, Textura};
pub use erro::Erro;
pub use trabalho::Trabalho;
pub use tracer::{renderizar_bloco, renderizar_imagem, renderizar_png, Bloco};

/// Versão do formato da cena (`HSTR`).
pub const VERSAO_FORMATO_CENA: u32 = cena::VERSAO_CENA;
/// Versão do formato do trabalho (`HSWK`).
pub const VERSAO_FORMATO_TRABALHO: u32 = trabalho::VERSAO_TRABALHO;
