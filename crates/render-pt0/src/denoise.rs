//! Redução de ruído (fase 6 do protótipo): filtro À-Trous em compute WGSL (`denoise.wgsl`), guiado pelo
//! G-buffer do primeiro acerto que o passe 0 de `pt0.wgsl` grava (ponto e flag, normal e distância,
//! fator R).
//!
//! Fluxo, sobre o acumulado de N amostras (soma em RGB, contagem no alfa), e o acumulado de R (soma por
//! amostra do fator R do primeiro acerto, mesma contagem). R é o albedo difuso mais a cor do metal.
//! 1. desmodulação: média de radiância / média de R do pixel, só nos pixels filtráveis. As duas médias
//!    saem da mesma amostragem, então a textura dentro do pixel entra na razão (o R de uma amostra no centro
//!    errava nas texturas e nas arestas);
//! 2. `iteracoes` passos À-Trous com passo 2^i (1, 2, 4, 8, 16), B3 5x5 dilatado, peso = geometria x normal
//!    x luminância;
//! 3. no último passo, remodulação pela mesma média de R. A saída tem alfa 1, então `media_do_acumulado` a
//!    usa direto.
//!
//! Não filtrado (copiado): fundo (flag 1), vidro e metal com rugosidade até `LIMIAR_METAL_LISO` (flag 2),
//! e borda com fundo (flag 3): o pixel de antialias do contorno, média de subamostras do G-buffer, que
//! vizinhos filtráveis não devem apagar nem misturar.
//! Reflexo e refração nítidos, e o vidro tem ruído próprio (Fresnel sorteado) que o filtro não resolve.
//!
//! `filtrar_cpu` é o espelho em CPU, com a mesma aritmética do WGSL. `tests/denoise_wgsl.rs` compara os dois.

use bytemuck::{Pod, Zeroable};
use wgpu::util::DeviceExt;

const FONTE: &str = include_str!("denoise.wgsl");
const LADO_WORKGROUP: u32 = 8;
const FORMATO: wgpu::TextureFormat = wgpu::TextureFormat::Rgba32Float;
const EPS_LUMINANCIA: f32 = 1.0e-3;
const EPS_PLANO: f32 = 1.0e-9;

/// Pesos B3 de 1D (1, 4, 6, 4, 1) / 16 para os desvios -2..=2. Somam 1; o kernel 2D é o produto.
pub const PESOS_B3: [f32; 5] = [1.0 / 16.0, 4.0 / 16.0, 6.0 / 16.0, 4.0 / 16.0, 1.0 / 16.0];

/// Parâmetros do filtro. O i-ésimo passo usa passo 2^i, então `iteracoes` = 5 cobre 1 a 16 pixels.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Parametros {
    pub iteracoes: u32,
    /// Expoente do peso de normal: `(n_p . n_q)^sigma_normal`.
    pub sigma_normal: f32,
    /// Tolerância do plano tangente, em pegadas (distância * abertura * passo).
    pub sigma_plano: f32,
    /// Tolerância de luminância, em desvios locais da vizinhança 3x3 do passo de entrada.
    pub sigma_luminancia: f32,
}

/// Perfis de medição. Os valores são os medidos em `examples/denoise_casa.rs`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Perfil {
    /// Três passos (até 4 pixels de alcance): mais barato, mais borrão residual.
    Rapido,
    /// Cinco passos (até 16 pixels), padrão.
    Padrao,
}

impl Parametros {
    pub fn perfil(perfil: Perfil) -> Self {
        match perfil {
            Perfil::Rapido => Self {
                iteracoes: 3,
                sigma_normal: 32.0,
                sigma_plano: 1.0,
                sigma_luminancia: 2.0,
            },
            Perfil::Padrao => Self {
                iteracoes: 5,
                sigma_normal: 32.0,
                sigma_plano: 1.0,
                sigma_luminancia: 2.0,
            },
        }
    }
}

/// Entradas do filtro, por pixel (`y * largura + x`). `acumulado`: RGB soma e contagem no alfa.
/// `geo`: xyz ponto, w flag (0 filtra, 1 fundo, 2 preserva). `normal`: xyz normal, w distância do
/// primário. `acumulado_r`: soma do fator R por amostra (xyz) e contagem (w), como `acumulado`.
pub struct Entrada<'a> {
    pub largura: usize,
    pub altura: usize,
    pub acumulado: &'a [[f32; 4]],
    pub geo: &'a [[f32; 4]],
    pub normal: &'a [[f32; 4]],
    pub acumulado_r: &'a [[f32; 4]],
}

