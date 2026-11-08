//! Utilidades só de teste: gerador pseudoaleatório determinístico (sem dependências).

pub struct Xorshift(u64);

impl Xorshift {
    pub fn novo(semente: u64) -> Xorshift {
        Xorshift(semente.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1)
    }

    pub fn proximo(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D) >> 11
    }

    /// Uniforme em [min, max).
    pub fn intervalo(&mut self, min: f64, max: f64) -> f64 {
        let u = (self.proximo() as f64) / ((1u64 << 53) as f64);
        min + (max - min) * u
    }
}
