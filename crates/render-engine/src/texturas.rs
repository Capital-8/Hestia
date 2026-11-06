//! Texturas de material em arrays: uma `texture_2d_array` por mapa (albedo, normal, rugosidade e
//! metálico), com uma camada por textura que os materiais usam nesse mapa. Sem limite fixo de
//! slots: a quantidade de camadas vem do formato (até 64 texturas por cena) e da placa
//! (`max_texture_array_layers`, conferido em `Plano::planejar`).
//!
//! Tudo que é CPU fica aqui: o plano (quais texturas entram em cada array e em que camada), o
//! redimensionamento bilinear para o tamanho comum e a cadeia de mips. `criar_array` só envia.
//!
//! Tamanho comum: o maior lado de largura e o maior lado de altura entre as texturas usadas pela
//! cena (o mesmo para os quatro arrays). Texturas menores são ampliadas e maiores são reduzidas,
//! por bilinear. A UV do shader é normalizada, então o conteúdo de cada textura não muda: só a
//! resolução dos texels. Textura que já tem o tamanho comum e a cadeia completa de mips é enviada
//! com os níveis originais, sem recalcular nada.
//!
//! Cada camada tem a cadeia completa de mips do tamanho comum. Os níveis gerados aqui fazem média
//! de 2x2 texels, como o gerador de `examples/gerar_cena_texturas.rs`.

use std::borrow::Cow;

use render_core::cena::{Material, Textura, SEM_TEXTURA};

use crate::constantes::FORMATO_TEXTURA_MATERIAL;
use crate::erro::ErroRender;
use crate::geometria::Vertice;

/// Mapas de material, na ordem do campo `texturas` de `Material`: albedo, normal, rugosidade e
/// metálico (ver `Vertice::texturas`).
pub const MAPAS: usize = 4;

/// Nomes dos mapas, na mesma ordem de `MAPAS`, para rótulos e mensagens de erro.
pub const NOMES_MAPAS: [&str; MAPAS] = ["albedo", "normal", "rugosidade", "metálico"];

/// Camada marcada na tabela para "este mapa não usa esta textura". Nunca chega ao shader: só as
/// texturas referenciadas por algum material entram na tabela, e os vértices só apontam para elas.
const SEM_CAMADA: u32 = u32::MAX;

/// Plano de uma cena: tamanho comum, camadas de cada mapa e a tabela de índices.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Plano {
    pub largura: u32,
    pub altura: u32,
    /// Cadeia completa de mips do tamanho comum (cada camada tem todos os níveis).
    pub niveis: u32,
    /// Por mapa: índice, na lista de texturas da cena, de cada camada. A camada `i` do mapa `m`
    /// é a textura `camadas[m][i]`.
    pub camadas: [Vec<u32>; MAPAS],
    /// Por mapa e por índice da lista de texturas da cena: a camada usada nesse mapa.
    tabela: [Vec<u32>; MAPAS],
}

