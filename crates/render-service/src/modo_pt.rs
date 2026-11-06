//! Modo `pt` (path tracing) do serviço: parâmetros do job, a recepção de `POST /jobs` e
//! `POST /jobs/cache` com `modo=pt`, e a thread que acumula amostras. O modo raster continua em
//! `main.rs` e não passa por aqui.
//!
//! Protocolo do modo pt:
//! - Parâmetros: `modo=pt` (o padrão é `raster`), `amostras=N` (1 a 4096, padrão 64), `denoise=1` (ou
//!   `true`). `amostras` e `denoise` sem `modo=pt` são recusados (400): nada é ignorado em silêncio.
//! - Fases: `decodificando`, `amostrando` (`fracao` = feitas / N), `montando`, `concluido`, e
//!   `cancelado` ou `erro`. Não há tiles neste modo.
//! - `GET /jobs/{id}` traz `"modo": "pt"`, `"amostras": {"feitas", "total"}` e `"denoise"`.
//! - `GET /jobs/{id}/preview`: o acumulado parcial a 320 px de largura, refeito a cada passe (com
//!   denoise, se pedido). Não há prévia de rasterização: a primeira amostra já é a imagem.
//! - `GET /jobs/{id}/result`: a imagem final em tamanho cheio, na fase `concluido`.
//! - `DELETE /jobs/{id}`: cancela entre passes.
//! - Memória: confere antes de alocar. Sem espaço, 507 com o necessário e o orçamento do perfil. Sem
//!   fallback: o modo pt nunca vira raster sozinho.
//! - Cache: cenas do modo pt ficam em cache próprio (`LIMITE_CACHE_PT`), pelo mesmo hash do HSTR.

use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;

use render_core::camera::Camera;
use render_core::Cena;
use render_engine::png_saida;
use render_pt0::{CenaPt, ErroPt, ImagemRgba8, Opcoes, Pt0};
use serde_json::json;
use tiny_http::Request;

use super::{Fim, Job, EstadoJob, Servico};

/// Amostras por pixel quando o pedido não diz.
pub const AMOSTRAS_PADRAO: u32 = 64;
/// Maior número de amostras aceito por job.
pub const AMOSTRAS_MAXIMAS: u32 = 4096;

/// O que a consulta pede: a rasterização (padrão) ou o path tracing com seus parâmetros.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ModoJob {
    Raster,
    Pt { amostras: u32, denoise: bool },
}

/// Lê `modo`, `amostras` e `denoise` da consulta. Sem `modo=pt`, `amostras` e `denoise` são erro.
pub fn ler_modo(consulta: &str) -> Result<ModoJob, String> {
    let mut modo = None;
    let mut amostras = None;
    let mut denoise = None;
    for par in consulta.split('&') {
        let Some((chave, valor)) = par.split_once('=') else {
            continue;
        };
        match chave {
            "modo" => modo = Some(valor),
            "amostras" => amostras = Some(valor),
            "denoise" => denoise = Some(valor),
            _ => {}
        }
    }
    match modo.unwrap_or("raster") {
        "raster" => {
            if amostras.is_some() || denoise.is_some() {
                Err("amostras e denoise só valem com modo=pt".into())
            } else {
                Ok(ModoJob::Raster)
            }
        }
        "pt" => {
            let amostras = match amostras {
                None => AMOSTRAS_PADRAO,
                Some(valor) => valor
                    .parse::<u32>()
                    .ok()
                    .filter(|n| (1..=AMOSTRAS_MAXIMAS).contains(n))
                    .ok_or_else(|| format!("amostras deve ser um inteiro de 1 a {AMOSTRAS_MAXIMAS}"))?,
            };
            let denoise = matches!(denoise, Some("1") | Some("true"));
            Ok(ModoJob::Pt { amostras, denoise })
        }
        outro => Err(format!("modo desconhecido '{outro}': use raster ou pt")),
    }
}

/// Andamento de um job do modo pt. Presente só nesses jobs (o raster não muda de forma).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct InfoPt {
    pub amostras_feitas: u32,
    pub amostras_total: u32,
    pub denoise: bool,
}

/// De onde vem a cena do modo pt: já na GPU (cache) ou decodificada agora, ainda não carregada.
pub enum OrigemPt {
    Cache { chave: u64, cena: Arc<CenaPt> },
    Nova { chave: u64, cena: Box<Cena> },
}

