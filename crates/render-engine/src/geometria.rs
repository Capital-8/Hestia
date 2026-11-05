//! Expansão da cena HSTR indexada em vértices independentes com material.
//!
//! O contrato guarda posições/índices e um material por lote. A GPU recebe uma lista de
//! triângulos não indexados: cada triângulo repete seus três vértices com a **normal de face**
//! (aresta × aresta) e os parâmetros do material. Isso elimina qualquer dependência de normais
//! suaves e mantém a leitura de arquitetura nítida, que é o objetivo desta primeira versão.

use bytemuck::{Pod, Zeroable};
use render_core::cena::{Cena, Material, SEM_TEXTURA};
use render_core::vetor::Vec3;

use crate::erro::ErroRender;

/// Tipo de superfície do vidro (`Material::tipo`).
pub const TIPO_VIDRO: u8 = 6;

/// Vértice enviado ao vertex buffer (84 bytes). Os padrões procedurais não usam UV; as texturas de
/// material usam a projeção triplanar do shader, também sem UV de malha.
///
/// `tipo_material` é o `u8` do material como `f32` (0 liso, 1 reboco, ..., 7 tijolo) e `escala`
/// é a escala do padrão em metros por repetição. Os dois são atributos por vértice (locations 6 e 7).
/// `opacidade` (location 8) é a do material: abaixo de 1 o triângulo é vidro (ver `e_vidro`).
/// `texturas` (location 9, `Uint32x4`) são os índices de textura do material: albedo, normal,
/// rugosidade e metálico, com `SEM_TEXTURA` (0xFFFFFFFF) onde o canal não tem textura.
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Pod, Zeroable)]
pub struct Vertice {
    pub posicao: [f32; 3],
    pub normal: [f32; 3],
    pub cor: [f32; 3],
    pub rugosidade: f32,
    pub metalico: f32,
    pub emissivo: [f32; 3],
    pub tipo_material: f32,
    pub escala: f32,
    pub opacidade: f32,
    pub texturas: [u32; 4],
}

/// Vidro: tipo 6 ou material com opacidade abaixo de 1. Esses triângulos saem do passe opaco e
/// são desenhados depois, com a cor opaca da região como fundo.
pub fn e_vidro(material: &Material) -> bool {
    material.tipo == TIPO_VIDRO || material.opacidade < 1.0
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
    /// Vértices opacos primeiro (`vertices[..opacos]`), depois os de vidro, na ordem da cena.
    pub vertices: Vec<Vertice>,
    pub caixa: Caixa,
    /// Quantidade de vértices opacos no início de `vertices`.
    pub opacos: usize,
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
    let mut opacos = Vec::with_capacity(n_triangulos * 3);
    let mut vidro = Vec::new();
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
        let tipo_material = f32::from(material.tipo);
        let escala = material.escala as f32;
        let opacidade = material.opacidade as f32;
        let texturas = material.texturas.map(|canal| canal.unwrap_or(SEM_TEXTURA));
        let destino = if e_vidro(material) { &mut vidro } else { &mut opacos };

        for ponto in [a, b, c] {
            caixa.expandir(ponto);
            destino.push(Vertice {
                posicao: [ponto.x as f32, ponto.y as f32, ponto.z as f32],
                normal: [normal.x as f32, normal.y as f32, normal.z as f32],
                cor,
                rugosidade,
                metalico,
                emissivo,
                tipo_material,
                escala,
                opacidade,
                texturas,
            });
        }
    }

    if opacos.len() + vidro.len() == 0 || !caixa.minimo.iter().all(|v| v.is_finite()) {
        return Err(ErroRender::Cena("a cena não gerou geometria finita".into()));
    }
    let n_opacos = opacos.len();
    opacos.extend(vidro);
    Ok(Malha {
        vertices: opacos,
        caixa,
        opacos: n_opacos,
    })
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
            tipo: 0,
            escala: 1.0,
            texturas: [None; 4],
        };
        Cena::nova(PartesCena {
            posicoes: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            indices: vec![0, 1, 2],
            normais: Vec::new(),
            materiais: vec![material],
            texturas: Vec::new(),
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
    fn vertice_tem_84_bytes() {
        // 68 bytes até a opacidade (location 8) do passe de vidro, mais os 4 índices de textura
        // (location 9, Uint32x4).
        assert_eq!(std::mem::size_of::<Vertice>(), 84);
    }

    #[test]
    fn expande_indices_de_textura_com_sentinela() {
        let mut cena = cena_um_triangulo();
        cena.materiais[0].texturas = [Some(2), None, Some(0), None];
        let malha = expandir(&cena).expect("expande");
        for v in &malha.vertices {
            assert_eq!(v.texturas, [2, SEM_TEXTURA, 0, SEM_TEXTURA]);
        }
    }

    #[test]
    fn vidro_vai_depois_dos_opacos() {
        let mut cena = cena_um_triangulo();
        // Triângulo 0 opaco; triângulo 1 com tipo de vidro (6) e opacidade 0,25.
        cena.indices = vec![0, 1, 2, 0, 2, 1];
        cena.lotes = vec![
            Lote { inicio_indices: 0, quantidade_indices: 3, material: 0 },
            Lote { inicio_indices: 3, quantidade_indices: 3, material: 1 },
        ];
        let mut vidro = cena.materiais[0];
        vidro.tipo = TIPO_VIDRO;
        vidro.opacidade = 0.25;
        cena.materiais.push(vidro);
        let malha = expandir(&cena).expect("expande");
        assert_eq!(malha.opacos, 3);
        assert!(malha.vertices[..3].iter().all(|v| v.opacidade == 1.0));
        assert!(malha.vertices[3..].iter().all(|v| v.opacidade == 0.25 && v.tipo_material == 6.0));
    }

    #[test]
    fn material_com_opacidade_menor_que_um_e_vidro() {
        let mut m = cena_um_triangulo().materiais[0];
        assert!(!e_vidro(&m));
        m.opacidade = 0.5;
        assert!(e_vidro(&m));
        m.opacidade = 1.0;
        m.tipo = TIPO_VIDRO;
        assert!(e_vidro(&m));
    }

    #[test]
    fn expande_preenche_tipo_e_escala_do_material() {
        let mut cena = cena_um_triangulo();
        cena.materiais[0].tipo = 3;
        cena.materiais[0].escala = 0.5;
        let malha = expandir(&cena).expect("expande");
        for v in &malha.vertices {
            assert_eq!(v.tipo_material, 3.0);
            assert_eq!(v.escala, 0.5);
        }
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
