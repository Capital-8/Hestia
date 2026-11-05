//! Ruído determinístico por pixel/amostra.
//!
//! A semente de cada amostra depende de `(seed, x absoluto, y absoluto, amostra)`, nunca de um
//! relógio. Isso torna o render reprodutível e faz um bloco renderizado isolado dar exatamente o
//! mesmo resultado do bloco recortado da imagem inteira.

#[derive(Clone, Debug)]
pub struct Rng {
    estado: u64,
}

impl Rng {
    pub fn novo(seed: u32, x: u32, y: u32, amostra: u32) -> Self {
        let mistura =
            misturar((seed as u64) ^ ((x as u64) << 32) ^ ((y as u64) << 16) ^ amostra as u64);
        Self {
            estado: mistura ^ 0x9E37_79B9_7F4A_7C15,
        }
    }

    pub fn proximo_u64(&mut self) -> u64 {
        // SplitMix64: período 2^64, sem estado global, barato o bastante no wasm.
        self.estado = self.estado.wrapping_add(0x9E37_79B9_7F4A_7C15);
        misturar(self.estado)
    }

    /// Uniforme em `[0, 1)`.
    pub fn proximo_f64(&mut self) -> f64 {
        // 53 bits são exatamente os que um f64 consegue representar sem perder uniformidade.
        (self.proximo_u64() >> 11) as f64 * (1.0 / 9_007_199_254_740_992.0)
    }

    pub fn proximo_faixa(&mut self, minimo: f64, maximo: f64) -> f64 {
        minimo + (maximo - minimo) * self.proximo_f64()
    }
}

fn misturar(mut z: u64) -> u64 {
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn mesma_semente_mesma_sequencia() {
        let mut a = Rng::novo(7, 10, 20, 3);
        let mut b = Rng::novo(7, 10, 20, 3);
        for _ in 0..16 {
            assert_eq!(a.proximo_u64(), b.proximo_u64());
        }
    }

    #[test]
    fn pixels_diferentes_sequencias_diferentes() {
        let mut a = Rng::novo(7, 10, 20, 0);
        let mut b = Rng::novo(7, 11, 20, 0);
        assert_ne!(a.proximo_u64(), b.proximo_u64());
    }

    #[test]
    fn uniforme_fica_em_zero_um() {
        let mut rng = Rng::novo(1, 2, 3, 4);
        for _ in 0..1000 {
            let v = rng.proximo_f64();
            assert!((0.0..1.0).contains(&v));
        }
    }
}
