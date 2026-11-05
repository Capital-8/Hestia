//! Trabalho de render: resolução, exposição e formato de saída.
//!
//! # Formato binário `HSWK` versão 1
//!
//! ```text
//!   0  "HSWK"     4 bytes
//!   4  versão     u32 = 1
//!   8  largura    u32 (1..=16384)
//!   12 altura     u32 (1..=16384)
//!   16 exposição  f32 (multiplicador aplicado antes do tone mapping)
//!   20 formato    u32 (0 = RGBA8 sRGB, alfa opaco; único formato desta versão)
//! ```
//!
//! `renderizar_bloco` devolve sempre `w * h * 4` bytes RGBA, em ordem de linhas, com o tone
//! mapping já aplicado no Rust. O tonemap **não** é responsabilidade do JS.

use crate::erro::Erro;
use crate::leitor::{escrever_f32, escrever_u32, Leitor};

pub const MAGIA_TRABALHO: [u8; 4] = *b"HSWK";
pub const VERSAO_TRABALHO: u32 = 1;
pub const FORMATO_RGBA8_SRGB: u32 = 0;
pub const MAX_DIMENSAO: u32 = 16_384;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Trabalho {
    pub largura: u32,
    pub altura: u32,
    pub exposicao: f64,
    pub formato: u32,
}

impl Trabalho {
    pub fn novo(largura: u32, altura: u32, exposicao: f64) -> Result<Self, Erro> {
        let trabalho = Self {
            largura,
            altura,
            exposicao,
            formato: FORMATO_RGBA8_SRGB,
        };
        if trabalho.valido() {
            Ok(trabalho)
        } else {
            Err(Erro::TrabalhoInvalido)
        }
    }

    pub fn valido(&self) -> bool {
        self.largura > 0
            && self.largura <= MAX_DIMENSAO
            && self.altura > 0
            && self.altura <= MAX_DIMENSAO
            && self.exposicao.is_finite()
            && (0.0..=1000.0).contains(&self.exposicao)
            && self.formato == FORMATO_RGBA8_SRGB
    }

    /// Valida um pedido de bloco: dentro da imagem, não vazio e com pelo menos 1 amostra.
    pub fn validar_bloco(&self, x: u32, y: u32, largura: u32, altura: u32, spp: u32) -> bool {
        if !self.valido() || largura == 0 || altura == 0 || spp == 0 {
            return false;
        }
        match (x.checked_add(largura), y.checked_add(altura)) {
            (Some(direita), Some(abaixo)) => direita <= self.largura && abaixo <= self.altura,
            _ => false,
        }
    }

    pub fn codificar(&self) -> Vec<u8> {
        let mut saida = Vec::with_capacity(24);
        saida.extend_from_slice(&MAGIA_TRABALHO);
        escrever_u32(&mut saida, VERSAO_TRABALHO);
        escrever_u32(&mut saida, self.largura);
        escrever_u32(&mut saida, self.altura);
        escrever_f32(&mut saida, self.exposicao);
        escrever_u32(&mut saida, self.formato);
        saida
    }

    pub fn decodificar(bytes: &[u8]) -> Result<Self, Erro> {
        if bytes.len() != 24 {
            return Err(Erro::TrabalhoInvalido);
        }
        let mut leitor = Leitor::novo(bytes);
        let magia = leitor.bytes(4).ok_or(Erro::TrabalhoInvalido)?;
        if magia != MAGIA_TRABALHO {
            return Err(Erro::TrabalhoInvalido);
        }
        let versao = leitor.u32().ok_or(Erro::TrabalhoInvalido)?;
        if versao != VERSAO_TRABALHO {
            return Err(Erro::TrabalhoInvalido);
        }
        let largura = leitor.u32().ok_or(Erro::TrabalhoInvalido)?;
        let altura = leitor.u32().ok_or(Erro::TrabalhoInvalido)?;
        let exposicao = leitor.f32().ok_or(Erro::TrabalhoInvalido)?;
        let formato = leitor.u32().ok_or(Erro::TrabalhoInvalido)?;
        let trabalho = Self {
            largura,
            altura,
            exposicao,
            formato,
        };
        if trabalho.valido() && leitor.restante() == 0 {
            Ok(trabalho)
        } else {
            Err(Erro::TrabalhoInvalido)
        }
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn ida_e_volta() {
        let trabalho = Trabalho::novo(320, 180, 1.25).expect("trabalho");
        let lido = Trabalho::decodificar(&trabalho.codificar()).expect("decodifica");
        assert_eq!(lido, trabalho);
    }

    #[test]
    fn recusa_dimensao_zero_e_bloco_fora() {
        assert!(Trabalho::novo(0, 180, 1.0).is_err());
        let trabalho = Trabalho::novo(320, 180, 1.0).expect("trabalho");
        assert!(trabalho.validar_bloco(0, 0, 320, 180, 1));
        assert!(!trabalho.validar_bloco(300, 0, 30, 180, 1));
        assert!(!trabalho.validar_bloco(0, 0, 0, 180, 1));
        assert!(!trabalho.validar_bloco(0, 0, 10, 10, 0));
    }
}