fn xyz(v: [f32; 4]) -> [f32; 3] {
    [v[0], v[1], v[2]]
}

fn lum(c: [f32; 3]) -> f32 {
    0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

fn produto(a: [f32; 3], b: [f32; 3]) -> f32 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/// Vizinho `(px + dx * passo, py + dy * passo)` se estiver na imagem e for filtrável (flag 0).
fn vizinho(e: &Entrada, px: usize, py: usize, dx: i64, dy: i64, passo: usize) -> Option<usize> {
    let qx = px as i64 + dx * passo as i64;
    let qy = py as i64 + dy * passo as i64;
    if qx < 0 || qy < 0 || qx >= e.largura as i64 || qy >= e.altura as i64 {
        return None;
    }
    let j = qy as usize * e.largura + qx as usize;
    (e.geo[j][3] == 0.0).then_some(j)
}

/// Média do fator R por pixel (soma do acumulado de R / contagem). Divisor e remodulação do denoise.
fn r_medio_de(e: &Entrada) -> Vec<[f32; 3]> {
    e.acumulado_r
        .iter()
        .map(|a| {
            let c = a[3].max(1.0);
            [a[0] / c, a[1] / c, a[2] / c]
        })
        .collect()
}

/// Um passo do À-Trous no pixel (px, py), com a aritmética de `denoise.wgsl` (modo 1, ou modo 2 com
/// `ultima`, que remodula por `r_medio`).
fn passo_pixel(
    x: &[[f32; 3]],
    e: &Entrada,
    p: &Parametros,
    abertura: f32,
    (px, py): (usize, usize),
    (passo, ultima): (usize, bool),
    r_medio: &[[f32; 3]],
) -> [f32; 3] {
    let i = py * e.largura + px;
    let xc = x[i];
    if e.geo[i][3] != 0.0 {
        return xc;
    }
    let pos_p = xyz(e.geo[i]);
    let n_p = xyz(e.normal[i]);
    let pegada = e.normal[i][3] * abertura * passo as f32;
    let lum_p = lum(xc);

    let (mut s1, mut s2, mut nv) = (0.0f32, 0.0f32, 0.0f32);
    for dy in -1..=1 {
        for dx in -1..=1 {
            if let Some(j) = vizinho(e, px, py, dx, dy, 1) {
                let l = lum(x[j]);
                s1 += l;
                s2 += l * l;
                nv += 1.0;
            }
        }
    }
    let media_l = s1 / nv;
    let desvio = (s2 / nv - media_l * media_l).max(0.0).sqrt();
    let tol_l = p.sigma_luminancia * desvio + EPS_LUMINANCIA;
    let tol_p = p.sigma_plano * pegada + EPS_PLANO;

    let mut acum = [0.0f32; 3];
    let mut total = 0.0f32;
    for dy in -2..=2i64 {
        for dx in -2..=2i64 {
            let Some(j) = vizinho(e, px, py, dx, dy, passo) else {
                continue;
            };
            let pos_q = xyz(e.geo[j]);
            let n_q = xyz(e.normal[j]);
            let xq = x[j];
            let dp = [pos_q[0] - pos_p[0], pos_q[1] - pos_p[1], pos_q[2] - pos_p[2]];
            let dplano = 0.5 * (produto(n_p, dp).abs() + produto(n_q, dp).abs());
            let wz = (-dplano / tol_p).exp();
            let wn = produto(n_p, n_q).max(1.0e-6).powf(p.sigma_normal);
            let wl = (-(lum(xq) - lum_p).abs() / tol_l).exp();
            let w = PESOS_B3[(dx + 2) as usize] * PESOS_B3[(dy + 2) as usize] * wz * wn * wl;
            for c in 0..3 {
                acum[c] += w * xq[c];
            }
            total += w;
        }
    }
    let mut saida = [acum[0] / total, acum[1] / total, acum[2] / total];
    if ultima {
        let r = r_medio[i];
        saida = [saida[0] * r[0], saida[1] * r[1], saida[2] * r[2]];
    }
    saida
}

/// Espelho em CPU de `denoise.wgsl`: desmodulação, `iteracoes` passos e remodulação. Devolve RGBA com
/// alfa 1, por pixel.
pub fn filtrar_cpu(e: &Entrada, p: &Parametros, abertura: f32) -> Vec<[f32; 4]> {
    let n = e.largura * e.altura;
    let r_medio = r_medio_de(e);
    let mut x: Vec<[f32; 3]> = (0..n)
        .map(|i| {
            let a = e.acumulado[i];
            let c = a[3].max(1.0);
            let v = [a[0] / c, a[1] / c, a[2] / c];
            if e.geo[i][3] == 0.0 {
                let r = r_medio[i];
                [v[0] / r[0], v[1] / r[1], v[2] / r[2]]
            } else {
                v
            }
        })
        .collect();
    let iteracoes = p.iteracoes.max(1);
    for i in 0..iteracoes {
        let ultima = i + 1 == iteracoes;
        let passo = 1usize << i;
        let mut saida = vec![[0.0f32; 3]; n];
        for py in 0..e.altura {
            for px in 0..e.largura {
                saida[py * e.largura + px] = passo_pixel(&x, e, p, abertura, (px, py), (passo, ultima), &r_medio);
            }
        }
        x = saida;
    }
    x.iter().map(|v| [v[0], v[1], v[2], 1.0]).collect()
}

#[repr(C)]
#[derive(Clone, Copy, Debug, Pod, Zeroable)]
struct ParamsGpu {
    /// largura, altura, passo, modo.
    dimensao: [u32; 4],
    /// expoente da normal, tolerância do plano, tolerância de luminância, abertura do pixel.
    sigmas: [f32; 4],
}

/// Vistas das entradas do filtro além do acumulado de radiância: geo e normal do G-buffer (bindings 11 e 12
/// de `pt0.wgsl`) e o acumulado de R (soma do fator R por amostra, mesma contagem).
pub struct GBufferVistas<'a> {
    pub geo: &'a wgpu::TextureView,
    pub normal: &'a wgpu::TextureView,
    pub acumulado_r: &'a wgpu::TextureView,
}

