//! Referência de CPU para a sombra direta do sol, no `render-core`.
//!
//! Usa a API pública do `render-core` (`Cena::intersectar`, `Cena::algum_acerto`, `Rng`) e as
//! mesmas contas de `tracer::luz_direta` no caso difuso: `cor * (1 - metal) / pi * I * cos * sombra`,
//! mais a emissão. Não entram céu, especular nem rebotes, para que a comparação com a GPU seja
//! direta. A imagem completa do tracer (com tudo isso) sai à parte, só para a prova visual.
//!
//! ## Fórmula da referência (`render-core/src/tracer.rs`, fase 3)
//!
//! Caminho de até `PROFUNDIDADE_MAXIMA = 4` vértices, `peso` começa em 1 (throughput):
//!
//! ```text
//! para cada vértice k (ponto acertado, normal n = face voltada para o raio d, sol s = cena.sol.direcao()):
//!   L += peso * emissao
//!   E  = cor_sol * I * max(n.s, 0) * visivel(sombra)           (visivel: n.dir > 0 e sem acerto)
//!   difuso   = cor * (1 - metal) / pi
//!   espec    = f0 * ndh^e * (e + 8) / (8 pi) * (0,25 + 0,75 (1 - r)),
//!              e = 8 + (1 - r)^2 * 500,  f0 = 0,04 (1 - metal) + cor * metal,
//!              ndh = max(n . normalizado(s + (-d)), 0)
//!   L += peso * (difuso + espec) * E                           (o especular entra no mesmo fator de sol)
//!   ambiente = 0,3 * cor * (1 - metal) * ceu(n)                  (sem oclusão)
//!   L += peso * ambiente
//!   se k + 1 = profundidade: para
//!   vidro (transmissao > 0,5): atravessa, peso *= cor (não usado aqui)
//!   metal (metal > 0,5): reflete com dispersão, peso *= cor * metal + 0,04 (1 - metal)
//!   difuso: direção por cosseno, peso *= cor * (1 - metal)
//! se o raio sai da cena em k: L += peso * ceu(d)
//! ```
//!
//! `ceu(d)` é a cor de fundo da cena, quando existe (cena-h1 tem uma: é o céu uniforme usado nas
//! comparações), ou o gradiente do próprio `render-core`. A GPU não usa o gradiente do render-core.
//! Na GPU (`pt0.wgsl`, `radiancia_caminho`), a fórmula acima vale para materiais sem metal e sem
//! vidro, sem disco solar (raio 0) e com profundidade fixa; metal e vidro dessa cena ficam como diferença.

use render_core::cena::Cena;
use render_core::matematica::{inverter, transformar};
use render_core::ruido::Rng;
use render_core::vetor::{Vec3, PI};

use crate::gpu::Modo;
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

/// Modelo da GPU, em CPU (f64), com as mesmas contas dos modos de `pt0.wgsl`:
/// (a) sol direto; (b) mais a irradiância do céu no ponto primário; (c) mais um rebote difuso.
///
/// Serve para separar erro de implementação (GPU contra este modelo) de diferença de modelo
/// (GPU contra o tracer do `render-core`, que tem outro termo de ambiente, especular e quatro
/// rebotes). `fundo_uniforme` escolhe o céu uniforme (`Some`) ou o gradiente do motor (`None`).
/// Roda em todos os núcleos (uma faixa de linhas por thread), com a mesma semente por pixel.
/// Parâmetros de `modelo_cpu`: imagem, amostras, semente, modo, céu (uniforme ou motor) e raio do sol.
pub struct ParametrosModelo {
    pub largura: u32,
    pub altura: u32,
    pub spp: u32,
    pub semente: u32,
    pub modo: Modo,
    pub fundo_uniforme: Option<[f32; 3]>,
    pub raio_sol: f64,
}

