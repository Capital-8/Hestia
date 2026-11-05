//! Expansão da cena HSTR indexada em vértices independentes com material.
//!
//! O contrato guarda posições/índices e um material por lote. A GPU recebe uma lista de
//! triângulos não indexados: cada triângulo repete seus três vértices com a **normal de face**
//! (aresta × aresta) e os parâmetros do material. Isso elimina qualquer dependência de normais
//! suaves e mantém a leitura de arquitetura nítida, que é o objetivo desta primeira versão.

use bytemuck::{Pod, Zeroable};
use render_core::cena::{Cena, Material};
use render_core::vetor::Vec3;

use crate::erro::ErroRender;

/// Vértice enviado ao vertex buffer (56 bytes, sem texturas nesta versão).
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Pod, Zeroable)]
pub struct Vertice {
    pub posicao: [f32; 3],
    pub normal: [f32; 3],
    pub cor: [f32; 3],
    pub rugosidade: f32,
    pub metalico: f32,
    pub emissivo: [f32; 3],
}

/// Caixa alinhada aos eixos da geometria já expandida.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Caixa {
    pub minimo: [f64; 3],
    pub maximo: [f64; 3],
}

impl Caixa {
    fn vazia() -> Self {
        Self {
            minimo: [f64::INFINITY; 3],
            maximo: [f64::NEG_INFINITY; 3],
        }
    }

    fn expandir(&mut self, p: Vec3) {
        for (eixo, valor) in [p.x, p.y, p.z].into_iter().enumerate() {
            self.minimo[eixo] = self.minimo[eixo].min(valor);
            self.maximo[eixo] = self.maximo[eixo].max(valor);
        }
    }

    pub fn centro(self) -> [f64; 3] {
        [
            (self.minimo[0] + self.maximo[0]) * 0.5,
            (self.minimo[1] + self.maximo[1]) * 0.5,
            (self.minimo[2] + self.maximo[2]) * 0.5,
        ]
    }

    /// Raio da esfera envolvente, nunca menor que 0,5 m (evita luz degenerada).
    pub fn raio(self) -> f64 {
        let dx = self.maximo[0] - self.minimo[0];
        let dy = self.maximo[1] - self.minimo[1];
        let dz = self.maximo[2] - self.minimo[2];
        ((dx * dx + dy * dy + dz * dz).sqrt() * 0.5).max(0.5)
    }
}

/// Geometria pronta para a GPU e sua caixa envolvente.
pub struct Malha {
    pub vertices: Vec<Vertice>,
    pub caixa: Caixa,
}

fn posicao(cena: &Cena, indice: u32) -> Result<Vec3, ErroRender> {
    let base = indice as usize * 3;
    let valores = cena
        .posicoes
        .get(base..base + 3)
        .ok_or_else(|| ErroRender::Cena(format!("índice {indice} fora das posições")))?;
    Ok(Vec3::novo(valores[0], valores[1], valores[2]))
}

/// Material de cada triângulo, exatamente como o núcleo (o último lote vence).
fn materiais_por_triangulo(cena: &Cena) -> Result<Vec<usize>, ErroRender> {
    let n_triangulos = cena.indices.len() / 3;
    let mut materiais = vec![0usize; n_triangulos];
    for lote in &cena.lotes {
        let inicio = lote.inicio_indices as usize / 3;
        let fim = (lote.inicio_indices as usize + lote.quantidade_indices as usize) / 3;
        let faixa = materiais
            .get_mut(inicio..fim)
            .ok_or_else(|| ErroRender::Cena("lote fora dos índices".into()))?;
        faixa.fill(lote.material as usize);
    }
    Ok(materiais)
}

fn material_da_cena(cena: &Cena, indice: usize) -> Result<&Material, ErroRender> {
    cena.materiais
        .get(indice)
        .ok_or_else(|| ErroRender::Cena(format!("material {indice} não existe")))
}