/// Recursos GPU do denoise: pipeline, duas texturas intermediárias e a saída.
pub struct DenoiseGpu {
    pipeline: wgpu::ComputePipeline,
    layout: wgpu::BindGroupLayout,
    texturas: [wgpu::Texture; 3],
    vistas: [wgpu::TextureView; 3],
    largura: u32,
    altura: u32,
}

impl DenoiseGpu {
    pub fn criar(dispositivo: &wgpu::Device, largura: u32, altura: u32) -> Self {
        let modulo = dispositivo.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("denoise.wgsl"),
            source: wgpu::ShaderSource::Wgsl(FONTE.into()),
        });
        let textura_leitura = |binding: u32| wgpu::BindGroupLayoutEntry {
            binding,
            visibility: wgpu::ShaderStages::COMPUTE,
            ty: wgpu::BindingType::Texture {
                sample_type: wgpu::TextureSampleType::Float { filterable: false },
                view_dimension: wgpu::TextureViewDimension::D2,
                multisampled: false,
            },
            count: None,
        };
        let layout = dispositivo.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("denoise-layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                textura_leitura(1),
                textura_leitura(2),
                textura_leitura(3),
                textura_leitura(4),
                wgpu::BindGroupLayoutEntry {
                    binding: 5,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::StorageTexture {
                        access: wgpu::StorageTextureAccess::WriteOnly,
                        format: FORMATO,
                        view_dimension: wgpu::TextureViewDimension::D2,
                    },
                    count: None,
                },
            ],
        });
        let pl = dispositivo.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("denoise-pipeline-layout"),
            bind_group_layouts: &[Some(&layout)],
            immediate_size: 0,
        });
        let pipeline = dispositivo.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("denoise-compute"),
            layout: Some(&pl),
            module: &modulo,
            entry_point: Some("main"),
            compilation_options: Default::default(),
            cache: None,
        });
        let criar = |rotulo: &str| {
            dispositivo.create_texture(&wgpu::TextureDescriptor {
                label: Some(rotulo),
                size: wgpu::Extent3d {
                    width: largura,
                    height: altura,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: FORMATO,
                usage: wgpu::TextureUsages::TEXTURE_BINDING
                    | wgpu::TextureUsages::STORAGE_BINDING
                    | wgpu::TextureUsages::COPY_SRC,
                view_formats: &[],
            })
        };
        let texturas = [criar("denoise-a"), criar("denoise-b"), criar("denoise-saida")];
        let vistas = [
            texturas[0].create_view(&wgpu::TextureViewDescriptor::default()),
            texturas[1].create_view(&wgpu::TextureViewDescriptor::default()),
            texturas[2].create_view(&wgpu::TextureViewDescriptor::default()),
        ];
        Self {
            pipeline,
            layout,
            texturas,
            vistas,
            largura,
            altura,
        }
    }

    /// Roda a desmodulação, os `iteracoes` passos e a remodulação, numa só submissão. Não espera a GPU:
    /// quem precisa do resultado chama `ler` (que espera). `acumulado` é a textura de soma e contagem.
    pub fn executar(
        &self,
        dispositivo: &wgpu::Device,
        fila: &wgpu::Queue,
        acumulado: &wgpu::TextureView,
        gbuffer: GBufferVistas,
        p: &Parametros,
        abertura: f32,
    ) {
        let iteracoes = p.iteracoes.max(1);
        // (entrada, índice da saída, passo, modo). Ping-pong entre 0 e 1; a última vai para 2.
        let mut passos: Vec<(&wgpu::TextureView, usize, u32, u32)> = vec![(acumulado, 0, 1, 0)];
        for i in 0..iteracoes {
            let ultima = i + 1 == iteracoes;
            let entrada = &self.vistas[(i % 2) as usize];
            let saida = if ultima {
                2
            } else if i % 2 == 0 {
                1
            } else {
                0
            };
            passos.push((entrada, saida, 1 << i, if ultima { 2 } else { 1 }));
        }

        let mut codificador = dispositivo.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("denoise-cmd"),
        });
        for (entrada, saida, passo, modo) in passos {
            let params = ParamsGpu {
                dimensao: [self.largura, self.altura, passo, modo],
                sigmas: [p.sigma_normal, p.sigma_plano, p.sigma_luminancia, abertura],
            };
            let uniforme = dispositivo.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: Some("denoise-parametros"),
                contents: bytemuck::bytes_of(&params),
                usage: wgpu::BufferUsages::UNIFORM,
            });
            let grupo = dispositivo.create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("denoise-grupo"),
                layout: &self.layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: uniforme.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::TextureView(entrada),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: wgpu::BindingResource::TextureView(gbuffer.geo),
                    },
                    wgpu::BindGroupEntry {
                        binding: 3,
                        resource: wgpu::BindingResource::TextureView(gbuffer.normal),
                    },
                    wgpu::BindGroupEntry {
                        binding: 4,
                        resource: wgpu::BindingResource::TextureView(gbuffer.acumulado_r),
                    },
                    wgpu::BindGroupEntry {
                        binding: 5,
                        resource: wgpu::BindingResource::TextureView(&self.vistas[saida]),
                    },
                ],
            });
            let mut passe = codificador.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("denoise-passe"),
                timestamp_writes: None,
            });
            passe.set_pipeline(&self.pipeline);
            passe.set_bind_group(0, &grupo, &[]);
            passe.dispatch_workgroups(
                self.largura.div_ceil(LADO_WORKGROUP),
                self.altura.div_ceil(LADO_WORKGROUP),
                1,
            );
        }
        fila.submit(Some(codificador.finish()));
    }

    /// Resultado da última `executar`: RGBA32F com alfa 1, `largura * altura * 4` floats. Espera a GPU.
    pub fn ler(&self, dispositivo: &wgpu::Device, fila: &wgpu::Queue) -> Result<Vec<f32>, String> {
        crate::gpu::ler_rgba32f(dispositivo, fila, &self.texturas[2], self.largura, self.altura)
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    fn parametros(iteracoes: u32) -> Parametros {
        Parametros {
            iteracoes,
            sigma_normal: 32.0,
            sigma_plano: 1.0,
            sigma_luminancia: 2.0,
        }
    }

    /// Campos de uma imagem de teste: acumulado, geo, normal e acumulado de R.
    type Campos = (Vec<[f32; 4]>, Vec<[f32; 4]>, Vec<[f32; 4]>, Vec<[f32; 4]>);

    /// Imagem plana (plano z = 0, normal +Z, distância 5 m), toda filtrável, acumulado com N = 16. O
    /// acumulado de R é a soma de N amostras iguais a `r`.
    fn plano(largura: usize, altura: usize, valor: [f32; 3], r: [f32; 3]) -> Campos {
        let n = largura * altura;
        let mut acum = Vec::with_capacity(n);
        let mut geo = Vec::with_capacity(n);
        let mut normal = Vec::with_capacity(n);
        let mut alb = Vec::with_capacity(n);
        for y in 0..altura {
            for x in 0..largura {
                acum.push([valor[0] * 16.0, valor[1] * 16.0, valor[2] * 16.0, 16.0]);
                geo.push([x as f32 * 0.02, y as f32 * 0.02, 0.0, 0.0]);
                normal.push([0.0, 0.0, 1.0, 5.0]);
                alb.push([r[0] * 16.0, r[1] * 16.0, r[2] * 16.0, 16.0]);
            }
        }
        (acum, geo, normal, alb)
    }

    #[test]
    fn pesos_b3_somam_um() {
        let soma: f32 = PESOS_B3.iter().sum();
        assert!((soma - 1.0).abs() < 1.0e-6, "soma 1D = {soma}");
        let soma2d: f32 = PESOS_B3.iter().map(|a| PESOS_B3.iter().map(|b| a * b).sum::<f32>()).sum();
        assert!((soma2d - 1.0).abs() < 1.0e-6, "soma 2D = {soma2d}");
        // Os pesos do filtro (peso_b3 do WGSL, aqui PESOS_B3) são simétricos em torno do centro.
        assert_eq!(PESOS_B3[0], PESOS_B3[4]);
        assert_eq!(PESOS_B3[1], PESOS_B3[3]);
    }

    #[test]
    fn imagem_constante_nao_muda() {
        let (acum, geo, normal, alb) = plano(12, 9, [0.3, 0.6, 0.2], [0.5, 0.7, 0.4]);
        let e = Entrada {
            largura: 12,
            altura: 9,
            acumulado: &acum,
            geo: &geo,
            normal: &normal,
            acumulado_r: &alb,
        };
        for iteracoes in [1, 3, 5] {
            let saida = filtrar_cpu(&e, &parametros(iteracoes), 0.001);
            for (i, px) in saida.iter().enumerate() {
                for c in 0..3 {
                    let esperado = [0.3f32, 0.6, 0.2][c];
                    assert!(
                        (px[c] - esperado).abs() < 1.0e-5,
                        "passos {iteracoes}, pixel {i}, canal {c}: {} != {esperado}",
                        px[c]
                    );
                }
                assert_eq!(px[3], 1.0);
            }
        }
    }

    #[test]
    fn borda_de_normal_nao_e_atravessada() {
        // Esquerda (x < 8): normal +Z, valor 0,2. Direita (x >= 8): normal +X, valor 1,0. Mesmo acumulado
        // em todos os pixels, então a diferença só pode ser atravessada se o peso de normal deixar.
        let (largura, altura) = (16usize, 16usize);
        let n = largura * altura;
        let mut acum = vec![[0.0f32; 4]; n];
        let mut geo = vec![[0.0f32; 4]; n];
        let mut normal = vec![[0.0f32; 4]; n];
        // R = 0,5 em 16 amostras.
        let alb = vec![[8.0f32, 8.0, 8.0, 16.0]; n];
        for y in 0..altura {
            for x in 0..largura {
                let i = y * largura + x;
                let (valor, nrm) = if x < 8 { (0.2f32, [0.0, 0.0, 1.0]) } else { (1.0, [1.0, 0.0, 0.0]) };
                acum[i] = [valor * 16.0 * 0.5, valor * 16.0 * 0.5, valor * 16.0 * 0.5, 16.0];
                geo[i] = [x as f32 * 0.02, y as f32 * 0.02, 0.0, 0.0];
                normal[i] = [nrm[0], nrm[1], nrm[2], 5.0];
            }
        }
        let e = Entrada {
            largura,
            altura,
            acumulado: &acum,
            geo: &geo,
            normal: &normal,
            acumulado_r: &alb,
        };
        let saida = filtrar_cpu(&e, &parametros(5), 0.001);
        for y in 0..altura {
            for x in 0..largura {
                let v = saida[y * largura + x][0];
                // Radiância = valor * R (R = 0,5): 0,2 * 0,5 à esquerda e 1,0 * 0,5 à direita.
                let esperado = if x < 8 { 0.1 } else { 0.5 };
                assert!(
                    (v - esperado).abs() < 1.0e-4,
                    "pixel ({x},{y}): {v} != {esperado}: a borda de normal foi atravessada"
                );
            }
        }
    }

    #[test]
    fn fundo_e_preservado() {
        let (mut acum, mut geo, normal, alb) = plano(8, 1, [0.4, 0.4, 0.4], [1.0, 1.0, 1.0]);
        // Último pixel é fundo: valor 0,9 não pode vazar para os vizinhos, nem ser alterado.
        acum[7] = [0.9 * 16.0, 0.9 * 16.0, 0.9 * 16.0, 16.0];
        geo[7][3] = 1.0;
        let e = Entrada {
            largura: 8,
            altura: 1,
            acumulado: &acum,
            geo: &geo,
            normal: &normal,
            acumulado_r: &alb,
        };
        let saida = filtrar_cpu(&e, &parametros(3), 0.001);
        assert!((saida[7][0] - 0.9).abs() < 1.0e-6, "fundo alterado: {}", saida[7][0]);
        for (x, px) in saida.iter().enumerate().take(7) {
            assert!((px[0] - 0.4).abs() < 1.0e-5, "pixel {x} recebeu o fundo: {}", px[0]);
        }
    }

    #[test]
    fn remodulacao_usa_a_media_de_r_de_cada_pixel() {
        // Radiância constante (I = 0,6 por amostra) e textura que varia dentro de cada pixel: pixel par com
        // 4 amostras de R (média 0,5), ímpar com 2 (média 0,25). A soma de radiância é I x soma de R. A saída
        // tem de ser I x média de R, pixel a pixel; uma só amostra de R daria outro valor.
        let (largura, altura) = (8usize, 8usize);
        let n = largura * altura;
        let mut acum = vec![[0.0f32; 4]; n];
        let mut geo = vec![[0.0f32; 4]; n];
        let mut normal = vec![[0.0f32; 4]; n];
        let mut acum_r = vec![[0.0f32; 4]; n];
        for y in 0..altura {
            for x in 0..largura {
                let i = y * largura + x;
                let par = (x + y) % 2 == 0;
                let rs: &[f32] = if par { &[0.1, 0.9, 0.3, 0.7] } else { &[0.1, 0.4] };
                let contagem = rs.len() as f32;
                let soma_r: f32 = rs.iter().sum();
                acum[i] = [0.6 * soma_r, 0.6 * soma_r, 0.6 * soma_r, contagem];
                acum_r[i] = [soma_r, soma_r, soma_r, contagem];
                geo[i] = [x as f32 * 0.02, y as f32 * 0.02, 0.0, 0.0];
                normal[i] = [0.0, 0.0, 1.0, 5.0];
            }
        }
        let e = Entrada {
            largura,
            altura,
            acumulado: &acum,
            geo: &geo,
            normal: &normal,
            acumulado_r: &acum_r,
        };
        let saida = filtrar_cpu(&e, &parametros(3), 0.001);
        for y in 0..altura {
            for x in 0..largura {
                let media_r = if (x + y) % 2 == 0 { 0.5 } else { 0.25 };
                let esperado = 0.6 * media_r;
                let v = saida[y * largura + x][0];
                assert!((v - esperado).abs() < 1.0e-5, "pixel ({x},{y}): {v} != {esperado}");
            }
        }
    }

    #[test]
    fn borda_com_fundo_mantem_o_pixel_de_antialias() {
        // Linha de pixels filtráveis com 0,52 e um pixel de borda com fundo (flag 3) de 0,34: o antialias do
        // contorno com o céu. A borda sai igual ao cru, e não entra na média dos vizinhos (que ficam em 0,52).
        let (mut acum, mut geo, normal, alb) = plano(8, 1, [0.52, 0.52, 0.52], [1.0, 1.0, 1.0]);
        acum[4] = [0.34 * 16.0, 0.34 * 16.0, 0.34 * 16.0, 16.0];
        geo[4][3] = 3.0;
        let e = Entrada {
            largura: 8,
            altura: 1,
            acumulado: &acum,
            geo: &geo,
            normal: &normal,
            acumulado_r: &alb,
        };
        let saida = filtrar_cpu(&e, &parametros(5), 0.001);
        assert!((saida[4][0] - 0.34).abs() < 1.0e-6, "borda alterada: {}", saida[4][0]);
        for (x, px) in saida.iter().enumerate().filter(|(x, _)| *x != 4) {
            assert!((px[0] - 0.52).abs() < 1.0e-5, "pixel {x} misturou a borda: {}", px[0]);
        }
    }
}
