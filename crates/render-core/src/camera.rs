//! Câmera do snapshot: matrizes `view` e `projection` prontas, mais a posição.
//!
//! A câmera **não** guarda ângulo, alvo ou distância. Quem amostra a animação é o TypeScript
//! (CONTRATO.md §2) e manda as matrizes já calculadas; o Rust só desprojeta pixels.

use crate::erro::Erro;
use crate::matematica::{multiplicar, olhar_para, perspectiva, Mat4, IDENTIDADE};
use crate::vetor::Vec3;

/// Quantidade de `f32` no payload de `atualizar_camera` da ABI.
pub const FLOATS_QUADRO_CAMERA: usize = 37;

#[derive(Clone, Debug)]
pub struct Camera {
    /// 4x4 em coluna maior.
    pub view: Mat4,
    /// 4x4 em coluna maior, recorte WebGL.
    pub projecao: Mat4,
    pub posicao: Vec3,
    pub perto: f64,
    pub longe: f64,
}

impl Camera {
    /// Câmera olhando para um alvo. Usada nos testes e por quem precisa montar um snapshot à mão.
    pub fn olhando_para(
        posicao: Vec3,
        alvo: Vec3,
        cima: Vec3,
        fov_y: f64,
        aspecto: f64,
        perto: f64,
        longe: f64,
    ) -> Result<Self, Erro> {
        let view = olhar_para(posicao, alvo, cima).ok_or(Erro::CenaInvalida)?;
        let projecao = perspectiva(fov_y, aspecto, perto, longe).ok_or(Erro::CenaInvalida)?;
        Self::com_matrizes(view, projecao, posicao, perto, longe)
    }

    pub fn com_matrizes(
        view: Mat4,
        projecao: Mat4,
        posicao: Vec3,
        perto: f64,
        longe: f64,
    ) -> Result<Self, Erro> {
        let camera = Self {
            view,
            projecao,
            posicao,
            perto,
            longe,
        };
        if camera.valida() {
            Ok(camera)
        } else {
            Err(Erro::CenaInvalida)
        }
    }

    pub fn valida(&self) -> bool {
        self.view.iter().all(|v| v.is_finite())
            && self.projecao.iter().all(|v| v.is_finite())
            && self.posicao.finito()
            && self.perto.is_finite()
            && self.longe.is_finite()
            && self.perto > 0.0
            && self.longe > self.perto
            && crate::matematica::inverter(&self.matriz_vp()).is_some()
    }

    /// `projection * view`, na ordem em que o recorte é aplicado.
    pub fn matriz_vp(&self) -> Mat4 {
        multiplicar(&self.projecao, &self.view)
    }

    /// Decodifica o payload de `atualizar_camera`: 37 `f32` little-endian na ordem
    /// view(16), projeção(16), posição(3), perto(1), longe(1).
    pub fn de_quadro(bytes: &[u8]) -> Result<Self, Erro> {
        let esperado = FLOATS_QUADRO_CAMERA * 4;
        if bytes.len() != esperado {
            return Err(Erro::TrabalhoInvalido);
        }
        let mut valores = [0.0f64; FLOATS_QUADRO_CAMERA];
        for (i, valor) in valores.iter_mut().enumerate() {
            let inicio = i * 4;
            let pedaco = &bytes[inicio..inicio + 4];
            let v = f32::from_le_bytes([pedaco[0], pedaco[1], pedaco[2], pedaco[3]]);
            *valor = v as f64;
        }
        let mut view = [0.0; 16];
        let mut projecao = [0.0; 16];
        view.copy_from_slice(&valores[0..16]);
        projecao.copy_from_slice(&valores[16..32]);
        let posicao = Vec3::novo(valores[32], valores[33], valores[34]);
        Self::com_matrizes(view, projecao, posicao, valores[35], valores[36])
    }

    pub fn identidade() -> Self {
        Self {
            view: IDENTIDADE,
            projecao: IDENTIDADE,
            posicao: Vec3::zero(),
            perto: 0.1,
            longe: 100.0,
        }
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    fn camera_teste() -> Camera {
        Camera::olhando_para(
            Vec3::novo(0.0, -4.0, 2.0),
            Vec3::novo(0.0, 0.0, 1.0),
            Vec3::novo(0.0, 0.0, 1.0),
            0.9,
            16.0 / 9.0,
            0.1,
            100.0,
        )
        .expect("câmera")
    }

    #[test]
    fn camera_valida_e_invertivel() {
        let camera = camera_teste();
        assert!(camera.valida());
        assert!(crate::matematica::inverter(&camera.matriz_vp()).is_some());
    }

    #[test]
    fn camera_recusa_matrizes_invalidas() {
        let mut view = IDENTIDADE;
        view[0] = f64::NAN;
        assert!(Camera::com_matrizes(view, IDENTIDADE, Vec3::zero(), 0.1, 10.0).is_err());
    }

    #[test]
    fn quadro_ida_e_volta() {
        let camera = camera_teste();
        let mut bytes = Vec::with_capacity(FLOATS_QUADRO_CAMERA * 4);
        let mut escrever = |v: f64| bytes.extend_from_slice(&(v as f32).to_le_bytes());
        for v in camera.view {
            escrever(v);
        }
        for v in camera.projecao {
            escrever(v);
        }
        for v in camera.posicao.para_array() {
            escrever(v);
        }
        escrever(camera.perto);
        escrever(camera.longe);
        let lida = Camera::de_quadro(&bytes).expect("decodifica");
        assert!((lida.posicao.z - camera.posicao.z).abs() < 1.0e-6);
        assert!((lida.longe - camera.longe).abs() < 1.0e-6);
    }
}
