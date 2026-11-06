//! Texturas de material no protótipo (fase 5): arrays por mapa, amostragem triplanar e nível de mip.
//!
//! Montagem copiada de `crates/render-engine/src/texturas.rs`, só o necessário: `Plano::planejar`,
//! `media_linear_rgb`, `redimensionar_bilinear`, `cadeia_de_mips`, `niveis_no_tamanho_comum`,
//! `criar_array` e `bytes_do_array`. É cópia, não dependência: o build do pt0 não pode depender de
//! `render-engine`, que muda em outras frentes (cascatas de sombra) enquanto esta fase roda. Se a
//! montagem mudar lá (tamanho comum, mips de 2x2, média linear do albedo), mudar aqui também.
//!
//! O que é o mesmo do motor de rasterização:
//! - Montagem: uma camada por textura usada em cada mapa, tamanho comum, cadeia completa de mips,
//!   média linear RGB do albedo por camada.
//! - Sombreamento (em `pt0.wgsl`): triplanar em espaço do mundo com pesos |n|^4; uma repetição do
//!   padrão a cada `escala` metros; albedo = cor do material * (textura linear / média); whiteout
//!   triplanar para a normal de mapa; rugosidade e metálico pelo canal R, com o mesmo limite de 0,04.
//!
//! O que é diferente (e por quê):
//! - Nível de mip. A rasterização usa derivadas (`dpdx`/`dpdy`); compute não tem derivadas, então o
//!   pt0 escolhe o mip pela distância do raio (ver [`lod_da_distancia`]) e amostra com
//!   `textureSampleLevel`. Aproximação: a abertura do pixel é o ângulo entre dois raios vizinhos no
//!   centro da imagem, e a distância é o caminho percorrido desde a câmera até o acerto. Nos rebotes a
//!   área real do feixe não é essa; a conta só cresce com a distância.
//! - Anisotropia: a rasterização usa 8x quando o adaptador tem; o pt0 usa 1x (sem derivadas).
//! - Vidro: não recebe textura, como no motor (`fs_vidro` não amostra os mapas).
//! - Redimensionamento: a cópia é bilinear sem filtro de área, como a original (reduzir é uma média
//!   ponderada, não um filtro de caixa).

use std::borrow::Cow;

use render_core::cena::{Cena, Material, Textura, SEM_TEXTURA};

/// Mapas de material, na ordem do campo `texturas` de `Material`: albedo, normal, rugosidade e metálico.
pub const MAPAS: usize = 4;

/// Nomes dos mapas, na mesma ordem de `MAPAS`.
pub const NOMES_MAPAS: [&str; MAPAS] = ["albedo", "normal", "rugosidade", "metálico"];

/// Formato dos arrays. Sem sRGB: a decodificação é do shader, como no motor.
const FORMATO_TEXTURA_MATERIAL: wgpu::TextureFormat = wgpu::TextureFormat::Rgba8Unorm;

/// Camada marcada para "este mapa não usa textura" (vai para `MaterialGpu::texturas`).
pub const SEM_CAMADA: u32 = u32::MAX;

/// Plano de uma cena: tamanho comum, camadas de cada mapa e média do albedo por camada.
#[derive(Debug, Clone, PartialEq)]
pub struct Plano {
    pub largura: u32,
    pub altura: u32,
    /// Cadeia completa de mips do tamanho comum (cada camada tem todos os níveis).
    pub niveis: u32,
    /// Por mapa: índice, na lista de texturas da cena, de cada camada. A camada `i` do mapa `m` é a
    /// textura `camadas[m][i]`.
    pub camadas: [Vec<u32>; MAPAS],
    /// Média linear RGB de cada camada de albedo (ver `media_linear_rgb`).
    pub medias_albedo: Vec<[f32; 3]>,
}

