//! Vetores 3D e caixas alinhadas aos eixos, em `f64`.
//!
//! O 3D do Hestia é Z para cima e metros; todo o núcleo mantém essa convenção.

use std::ops::{Add, Div, Mul, Neg, Sub};

pub const PI: f64 = std::f64::consts::PI;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vec3 {
    pub const fn novo(x: f64, y: f64, z: f64) -> Self {
        Self { x, y, z }
    }

    pub const fn zero() -> Self {
        Self::novo(0.0, 0.0, 0.0)
    }

    pub const fn splat(v: f64) -> Self {
        Self::novo(v, v, v)
    }

    pub fn de_array(v: [f64; 3]) -> Self {
        Self::novo(v[0], v[1], v[2])
    }

    pub fn para_array(self) -> [f64; 3] {
        [self.x, self.y, self.z]
    }

    pub fn dot(self, outro: Self) -> f64 {
        self.x * outro.x + self.y * outro.y + self.z * outro.z
    }

    pub fn cross(self, outro: Self) -> Self {
        Self::novo(
            self.y * outro.z - self.z * outro.y,
            self.z * outro.x - self.x * outro.z,
            self.x * outro.y - self.y * outro.x,
        )
    }

    pub fn comprimento(self) -> f64 {
        self.dot(self).sqrt()
    }

    /// Normaliza; um vetor degenerado vira zero, nunca NaN.
    pub fn normalizado(self) -> Self {
        let comprimento = self.comprimento();
        if comprimento > 1.0e-12 {
            self / comprimento
        } else {
            Self::zero()
        }
    }

    pub fn reflectido(self, normal: Self) -> Self {
        self - normal * (2.0 * self.dot(normal))
    }

    pub fn comp(self, eixo: usize) -> f64 {
        match eixo {
            0 => self.x,
            1 => self.y,
            _ => self.z,
        }
    }

    pub fn minimo(self, outro: Self) -> Self {
        Self::novo(
            self.x.min(outro.x),
            self.y.min(outro.y),
            self.z.min(outro.z),
        )
    }

    pub fn maximo(self, outro: Self) -> Self {
        Self::novo(
            self.x.max(outro.x),
            self.y.max(outro.y),
            self.z.max(outro.z),
        )
    }

    pub fn finito(self) -> bool {
        self.x.is_finite() && self.y.is_finite() && self.z.is_finite()
    }
}

impl Add for Vec3 {
    type Output = Self;

    fn add(self, outro: Self) -> Self {
        Self::novo(self.x + outro.x, self.y + outro.y, self.z + outro.z)
    }
}

impl Sub for Vec3 {
    type Output = Self;

    fn sub(self, outro: Self) -> Self {
        Self::novo(self.x - outro.x, self.y - outro.y, self.z - outro.z)
    }
}

impl Mul<f64> for Vec3 {
    type Output = Self;

    fn mul(self, escalar: f64) -> Self {
        Self::novo(self.x * escalar, self.y * escalar, self.z * escalar)
    }
}

impl Mul<Vec3> for Vec3 {
    type Output = Self;

    fn mul(self, outro: Self) -> Self {
        Self::novo(self.x * outro.x, self.y * outro.y, self.z * outro.z)
    }
}

impl Div<f64> for Vec3 {
    type Output = Self;

    fn div(self, escalar: f64) -> Self {
        Self::novo(self.x / escalar, self.y / escalar, self.z / escalar)
    }
}

impl Neg for Vec3 {
    type Output = Self;

    fn neg(self) -> Self {
        Self::novo(-self.x, -self.y, -self.z)
    }
}

/// Interpolação linear componente a componente.
pub fn misturar(a: Vec3, b: Vec3, t: f64) -> Vec3 {
    a * (1.0 - t) + b * t
}

/// Caixa alinhada aos eixos.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Aabb {
    pub min: Vec3,
    pub max: Vec3,
}

impl Aabb {
    pub fn vazia() -> Self {
        Self {
            min: Vec3::splat(f64::INFINITY),
            max: Vec3::splat(f64::NEG_INFINITY),
        }
    }

    pub fn de_pontos(pontos: &[Vec3]) -> Self {
        let mut caixa = Self::vazia();
        for &ponto in pontos {
            caixa = caixa.expandir(ponto);
        }
        caixa
    }

    pub fn expandir(self, ponto: Vec3) -> Self {
        Self {
            min: self.min.minimo(ponto),
            max: self.max.maximo(ponto),
        }
    }

    pub fn uniao(self, outro: Self) -> Self {
        Self {
            min: self.min.minimo(outro.min),
            max: self.max.maximo(outro.max),
        }
    }

    pub fn centro(self) -> Vec3 {
        (self.min + self.max) * 0.5
    }

    pub fn extensao(self) -> Vec3 {
        self.max - self.min
    }

    pub fn valida(self) -> bool {
        self.min.finito()
            && self.max.finito()
            && self.min.x <= self.max.x
            && self.min.y <= self.max.y
            && self.min.z <= self.max.z
    }

    /// Testa o raio contra a caixa. Devolve o `t` de entrada e de saída, se houver.
    pub fn intersectar(
        self,
        origem: Vec3,
        inv_direcao: Vec3,
        t_min: f64,
        t_max: f64,
    ) -> Option<(f64, f64)> {
        let mut inicio = t_min;
        let mut fim = t_max;
        for eixo in 0..3 {
            let o = origem.comp(eixo);
            let inv = inv_direcao.comp(eixo);
            let mn = self.min.comp(eixo);
            let mx = self.max.comp(eixo);
            let t0 = (mn - o) * inv;
            let t1 = (mx - o) * inv;
            let perto = if t0 < t1 { t0 } else { t1 };
            let longe = if t0 < t1 { t1 } else { t0 };
            // `f64::min/max` devolvem o outro operando quando um lado é NaN (raio paralelo na
            // borda), o que é exatamente o comportamento tolerante que queremos.
            inicio = inicio.max(perto);
            fim = fim.min(longe);
            if inicio > fim {
                return None;
            }
        }
        Some((inicio, fim))
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn normaliza_e_protege_degenerado() {
        let v = Vec3::novo(3.0, 0.0, 4.0).normalizado();
        assert!((v.comprimento() - 1.0).abs() < 1.0e-12);
        assert_eq!(Vec3::zero().normalizado(), Vec3::zero());
    }

    #[test]
    fn caixa_intersecta_raio() {
        let caixa = Aabb::de_pontos(&[Vec3::novo(-1.0, -1.0, -1.0), Vec3::novo(1.0, 1.0, 1.0)]);
        let origem = Vec3::novo(0.0, 0.0, -5.0);
        let inv_reto = Vec3::novo(f64::INFINITY, f64::INFINITY, 0.5);
        assert!(caixa.intersectar(origem, inv_reto, 0.0, 100.0).is_some());
        // Direção diagonal (0.1, 0.1, 0.5): entra na caixa perto de z = -1.
        assert!(caixa
            .intersectar(origem, Vec3::novo(10.0, 10.0, 2.0), 0.0, 100.0)
            .is_some());
        assert!(caixa
            .intersectar(Vec3::novo(5.0, 5.0, 5.0), inv_reto, 0.0, 100.0)
            .is_none());
    }
}