pub fn modelo_cpu(cena: &Cena, p: &ParametrosModelo) -> Result<Vec<[f32; 3]>, String> {
    let (largura, altura, spp, semente) = (p.largura, p.altura, p.spp, p.semente);
    let inversa = inverter(&cena.camera.matriz_vp()).ok_or("matriz da câmera não inverte")?;
    let contexto = Contexto {
        cena,
        modo: p.modo,
        raio_sol: p.raio_sol,
        fundo_uniforme: p.fundo_uniforme,
        coeficientes: crate::ceu::irradiancia_sh(p.fundo_uniforme),
        sol: cena.sol.direcao(),
        sol_f: {
            let s = cena.sol.direcao();
            [s.x as f32, s.y as f32, s.z as f32]
        },
        intensidade: cena.sol.intensidade as f32,
        sol_ativo: cena.sol.elevacao > 0.0 && cena.sol.intensidade > 0.0,
        fundo: cena.fundo.unwrap_or([0.0; 3]),
    };
    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).min(altura as usize).max(1);
    let linhas_por_faixa = (altura as usize).div_ceil(threads);
    let mut saida = vec![[0.0f32; 3]; (largura * altura) as usize];
    std::thread::scope(|escopo| {
        for (indice, faixa) in saida.chunks_mut(linhas_por_faixa * largura as usize).enumerate() {
            let inversa = &inversa;
            let contexto = &contexto;
            escopo.spawn(move || {
                let y0 = indice * linhas_por_faixa;
                for (linha, pixels) in faixa.chunks_mut(largura as usize).enumerate() {
                    let py = (y0 + linha) as u32;
                    for (px, pixel) in pixels.iter_mut().enumerate() {
                        *pixel = contexto.pixel(inversa, largura, altura, px as u32, py, spp, semente);
                    }
                }
            });
        }
    });
    Ok(saida)
}

/// Estado comum das amostras do `modelo_cpu`.
struct Contexto<'a> {
    cena: &'a Cena,
    modo: Modo,
    raio_sol: f64,
    fundo_uniforme: Option<[f32; 3]>,
    coeficientes: [[f32; 3]; 9],
    sol: Vec3,
    sol_f: [f32; 3],
    intensidade: f32,
    sol_ativo: bool,
    fundo: [f64; 3],
}