impl Plano {
    /// Monta o plano da cena. Cada mapa ganha uma camada por textura que algum material usa nesse mapa,
    /// na ordem do índice da cena. Erro explícito se um material aponta para uma textura que não existe
    /// ou se um mapa precisa de mais camadas que `limite_camadas` (`max_texture_array_layers`).
    pub fn planejar(texturas: &[Textura], materiais: &[Material], limite_camadas: u32) -> Result<Plano, String> {
        let n = texturas.len();
        let mut usada: [Vec<bool>; MAPAS] = std::array::from_fn(|_| vec![false; n]);
        for material in materiais {
            for (mapa, indice) in material.texturas.iter().enumerate() {
                if let Some(i) = *indice {
                    let i = i as usize;
                    if i >= n {
                        return Err(format!("material usa a textura {i}, mas a cena tem {n} texturas"));
                    }
                    usada[mapa][i] = true;
                }
            }
        }

        let mut camadas: [Vec<u32>; MAPAS] = std::array::from_fn(|_| Vec::new());
        for mapa in 0..MAPAS {
            for (i, &em_uso) in usada[mapa].iter().enumerate() {
                if em_uso {
                    camadas[mapa].push(i as u32);
                }
            }
            let precisa = camadas[mapa].len() as u32;
            if precisa > limite_camadas {
                return Err(format!(
                    "a cena usa {precisa} texturas de {} (um array por mapa), mas a placa aceita \
                     até {limite_camadas} camadas por array (max_texture_array_layers)",
                    NOMES_MAPAS[mapa]
                ));
            }
        }

        // Tamanho comum: o maior lado entre as texturas que algum material usa.
        let (mut largura, mut altura) = (1u32, 1u32);
        for (i, textura) in texturas.iter().enumerate() {
            if usada.iter().any(|mapa| mapa[i]) {
                largura = largura.max(textura.largura);
                altura = altura.max(textura.altura);
            }
        }

        let medias_albedo = camadas[0]
            .iter()
            .map(|&i| media_linear_rgb(&texturas[i as usize].niveis[0]))
            .collect();

        Ok(Plano {
            largura,
            altura,
            niveis: Textura::niveis_completos(largura, altura),
            camadas,
            medias_albedo,
        })
    }

    /// Bytes na GPU de um array de `camadas` camadas deste plano (todos os níveis de mip).
    pub fn bytes_do_array(&self, camadas: u32) -> u64 {
        let mut por_camada = 0u64;
        for nivel in 0..self.niveis {
            let (w, h) = Textura::dimensoes_do_nivel(self.largura, self.altura, nivel);
            por_camada += u64::from(w) * u64::from(h) * 4;
        }
        por_camada * u64::from(camadas)
    }
}

/// Média linear RGB de um nível RGBA8 codificado em sRGB (o alfa não entra). Cada canal é decodificado
/// como o shader faz (a fórmula sRGB exata, por tabela de 256 entradas) e depois tira-se a média dos
/// texels. Sem texels, devolve branco, para que a divisão do shader não zere a cor.
pub fn media_linear_rgb(nivel: &[u8]) -> [f32; 3] {
    let tabela: [f64; 256] = std::array::from_fn(|byte| {
        let c = byte as f64 / 255.0;
        if c <= 0.04045 {
            c / 12.92
        } else {
            ((c + 0.055) / 1.055).powf(2.4)
        }
    });
    let mut soma = [0f64; 3];
    let mut texels = 0u64;
    for texel in nivel.chunks_exact(4) {
        for (canal, acumulado) in soma.iter_mut().enumerate() {
            *acumulado += tabela[usize::from(texel[canal])];
        }
        texels += 1;
    }
    if texels == 0 {
        return [1.0; 3];
    }
    soma.map(|s| (s / texels as f64) as f32)
}