impl Plano {
    /// Monta o plano da cena. Cada mapa ganha uma camada por textura que algum material usa nesse
    /// mapa, na ordem do índice da cena. Erro explícito se um material aponta para uma textura
    /// que não existe ou se um mapa precisa de mais camadas que `limite_camadas` (o limite da
    /// placa, `max_texture_array_layers`). Não há fallback silencioso.
    pub fn planejar(
        texturas: &[Textura],
        materiais: &[Material],
        limite_camadas: u32,
    ) -> Result<Plano, ErroRender> {
        let n = texturas.len();
        let mut usada: [Vec<bool>; MAPAS] = std::array::from_fn(|_| vec![false; n]);
        for material in materiais {
            for (mapa, indice) in material.texturas.iter().enumerate() {
                if let Some(i) = *indice {
                    let i = i as usize;
                    if i >= n {
                        return Err(ErroRender::Gpu(format!(
                            "material usa a textura {i}, mas a cena tem {n} texturas"
                        )));
                    }
                    usada[mapa][i] = true;
                }
            }
        }

        let mut camadas: [Vec<u32>; MAPAS] = std::array::from_fn(|_| Vec::new());
        let mut tabela: [Vec<u32>; MAPAS] = std::array::from_fn(|_| vec![SEM_CAMADA; n]);
        for mapa in 0..MAPAS {
            for i in 0..n {
                if usada[mapa][i] {
                    tabela[mapa][i] = camadas[mapa].len() as u32;
                    camadas[mapa].push(i as u32);
                }
            }
            let precisa = camadas[mapa].len() as u32;
            if precisa > limite_camadas {
                return Err(ErroRender::Gpu(format!(
                    "a cena usa {precisa} texturas de {} (um array por mapa), mas a placa aceita \
                     até {limite_camadas} camadas por array (max_texture_array_layers)",
                    NOMES_MAPAS[mapa]
                )));
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

        Ok(Plano {
            largura,
            altura,
            niveis: Textura::niveis_completos(largura, altura),
            camadas,
            tabela,
        })
    }

    /// Troca os índices de textura de cada vértice (índices da cena) pela camada do mapa.
    /// `SEM_TEXTURA` continua `SEM_TEXTURA`: o shader não amostra o canal.
    pub fn remapear(&self, vertices: &mut [Vertice]) {
        for vertice in vertices {
            for mapa in 0..MAPAS {
                let indice = vertice.texturas[mapa];
                if indice != SEM_TEXTURA {
                    vertice.texturas[mapa] = self.tabela[mapa][indice as usize];
                }
            }
        }
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

/// Redimensiona uma imagem RGBA8 para `(dw, dh)` por interpolação bilinear, com o centro do texel
/// como referência. Feito na CPU, uma vez por textura e por cena. Ampliar (origem menor) repete a
/// interpolação entre texels vizinhos; reduzir é só uma média ponderada, sem filtro de área.
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

/// Cadeia de mips de `base` (nível 0, `largura` x `altura`) com `niveis` níveis. Cada nível novo
/// é a média de 2x2 texels do anterior; na borda, o último texel é repetido.
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

/// Níveis de uma textura da cena no tamanho comum do plano. Os níveis originais servem quando a
/// textura já tem o tamanho comum e a cadeia completa; senão, a cadeia é gerada a partir do nível
/// 0 (redimensionado, quando o tamanho difere).
fn niveis_no_tamanho_comum<'a>(textura: &'a Textura, plano: &Plano) -> Vec<Cow<'a, [u8]>> {
    let mesmo_tamanho = textura.largura == plano.largura && textura.altura == plano.altura;
    if mesmo_tamanho && textura.niveis.len() as u32 == plano.niveis {
        return textura.niveis.iter().map(|n| Cow::Borrowed(n.as_slice())).collect();
    }
    let base = if mesmo_tamanho {
        textura.niveis[0].clone()
    } else {
        redimensionar_bilinear(
            &textura.niveis[0],
            textura.largura,
            textura.altura,
            plano.largura,
            plano.altura,
        )
    };
    cadeia_de_mips(base, plano.largura, plano.altura, plano.niveis)
        .into_iter()
        .map(Cow::Owned)
        .collect()
}

/// Cria o array de um mapa: uma camada por textura de `texturas` (na ordem do plano), todas no
/// tamanho comum, com a cadeia completa de mips de cada camada. `texturas` não pode estar vazia.
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
            let (largura, altura) =
                Textura::dimensoes_do_nivel(plano.largura, plano.altura, nivel as u32);
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

#[cfg(test)]
mod testes {
    use super::*;

    fn textura_lisa(largura: u32, altura: u32, valor: u8) -> Textura {
        let pixels = vec![valor; (largura * altura * 4) as usize];
        Textura {
            largura,
            altura,
            niveis: vec![pixels],
        }
    }

    fn material_com(texturas: [Option<u32>; 4]) -> Material {
        let mut material = Material::padrao();
        material.texturas = texturas;
        material
    }

    #[test]
    fn plano_numera_camadas_por_mapa_na_ordem_da_cena() {
        let texturas = vec![textura_lisa(4, 4, 0), textura_lisa(8, 2, 0), textura_lisa(2, 8, 0)];
        let materiais = vec![
            material_com([Some(2), None, Some(0), None]),
            material_com([Some(1), Some(2), None, None]),
        ];
        let plano = Plano::planejar(&texturas, &materiais, 256).expect("plano");
        assert_eq!(plano.camadas[0], vec![1, 2]);
        assert_eq!(plano.camadas[1], vec![2]);
        assert_eq!(plano.camadas[2], vec![0]);
        assert!(plano.camadas[3].is_empty());
        // Tamanho comum: maior largura e maior altura entre as texturas usadas.
        assert_eq!((plano.largura, plano.altura), (8, 8));
        assert_eq!(plano.niveis, 4);

        let mut vertices = vec![Vertice {
            posicao: [0.0; 3],
            normal: [0.0; 3],
            cor: [0.0; 3],
            rugosidade: 0.0,
            metalico: 0.0,
            emissivo: [0.0; 3],
            tipo_material: 0.0,
            escala: 1.0,
            opacidade: 1.0,
            texturas: [2, SEM_TEXTURA, 0, SEM_TEXTURA],
        }];
        plano.remapear(&mut vertices);
        // Textura 2 é a camada 1 do albedo; textura 0 é a camada 0 da rugosidade.
        assert_eq!(vertices[0].texturas, [1, SEM_TEXTURA, 0, SEM_TEXTURA]);
    }

    #[test]
    fn plano_recusa_indice_fora_da_cena() {
        let texturas = vec![textura_lisa(4, 4, 0)];
        let materiais = vec![material_com([Some(1), None, None, None])];
        let erro = Plano::planejar(&texturas, &materiais, 256).expect_err("recusa");
        assert!(erro.to_string().contains("textura 1"), "mensagem: {erro}");
    }

    #[test]
    fn plano_recusa_mais_camadas_que_a_placa() {
        let texturas: Vec<Textura> = (0..3).map(|_| textura_lisa(4, 4, 0)).collect();
        let materiais: Vec<Material> = (0..3)
            .map(|i| material_com([Some(i), None, None, None]))
            .collect();
        let erro = Plano::planejar(&texturas, &materiais, 2).expect_err("recusa");
        let texto = erro.to_string();
        assert!(texto.contains("3 texturas de albedo"), "mensagem: {texto}");
        assert!(texto.contains("até 2 camadas"), "mensagem: {texto}");
    }

    #[test]
    fn redimensionar_mantem_o_tamanho_e_a_cor_de_uma_imagem_lisa() {
        let origem = vec![90u8; 4 * 4 * 4];
        let saida = redimensionar_bilinear(&origem, 4, 4, 9, 3);
        assert_eq!(saida.len(), 9 * 3 * 4);
        assert!(saida.iter().all(|&v| v == 90));
    }

    #[test]
    fn redimensionar_interpola_entre_dois_texels() {
        // Duas colunas, 0 e 200: ampliar para 4 colunas dá valores crescentes entre os dois.
        let origem = vec![0, 0, 0, 255, 200, 200, 200, 255];
        let saida = redimensionar_bilinear(&origem, 2, 1, 4, 1);
        let vermelho: Vec<u8> = saida.chunks_exact(4).map(|p| p[0]).collect();
        assert_eq!(vermelho, vec![0, 50, 150, 200]);
    }

    #[test]
    fn cadeia_de_mips_media_2x2_e_repete_a_borda() {
        // Base 3x1 (vermelho 0, 100, 200): o nível 1 é 1x1. A janela 2x2 do único texel de saída
        // cai nos texels (0,0) e (1,0), repetidos na altura de 1 linha: média (0+100+0+100+2)/4.
        let base = vec![0, 0, 0, 255, 100, 100, 100, 255, 200, 200, 200, 255];
        let cadeia = cadeia_de_mips(base.clone(), 3, 1, 2);
        assert_eq!(cadeia.len(), 2);
        assert_eq!(cadeia[0], base);
        assert_eq!(cadeia[1].len(), 4);
        assert_eq!(cadeia[1][0], 50);
    }

    #[test]
    fn bytes_do_array_soma_todos_os_niveis_de_todas_as_camadas() {
        let plano = Plano {
            largura: 8,
            altura: 8,
            niveis: 4,
            camadas: std::array::from_fn(|_| Vec::new()),
            tabela: std::array::from_fn(|_| Vec::new()),
        };
        // 8x8 + 4x4 + 2x2 + 1x1 = 85 texels de 4 bytes = 340 bytes por camada.
        assert_eq!(plano.bytes_do_array(3), 340 * 3);
    }
}
