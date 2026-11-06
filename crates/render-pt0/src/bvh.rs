//! BVH plana para a GPU, com a travessia de referência em CPU.
//!
//! Escolha: uma BVH nova, em vez de reutilizar a do `render-core`. Motivo: a BVH de lá é
//! `pub(crate)` e guarda `Triangulo` com o formato do tracer de CPU; a GPU precisa de arrays
//! planos com layout fixo (`repr(C)`, 32 bytes por nó e 112 bytes por triângulo).
//!
//! Construção: divisão pela mediana do eixo mais largo dos centróides, folhas de até
//! `FOLHA_MAXIMA` triângulos, layout em profundidade com o filho esquerdo sempre logo após o pai
//! (`indice + 1`) e o direito guardado em `a`. Os triângulos são reordenados na ordem das folhas,
//! então cada folha lê um intervalo contíguo de `tris`.
//!
//! A travessia de CPU (`intersectar`, `algum_acerto`) segue a mesma ordem e a mesma aritmética f32
//! do `pt0.wgsl`, para que o teste contra força bruta valide os dados e a lógica que a GPU usa.

use render_core::cena::Cena;

/// Triângulos por folha no máximo.
pub const FOLHA_MAXIMA: usize = 4;
/// Profundidade da pilha de travessia (com divisão pela mediana, a profundidade é ~log2(n)).
pub const PILHA: usize = 64;
/// Componente mínima de direção; evita `1/0` na divisão do teste de caixa.
const DIRECAO_MINIMA: f32 = 1.0e-8;
/// Determinante mínimo do teste de Möller-Trumbore.
const DETERMINANTE_MINIMO: f32 = 1.0e-12;

/// Nó da BVH no formato da GPU (32 bytes).
///
/// Interno: `n == 0`, filho esquerdo em `indice + 1`, filho direito em `a`.
/// Folha: `n > 0`, primeiro triângulo em `a`, `n` triângulos a partir dele.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, bytemuck::Pod, bytemuck::Zeroable)]
pub struct NoGpu {
    pub caixa_min: [f32; 3],
    pub a: u32,
    pub caixa_max: [f32; 3],
    pub n: u32,
}

/// Triângulo no formato da GPU (112 bytes). `material[0]` é o índice do material.
#[repr(C)]
#[derive(Clone, Copy, Debug, Default, bytemuck::Pod, bytemuck::Zeroable)]
pub struct TrianguloGpu {
    pub v0: [f32; 4],
    pub v1: [f32; 4],
    pub v2: [f32; 4],
    pub n0: [f32; 4],
    pub n1: [f32; 4],
    pub n2: [f32; 4],
    pub material: [u32; 4],
}

/// Acerto da travessia de CPU (mesma convenção do shader: `u`, `v` são coordenadas baricêntricas).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Acerto {
    pub t: f32,
    pub u: f32,
    pub v: f32,
    pub triangulo: u32,
}

/// BVH já achatada, pronta para subir para os buffers da GPU.
pub struct Bvh {
    pub nos: Vec<NoGpu>,
    pub tris: Vec<TrianguloGpu>,
    /// Profundidade máxima da árvore (para validar contra `PILHA`).
    pub profundidade: usize,
}

/// Triângulo com a caixa e o centróide já calculados (só durante a construção).
struct Construcao {
    tri: TrianguloGpu,
    caixa_min: [f32; 3],
    caixa_max: [f32; 3],
    centroide: [f32; 3],
}