/// Redimensiona uma imagem RGBA8 para `(dw, dh)` por interpolação bilinear, com o centro do texel como
/// referência. Feito na CPU, uma vez por textura e por cena.
pub fn redimensionar_bilinear(origem: &[u8], lw: u32, lh: u32, dw: u32, dh: u32) -> Vec<u8> {
    let escala_x = lw as f32 / dw as f32;
    let escala_y = lh as f32 / dh as f32;
    let colunas: Vec<(usize, usize, f32)> = (0..dw)
        .map(|x| {
            let f = ((x as f32 + 0.5) * escala_x - 0.5).clamp(0.0, (lw - 1) as f32);
            let x0 = f.floor() as usize;
            let x1 = (x0 + 1).min(lw as usize - 1);
            (x0, x1, f - x0 as f32)
        })
        .collect();
    let linhas: Vec<(usize, usize, f32)> = (0..dh)
        .map(|y| {
            let f = ((y as f32 + 0.5) * escala_y - 0.5).clamp(0.0, (lh - 1) as f32);
            let y0 = f.floor() as usize;
            let y1 = (y0 + 1).min(lh as usize - 1);
            (y0, y1, f - y0 as f32)
        })
        .collect();

    let largura_origem = lw as usize;
    let mut saida = vec![0u8; dw as usize * dh as usize * 4];
    for (y, &(y0, y1, ty)) in linhas.iter().enumerate() {
        for (x, &(x0, x1, tx)) in colunas.iter().enumerate() {
            let p00 = (y0 * largura_origem + x0) * 4;
            let p01 = (y0 * largura_origem + x1) * 4;
            let p10 = (y1 * largura_origem + x0) * 4;
            let p11 = (y1 * largura_origem + x1) * 4;
            let destino = (y * dw as usize + x) * 4;
            for c in 0..4 {
                let topo = f32::from(origem[p00 + c]) * (1.0 - tx) + f32::from(origem[p01 + c]) * tx;
                let base = f32::from(origem[p10 + c]) * (1.0 - tx) + f32::from(origem[p11 + c]) * tx;
                let v = topo * (1.0 - ty) + base * ty;
                saida[destino + c] = (v + 0.5).clamp(0.0, 255.0) as u8;
            }
        }
    }
    saida
}

/// Cadeia de mips de `base` (nível 0, `largura` x `altura`) com `niveis` níveis. Cada nível novo é a
/// média de 2x2 texels do anterior; na borda, o último texel é repetido.
pub fn cadeia_de_mips(base: Vec<u8>, largura: u32, altura: u32, niveis: u32) -> Vec<Vec<u8>> {
    let mut cadeia: Vec<Vec<u8>> = vec![base];
    for nivel in 1..niveis {
        let (w0, h0) = Textura::dimensoes_do_nivel(largura, altura, nivel - 1);
        let (w1, h1) = Textura::dimensoes_do_nivel(largura, altura, nivel);
        let saida = {
            let anterior = &cadeia[(nivel - 1) as usize];
            let mut saida = vec![0u8; (w1 * h1 * 4) as usize];
            for y in 0..h1 {
                for x in 0..w1 {
                    for c in 0..4u32 {
                        let mut soma = 0u32;
                        for (dx, dy) in [(0, 0), (1, 0), (0, 1), (1, 1)] {
                            let sx = (2 * x + dx).min(w0 - 1);
                            let sy = (2 * y + dy).min(h0 - 1);
                            soma += u32::from(anterior[((sy * w0 + sx) * 4 + c) as usize]);
                        }
                        saida[((y * w1 + x) * 4 + c) as usize] = ((soma + 2) / 4) as u8;
                    }
                }
            }
            saida
        };
        cadeia.push(saida);
    }
    cadeia
}

/// Níveis de uma textura no tamanho comum do plano. Os níveis originais servem quando a textura já tem o
/// tamanho comum e a cadeia completa; senão, a cadeia é gerada a partir do nível 0.
fn niveis_no_tamanho_comum<'a>(textura: &'a Textura, plano: &Plano) -> Vec<Cow<'a, [u8]>> {
    let mesmo_tamanho = textura.largura == plano.largura && textura.altura == plano.altura;
    if mesmo_tamanho && textura.niveis.len() as u32 == plano.niveis {
        return textura.niveis.iter().map(|n| Cow::Borrowed(n.as_slice())).collect();
    }
    let base = if mesmo_tamanho {
        textura.niveis[0].clone()
    } else {
        redimensionar_bilinear(&textura.niveis[0], textura.largura, textura.altura, plano.largura, plano.altura)
    };
    cadeia_de_mips(base, plano.largura, plano.altura, plano.niveis)
        .into_iter()
        .map(Cow::Owned)
        .collect()
}

