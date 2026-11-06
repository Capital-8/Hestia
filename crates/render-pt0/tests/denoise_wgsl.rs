//! O denoise em WGSL (`denoise.wgsl`) bate com o espelho em CPU (`denoise::filtrar_cpu`) numa imagem
//! sintética: dois planos com aresta de normal, um pixel de fundo, um de vidro (flag 2) e contagens de
//! amostra diferentes. Roda na GPU real; sem adaptador de hardware, o teste avisa e passa sem comparar.

use render_pt0::denoise::{filtrar_cpu, DenoiseGpu, Entrada, GBufferVistas, Parametros};
use render_pt0::gpu::criar_dispositivo;

const LARGURA: usize = 24;
const ALTURA: usize = 16;

/// Gerador determinístico (LCG) para os valores de teste, sem depender de crate de aleatório.
fn aleatorio(semente: &mut u32) -> f32 {
    *semente = semente.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
    (*semente >> 8) as f32 / (1u32 << 24) as f32
}

/// Cena sintética. Esquerda (x < 12): plano z = 0, normal +Z. Direita: plano x = 0,24, normal +X. Os
/// pontos seguem o plano de cada lado, então a aresta é geometricamente real.
/// Acumulado, geo, normal e albedo da cena sintética.
type Campos = (Vec<[f32; 4]>, Vec<[f32; 4]>, Vec<[f32; 4]>, Vec<[f32; 4]>);

fn cena() -> Campos {
    let mut semente = 7u32;
    let n = LARGURA * ALTURA;
    let (mut acum, mut geo, mut normal, mut alb) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
    for y in 0..ALTURA {
        for x in 0..LARGURA {
            let contagem = [4.0f32, 8.0, 16.0][(aleatorio(&mut semente) * 3.0) as usize % 3];
            let valor = 0.2 + 0.8 * aleatorio(&mut semente);
            let r = [
                0.3 + 0.6 * aleatorio(&mut semente),
                0.3 + 0.6 * aleatorio(&mut semente),
                0.3 + 0.6 * aleatorio(&mut semente),
            ];
            acum.push([valor * contagem, valor * contagem * 0.8, valor * contagem * 0.6, contagem]);
            let (ponto, nrm) = if x < 12 {
                ([x as f32 * 0.02, y as f32 * 0.02, 0.0], [0.0, 0.0, 1.0])
            } else {
                ([0.24, y as f32 * 0.02, (x - 12) as f32 * 0.02], [1.0, 0.0, 0.0])
            };
            // Vidro em (5, 5) e fundo em (20, 3). O fundo tem distância zero, como no G-buffer.
            let flag = if (x, y) == (5, 5) {
                2.0
            } else if (x, y) == (20, 3) {
                1.0
            } else {
                0.0
            };
            let distancia = if flag == 1.0 { 0.0 } else { 5.0 };
            geo.push([ponto[0], ponto[1], ponto[2], flag]);
            normal.push([nrm[0], nrm[1], nrm[2], distancia]);
            alb.push([r[0], r[1], r[2], 0.0]);
        }
    }
    assert_eq!(acum.len(), n);
    (acum, geo, normal, alb)
}

fn textura(dispositivo: &wgpu::Device, fila: &wgpu::Queue, rotulo: &str, dados: &[[f32; 4]]) -> wgpu::Texture {
    let tamanho = wgpu::Extent3d {
        width: LARGURA as u32,
        height: ALTURA as u32,
        depth_or_array_layers: 1,
    };
    let t = dispositivo.create_texture(&wgpu::TextureDescriptor {
        label: Some(rotulo),
        size: tamanho,
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba32Float,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    fila.write_texture(
        t.as_image_copy(),
        bytemuck::cast_slice(dados),
        wgpu::TexelCopyBufferLayout {
            offset: 0,
            bytes_per_row: Some(LARGURA as u32 * 16),
            rows_per_image: Some(ALTURA as u32),
        },
        tamanho,
    );
    t
}

#[test]
fn denoise_wgsl_bate_com_o_espelho_em_cpu() {
    let (_, dispositivo, fila) = match criar_dispositivo() {
        Ok(v) => v,
        Err(erro) => {
            eprintln!("denoise_wgsl: {erro}; teste ignorado");
            return;
        }
    };
    let (acum, geo, normal, alb) = cena();
    let abertura = 0.001f32;

    let t_acum = textura(&dispositivo, &fila, "teste-acumulado", &acum);
    let t_geo = textura(&dispositivo, &fila, "teste-geo", &geo);
    let t_normal = textura(&dispositivo, &fila, "teste-normal", &normal);
    let t_alb = textura(&dispositivo, &fila, "teste-albedo", &alb);
    let v_acum = t_acum.create_view(&wgpu::TextureViewDescriptor::default());
    let v_geo = t_geo.create_view(&wgpu::TextureViewDescriptor::default());
    let v_normal = t_normal.create_view(&wgpu::TextureViewDescriptor::default());
    let v_alb = t_alb.create_view(&wgpu::TextureViewDescriptor::default());
    let gpu = DenoiseGpu::criar(&dispositivo, LARGURA as u32, ALTURA as u32);

    for iteracoes in [1u32, 3, 5] {
        let p = Parametros {
            iteracoes,
            sigma_normal: 32.0,
            sigma_plano: 1.0,
            sigma_luminancia: 2.0,
        };
        gpu.executar(
            &dispositivo,
            &fila,
            &v_acum,
            GBufferVistas {
                geo: &v_geo,
                normal: &v_normal,
                albedo: &v_alb,
            },
            &p,
            abertura,
        );
        let saida_gpu = gpu.ler(&dispositivo, &fila).expect("leitura do denoise");
        let saida_cpu = filtrar_cpu(
            &Entrada {
                largura: LARGURA,
                altura: ALTURA,
                acumulado: &acum,
                geo: &geo,
                normal: &normal,
                albedo: &alb,
            },
            &p,
            abertura,
        );
        for (i, cpu) in saida_cpu.iter().enumerate() {
            for c in 0..4 {
                let g = saida_gpu[i * 4 + c];
                let r = cpu[c];
                assert!(
                    (g - r).abs() <= 1.0e-4 * r.abs().max(1.0),
                    "passos {iteracoes}, pixel {i}, canal {c}: GPU {g} CPU {r}"
                );
            }
        }
    }
}
