//! Path tracer simples: sol direcional, céu, difuso e especular básico.
//!
//! Limitações conscientes desta primeira versão (documentadas no relatório da T7):
//! - sem texturas, sem luzes internas, sem refração física (transmissão atravessa reto);
//! - sombra dura do sol (um único raio de sombra, sem penumbra);
//! - ambiente aproximado pelo céu, sem oclusão de ambiente;
//! - paralelismo fica fora do wasm (o host fatia a imagem em blocos).
//!
//! O que já é real: BVH, interseção de triângulos com normais interpoladas, materiais por lote,
//! exposição, ACES, sRGB, PNG e cancelamento determinístico.

use std::sync::atomic::{AtomicBool, Ordering};

use crate::cena::{Acerto, Cena};
use crate::erro::Erro;
use crate::imagem;
use crate::matematica::{inverter, transformar, Mat4};
use crate::ruido::Rng;
use crate::tonemap;
use crate::trabalho::Trabalho;
use crate::vetor::{misturar, Vec3, PI};

/// Quantidade de rebotes máximos. Quatro já dão inter-reflexão suficiente para um render de
/// conceito; aumentar encarece linearmente e não muda a arquitetura.
const PROFUNDIDADE_MAXIMA: u32 = 4;
/// Deslocamento de origem para evitar auto-interseção (shadow acne).
const EPSILON: f64 = 1.0e-4;

/// Retângulo de pixels a renderizar. As coordenadas são absolutas na imagem.
#[derive(Clone, Copy, Debug)]
pub struct Bloco {
    pub x: u32,
    pub y: u32,
    pub largura: u32,
    pub altura: u32,
    pub spp: u32,
    pub seed: u32,
}

/// Renderiza um bloco retangular em RGBA8 sRGB, linha a linha.
///
/// O bloco é independente do resto da imagem: a semente de cada pixel usa coordenadas absolutas,
/// então renderizar `(x, y, w, h)` dá o mesmo resultado do recorte correspondente da imagem toda.
pub fn renderizar_bloco(
    cena: &Cena,
    trabalho: &Trabalho,
    bloco: &Bloco,
    cancelado: &AtomicBool,
) -> Result<Vec<u8>, Erro> {
    if !trabalho.validar_bloco(bloco.x, bloco.y, bloco.largura, bloco.altura, bloco.spp) {
        return Err(Erro::TrabalhoInvalido);
    }
    let inversa_vp = inverter(&cena.camera.matriz_vp()).ok_or(Erro::CenaInvalida)?;
    let tamanho = (bloco.largura as usize)
        .checked_mul(bloco.altura as usize)
        .and_then(|n| n.checked_mul(4))
        .ok_or(Erro::TrabalhoInvalido)?;
    let mut saida = vec![0u8; tamanho];

    let largura_f = trabalho.largura as f64;
    let altura_f = trabalho.altura as f64;
    let inv_spp = 1.0 / bloco.spp as f64;

    for linha in 0..bloco.altura {
        if cancelado.load(Ordering::Relaxed) {
            return Err(Erro::Cancelado);
        }
        let py = bloco.y + linha;
        for coluna in 0..bloco.largura {
            // Além da checagem por linha, confere a cada 32 pixels para cancelar rápido em linhas
            // largas (o host fatia a imagem, mas um bloco 4K ainda tem 3840 pixels).
            if coluna % 32 == 0 && cancelado.load(Ordering::Relaxed) {
                return Err(Erro::Cancelado);
            }
            let px = bloco.x + coluna;
            let mut acumulado = Vec3::zero();
            for amostra in 0..bloco.spp {
                let mut rng = Rng::novo(bloco.seed, px, py, amostra);
                let jx = rng.proximo_f64();
                let jy = rng.proximo_f64();
                let ndc_x = ((px as f64 + jx) / largura_f) * 2.0 - 1.0;
                let ndc_y = 1.0 - ((py as f64 + jy) / altura_f) * 2.0;
                if let Some((origem, direcao)) = raio_da_camera(&inversa_vp, cena, ndc_x, ndc_y) {
                    acumulado = acumulado + rastrear(cena, origem, direcao, &mut rng);
                }
            }
            let [r, g, b] = tonemap::mapear_cor(acumulado * inv_spp, trabalho.exposicao);
            let destino = ((linha as usize) * (bloco.largura as usize) + coluna as usize) * 4;
            saida[destino] = r;
            saida[destino + 1] = g;
            saida[destino + 2] = b;
            saida[destino + 3] = 255;
        }
    }
    Ok(saida)
}