/// Cria o array de um mapa: uma camada por textura de `texturas` (na ordem do plano), todas no tamanho
/// comum, com a cadeia completa de mips. `texturas` não pode estar vazia.
pub fn criar_array(
    device: &wgpu::Device,
    queue: &wgpu::Queue,
    rotulo: &str,
    plano: &Plano,
    texturas: &[&Textura],
) -> wgpu::Texture {
    let textura_gpu = device.create_texture(&wgpu::TextureDescriptor {
        label: Some(rotulo),
        size: wgpu::Extent3d {
            width: plano.largura,
            height: plano.altura,
            depth_or_array_layers: texturas.len() as u32,
        },
        mip_level_count: plano.niveis,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: FORMATO_TEXTURA_MATERIAL,
        usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
        view_formats: &[],
    });
    for (camada, textura) in texturas.iter().enumerate() {
        for (nivel, pixels) in niveis_no_tamanho_comum(textura, plano).iter().enumerate() {
            let (largura, altura) = Textura::dimensoes_do_nivel(plano.largura, plano.altura, nivel as u32);
            queue.write_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &textura_gpu,
                    mip_level: nivel as u32,
                    origin: wgpu::Origin3d {
                        x: 0,
                        y: 0,
                        z: camada as u32,
                    },
                    aspect: wgpu::TextureAspect::All,
                },
                pixels,
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(largura * 4),
                    rows_per_image: Some(altura),
                },
                wgpu::Extent3d {
                    width: largura,
                    height: altura,
                    depth_or_array_layers: 1,
                },
            );
        }
    }
    textura_gpu
}

/// Texturas da cena na GPU: um array por mapa (albedo, normal, rugosidade, metálico), o plano que as
/// descreve e o amostrador (repetição, filtro linear, mip linear).
pub struct MapasGpu {
    pub plano: Plano,
    /// Texturas que sustentam as vistas. Mantidas vivas enquanto o protótipo existir.
    pub arrays: [wgpu::Texture; MAPAS],
    pub vistas: [wgpu::TextureView; MAPAS],
    pub amostrador: wgpu::Sampler,
    /// Bytes na GPU dos quatro arrays (todos os níveis de mip). Mapa sem textura conta um placeholder de
    /// 1 texel.
    pub bytes: u64,
}

impl MapasGpu {
    /// Monta o plano da cena e sobe os quatro arrays. Erro (não fallback) se a cena usa mais camadas do que
    /// a placa aceita ou se um material aponta para uma textura que não existe.
    pub fn criar(
        dispositivo: &wgpu::Device,
        fila: &wgpu::Queue,
        cena: &Cena,
        limite_camadas: u32,
    ) -> Result<Self, String> {
        let plano = Plano::planejar(&cena.texturas, &cena.materiais, limite_camadas)?;
        let mut bytes = 0u64;
        let arrays: [wgpu::Texture; MAPAS] = std::array::from_fn(|mapa| {
            let usados = &plano.camadas[mapa];
            if usados.is_empty() {
                // Sem textura neste mapa: o shader nunca amostra (camada SEM_CAMADA), então um texel basta
                // para o binding existir.
                bytes += 4;
                return placeholder(dispositivo, NOMES_MAPAS[mapa]);
            }
            let lista: Vec<&Textura> = usados.iter().map(|&i| &cena.texturas[i as usize]).collect();
            bytes += plano.bytes_do_array(usados.len() as u32);
            criar_array(dispositivo, fila, NOMES_MAPAS[mapa], &plano, &lista)
        });
        let vistas: [wgpu::TextureView; MAPAS] = std::array::from_fn(|mapa| {
            arrays[mapa].create_view(&wgpu::TextureViewDescriptor {
                label: Some(NOMES_MAPAS[mapa]),
                dimension: Some(wgpu::TextureViewDimension::D2Array),
                ..Default::default()
            })
        });
        let amostrador = dispositivo.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("pt0-amostrador-texturas"),
            address_mode_u: wgpu::AddressMode::Repeat,
            address_mode_v: wgpu::AddressMode::Repeat,
            address_mode_w: wgpu::AddressMode::Repeat,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::MipmapFilterMode::Linear,
            ..Default::default()
        });
        Ok(Self {
            plano,
            arrays,
            vistas,
            amostrador,
            bytes,
        })
    }

    /// Camadas usadas em cada mapa (para relatório).
    pub fn camadas_por_mapa(&self) -> [usize; MAPAS] {
        std::array::from_fn(|mapa| self.plano.camadas[mapa].len())
    }
}