impl OrigemPt {
    fn chave(&self) -> u64 {
        match self {
            OrigemPt::Cache { chave, .. } | OrigemPt::Nova { chave, .. } => *chave,
        }
    }
}

/// Tudo o que um job do modo pt precisa.
pub struct PedidoPt {
    pub origem: OrigemPt,
    pub camera: Camera,
    pub largura: u32,
    pub altura: u32,
    pub exposicao: f64,
    pub amostras: u32,
    pub denoise: bool,
}

/// Parâmetros de render lidos da consulta, junto com a imagem.
#[derive(Clone, Copy, Debug)]
pub struct ParametrosPt {
    pub largura: u32,
    pub altura: u32,
    pub exposicao: f64,
    pub amostras: u32,
    pub denoise: bool,
}

/// Código HTTP de um erro do modo pt: memória é 507; o resto é a cena ou o argumento (400) ou a GPU (500).
pub fn status_de(erro: &ErroPt) -> u16 {
    match erro {
        ErroPt::Memoria { .. } => 507,
        ErroPt::Cena(_) | ErroPt::Argumentos(_) => 400,
        ErroPt::Gpu(_) | ErroPt::Cancelado => 500,
    }
}

/// `POST /jobs` com `modo=pt`: decodifica o HSTR, confere a memória e cria o job. Recusas: 400 (cena
/// inválida), 503 (sem GPU ou modo pt indisponível), 507 (sem memória).
pub fn receber_completo(
    req: Request,
    servico: &Arc<Servico>,
    bytes: &[u8],
    p: ParametrosPt,
) -> Result<(), String> {
    let Some(pt) = pt_disponivel(servico) else {
        return recusar_sem_pt(req, servico);
    };
    let chave = super::chave_da_cena(bytes).ok_or_else(|| "cena inválida: corpo menor que o trailer da câmera".to_string());
    let chave = match chave {
        Ok(chave) => chave,
        Err(e) => return super::erro_json(req, 400, &e),
    };
    let cache = match super::buscar_no_cache_pt(servico, chave) {
        Ok(cache) => cache,
        Err(e) => return super::erro_json(req, 500, &e),
    };
    let (origem, camera) = match cache {
        Some(cena) => {
            let camera = match super::camera_do_trailer(&bytes[bytes.len() - super::TAMANHO_TRAILER_CAMERA..]) {
                Ok(camera) => camera,
                Err(e) => return super::erro_json(req, 400, &e),
            };
            (OrigemPt::Cache { chave, cena }, camera)
        }
        None => {
            let cena = match super::decodificar_cena(bytes) {
                Ok(cena) => cena,
                Err(e) => return super::erro_json(req, 400, &e),
            };
            if let Err(e) = pt.conferir_memoria(&cena, p.largura, p.altura, p.denoise) {
                return super::erro_json(req, status_de(&e), &e.to_string());
            }
            let camera = cena.camera.clone();
            (OrigemPt::Nova { chave, cena: Box::new(cena) }, camera)
        }
    };
    if let OrigemPt::Cache { cena, .. } = &origem {
        if let Err(e) = pt.conferir_memoria_render(cena.bytes(), p.largura, p.altura, p.denoise) {
            return super::erro_json(req, status_de(&e), &e.to_string());
        }
    }
    criar_job(req, servico, pt, pedido(origem, camera, p))
}

/// `POST /jobs/cache` com `modo=pt`: a cena tem de estar no cache do modo pt (senão 404, e o cliente
/// reenvia o HSTR completo). Só o trailer da câmera vem no corpo.
pub fn receber_cache(
    req: Request,
    servico: &Arc<Servico>,
    chave: u64,
    bytes: &[u8],
    p: ParametrosPt,
) -> Result<(), String> {
    let Some(pt) = pt_disponivel(servico) else {
        return recusar_sem_pt(req, servico);
    };
    let cena = match super::buscar_no_cache_pt(servico, chave) {
        Ok(Some(cena)) => cena,
        Ok(None) => return super::resposta_sem_cache(req, chave),
        Err(e) => return super::erro_json(req, 500, &e),
    };
    let camera = match super::camera_do_trailer(bytes) {
        Ok(camera) => camera,
        Err(e) => return super::erro_json(req, 400, &e),
    };
    if let Err(e) = pt.conferir_memoria_render(cena.bytes(), p.largura, p.altura, p.denoise) {
        return super::erro_json(req, status_de(&e), &e.to_string());
    }
    criar_job(req, servico, pt, pedido(OrigemPt::Cache { chave, cena }, camera, p))
}