impl Contexto<'_> {
    /// Céu visto por um raio que sai da cena. `disco` liga o disco e o halo (só no primário).
    fn ceu(&self, dir: Vec3, primario: bool) -> Vec3 {
        if let Some(cor) = self.fundo_uniforme {
            return Vec3::de_array(cor.map(f64::from));
        }
        let d = [dir.x as f32, dir.y as f32, dir.z as f32];
        let mut cor = crate::ceu::radiancia(d, self.sol_f, self.intensidade, primario && self.sol_ativo);
        if primario && self.sol_ativo {
            let halo = crate::ceu::halo_sol(d, self.sol_f, self.intensidade);
            cor = [cor[0] + halo, cor[1] + halo, cor[2] + halo];
        }
        Vec3::de_array(cor.map(f64::from))
    }

    fn irradiancia(&self, n: Vec3) -> Vec3 {
        let e = crate::ceu::irradiancia_em(&self.coeficientes, [n.x as f32, n.y as f32, n.z as f32]);
        Vec3::de_array(e.map(f64::from))
    }

    /// Sol direto num ponto (sombra por raio), como `sol_direto` do shader, sem o 1/pi.
    fn sol_direto(&self, ponto: Vec3, normal: Vec3, rng: &mut Rng) -> Vec3 {
        let ndl = normal.dot(self.sol);
        if ndl <= 0.0 {
            return Vec3::zero();
        }
        let dir = direcao_sol(self.sol, self.raio_sol, rng);
        if normal.dot(dir) <= 0.0 {
            return Vec3::zero();
        }
        let origem = ponto + normal * EPSILON_CPU;
        if self.cena.algum_acerto(origem, dir, EPSILON_CPU, f64::INFINITY) {
            return Vec3::zero();
        }
        Vec3::novo(1.0, 0.96, 0.9) * (self.cena.sol.intensidade * ndl)
    }

    /// Um rebote difuso por cosseno: radiância que chega ao ponto pela direção sorteada.
    fn rebote(&self, ponto: Vec3, normal: Vec3, rng: &mut Rng) -> Vec3 {
        let [lx, ly, lz] = crate::amostragem::cosseno_local(rng.proximo_f64() as f32, rng.proximo_f64() as f32);
        let ajuda = if normal.z.abs() < 0.999 {
            Vec3::novo(0.0, 0.0, 1.0)
        } else {
            Vec3::novo(1.0, 0.0, 0.0)
        };
        let t1 = ajuda.cross(normal).normalizado();
        let t2 = normal.cross(t1);
        let d = (t1 * f64::from(lx) + t2 * f64::from(ly) + normal * f64::from(lz)).normalizado();
        let origem = ponto + normal * EPSILON_CPU;
        match self.cena.intersectar(origem, d, EPSILON_CPU, f64::INFINITY) {
            None => {
                if let Some(cor) = self.fundo_uniforme {
                    Vec3::de_array(cor.map(f64::from))
                } else {
                    let f = [d.x as f32, d.y as f32, d.z as f32];
                    Vec3::de_array(crate::ceu::radiancia(f, self.sol_f, self.intensidade, false).map(f64::from))
                }
            }
            Some(acerto) => {
                let n = if acerto.normal.dot(d) > 0.0 { -acerto.normal } else { acerto.normal };
                let material = self.cena.materiais[acerto.material];
                let albedo = material.cor() * (1.0 - material.metalico);
                let direto = self.sol_direto(acerto.ponto, n, rng);
                albedo * ((direto + self.irradiancia(n)) * (1.0 / PI))
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn pixel(&self, inversa: &[f64; 16], largura: u32, altura: u32, px: u32, py: u32, spp: u32, semente: u32) -> [f32; 3] {
        let mut soma = Vec3::zero();
        for amostra in 0..spp {
            let mut rng = Rng::novo(semente, px, py, amostra);
            let jx = rng.proximo_f64();
            let jy = rng.proximo_f64();
            let ndc_x = ((px as f64 + jx) / f64::from(largura)) * 2.0 - 1.0;
            let ndc_y = 1.0 - ((py as f64 + jy) / f64::from(altura)) * 2.0;
            let cor = match raio_da_camera(inversa, ndc_x, ndc_y) {
                None => Vec3::de_array(self.fundo),
                Some((origem, direcao)) => match self.cena.intersectar(origem, direcao, EPSILON_CPU, f64::INFINITY) {
                    None => {
                        if self.modo == Modo::SolDireto {
                            Vec3::de_array(self.fundo)
                        } else {
                            self.ceu(direcao, true)
                        }
                    }
                    Some(acerto) => {
                        let n = if acerto.normal.dot(direcao) > 0.0 { -acerto.normal } else { acerto.normal };
                        let material = self.cena.materiais[acerto.material];
                        let albedo = material.cor() * (1.0 - material.metalico);
                        let mut total = material.emissao() + albedo * (self.sol_direto(acerto.ponto, n, &mut rng) * (1.0 / PI));
                        match self.modo {
                            Modo::SolDireto => {}
                            Modo::SolCeu => total = total + albedo * (self.irradiancia(n) * (1.0 / PI)),
                            // O rebote já traz a luz do céu no ponto acertado; o peso é a cor.
                            Modo::SolCeuRebote => total = total + albedo * self.rebote(acerto.ponto, n, &mut rng),
                        }
                        total
                    }
                },
            };
            soma = soma + cor;
        }
        soma.para_array().map(|c| (c / f64::from(spp)) as f32)
    }
}

/// Máscara de superfície: `true` onde o raio do centro do pixel acerta geometria (sem jitter).
/// Pixels `false` são fundo (céu ou cor de fundo) e ficam fora das métricas de superfície.
pub fn mascara_superficie(cena: &Cena, largura: u32, altura: u32) -> Result<Vec<bool>, String> {
    let inversa = inverter(&cena.camera.matriz_vp()).ok_or("matriz da câmera não inverte")?;
    let mut saida = Vec::with_capacity((largura * altura) as usize);
    for py in 0..altura {
        for px in 0..largura {
            let ndc_x = ((px as f64 + 0.5) / largura as f64) * 2.0 - 1.0;
            let ndc_y = 1.0 - ((py as f64 + 0.5) / altura as f64) * 2.0;
            let acerta = match raio_da_camera(&inversa, ndc_x, ndc_y) {
                None => false,
                Some((origem, direcao)) => cena.intersectar(origem, direcao, EPSILON_CPU, f64::INFINITY).is_some(),
            };
            saida.push(acerta);
        }
    }
    Ok(saida)
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