impl Bvh {
    /// Constrói a BVH a partir dos triângulos de uma cena validada do `render-core`.
    ///
    /// Normais por vértice são usadas quando existem; sem elas, a normal da face. O material de
    /// cada triângulo vem do lote que o contém (padrão: material 0), como no `render-core`.
    pub fn construir(cena: &Cena) -> Result<Self, String> {
        let triangulos = triangulos_da_cena(cena)?;
        let mut ordem: Vec<usize> = (0..triangulos.len()).collect();
        let mut nos = Vec::with_capacity(triangulos.len() * 2);
        let profundidade = if triangulos.is_empty() {
            0
        } else {
            let fim = ordem.len();
            construir_no(&mut nos, &mut ordem, &triangulos, 0, fim, 1)
        };
        if profundidade > PILHA {
            return Err(format!(
                "BVH com profundidade {profundidade} excede a pilha de {PILHA} da travessia"
            ));
        }
        let tris = ordem.iter().map(|&i| triangulos[i].tri).collect();
        if nos.is_empty() {
            // Cena sem triângulos é recusada por `Cena::nova`; por segurança, um nó vazio inerte.
            nos.push(NoGpu::default());
        }
        Ok(Self {
            nos,
            tris,
            profundidade,
        })
    }

    /// Acerto mais próximo no intervalo `(t_min, t_max)`. Mesma ordem e aritmética do shader.
    pub fn intersectar(&self, origem: [f32; 3], direcao: [f32; 3], t_min: f32, t_max: f32) -> Option<Acerto> {
        if self.tris.is_empty() {
            return None;
        }
        let inv = inverso_seguro(direcao);
        let mut melhor_t = t_max;
        let mut melhor = None;
        let mut pilha = [0u32; PILHA];
        let mut topo = 0usize;
        let mut atual = 0usize;
        loop {
            let no = &self.nos[atual];
            if caixa_atinge(no, origem, inv, t_min, melhor_t) {
                if no.n > 0 {
                    for indice in no.a..no.a + no.n {
                        if let Some((t, u, v)) =
                            triangulo_atinge(&self.tris[indice as usize], origem, direcao, t_min, melhor_t)
                        {
                            melhor_t = t;
                            melhor = Some(Acerto {
                                t,
                                u,
                                v,
                                triangulo: indice,
                            });
                        }
                    }
                } else {
                    pilha[topo] = no.a;
                    topo += 1;
                    atual += 1;
                    continue;
                }
            }
            if topo == 0 {
                break;
            }
            topo -= 1;
            atual = pilha[topo] as usize;
        }
        melhor
    }

    /// Existe algum acerto no intervalo? Para no primeiro (sombra).
    pub fn algum_acerto(&self, origem: [f32; 3], direcao: [f32; 3], t_min: f32, t_max: f32) -> bool {
        if self.tris.is_empty() {
            return false;
        }
        let inv = inverso_seguro(direcao);
        let mut pilha = [0u32; PILHA];
        let mut topo = 0usize;
        let mut atual = 0usize;
        loop {
            let no = &self.nos[atual];
            if caixa_atinge(no, origem, inv, t_min, t_max) {
                if no.n > 0 {
                    for indice in no.a..no.a + no.n {
                        if triangulo_atinge(&self.tris[indice as usize], origem, direcao, t_min, t_max).is_some() {
                            return true;
                        }
                    }
                } else {
                    pilha[topo] = no.a;
                    topo += 1;
                    atual += 1;
                    continue;
                }
            }
            if topo == 0 {
                break;
            }
            topo -= 1;
            atual = pilha[topo] as usize;
        }
        false
    }
}

/// Força bruta sobre todos os triângulos: referência para os testes da travessia.
pub fn intersectar_forca_bruta(
    tris: &[TrianguloGpu],
    origem: [f32; 3],
    direcao: [f32; 3],
    t_min: f32,
    t_max: f32,
) -> Option<Acerto> {
    let mut melhor_t = t_max;
    let mut melhor = None;
    for (indice, tri) in tris.iter().enumerate() {
        if let Some((t, u, v)) = triangulo_atinge(tri, origem, direcao, t_min, melhor_t) {
            melhor_t = t;
            melhor = Some(Acerto {
                t,
                u,
                v,
                triangulo: indice as u32,
            });
        }
    }
    melhor
}