fn pedido(origem: OrigemPt, camera: Camera, p: ParametrosPt) -> PedidoPt {
    PedidoPt {
        origem,
        camera,
        largura: p.largura,
        altura: p.altura,
        exposicao: p.exposicao,
        amostras: p.amostras,
        denoise: p.denoise,
    }
}

/// O `Pt0` do serviço, se existe (há GPU e o pipeline validou).
fn pt_disponivel(servico: &Servico) -> Option<Arc<Pt0>> {
    servico.pt.clone()
}

/// 503 para o modo pt: sem GPU responde a mensagem da GPU; com GPU, o motivo da falha do `Pt0`.
fn recusar_sem_pt(req: Request, servico: &Servico) -> Result<(), String> {
    if servico.motor.is_none() {
        return super::sem_gpu(req, servico);
    }
    let motivo = servico
        .erro_pt
        .clone()
        .unwrap_or_else(|| "motivo desconhecido".into());
    super::erro_json(req, 503, &format!("modo pt indisponível: {motivo}"))
}

/// Cria o job, a thread, e responde `{id, hash, modo}`.
fn criar_job(req: Request, servico: &Arc<Servico>, pt: Arc<Pt0>, pedido: PedidoPt) -> Result<(), String> {
    let chave = pedido.origem.chave();
    let id = format!("job-{}", servico.sequencia.fetch_add(1, Ordering::Relaxed));
    let info = InfoPt {
        amostras_feitas: 0,
        amostras_total: pedido.amostras,
        denoise: pedido.denoise,
    };
    let job: Job = Arc::new(Mutex::new(EstadoJob {
        fase: "preparando".into(),
        pt: Some(info),
        ..EstadoJob::default()
    }));
    servico
        .jobs
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id.clone(), Arc::clone(&job));
    let id_thread = id.clone();
    let servico_thread = Arc::clone(servico);
    thread::spawn(move || executar(id_thread, pedido, job, pt, servico_thread));
    let corpo = json!({ "id": id, "hash": super::formatar_hash(chave), "modo": "pt" }).to_string();
    super::responder(req, 200, "application/json", corpo.into_bytes())
}

/// Thread do job. Falha vira fase `erro` com a mensagem (sem fallback para outro modo).
fn executar(id: String, pedido: PedidoPt, job: Job, pt: Arc<Pt0>, servico: Arc<Servico>) {
    let inicio = Instant::now();
    match rodar(&job, &pt, &servico, pedido) {
        Ok(Fim::Concluido) => println!(
            "render-service: job {id} (pt) concluído em {:.0} ms",
            inicio.elapsed().as_secs_f64() * 1000.0
        ),
        Ok(Fim::Cancelado) => println!("render-service: job {id} (pt) cancelado"),
        Err(e) => {
            eprintln!("render-service: job {id} (pt) falhou: {e}");
            if let Ok(mut estado) = job.lock() {
                estado.erro = Some(e);
                estado.fase = "erro".into();
            }
        }
    }
}