fn normal_de_face(a: Vec3, b: Vec3, c: Vec3) -> Vec3 {
    let normal = (b - a).cross(c - a).normalizado();
    if normal.comprimento() < 1.0e-9 {
        // Triângulo degenerado: uma normal arbitrária evita NaN no shader.
        Vec3::novo(0.0, 0.0, 1.0)
    } else {
        normal
    }
}

/// Converte a cena validada em triângulos não indexados.
pub fn expandir(cena: &Cena) -> Result<Malha, ErroRender> {
    if cena.indices.is_empty() || !cena.indices.len().is_multiple_of(3) {
        return Err(ErroRender::Cena(
            "lista de índices vazia ou fora de triângulos".into(),
        ));
    }
    let materiais = materiais_por_triangulo(cena)?;
    let n_triangulos = cena.indices.len() / 3;
    let mut vertices = Vec::with_capacity(n_triangulos * 3);
    let mut caixa = Caixa::vazia();

    for (triangulo, indices) in cena.indices.chunks_exact(3).enumerate() {
        let a = posicao(cena, indices[0])?;
        let b = posicao(cena, indices[1])?;
        let c = posicao(cena, indices[2])?;
        let material = material_da_cena(cena, materiais[triangulo])?;
        let normal = normal_de_face(a, b, c);
        let cor = material.cor_base.map(|v| v as f32);
        let emissivo = material.emissivo.map(|v| v as f32);
        let rugosidade = material.rugosidade as f32;
        let metalico = material.metalico as f32;

        for ponto in [a, b, c] {
            caixa.expandir(ponto);
            vertices.push(Vertice {
                posicao: [ponto.x as f32, ponto.y as f32, ponto.z as f32],
                normal: [normal.x as f32, normal.y as f32, normal.z as f32],
                cor,
                rugosidade,
                metalico,
                emissivo,
            });
        }
    }

    if vertices.is_empty() || !caixa.minimo.iter().all(|v| v.is_finite()) {
        return Err(ErroRender::Cena("a cena não gerou geometria finita".into()));
    }
    Ok(Malha { vertices, caixa })
}

#[cfg(test)]
mod testes {
    use super::*;
    use render_core::camera::Camera;
    use render_core::cena::{Lote, PartesCena, Sol};

    fn cena_um_triangulo() -> Cena {
        let camera = Camera::olhando_para(
            Vec3::novo(0.0, -3.0, 2.0),
            Vec3::novo(0.0, 0.0, 0.0),
            Vec3::novo(0.0, 0.0, 1.0),
            0.9,
            16.0 / 9.0,
            0.1,
            100.0,
        )
        .expect("câmera");
        let material = Material {
            cor_base: [0.8, 0.2, 0.1],
            rugosidade: 0.6,
            metalico: 0.3,
            opacidade: 1.0,
            transmissao: 0.0,
            ior: 1.5,
            emissivo: [0.0, 0.0, 0.0],
        };
        Cena::nova(PartesCena {
            posicoes: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            indices: vec![0, 1, 2],
            normais: Vec::new(),
            materiais: vec![material],
            lotes: vec![Lote {
                inicio_indices: 0,
                quantidade_indices: 3,
                material: 0,
            }],
            sol: Sol::padrao(),
            fundo: None,
            camera,
        })
        .expect("cena")
    }

    #[test]
    fn expande_tres_vertices_com_normal_de_face_e_material() {
        let malha = expandir(&cena_um_triangulo()).expect("expande");
        assert_eq!(malha.vertices.len(), 3);
        for v in &malha.vertices {
            assert!((v.normal[2] - 1.0).abs() < 1.0e-6);
            assert_eq!(v.cor, [0.8, 0.2, 0.1]);
            assert!((v.rugosidade - 0.6).abs() < 1.0e-6);
            assert!((v.metalico - 0.3).abs() < 1.0e-6);
        }
        // A câmera olha de -Y; a face está no plano Z=0, então a normal é +Z.
        assert!((malha.caixa.raio() - std::f64::consts::FRAC_1_SQRT_2).abs() < 1.0e-9);
    }
}
