//! Protótipo de rastreamento de caminhos na GPU (fatia vertical 0). Não é o render de produção.
//!
//! Crate separado de propósito: `render-engine` (motor.rs, shader.wgsl) não é tocado. O protótipo
//! reutiliza o formato de cena, a câmera, o ruído e o tone mapping de `render-core`.
//!
//! ## O que existe
//!
//! - [`bvh`]: BVH nova (mediana, folhas de 4) achatada em arrays `repr(C)` para a GPU, com a
//!   travessia de CPU que espelha o shader. Motivo de não reutilizar a do `render-core`: ela é
//!   privada e presa ao tipo `Triangulo` do tracer de CPU.
//! - `pt0.wgsl`: compute shader. Raio primário, travessia com pilha local, sombra do sol por raio
//!   de sombra, céu (`ceu.wgsl`), um rebote difuso por cosseno (modo 2), e soma numa textura
//!   RGBA32F em ping-pong.
//! - [`ceu`]: céu do motor (`radiancia_ceu` e halo de `shader.wgsl`) em Rust, e a irradiância SH9
//!   do céu. Espelho de `ceu.wgsl`, com teste de sincronia.
//! - [`amostragem`]: hash PCG e amostragem por cosseno, com a mesma aritmética do WGSL.
//! - [`gpu`]: buffers, pipeline, modos (`Modo`), passes por tile e leitura do acumulado.
//! - [`referencia`]: sombra direta do sol no tracer de CPU, com as mesmas contas, para medir a
//!   corretude do protótipo. A referência completa (com especular e os rebotes do tracer) é a do
//!   `render-core`.
//!
//! ## Escopo desta fase (o que NÃO está aqui)
//!
//! Sem textura de material, sem vidro (transmissão é tratada como opaca), sem especular, sem
//! oclusão de ambiente (a irradiância do céu não sabe se a parede está coberta), sem luzes
//! internas e sem denoise. Um rebote só. O sol é pontual por padrão; `raio_sol` (radianos) liga um
//! disco solar, que é a única fonte estocástica além do subpixel. Nada disso é pronto para produção.
//!
//! ## Convenções
//!
//! Metros, Z para cima, matrizes em coluna maior (como `render-core`). Radiância linear em f32;
//! o tone mapping só acontece na saída PNG.

pub mod amostragem;
pub mod bvh;
pub mod ceu;
pub mod gpu;
pub mod referencia;

/// Cor do sol, a mesma de `render-core::tracer::luz_direta`.
pub const COR_SOL: [f32; 3] = [1.0, 0.96, 0.9];

/// Luminância linear (Rec. 709), usada nas métricas.
pub fn luminancia(rgb: [f32; 3]) -> f32 {
    0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}
