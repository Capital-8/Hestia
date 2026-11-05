//! Leitura/escrita little-endian usado pelos formatos binários do render.

pub fn escrever_u32(saida: &mut Vec<u8>, valor: u32) {
    saida.extend_from_slice(&valor.to_le_bytes());
}

pub fn escrever_f32(saida: &mut Vec<u8>, valor: f64) {
    saida.extend_from_slice(&(valor as f32).to_le_bytes());
}

pub struct Leitor<'a> {
    bytes: &'a [u8],
    posicao: usize,
}

impl<'a> Leitor<'a> {
    pub fn novo(bytes: &'a [u8]) -> Self {
        Self { bytes, posicao: 0 }
    }

    pub fn posicao(&self) -> usize {
        self.posicao
    }

    pub fn restante(&self) -> usize {
        self.bytes.len().saturating_sub(self.posicao)
    }

    pub fn bytes(&mut self, quantidade: usize) -> Option<&'a [u8]> {
        let fim = self.posicao.checked_add(quantidade)?;
        let pedaco = self.bytes.get(self.posicao..fim)?;
        self.posicao = fim;
        Some(pedaco)
    }

    pub fn u32(&mut self) -> Option<u32> {
        let pedaco = self.bytes(4)?;
        Some(u32::from_le_bytes([
            pedaco[0], pedaco[1], pedaco[2], pedaco[3],
        ]))
    }

    pub fn f32(&mut self) -> Option<f64> {
        let pedaco = self.bytes(4)?;
        Some(f32::from_le_bytes([pedaco[0], pedaco[1], pedaco[2], pedaco[3]]) as f64)
    }

    pub fn f32_array<const N: usize>(&mut self) -> Option<[f64; N]> {
        let mut saida = [0.0; N];
        for valor in &mut saida {
            *valor = self.f32()?;
        }
        Some(saida)
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn le_e_escreve_em_little_endian() {
        let mut bytes = Vec::new();
        escrever_u32(&mut bytes, 0x0102_0304);
        escrever_f32(&mut bytes, 1.5);
        assert_eq!(&bytes[0..4], &[0x04, 0x03, 0x02, 0x01]);
        let mut leitor = Leitor::novo(&bytes);
        assert_eq!(leitor.u32(), Some(0x0102_0304));
        assert_eq!(leitor.f32(), Some(1.5));
        assert_eq!(leitor.u32(), None);
    }
}