fn triangulos_da_cena(cena: &Cena) -> Result<Vec<Construcao>, String> {
    let posicao = |i: u32| -> [f32; 3] {
        let k = i as usize * 3;
        [
            cena.posicoes[k] as f32,
            cena.posicoes[k + 1] as f32,
            cena.posicoes[k + 2] as f32,
        ]
    };
    let mut material_do_triangulo = vec![0u32; cena.indices.len() / 3];
    for lote in &cena.lotes {
        let inicio = lote.inicio_indices as usize / 3;
        let fim = inicio + lote.quantidade_indices as usize / 3;
        for m in material_do_triangulo.iter_mut().take(fim).skip(inicio) {
            *m = lote.material;
        }
    }
    let mut saida = Vec::with_capacity(material_do_triangulo.len());
    for (t, material) in material_do_triangulo.iter().enumerate() {
        let i = [cena.indices[3 * t], cena.indices[3 * t + 1], cena.indices[3 * t + 2]];
        let p = [posicao(i[0]), posicao(i[1]), posicao(i[2])];
        let normal_de = |vertice: u32| -> [f32; 3] {
            if cena.normais.is_empty() {
                return [0.0; 3];
            }
            let k = vertice as usize * 3;
            [
                cena.normais[k] as f32,
                cena.normais[k + 1] as f32,
                cena.normais[k + 2] as f32,
            ]
        };
        let face = normalizar(produto_vetorial(sub(p[1], p[0]), sub(p[2], p[0])));
        let mut n = [normal_de(i[0]), normal_de(i[1]), normal_de(i[2])];
        for nv in n.iter_mut() {
            if produto_escalar(*nv, *nv) < 1.0e-12 {
                *nv = face;
            }
        }
        let tri = TrianguloGpu {
            v0: com_w(p[0]),
            v1: com_w(p[1]),
            v2: com_w(p[2]),
            n0: com_w(n[0]),
            n1: com_w(n[1]),
            n2: com_w(n[2]),
            material: [*material, 0, 0, 0],
        };
        let caixa_min = [0, 1, 2].map(|c| p[0][c].min(p[1][c]).min(p[2][c]));
        let caixa_max = [0, 1, 2].map(|c| p[0][c].max(p[1][c]).max(p[2][c]));
        let centroide = [0, 1, 2].map(|c| (p[0][c] + p[1][c] + p[2][c]) / 3.0);
        saida.push(Construcao {
            tri,
            caixa_min,
            caixa_max,
            centroide,
        });
    }
    if saida.is_empty() {
        return Err("cena sem triângulos".into());
    }
    Ok(saida)
}

fn construir_no(
    nos: &mut Vec<NoGpu>,
    ordem: &mut [usize],
    tris: &[Construcao],
    inicio: usize,
    fim: usize,
    profundidade: usize,
) -> usize {
    let mut caixa_min = [f32::INFINITY; 3];
    let mut caixa_max = [f32::NEG_INFINITY; 3];
    let mut cent_min = [f32::INFINITY; 3];
    let mut cent_max = [f32::NEG_INFINITY; 3];
    for &i in &ordem[inicio..fim] {
        let t = &tris[i];
        for c in 0..3 {
            caixa_min[c] = caixa_min[c].min(t.caixa_min[c]);
            caixa_max[c] = caixa_max[c].max(t.caixa_max[c]);
            cent_min[c] = cent_min[c].min(t.centroide[c]);
            cent_max[c] = cent_max[c].max(t.centroide[c]);
        }
    }
    let indice_no = nos.len();
    let quantidade = fim - inicio;
    if quantidade <= FOLHA_MAXIMA {
        nos.push(NoGpu {
            caixa_min,
            a: inicio as u32,
            caixa_max,
            n: quantidade as u32,
        });
        return profundidade;
    }
    let extensao = [0, 1, 2].map(|c| cent_max[c] - cent_min[c]);
    let eixo = if extensao[0] >= extensao[1] && extensao[0] >= extensao[2] {
        0
    } else if extensao[1] >= extensao[2] {
        1
    } else {
        2
    };
    ordem[inicio..fim].sort_unstable_by(|&a, &b| tris[a].centroide[eixo].total_cmp(&tris[b].centroide[eixo]));
    let meio = inicio + quantidade / 2;

    // Reserva o nó antes de recursar: o filho esquerdo cai em `indice_no + 1`.
    nos.push(NoGpu {
        caixa_min,
        a: 0,
        caixa_max,
        n: 0,
    });
    let prof_esq = construir_no(nos, ordem, tris, inicio, meio, profundidade + 1);
    let direita = nos.len();
    let prof_dir = construir_no(nos, ordem, tris, meio, fim, profundidade + 1);
    nos[indice_no].a = direita as u32;
    prof_esq.max(prof_dir)
}

