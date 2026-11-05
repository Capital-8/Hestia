//! Erros do núcleo de renderização.
//!
//! Os códigos são os mesmos da ABI (`crates/render-wasm/src/lib.rs` e CONTRATO.md §7):
//! `0` ok, `1` cena inválida, `2` trabalho inválido, `3` erro interno, `4` cancelado.

use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Erro {
    /// A cena enviada pelo JS não decodifica ou contém valores/índices inválidos.
    CenaInvalida,
    /// O trabalho (largura, altura, exposição, formato) ou um bloco pedido é inválido.
    TrabalhoInvalido,
    /// Falha de encode/escrita que não é culpa da entrada.
    Interno,
    /// O host chamou `cancelar()`; o render parou no próximo pixel.
    Cancelado,
}

impl Erro {
    pub fn codigo(self) -> u32 {
        match self {
            Erro::CenaInvalida => 1,
            Erro::TrabalhoInvalido => 2,
            Erro::Interno => 3,
            Erro::Cancelado => 4,
        }
    }
}

impl fmt::Display for Erro {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let texto = match self {
            Erro::CenaInvalida => "cena inválida",
            Erro::TrabalhoInvalido => "trabalho inválido",
            Erro::Interno => "erro interno",
            Erro::Cancelado => "render cancelado",
        };
        f.write_str(texto)
    }
}

impl std::error::Error for Erro {}