/// Renderiza a imagem inteira (atalho para imagem still e testes).
pub fn renderizar_imagem(
    cena: &Cena,
    trabalho: &Trabalho,
    spp: u32,
    seed: u32,
    cancelado: &AtomicBool,
) -> Result<Vec<u8>, Erro> {
    renderizar_bloco(
        cena,
        trabalho,
        &Bloco {
            x: 0,
            y: 0,
            largura: trabalho.largura,
            altura: trabalho.altura,
            spp,
            seed,
        },
        cancelado,
    )
}

/// Renderiza e devolve um PNG RGBA (mesmo caminho de tonemap da ABI).
pub fn renderizar_png(
    cena: &Cena,
    trabalho: &Trabalho,
    spp: u32,
    seed: u32,
    cancelado: &AtomicBool,
) -> Result<Vec<u8>, Erro> {
    let rgba = renderizar_imagem(cena, trabalho, spp, seed, cancelado)?;
    imagem::codificar_png(trabalho.largura, trabalho.altura, &rgba)
}

/// Desprojeta o centro jitterizado do pixel pelo inverso de `projection * view`.
fn raio_da_camera(inversa_vp: &Mat4, cena: &Cena, ndc_x: f64, ndc_y: f64) -> Option<(Vec3, Vec3)> {
    let perto = transformar(inversa_vp, [ndc_x, ndc_y, -1.0, 1.0]);
    let longe = transformar(inversa_vp, [ndc_x, ndc_y, 1.0, 1.0]);
    if perto[3].abs() < 1.0e-12 || longe[3].abs() < 1.0e-12 {
        return None;
    }
    let p0 = Vec3::novo(
        perto[0] / perto[3],
        perto[1] / perto[3],
        perto[2] / perto[3],
    );
    let p1 = Vec3::novo(
        longe[0] / longe[3],
        longe[1] / longe[3],
        longe[2] / longe[3],
    );
    let direcao = (p1 - p0).normalizado();
    if direcao.comprimento() < 1.0e-12 {
        // Câmera degenerada: usa a posição informada como último recurso, mas nunca gera NaN.
        let alternativa = (p1 - cena.camera.posicao).normalizado();
        if alternativa.comprimento() < 1.0e-12 {
            return None;
        }
        return Some((cena.camera.posicao, alternativa));
    }
    Some((p0, direcao))
}

fn rastrear(cena: &Cena, origem: Vec3, direcao: Vec3, rng: &mut Rng) -> Vec3 {
    let mut total = Vec3::zero();
    let mut throughput = Vec3::splat(1.0);
    let mut o = origem;
    let mut d = direcao;

    for profundidade in 0..PROFUNDIDADE_MAXIMA {
        let acerto = match cena.intersectar(o, d, EPSILON, f64::INFINITY) {
            Some(acerto) => acerto,
            None => {
                total = total + throughput * ceu(cena, d);
                break;
            }
        };
        let material = cena
            .materiais
            .get(acerto.material)
            .copied()
            .unwrap_or_else(crate::cena::Material::padrao);
        let normal = acerto.normal;
        total = total + throughput * material.emissao();

        total = total + throughput * luz_direta(cena, &acerto, &material, d);

        // Ambiente: aproximação barata do céu sobre a normal. Não há oclusão de ambiente.
        let ambiente = material.cor() * (1.0 - material.metalico) * ceu(cena, normal) * 0.3;
        total = total + throughput * ambiente;

        if profundidade + 1 == PROFUNDIDADE_MAXIMA {
            break;
        }

        if material.transmissao > 0.5 {
            // Vidro simplificado: atravessa reto e tinge pela cor base.
            o = acerto.ponto - normal * EPSILON;
            throughput = throughput * material.cor();
        } else if material.metalico > 0.5 {
            let refletido = d.reflectido(normal).normalizado();
            let dispersao = Vec3::novo(
                rng.proximo_faixa(-1.0, 1.0),
                rng.proximo_faixa(-1.0, 1.0),
                rng.proximo_faixa(-1.0, 1.0),
            ) * (material.rugosidade * 0.5);
            d = (refletido + dispersao).normalizado();
            if d.comprimento() < 1.0e-12 {
                d = refletido;
            }
            o = acerto.ponto + normal * EPSILON;
            throughput = throughput
                * (material.cor() * material.metalico
                    + Vec3::splat(0.04 * (1.0 - material.metalico)));
        } else {
            d = hemisferio_cosseno(normal, rng);
            o = acerto.ponto + normal * EPSILON;
            throughput = throughput * material.cor() * (1.0 - material.metalico);
        }

        if throughput.x + throughput.y + throughput.z < 1.0e-5 {
            break;
        }
    }
    total
}