/// Teste de caixa (slab), como no shader. `inv` é a direção inversa já segura.
fn caixa_atinge(no: &NoGpu, origem: [f32; 3], inv: [f32; 3], t_min: f32, t_max: f32) -> bool {
    let mut entrada = t_min;
    let mut saida = t_max;
    for c in 0..3 {
        let t1 = (no.caixa_min[c] - origem[c]) * inv[c];
        let t2 = (no.caixa_max[c] - origem[c]) * inv[c];
        entrada = entrada.max(t1.min(t2));
        saida = saida.min(t1.max(t2));
    }
    entrada <= saida
}

/// Möller-Trumbore, a mesma sequência de contas de `triangulo_hit` no shader.
fn triangulo_atinge(
    tri: &TrianguloGpu,
    origem: [f32; 3],
    direcao: [f32; 3],
    t_min: f32,
    t_max: f32,
) -> Option<(f32, f32, f32)> {
    let v0 = xyz(tri.v0);
    let e1 = sub(xyz(tri.v1), v0);
    let e2 = sub(xyz(tri.v2), v0);
    let p = produto_vetorial(direcao, e2);
    let det = produto_escalar(e1, p);
    if det.abs() < DETERMINANTE_MINIMO {
        return None;
    }
    let inv_det = 1.0 / det;
    let s = sub(origem, v0);
    let u = produto_escalar(s, p) * inv_det;
    if !(0.0..=1.0).contains(&u) {
        return None;
    }
    let q = produto_vetorial(s, e1);
    let v = produto_escalar(direcao, q) * inv_det;
    if v < 0.0 || u + v > 1.0 {
        return None;
    }
    let t = produto_escalar(e2, q) * inv_det;
    if t > t_min && t < t_max {
        Some((t, u, v))
    } else {
        None
    }
}

/// Inverso componente a componente, com as componentes nulas trocadas por um valor pequeno.
pub fn inverso_seguro(d: [f32; 3]) -> [f32; 3] {
    d.map(|c| {
        let seguro = if c.abs() < DIRECAO_MINIMA {
            DIRECAO_MINIMA.copysign(if c == 0.0 { 1.0 } else { c })
        } else {
            c
        };
        1.0 / seguro
    })
}

fn xyz(v: [f32; 4]) -> [f32; 3] {
    [v[0], v[1], v[2]]
}

fn com_w(v: [f32; 3]) -> [f32; 4] {
    [v[0], v[1], v[2], 0.0]
}

fn sub(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

fn produto_escalar(a: [f32; 3], b: [f32; 3]) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

fn produto_vetorial(a: [f32; 3], b: [f32; 3]) -> [f32; 3] {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}

fn normalizar(a: [f32; 3]) -> [f32; 3] {
    let c = produto_escalar(a, a).sqrt();
    if c < 1.0e-12 {
        [0.0, 0.0, 1.0]
    } else {
        [a[0] / c, a[1] / c, a[2] / c]
    }
}
