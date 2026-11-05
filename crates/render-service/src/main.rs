//! Serviço local do renderizador GPU nativo do Hestia.
//!
//! O navegador envia o snapshot HSTR e recebe PNG/MP4. O render roda em `render-native`
//! (Rust/wgpu), nunca no path tracer de CPU do WASM.
//!
//! Rotas:
//! - `GET  /health`              → JSON do serviço
//! - `POST /render?largura&altura` → PNG (síncrono, imagem final)
//! - `POST /jobs?largura&altura`  → `{id}`; render progressivo em background
//! - `GET  /jobs/{id}`            → JSON do andamento
//! - `GET  /jobs/{id}/preview`    → último PNG parcial
//! - `GET  /jobs/{id}/result`     → PNG final
//! - `DELETE /jobs/{id}`          → cancela (cooperativo entre passes)

use std::collections::HashMap;
use std::io::Read;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use render_core::camera::Camera;
use render_core::Cena;
use serde_json::json;
use tiny_http::{Header, Method, Request, Response, Server};

const PORTA: u16 = 19787;
const MAX_CORPO: usize = 256 * 1024 * 1024;

#[derive(Default)]
struct EstadoJob {
    fase: String,
    fracao: f32,
    preview: Option<Vec<u8>>,
    resultado: Option<Vec<u8>>,
    erro: Option<String>,
    cancelado: bool,
}

type Job = Arc<Mutex<EstadoJob>>;

struct Servico {
    jobs: Mutex<HashMap<String, Job>>,
    /** Cenas carregadas para vídeo: a BVH é decodificada uma vez por sequência. */
    cenas: Mutex<HashMap<String, Arc<Cena>>>,
    sequencia: AtomicU64,
}

fn main() {
    let servico = Arc::new(Servico {
        jobs: Mutex::new(HashMap::new()),
        cenas: Mutex::new(HashMap::new()),
        sequencia: AtomicU64::new(1),
    });
    let endereco = format!("127.0.0.1:{PORTA}");
    let servidor = match Server::http(&endereco) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("render-service: não foi possível abrir {endereco}: {e}");
            std::process::exit(1);
        }
    };
    println!("render-service: http://{endereco}");

    for requisicao in servidor.incoming_requests() {
        let estado = Arc::clone(&servico);
        // Cada requisição é curta; o render pesado fica no thread do job.
        if let Err(e) = atender(requisicao, estado) {
            eprintln!("render-service: erro ao atender: {e}");
        }
    }
}

