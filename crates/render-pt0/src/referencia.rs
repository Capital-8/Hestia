//! Referência de CPU para a sombra direta do sol, no `render-core`.
//!
//! Usa a API pública do `render-core` (`Cena::intersectar`, `Cena::algum_acerto`, `Rng`) e as
//! mesmas contas de `tracer::luz_direta` no caso difuso: `cor * (1 - metal) / pi * I * cos * sombra`,
//! mais a emissão. Não entram céu, especular nem rebotes, para que a comparação com a GPU seja
//! direta. A imagem completa do tracer (com tudo isso) sai à parte, só para a prova visual.

use render_core::cena::Cena;
use render_core::matematica::{inverter, transformar};
use render_core::ruido::Rng;
use render_core::vetor::{Vec3, PI};

use crate::COR_SOL;

/// Mesmo deslocamento do tracer de CPU (`EPSILON` em `tracer.rs`).
const EPSILON_CPU: f64 = 1.0e-4;

/// Sombra direta do sol, em radiância linear, média de `spp` amostras por pixel.
///
/// Fundo: a cor de fundo da cena se houver, senão preto. O céu do tracer não entra aqui, nos
/// dois lados, para que a comparação seja só da luz direta.
pub fn direto_cpu(cena: &Cena, largura: u32, altura: u32, spp: u32, semente: u32, raio_sol: f64) -> Result<Vec<[f32; 3]>, String> {
    let inversa = inverter(&cena.camera.matriz_vp()).ok_or("matriz da câmera não inverte")?;
    let fundo = cena.fundo.unwrap_or([0.0; 3]);
    let para_sol = cena.sol.direcao();
    let intensidade = cena.sol.intensidade;
    let mut saida = Vec::with_capacity((largura * altura) as usize);
    for py in 0..altura {
        for px in 0..largura {
            let mut soma = [0.0f64; 3];
            for amostra in 0..spp {
                let mut rng = Rng::novo(semente, px, py, amostra);
                let jx = rng.proximo_f64();
                let jy = rng.proximo_f64();
                let ndc_x = ((px as f64 + jx) / largura as f64) * 2.0 - 1.0;
                let ndc_y = 1.0 - ((py as f64 + jy) / altura as f64) * 2.0;
                let cor = match raio_da_camera(&inversa, ndc_x, ndc_y) {
                    None => fundo,
                    Some((origem, direcao)) => {
                        match cena.intersectar(origem, direcao, EPSILON_CPU, f64::INFINITY) {
                            None => fundo,
                            Some(acerto) => {
                                let material = cena.materiais[acerto.material];
                                let normal = acerto.normal;
                                let dir = direcao_sol(para_sol, raio_sol, &mut rng);
                                let mut direto = Vec3::zero();
                                let ndl = normal.dot(para_sol).max(0.0);
                                if ndl > 0.0 {
                                    let visivel = normal.dot(dir) > 0.0 && {
                                        let origem_sombra = acerto.ponto + normal * EPSILON_CPU;
                                        !cena.algum_acerto(origem_sombra, dir, EPSILON_CPU, f64::INFINITY)
                                    };
                                    if visivel {
                                        let cor_sol = Vec3::novo(COR_SOL[0] as f64, COR_SOL[1] as f64, COR_SOL[2] as f64);
                                        direto = cor_sol * (intensidade * ndl);
                                    }
                                }
                                let difuso = material.cor() * ((1.0 - material.metalico) / PI);
                                let emissao = material.emissao();
                                let total = emissao + difuso * direto;
                                total.para_array()
                            }
                        }
                    }
                };
                for (acumulador, valor) in soma.iter_mut().zip(cor) {
                    *acumulador += valor;
                }
            }
            let inv = 1.0 / spp as f64;
            saida.push(soma.map(|c| (c * inv) as f32));
        }
    }
    Ok(saida)
}

/// Direção do sol para uma amostra: o próprio sol, ou uma amostra uniforme no cone do disco.
fn direcao_sol(para_sol: Vec3, raio: f64, rng: &mut Rng) -> Vec3 {
    if raio <= 0.0 {
        return para_sol;
    }
    let u1 = rng.proximo_f64();
    let u2 = rng.proximo_f64();
    let cos_t = 1.0 - u1 * (1.0 - raio.cos());
    let sen_t = (1.0 - cos_t * cos_t).max(0.0).sqrt();
    let phi = 2.0 * PI * u2;
    let ajuda = if para_sol.z.abs() < 0.999 {
        Vec3::novo(0.0, 0.0, 1.0)
    } else {
        Vec3::novo(1.0, 0.0, 0.0)
    };
    let t1 = ajuda.cross(para_sol).normalizado();
    let t2 = para_sol.cross(t1);
    (t1 * (sen_t * phi.cos()) + t2 * (sen_t * phi.sin()) + para_sol * cos_t).normalizado()
}

/// Mesma desprojeção de `tracer::raio_da_camera`.
fn raio_da_camera(inversa: &[f64; 16], ndc_x: f64, ndc_y: f64) -> Option<(Vec3, Vec3)> {
    let perto = transformar(inversa, [ndc_x, ndc_y, -1.0, 1.0]);
    let longe = transformar(inversa, [ndc_x, ndc_y, 1.0, 1.0]);
    if perto[3].abs() < 1.0e-12 || longe[3].abs() < 1.0e-12 {
        return None;
    }
    let p0 = Vec3::novo(perto[0] / perto[3], perto[1] / perto[3], perto[2] / perto[3]);
    let p1 = Vec3::novo(longe[0] / longe[3], longe[1] / longe[3], longe[2] / longe[3]);
    let direcao = (p1 - p0).normalizado();
    if direcao.comprimento() < 1.0e-12 {
        return None;
    }
    Some((p0, direcao))
}