/// Acumula amostras, uma por passe. Depois de cada passe, atualiza `fracao`, `amostras` e a prévia
/// (320 px, com denoise se pedido). No fim, a imagem em tamanho cheio vira `resultado`.
fn rodar(job: &Job, pt: &Pt0, servico: &Servico, pedido: PedidoPt) -> Result<Fim, String> {
    let PedidoPt {
        origem,
        camera,
        largura,
        altura,
        exposicao,
        amostras,
        denoise,
    } = pedido;
    super::atualizar(job, "decodificando", 0.02);
    let cena = match origem {
        OrigemPt::Cache { cena, .. } => cena,
        OrigemPt::Nova { chave, cena } => {
            let carregada = Arc::new(pt.carregar_cena(&cena).map_err(|e| e.to_string())?);
            println!(
                "render-service: cena {} no modo pt, {:.1} MiB na GPU",
                super::formatar_hash(chave),
                carregada.bytes() as f64 / 1_048_576.0
            );
            super::guardar_no_cache_pt(servico, chave, Arc::clone(&carregada))?;
            carregada
        }
    };
    if super::cancelar_se_preciso(job) {
        return Ok(Fim::Cancelado);
    }

    let opcoes = Opcoes {
        denoise,
        exposicao,
        ..Opcoes::default()
    };
    let mut acumulacao = pt
        .iniciar(&cena, &camera, largura, altura, opcoes)
        .map_err(|e| e.to_string())?;
    super::atualizar(job, "amostrando", 0.0);
    let inicio = Instant::now();
    while acumulacao.amostras() < amostras {
        if super::cancelar_se_preciso(job) {
            return Ok(Fim::Cancelado);
        }
        let feitas = acumulacao.passe().map_err(|e| e.to_string())?;
        let previa = acumulacao
            .previa(super::LARGURA_PREVIA)
            .map_err(|e| e.to_string())?;
        let png = codificar(&previa)?;
        let mut estado = job.lock().map_err(|e| e.to_string())?;
        estado.preview = Some(png);
        estado.fracao = f64::from(feitas) / f64::from(amostras);
        if let Some(info) = estado.pt.as_mut() {
            info.amostras_feitas = feitas;
        }
    }
    let medio_ms = inicio.elapsed().as_secs_f64() * 1000.0 / f64::from(amostras.max(1));
    println!("render-service: job pt: {amostras} amostras, {medio_ms:.1} ms por passe (com prévia)");

    if super::cancelar_se_preciso(job) {
        return Ok(Fim::Cancelado);
    }
    super::atualizar(job, "montando", 1.0);
    let final_ = acumulacao.imagem().map_err(|e| e.to_string())?;
    let png_final = codificar(&final_)?;
    let mut estado = job.lock().map_err(|e| e.to_string())?;
    estado.resultado = Some(png_final);
    estado.fase = "concluido".into();
    estado.fracao = 1.0;
    Ok(Fim::Concluido)
}

fn codificar(imagem: &ImagemRgba8) -> Result<Vec<u8>, String> {
    png_saida::codificar(&imagem.rgba, imagem.largura, imagem.altura)
        .map_err(|e| format!("PNG do modo pt falhou: {e}"))
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn padrao_e_raster_sem_parametros_de_pt() {
        assert_eq!(ler_modo("largura=640&altura=360"), Ok(ModoJob::Raster));
        assert_eq!(ler_modo("modo=raster"), Ok(ModoJob::Raster));
    }

    #[test]
    fn pt_usa_padroes_e_le_os_parametros() {
        assert_eq!(
            ler_modo("modo=pt"),
            Ok(ModoJob::Pt { amostras: AMOSTRAS_PADRAO, denoise: false })
        );
        assert_eq!(
            ler_modo("modo=pt&amostras=16&denoise=1"),
            Ok(ModoJob::Pt { amostras: 16, denoise: true })
        );
        assert_eq!(
            ler_modo("denoise=true&amostras=4&modo=pt"),
            Ok(ModoJob::Pt { amostras: 4, denoise: true })
        );
    }

    #[test]
    fn amostras_fora_da_faixa_sao_recusadas() {
        assert!(ler_modo("modo=pt&amostras=0").is_err());
        assert!(ler_modo("modo=pt&amostras=4097").is_err());
        assert!(ler_modo("modo=pt&amostras=abc").is_err());
    }

    #[test]
    fn parametros_de_pt_sem_modo_pt_sao_erro() {
        assert!(ler_modo("amostras=16").is_err());
        assert!(ler_modo("modo=raster&denoise=1").is_err());
    }

    #[test]
    fn modo_desconhecido_e_erro_claro() {
        let erro = ler_modo("modo=cpu").unwrap_err();
        assert!(erro.contains("cpu") && erro.contains("raster ou pt"), "mensagem: {erro}");
    }

    #[test]
    fn memoria_e_507_e_o_resto_segue_o_tipo() {
        assert_eq!(status_de(&ErroPt::Memoria { necessario: 2, orcamento: 1 }), 507);
        assert_eq!(status_de(&ErroPt::Cena("x".into())), 400);
        assert_eq!(status_de(&ErroPt::Gpu("x".into())), 500);
    }
}