fn atender(mut req: Request, servico: Arc<Servico>) -> Result<(), String> {
    if req.method() == &Method::Options {
        return responder(req, 204, "text/plain", Vec::new());
    }

    let url = req.url().to_string();
    let (rota, consulta) = match url.split_once('?') {
        Some((r, q)) => (r, q),
        None => (url.as_str(), ""),
    };

    match (req.method().clone(), rota) {
        (Method::Get, "/health") => {
            let corpo = json!({
                "ok": true,
                "versao": env!("CARGO_PKG_VERSION"),
                "backend": "wgpu",
                "gpu": "nativo",
            })
            .to_string();
            responder(req, 200, "application/json", corpo.into_bytes())
        }
        (Method::Post, "/render") => {
            let (largura, altura) = dimensoes(consulta);
            let exposicao = fator_exposicao(consulta);
            let bytes = ler_corpo(&mut req)?;
            let png = render_sincrono(&bytes, largura, altura, exposicao)?;
            responder(req, 200, "image/png", png)
        }
        (Method::Post, "/jobs") => {
            let (largura, altura) = dimensoes(consulta);
            let exposicao = fator_exposicao(consulta);
            let bytes = ler_corpo(&mut req)?;
            let id = format!(
                "job-{}",
                servico.sequencia.fetch_add(1, Ordering::Relaxed)
            );
            let job: Job = Arc::new(Mutex::new(EstadoJob {
                fase: "preparando".into(),
                ..EstadoJob::default()
            }));
            servico.jobs.lock().map_err(|e| e.to_string())?.insert(id.clone(), Arc::clone(&job));
            let id_thread = id.clone();
            thread::spawn(move || executar_job(id_thread, bytes, largura, altura, exposicao, job));
            let corpo = json!({ "id": id }).to_string();
            responder(req, 200, "application/json", corpo.into_bytes())
        }
        (Method::Post, "/scenes") => {
            let bytes = ler_corpo(&mut req)?;
            let cena = Cena::decodificar(&bytes).map_err(|e| format!("cena inválida: {e}"))?;
            let id = format!("cena-{}", servico.sequencia.fetch_add(1, Ordering::Relaxed));
            servico
                .cenas
                .lock()
                .map_err(|e| e.to_string())?
                .insert(id.clone(), Arc::new(cena));
            responder(req, 200, "application/json", json!({ "id": id }).to_string().into_bytes())
        }
        (Method::Post, rota) if rota.starts_with("/scenes/") => {
            let resto = &rota["/scenes/".len()..];
            let Some((id, "frame")) = resto.split_once('/') else {
                return responder(req, 404, "text/plain", b"rota".to_vec());
            };
            let cena = {
                let cenas = servico.cenas.lock().map_err(|e| e.to_string())?;
                cenas.get(id).cloned()
            };
            let Some(cena) = cena else {
                return responder(req, 404, "application/json", b"{\"erro\":\"cena inexistente\"}".to_vec());
            };
            let (largura, altura) = dimensoes(consulta);
            let exposicao = fator_exposicao(consulta);
            let bytes = ler_corpo(&mut req)?;
            let camera = Camera::de_quadro(&bytes).map_err(|e| format!("câmera inválida: {e}"))?;
            let png = render_native::renderizar_com_camera(&cena, &camera, largura, altura, exposicao)
                .and_then(|img| render_native::png_saida::codificar(&img.rgba, img.largura, img.altura))
                .map_err(|e| format!("render GPU falhou: {e}"))?;
            responder(req, 200, "image/png", png)
        }
        (Method::Delete, rota) if rota.starts_with("/scenes/") => {
            let id = &rota["/scenes/".len()..];
            servico.cenas.lock().map_err(|e| e.to_string())?.remove(id);
            responder(req, 200, "application/json", b"{\"ok\":true}".to_vec())
        }
        (Method::Get, rota) if rota.starts_with("/jobs/") => {
            let resto = &rota["/jobs/".len()..];
            let (id, parte) = resto.split_once('/').unwrap_or((resto, ""));
            let job = {
                let jobs = servico.jobs.lock().map_err(|e| e.to_string())?;
                jobs.get(id).cloned()
            };
            let Some(job) = job else {
                return responder(req, 404, "application/json", b"{\"erro\":\"job inexistente\"}".to_vec());
            };
            match parte {
                "" => status_json(req, &job),
                "preview" => imagem_do_job(req, &job, false),
                "result" => imagem_do_job(req, &job, true),
                _ => responder(req, 404, "text/plain", b"rota".to_vec()),
            }
        }
        (Method::Delete, rota) if rota.starts_with("/jobs/") => {
            let id = &rota["/jobs/".len()..];
            let job = {
                let jobs = servico.jobs.lock().map_err(|e| e.to_string())?;
                jobs.get(id).cloned()
            };
            let Some(job) = job else {
                return responder(req, 404, "application/json", b"{\"erro\":\"job inexistente\"}".to_vec());
            };
            if let Ok(mut estado) = job.lock() {
                estado.cancelado = true;
            }
            responder(req, 200, "application/json", b"{\"ok\":true}".to_vec())
        }
        _ => responder(req, 404, "text/plain", b"rota desconhecida".to_vec()),
    }
}

fn dimensoes(consulta: &str) -> (u32, u32) {
    let mut largura = 1280;
    let mut altura = 720;
    for par in consulta.split('&') {
        let Some((chave, valor)) = par.split_once('=') else { continue };
        let Ok(n) = valor.parse::<u32>() else { continue };
        if chave == "largura" && (1..=16_384).contains(&n) {
            largura = n;
        }
        if chave == "altura" && (1..=16_384).contains(&n) {
            altura = n;
        }
    }
    (largura, altura)
}

/// `exposicao` chega em EV (paradas) e o render usa o multiplicador `2^EV`.
fn fator_exposicao(consulta: &str) -> f64 {
    for par in consulta.split('&') {
        let Some((chave, valor)) = par.split_once('=') else { continue };
        if chave == "exposicao" {
            if let Ok(ev) = valor.parse::<f64>() {
                if ev.is_finite() {
                    return 2f64.powf(ev.clamp(-10.0, 10.0));
                }
            }
        }
    }
    1.0
}

fn ler_corpo(req: &mut Request) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    req.as_reader()
        .take(MAX_CORPO as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > MAX_CORPO {
        return Err("corpo maior que 256 MiB".into());
    }
    if bytes.is_empty() {
        return Err("corpo vazio: envie o scene.hstr".into());
    }
    Ok(bytes)
}

