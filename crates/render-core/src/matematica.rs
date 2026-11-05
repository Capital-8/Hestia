//! Matrizes 4x4 em coluna maior, o mesmo layout que o Three.js e o snapshot usam.
//!
//! O renderizador não assume FOV nem orientação: ele desprojeta o centro de cada pixel pelo
//! inverso de `projection * view`. Assim a câmera do snapshot (mesmo que venha de uma vista salva)
//! é respeitada sem conversão de unidade.

use crate::vetor::Vec3;

pub type Mat4 = [f64; 16];

pub const IDENTIDADE: Mat4 = [
    1.0, 0.0, 0.0, 0.0, //
    0.0, 1.0, 0.0, 0.0, //
    0.0, 0.0, 1.0, 0.0, //
    0.0, 0.0, 0.0, 1.0,
];

/// Produto `a * b`, ambos em coluna maior. O resultado transforma primeiro por `b` e depois `a`,
/// que é a ordem usada em `projection * view`.
pub fn multiplicar(a: &Mat4, b: &Mat4) -> Mat4 {
    let mut saida = [0.0; 16];
    for coluna in 0..4 {
        for linha in 0..4 {
            let mut soma = 0.0;
            for k in 0..4 {
                soma += a[k * 4 + linha] * b[coluna * 4 + k];
            }
            saida[coluna * 4 + linha] = soma;
        }
    }
    saida
}

/// Inverte a matriz por eliminação de Gauss-Jordan com pivô parcial.
///
/// Devolve `None` para matrizes singulares (câmera degenerada); o chamador trata isso como cena
/// inválida em vez de gerar raios NaN.
pub fn inverter(m: &Mat4) -> Option<Mat4> {
    // Trabalhamos em linha maior internamente, que deixa a eliminação legível.
    let mut a = [[0.0f64; 4]; 4];
    let mut inv = [[0.0f64; 4]; 4];
    for linha in 0..4 {
        for coluna in 0..4 {
            a[linha][coluna] = m[coluna * 4 + linha];
        }
        inv[linha][linha] = 1.0;
    }

    for coluna in 0..4 {
        let mut pivo = coluna;
        for linha in (coluna + 1)..4 {
            if a[linha][coluna].abs() > a[pivo][coluna].abs() {
                pivo = linha;
            }
        }
        if a[pivo][coluna].abs() < 1.0e-12 {
            return None;
        }
        if pivo != coluna {
            a.swap(pivo, coluna);
            inv.swap(pivo, coluna);
        }
        let divisor = a[coluna][coluna];
        for k in 0..4 {
            a[coluna][k] /= divisor;
            inv[coluna][k] /= divisor;
        }
        for linha in 0..4 {
            if linha == coluna {
                continue;
            }
            let fator = a[linha][coluna];
            if fator == 0.0 {
                continue;
            }
            for k in 0..4 {
                a[linha][k] -= fator * a[coluna][k];
                inv[linha][k] -= fator * inv[coluna][k];
            }
        }
    }

    let mut saida = [0.0; 16];
    for linha in 0..4 {
        for coluna in 0..4 {
            saida[coluna * 4 + linha] = inv[linha][coluna];
        }
    }
    Some(saida)
}

/// Transforma um vetor homogêneo `[x, y, z, w]` por uma matriz em coluna maior.
pub fn transformar(m: &Mat4, v: [f64; 4]) -> [f64; 4] {
    [
        m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
        m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
        m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
        m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3],
    ]
}

/// Matriz `look_at` em coluna maior, mão direita, Z para cima.
pub fn olhar_para(posicao: Vec3, alvo: Vec3, cima: Vec3) -> Option<Mat4> {
    let frente = (alvo - posicao).normalizado();
    if frente.comprimento() < 1.0e-12 {
        return None;
    }
    let direita = frente.cross(cima).normalizado();
    if direita.comprimento() < 1.0e-12 {
        return None;
    }
    let cima_ortogonal = direita.cross(frente);
    Some([
        direita.x,
        cima_ortogonal.x,
        -frente.x,
        0.0,
        direita.y,
        cima_ortogonal.y,
        -frente.y,
        0.0,
        direita.z,
        cima_ortogonal.z,
        -frente.z,
        0.0,
        -direita.dot(posicao),
        -cima_ortogonal.dot(posicao),
        frente.dot(posicao),
        1.0,
    ])
}

/// Projeção perspectiva no recorte do WebGL (`z` em `[-1, 1]`), coluna maior.
pub fn perspectiva(fov_y: f64, aspecto: f64, perto: f64, longe: f64) -> Option<Mat4> {
    if !(fov_y.is_finite() && aspecto.is_finite() && perto.is_finite() && longe.is_finite()) {
        return None;
    }
    if fov_y <= 0.0
        || fov_y >= std::f64::consts::PI
        || aspecto <= 0.0
        || perto <= 0.0
        || longe <= perto
    {
        return None;
    }
    let f = 1.0 / (fov_y * 0.5).tan();
    Some([
        f / aspecto,
        0.0,
        0.0,
        0.0,
        0.0,
        f,
        0.0,
        0.0,
        0.0,
        0.0,
        (longe + perto) / (perto - longe),
        -1.0,
        0.0,
        0.0,
        (2.0 * longe * perto) / (perto - longe),
        0.0,
    ])
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn identidade_e_neutra() {
        let m = perspectiva(1.0, 1.5, 0.1, 100.0).expect("projeção");
        assert_eq!(multiplicar(&IDENTIDADE, &m), m);
        assert_eq!(multiplicar(&m, &IDENTIDADE), m);
    }

    #[test]
    fn inversa_desfaz_a_projecao() {
        let m = perspectiva(1.0, 16.0 / 9.0, 0.1, 200.0).expect("projeção");
        let inv = inverter(&m).expect("inversa");
        let produto = multiplicar(&m, &inv);
        for (i, valor) in produto.iter().enumerate() {
            let esperado = if i % 5 == 0 { 1.0 } else { 0.0 };
            assert!((valor - esperado).abs() < 1.0e-9, "posição {i}: {valor}");
        }
    }

    #[test]
    fn olhar_para_leva_alvo_para_origem() {
        let camera = olhar_para(
            Vec3::novo(0.0, -5.0, 2.0),
            Vec3::novo(0.0, 0.0, 1.0),
            Vec3::novo(0.0, 0.0, 1.0),
        )
        .expect("view");
        let alvo = transformar(&camera, [0.0, 0.0, 1.0, 1.0]);
        assert!((alvo[0]).abs() < 1.0e-9);
        assert!((alvo[1]).abs() < 1.0e-9);
        assert!(alvo[2] < -4.0, "o alvo fica à frente, em -Z da câmera");
        assert!((alvo[3] - 1.0).abs() < 1.0e-9);
    }

    #[test]
    fn matriz_singular_e_recusada() {
        assert!(inverter(&[0.0; 16]).is_none());
    }
}