/// Textura 1x1 de uma camada, para o binding de um mapa que a cena não usa.
fn placeholder(dispositivo: &wgpu::Device, rotulo: &str) -> wgpu::Texture {
    dispositivo.create_texture(&wgpu::TextureDescriptor {
        label: Some(rotulo),
        size: wgpu::Extent3d {
            width: 1,
            height: 1,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: FORMATO_TEXTURA_MATERIAL,
        usage: wgpu::TextureUsages::TEXTURE_BINDING,
        view_formats: &[],
    })
}

/// Camada do mapa `mapa` que tem a textura `textura` da cena (índice na lista de texturas da cena).
/// `SEM_CAMADA` se o material não usa textura nesse mapa. A camada é a posição da textura na lista de
/// camadas do plano, que segue a ordem da cena.
pub fn camada_do_mapa(plano: &Plano, mapa: usize, textura: u32) -> u32 {
    if textura == SEM_TEXTURA {
        return SEM_CAMADA;
    }
    plano.camadas[mapa]
        .iter()
        .position(|&i| i == textura)
        .map_or(SEM_CAMADA, |p| p as u32)
}

/// Média linear RGB do albedo da textura `textura` (na lista da cena): o divisor do albedo no shader.
/// Sem albedo, branco (a divisão não altera a cor).
pub fn media_do_albedo(plano: &Plano, textura: u32) -> [f32; 3] {
    match camada_do_mapa(plano, 0, textura) {
        SEM_CAMADA => [1.0; 3],
        camada => plano.medias_albedo[camada as usize],
    }
}

/// Nível de mip pela distância do raio (aproximação de largura de pixel, sem derivadas):
///
/// `lod = log2(max(1, distancia * angulo_do_pixel / tamanho_do_texel))`, limitado a `niveis - 1`.
///
/// `distancia` é o caminho do raio até o acerto (metros), `angulo_do_pixel` a abertura de um pixel
/// (radianos) e `tamanho_do_texel` o tamanho de um texel no mundo (`escala / lado da textura`). Quando o
/// pixel cobre menos de um texel, o nível é 0. É monótono em `distancia`. A mesma conta está em
/// `pt0.wgsl` (`lod_da_distancia`).
pub fn lod_da_distancia(distancia: f32, angulo_do_pixel: f32, tamanho_do_texel: f32, niveis: u32) -> f32 {
    let razao = (distancia * angulo_do_pixel / tamanho_do_texel.max(1.0e-9)).max(1.0);
    razao.log2().min((niveis.max(1) - 1) as f32)
}

/// Abertura de um pixel (radianos): ângulo entre os raios de dois pixels vizinhos no centro da imagem.
/// Com a câmera de perspectiva, nas bordas o pixel é um pouco maior; a aproximação usa o centro.
pub fn angulo_do_pixel(cena: &Cena, largura: u32) -> Result<f32, String> {
    let inversa = render_core::matematica::inverter(&cena.camera.matriz_vp())
        .ok_or("matriz da câmera não inverte")?;
    let direcao = |ndc_x: f64, ndc_y: f64| -> [f64; 3] {
        let perto = render_core::matematica::transformar(&inversa, [ndc_x, ndc_y, -1.0, 1.0]);
        let longe = render_core::matematica::transformar(&inversa, [ndc_x, ndc_y, 1.0, 1.0]);
        let p0 = [perto[0] / perto[3], perto[1] / perto[3], perto[2] / perto[3]];
        let p1 = [longe[0] / longe[3], longe[1] / longe[3], longe[2] / longe[3]];
        let v = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        let n = (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt().max(1.0e-12);
        [v[0] / n, v[1] / n, v[2] / n]
    };
    let a = direcao(0.0, 0.0);
    let b = direcao(2.0 / f64::from(largura.max(1)), 0.0);
    let cos = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]).clamp(-1.0, 1.0);
    Ok(cos.acos() as f32)
}