fn luz_direta(
    cena: &Cena,
    acerto: &Acerto,
    material: &crate::cena::Material,
    direcao: Vec3,
) -> Vec3 {
    let para_sol = cena.sol.direcao();
    let ndl = acerto.normal.dot(para_sol).max(0.0);
    if ndl <= 0.0 || cena.sol.intensidade <= 0.0 {
        return Vec3::zero();
    }
    let origem_sombra = acerto.ponto + acerto.normal * EPSILON;
    if cena.algum_acerto(origem_sombra, para_sol, EPSILON, f64::INFINITY) {
        return Vec3::zero();
    }

    let cor_sol = Vec3::novo(1.0, 0.96, 0.9);
    let difuso = material.cor() * ((1.0 - material.metalico) / PI);

    // Blinn-Phong normalizado: rugosidade 0 vira um brilho estreito, 1 vira um brilho largo.
    let para_observador = -direcao;
    let meio = (para_sol + para_observador).normalizado();
    let ndh = acerto.normal.dot(meio).max(0.0);
    let expoente = 8.0 + (1.0 - material.rugosidade).powi(2) * 500.0;
    let f0 = Vec3::splat(0.04 * (1.0 - material.metalico)) + material.cor() * material.metalico;
    let normalizacao = (expoente + 8.0) / (8.0 * PI);
    let especular =
        f0 * (ndh.powf(expoente) * normalizacao * (0.25 + 0.75 * (1.0 - material.rugosidade)));

    (difuso + especular) * (cena.sol.intensidade * ndl) * cor_sol
}

/// Céu do tema quando não há cor de fundo no snapshot; fundo explícito é usado como ambiente.
fn ceu(cena: &Cena, direcao: Vec3) -> Vec3 {
    if let Some(cor) = cena.fundo {
        return Vec3::de_array(cor);
    }
    let d = direcao.normalizado();
    let t = (d.z * 0.5 + 0.5).clamp(0.0, 1.0);
    let horizonte = Vec3::novo(0.86, 0.88, 0.92);
    let zenite = Vec3::novo(0.18, 0.34, 0.72);
    let mut cor = misturar(horizonte, zenite, t.powf(0.65));
    if d.z < 0.0 {
        let chao = Vec3::novo(0.16, 0.15, 0.14);
        cor = misturar(cor, chao, (-d.z).clamp(0.0, 1.0));
    }
    cor
}