fn render_sincrono(bytes: &[u8], largura: u32, altura: u32, exposicao: f64) -> Result<Vec<u8>, String> {
    let cena = render_core::Cena::decodificar(bytes).map_err(|e| format!("cena inválida: {e}"))?;
    let imagem = render_native::renderizar_com_exposicao(&cena, largura, altura, exposicao)
        .map_err(|e| format!("render GPU falhou: {e}"))?;
    render_native::png_saida::codificar(&imagem.rgba, imagem.largura, imagem.altura)
        .map_err(|e| format!("PNG falhou: {e}"))
}

fn executar_job(id: String, bytes: Vec<u8>, largura: u32, altura: u32, exposicao: f64, job: Job) {
    let atualizar = |fase: &str, fracao: f32| {
        if let Ok(mut estado) = job.lock() {
            estado.fase = fase.to_string();
            estado.fracao = fracao;
        }
    };
    atualizar("decodificando", 0.02);
    let cena = match render_core::Cena::decodificar(&bytes) {
        Ok(c) => c,
        Err(e) => {
            if let Ok(mut estado) = job.lock() {
                estado.erro = Some(format!("cena inválida: {e}"));
                estado.fase = "erro".into();
            }
            return;
        }
    };

    let mut passos = Vec::new();
    for (w, h) in [(480.min(largura), 270.min(altura)), (960.min(largura), 540.min(altura)), (largura, altura)] {
        if w == 0 || h == 0 || passos.contains(&(w, h)) { continue; }
        passos.push((w, h));
    }

    for (indice, (w, h)) in passos.iter().enumerate() {
        let cancelado = job.lock().map(|e| e.cancelado).unwrap_or(true);
        if cancelado {
            if let Ok(mut estado) = job.lock() {
                estado.fase = "cancelado".into();
            }
            return;
        }
        let ultimo = indice + 1 == passos.len();
        atualizar(if ultimo { "renderizando final" } else { "prévia" }, 0.05 + 0.9 * (indice as f32 / passos.len() as f32));
        match render_native::renderizar_com_exposicao(&cena, *w, *h, exposicao)
            .and_then(|img| render_native::png_saida::codificar(&img.rgba, img.largura, img.altura))
        {
            Ok(png) => {
                if let Ok(mut estado) = job.lock() {
                    estado.preview = Some(png.clone());
                    if ultimo {
                        estado.resultado = Some(png);
                        estado.fase = "concluído".into();
                        estado.fracao = 1.0;
                    }
                }
            }
            Err(e) => {
                if let Ok(mut estado) = job.lock() {
                    estado.erro = Some(format!("render GPU falhou: {e}"));
                    estado.fase = "erro".into();
                }
                return;
            }
        }
    }
    println!("render-service: job {id} concluído");
}

fn status_json(req: Request, job: &Job) -> Result<(), String> {
    let estado = job.lock().map_err(|e| e.to_string())?;
    let corpo = json!({
        "fase": estado.fase,
        "fracao": estado.fracao,
        "pronto": estado.resultado.is_some(),
        "cancelado": estado.cancelado,
        "erro": estado.erro,
    })
    .to_string();
    drop(estado);
    responder(req, 200, "application/json", corpo.into_bytes())
}

fn imagem_do_job(req: Request, job: &Job, final_: bool) -> Result<(), String> {
    let estado = job.lock().map_err(|e| e.to_string())?;
    let imagem = if final_ { estado.resultado.clone() } else { estado.preview.clone() };
    let erro = estado.erro.clone();
    drop(estado);
    match imagem {
        Some(png) => responder(req, 200, "image/png", png),
        None => {
            let corpo = json!({ "erro": erro.unwrap_or_else(|| "sem imagem ainda".into()) }).to_string();
            responder(req, 404, "application/json", corpo.into_bytes())
        }
    }
}

fn responder(req: Request, status: u16, tipo: &str, corpo: Vec<u8>) -> Result<(), String> {
    let mut resposta = Response::from_data(corpo).with_status_code(status);
    for (nome, valor) in [
        ("Content-Type", tipo),
        ("Access-Control-Allow-Origin", "*"),
        ("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS"),
        ("Access-Control-Allow-Headers", "content-type"),
        ("Cache-Control", "no-store"),
    ] {
        if let Ok(header) = Header::from_bytes(nome.as_bytes(), valor.as_bytes()) {
            resposta.add_header(header);
        }
    }
    req.respond(resposta).map_err(|e| e.to_string())
}
