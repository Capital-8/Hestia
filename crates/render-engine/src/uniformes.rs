//! Uniformes da cena, compartilhados pelos passes principal e de sombra.

use bytemuck::{Pod, Zeroable};

/// Layout espelhado em `shader.wgsl`. Todos os campos têm 16 bytes para não introduzir
/// padding implícito diferente entre Rust, WGSL e os backends.
#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
pub struct Uniformes {
    pub view_proj: [[f32; 4]; 4],
    pub luz_vp: [[f32; 4]; 4],
    /// Posição da câmera (w livre).
    pub camera: [f32; 4],
    /// Direção normalizada **para o Sol** (xyz) e intensidade (w).
    pub sol: [f32; 4],
    /// Cor do Sol (w livre).
    pub sol_cor: [f32; 4],
    /// Irradiância hemisférica do céu (w livre).
    pub ceu: [f32; 4],
    /// Irradiância hemisférica do chão (w livre).
    pub chao: [f32; 4],
    /// (exposição, força do ambiente, texel do mapa de sombra, reservado).
    pub parametros: [f32; 4],
    /// (largura, altura, 1/largura, 1/altura).
    pub resolucao: [f32; 4],
    /// Inversa de `view_proj` (usada só pelo céu de fundo, para achar a direção de cada pixel).
    pub inversa_vp: [[f32; 4]; 4],
}

impl Uniformes {
    /// Tamanho em bytes, usado na criação do buffer.
    pub const TAMANHO: u64 = std::mem::size_of::<Self>() as u64;
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn layout_tem_multiplos_de_dezesseis_bytes() {
        assert_eq!(Uniformes::TAMANHO % 16, 0);
        assert_eq!(Uniformes::TAMANHO, 304);
    }
}