#[cfg(test)]
mod testes {
    use super::*;
    use render_core::camera::Camera;
    use render_core::cena::{Lote, PartesCena, Sol};
    use render_core::vetor::Vec3;

    fn textura_lisa(largura: u32, altura: u32, cor: [u8; 3]) -> Textura {
        let pixels: Vec<u8> = (0..largura * altura).flat_map(|_| [cor[0], cor[1], cor[2], 255]).collect();
        Textura {
            largura,
            altura,
            niveis: vec![pixels],
        }
    }

    fn material_com(texturas: [Option<u32>; 4]) -> Material {
        let mut m = Material::padrao();
        m.texturas = texturas;
        m
    }

    fn texels(valores: &[[u8; 3]]) -> Vec<u8> {
        valores.iter().flat_map(|c| [c[0], c[1], c[2], 255]).collect()
    }

    #[test]
    fn lod_e_monotono_na_distancia_e_limitado_aos_niveis() {
        // Pixel de 0,001 rad, texel de 0,01 m (escala 1 m e lado 100 texels), 8 níveis.
        let (angulo, texel, niveis) = (0.001f32, 0.01f32, 8u32);
        let mut anterior = f32::NEG_INFINITY;
        for passo in 0..400 {
            let distancia = passo as f32 * 0.25;
            let lod = lod_da_distancia(distancia, angulo, texel, niveis);
            assert!(lod >= anterior, "LOD caiu em {distancia} m: {lod} < {anterior}");
            assert!((0.0..=(niveis - 1) as f32).contains(&lod), "fora dos níveis: {lod}");
            anterior = lod;
        }
        // Perto da câmera (pixel menor que um texel), nível 0; longe, no último nível.
        assert_eq!(lod_da_distancia(0.5, angulo, texel, niveis), 0.0);
        assert_eq!(lod_da_distancia(1.0e6, angulo, texel, niveis), (niveis - 1) as f32);
        // Dobrar a distância sobe um nível (log2), antes do limite.
        let a = lod_da_distancia(10.0, angulo, texel, niveis);
        let b = lod_da_distancia(20.0, angulo, texel, niveis);
        assert!((b - a - 1.0).abs() < 1.0e-4, "a {a} b {b}");
    }

    #[test]
    fn lod_com_texel_nulo_ou_sem_niveis_nao_quebra() {
        assert!(lod_da_distancia(5.0, 0.001, 0.0, 4).is_finite());
        assert_eq!(lod_da_distancia(5.0, 0.001, 0.01, 0), 0.0);
    }

    #[test]
    fn camada_segue_a_ordem_da_cena_em_cada_mapa() {
        let texturas = vec![
            textura_lisa(4, 4, [10, 10, 10]),
            textura_lisa(4, 4, [20, 20, 20]),
            textura_lisa(4, 4, [30, 30, 30]),
        ];
        let materiais = vec![
            material_com([Some(2), None, Some(0), None]),
            material_com([Some(1), Some(2), None, None]),
        ];
        let plano = Plano::planejar(&texturas, &materiais, 256).expect("plano");
        // Albedo usa as texturas 1 e 2 (camadas 0 e 1); normal só a 2 (camada 0).
        assert_eq!(camada_do_mapa(&plano, 0, 1), 0);
        assert_eq!(camada_do_mapa(&plano, 0, 2), 1);
        assert_eq!(camada_do_mapa(&plano, 1, 2), 0);
        // Rugosidade usa a 0; textura não usada nesse mapa não tem camada.
        assert_eq!(camada_do_mapa(&plano, 2, 0), 0);
        assert_eq!(camada_do_mapa(&plano, 2, 1), SEM_CAMADA);
        assert_eq!(camada_do_mapa(&plano, 3, 0), SEM_CAMADA);
        assert_eq!(camada_do_mapa(&plano, 0, SEM_TEXTURA), SEM_CAMADA);
    }