/// Amostra hemisférica ponderada por cosseno ao redor de `normal`.
fn hemisferio_cosseno(normal: Vec3, rng: &mut Rng) -> Vec3 {
    let r1 = rng.proximo_f64();
    let r2 = rng.proximo_f64();
    let raio = r1.sqrt();
    let phi = 2.0 * PI * r2;
    let local = Vec3::novo(raio * phi.cos(), raio * phi.sin(), (1.0 - r1).sqrt());
    let auxiliar = if normal.z.abs() < 0.999 {
        Vec3::novo(0.0, 0.0, 1.0)
    } else {
        Vec3::novo(1.0, 0.0, 0.0)
    };
    let tangente = auxiliar.cross(normal).normalizado();
    let bitangente = normal.cross(tangente);
    (tangente * local.x + bitangente * local.y + normal * local.z).normalizado()
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::cena::cena_teste_publica;
    use crate::trabalho::Trabalho;

    #[test]
    fn quadro_320x180_e_deterministico() {
        let cena = cena_teste_publica();
        let trabalho = Trabalho::novo(320, 180, 1.0).expect("trabalho");
        let cancelado = AtomicBool::new(false);
        let primeiro = renderizar_imagem(&cena, &trabalho, 2, 42, &cancelado).expect("render 1");
        let segundo = renderizar_imagem(&cena, &trabalho, 2, 42, &cancelado).expect("render 2");
        assert_eq!(primeiro, segundo);
        assert_eq!(primeiro.len(), 320 * 180 * 4);
        assert!(
            primeiro.iter().any(|&v| v != 0),
            "imagem não pode ser toda preta"
        );
        // Todo pixel é opaco e existe uma variação real de cor.
        assert!(primeiro.chunks_exact(4).all(|p| p[3] == 255));
        let cores: std::collections::HashSet<[u8; 3]> = primeiro
            .chunks_exact(4)
            .map(|p| [p[0], p[1], p[2]])
            .collect();
        assert!(
            cores.len() > 8,
            "esperava gradiente, veio {} cores",
            cores.len()
        );
    }

    #[test]
    fn png_320x180_e_deterministico() {
        let cena = cena_teste_publica();
        let trabalho = Trabalho::novo(320, 180, 1.0).expect("trabalho");
        let cancelado = AtomicBool::new(false);
        let primeiro = renderizar_png(&cena, &trabalho, 1, 7, &cancelado).expect("png 1");
        let segundo = renderizar_png(&cena, &trabalho, 1, 7, &cancelado).expect("png 2");
        assert_eq!(primeiro, segundo, "mesma seed = mesmo PNG");
        assert!(primeiro.starts_with(b"\x89PNG\r\n\x1a\n"));
        assert!(primeiro.len() > 200);
        let decodificador = png::Decoder::new(std::io::Cursor::new(&primeiro));
        let leitor = decodificador.read_info().expect("cabeçalho png");
        assert_eq!(leitor.info().width, 320);
        assert_eq!(leitor.info().height, 180);
    }

    #[test]
    fn bloco_bate_com_o_recorte() {
        let cena = cena_teste_publica();
        let trabalho = Trabalho::novo(48, 32, 1.0).expect("trabalho");
        let cancelado = AtomicBool::new(false);
        let inteira = renderizar_imagem(&cena, &trabalho, 1, 11, &cancelado).expect("inteira");
        let bloco = renderizar_bloco(
            &cena,
            &trabalho,
            &Bloco {
                x: 10,
                y: 6,
                largura: 12,
                altura: 10,
                spp: 1,
                seed: 11,
            },
            &cancelado,
        )
        .expect("bloco");
        for linha in 0..10usize {
            for coluna in 0..12usize {
                let destino = (linha * 12 + coluna) * 4;
                let origem = ((linha + 6) * 48 + (coluna + 10)) * 4;
                assert_eq!(
                    &bloco[destino..destino + 4],
                    &inteira[origem..origem + 4],
                    "pixel ({coluna}, {linha}) diverge"
                );
            }
        }
    }

    #[test]
    fn cancelamento_para_o_render() {
        let cena = cena_teste_publica();
        let trabalho = Trabalho::novo(32, 18, 1.0).expect("trabalho");
        let cancelado = AtomicBool::new(true);
        assert_eq!(
            renderizar_imagem(&cena, &trabalho, 1, 0, &cancelado).err(),
            Some(Erro::Cancelado)
        );
    }

    #[test]
    fn bloco_fora_da_imagem_e_recusado() {
        let cena = cena_teste_publica();
        let trabalho = Trabalho::novo(32, 18, 1.0).expect("trabalho");
        let cancelado = AtomicBool::new(false);
        assert_eq!(
            renderizar_bloco(
                &cena,
                &trabalho,
                &Bloco {
                    x: 20,
                    y: 10,
                    largura: 20,
                    altura: 10,
                    spp: 1,
                    seed: 0,
                },
                &cancelado,
            )
            .err(),
            Some(Erro::TrabalhoInvalido)
        );
    }
}