    #[test]
    fn media_do_albedo_e_a_media_linear_da_textura() {
        // Textura lisa de 128 (sRGB): média linear 0,2159 em cada canal, como em render-engine.
        let texturas = vec![textura_lisa(2, 2, [128, 128, 128]), textura_lisa(2, 2, [255, 255, 255])];
        let materiais = vec![material_com([Some(0), None, None, None]), material_com([Some(1), None, None, None])];
        let plano = Plano::planejar(&texturas, &materiais, 256).expect("plano");
        for canal in media_do_albedo(&plano, 0) {
            assert!((canal - 0.2159).abs() < 1.0e-3, "canal {canal}");
        }
        for canal in media_do_albedo(&plano, 1) {
            assert!((canal - 1.0).abs() < 1.0e-6, "canal {canal}");
        }
        // Sem textura de albedo, a divisão do shader não altera a cor.
        assert_eq!(media_do_albedo(&plano, SEM_TEXTURA), [1.0; 3]);
    }

    #[test]
    fn media_preto_e_branco_e_meio_linear_e_sem_texels_e_branco() {
        for canal in media_linear_rgb(&texels(&[[0, 0, 0], [255, 255, 255]])) {
            assert!((canal - 0.5).abs() < 1.0e-6, "canal {canal}");
        }
        assert_eq!(media_linear_rgb(&[]), [1.0; 3]);
    }

    #[test]
    fn plano_recusa_mais_camadas_que_a_placa_e_indice_fora_da_cena() {
        let texturas: Vec<Textura> = (0..3).map(|_| textura_lisa(4, 4, [0, 0, 0])).collect();
        let materiais: Vec<Material> = (0..3).map(|i| material_com([Some(i), None, None, None])).collect();
        let erro = Plano::planejar(&texturas, &materiais, 2).expect_err("recusa");
        assert!(erro.contains("3 texturas de albedo") && erro.contains("até 2 camadas"), "{erro}");
        let erro = Plano::planejar(&texturas[..1], &[material_com([Some(1), None, None, None])], 256)
            .expect_err("índice fora");
        assert!(erro.contains("textura 1"), "{erro}");
    }

    #[test]
    fn cadeia_de_mips_media_2x2_e_repete_a_borda() {
        // Base 3x1 (vermelho 0, 100, 200): o nível 1 é 1x1 e a janela cai nos texels 0 e 1, repetidos na
        // altura de 1 linha: média (0+100+0+100+2)/4 = 50.
        let base = vec![0, 0, 0, 255, 100, 100, 100, 255, 200, 200, 200, 255];
        let cadeia = cadeia_de_mips(base.clone(), 3, 1, 2);
        assert_eq!(cadeia.len(), 2);
        assert_eq!(cadeia[1][0], 50);
    }

    #[test]
    fn angulo_do_pixel_e_pequeno_e_positivo_para_uma_camera_comum() {
        // Câmera de 60 graus verticais: um pixel de 1280 colunas ocupa uns 0,0008 rad no centro.
        let camera = Camera::olhando_para(
            Vec3::novo(0.0, -10.0, 2.0),
            Vec3::novo(0.0, 0.0, 1.0),
            Vec3::novo(0.0, 0.0, 1.0),
            60f64.to_radians(),
            1280.0 / 720.0,
            0.1,
            500.0,
        )
        .expect("câmera");
        let cena = Cena::nova(PartesCena {
            posicoes: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            indices: vec![0, 1, 2],
            normais: Vec::new(),
            materiais: vec![Material::padrao()],
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
        .expect("cena");
        let angulo = angulo_do_pixel(&cena, 1280).expect("ângulo");
        assert!(angulo > 0.0 && angulo < 0.002, "ângulo {angulo}");
    }
}
