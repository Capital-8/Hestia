//! Serviço local do renderizador GPU nativo do Hestia.
//!
//! O navegador envia o snapshot HSTR e recebe PNG. O render roda em `render-engine` (Rust/wgpu).
//! Um único `Motor` é criado na inicialização e reusado por cenas, renders síncronos e jobs.
//! Sem adaptador GPU o processo continua de pé: `/health` informa `gpu_disponivel: false` e as
//! rotas de render respondem 503 com a mensagem. Não existe fallback de CPU.
//!
//! Rotas:
//! - `GET  /health`                     → JSON do serviço e da GPU
//! - `POST /render?largura&altura`      → PNG (síncrono, imagem final)
//! - `POST /scenes`                     → `{id}`; carrega a cena na GPU uma vez
//! - `POST /scenes/{id}/frame?...`      → PNG de um quadro (câmera no corpo)
//! - `DELETE /scenes/{id}`              → descarta a cena
//! - `POST /jobs?largura&altura`        → `{id}`; render por tiles em background
//! - `GET  /jobs/{id}`                  → JSON do andamento (fase, fracao, tiles)
//! - `GET  /jobs/{id}/tile/{i}`         → PNG do tile `i`, se já concluído
//! - `GET  /jobs/{id}/preview`          → prévia PNG (320 px de largura)
//! - `GET  /jobs/{id}/result`           → PNG final
//! - `DELETE /jobs/{id}`                → cancela (cooperativo entre tiles)
//!
//! Fases de um job, em ordem: `decodificando`, `previa`, `tiles`, `montando`, `concluido`.
//! Também: `cancelado` e `erro`. A imagem final só é publicada na fase `concluido`.

use std::collections::HashMap;
use std::io::Read;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;

use render_core::camera::Camera;
use render_core::Cena;
use render_engine::{png_saida, CenaGpu, Motor, Retangulo};
use serde_json::json;
use tiny_http::{Header, Method, Request, Response, Server};

const PORTA: u16 = 19787;
const MAX_CORPO: usize = 256 * 1024 * 1024;
/// Lado dos tiles do render final (contrato do render-engine).
const LADO_TILE: u32 = 256;
/// Largura da prévia em pixels; a altura segue a proporção da imagem.
const LARGURA_PREVIA: u32 = 320;

/// Tile já renderizado. Guardamos o PNG (para `/tile/{i}`) e o RGBA (para montar a imagem final).
/// O RGBA é liberado logo após a fase `montando`. Para 4K, o RGBA de todos os tiles soma cerca de
/// 33 MB; aceito pelo brief. Não decodificamos o PNG de volta para evitar uma dependência extra.
struct TileConcluido {
    indice: usize,
    regiao: Retangulo,
    png: Vec<u8>,
    rgba: Vec<u8>,
}

#[derive(Default)]
struct EstadoJob {
    fase: String,
    fracao: f64,
    preview: Option<Vec<u8>>,
    tiles_total: usize,
    /// Em ordem de conclusão; `indice` é a posição na ordem espiral.
    tiles: Vec<TileConcluido>,
    resultado: Option<Vec<u8>>,
    erro: Option<String>,
    cancelado: bool,
}

type Job = Arc<Mutex<EstadoJob>>;

struct Servico {
    /// Motor persistente, criado uma vez. `None` quando não há adaptador GPU.
    motor: Option<Arc<Motor>>,
    /// Motivo da falha ao criar o motor (presente só quando `motor` é `None`).
    erro_gpu: Option<String>,
    jobs: Mutex<HashMap<String, Job>>,
    /// Cenas já carregadas na GPU, por id.
    cenas: Mutex<HashMap<String, Arc<CenaGpu>>>,
    sequencia: AtomicU64,
}

/// Desfecho de um job que não falhou.
enum Fim {
    Concluido,
    Cancelado,
}

fn main() {
    let (motor, erro_gpu) = match Motor::nativo() {
        Ok(m) => (Some(Arc::new(m)), None),
        Err(e) => {
            let mensagem = e.to_string();
            eprintln!("render-service: GPU indisponível: {mensagem}");
            (None, Some(mensagem))
        }
    };
    let servico = Arc::new(Servico {
        motor,
        erro_gpu,
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
    if let Some(motor) = &servico.motor {
        println!("render-service: GPU {:?} {}", motor.backend(), motor.adaptador());
    }

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
                "gpu_disponivel": servico.motor.is_some(),
                "erro_gpu": servico.erro_gpu,
                "adaptador": servico.motor.as_ref().map(|m| m.adaptador().to_string()),
            })
            .to_string();
            responder(req, 200, "application/json", corpo.into_bytes())
        }
        (Method::Post, "/render") => {
            let (largura, altura) = dimensoes(consulta);
            let exposicao = fator_exposicao(consulta);
            let bytes = match ler_corpo(&mut req) {
                Ok(b) => b,
                Err(e) => return erro_json(req, 400, &e),
            };
            let Some(motor) = servico.motor.clone() else {
                return sem_gpu(req, &servico);
            };
            let cena = match decodificar_cena(&bytes) {
                Ok(c) => c,
                Err(e) => return erro_json(req, 400, &e),
            };
            match render_sincrono(&motor, &cena, largura, altura, exposicao) {
                Ok(png) => responder(req, 200, "image/png", png),
                Err(e) => erro_json(req, 500, &e),
            }
        }
        (Method::Post, "/jobs") => {
            let (largura, altura) = dimensoes(consulta);
            let exposicao = fator_exposicao(consulta);
            let bytes = match ler_corpo(&mut req) {
                Ok(b) => b,
                Err(e) => return erro_json(req, 400, &e),
            };
            let Some(motor) = servico.motor.clone() else {
                return sem_gpu(req, &servico);
            };
            // Cena inválida recusada já aqui: sem id, sem job e sem thread.
            let cena = match decodificar_cena(&bytes) {
                Ok(c) => c,
                Err(e) => return erro_json(req, 400, &e),
            };
            let id = format!("job-{}", servico.sequencia.fetch_add(1, Ordering::Relaxed));
            let job: Job = Arc::new(Mutex::new(EstadoJob {
                fase: "preparando".into(),
                ..EstadoJob::default()
            }));
            servico
                .jobs
                .lock()
                .map_err(|e| e.to_string())?
                .insert(id.clone(), Arc::clone(&job));
            let id_thread = id.clone();
            thread::spawn(move || executar_job(id_thread, cena, largura, altura, exposicao, job, motor));
            let corpo = json!({ "id": id }).to_string();
            responder(req, 200, "application/json", corpo.into_bytes())
        }
        (Method::Post, "/scenes") => {
            let bytes = match ler_corpo(&mut req) {
                Ok(b) => b,
                Err(e) => return erro_json(req, 400, &e),
            };
            let Some(motor) = servico.motor.clone() else {
                return sem_gpu(req, &servico);
            };
            let cena = match Cena::decodificar(&bytes) {
                Ok(c) => c,
                Err(e) => return erro_json(req, 400, &format!("cena inválida: {e}")),
            };
            let cena_gpu = match motor.carregar_cena(&cena) {
                Ok(c) => c,
                Err(e) => return erro_json(req, 500, &format!("carga na GPU falhou: {e}")),
            };
            let id = format!("cena-{}", servico.sequencia.fetch_add(1, Ordering::Relaxed));
            servico
                .cenas
                .lock()
                .map_err(|e| e.to_string())?
                .insert(id.clone(), Arc::new(cena_gpu));
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
            let bytes = match ler_corpo(&mut req) {
                Ok(b) => b,
                Err(e) => return erro_json(req, 400, &e),
            };
            let Some(motor) = servico.motor.clone() else {
                return sem_gpu(req, &servico);
            };
            let camera = match Camera::de_quadro(&bytes) {
                Ok(c) => c,
                Err(e) => return erro_json(req, 400, &format!("câmera inválida: {e}")),
            };
            let regiao = Retangulo { x: 0, y: 0, w: largura, h: altura };
            let png = motor
                .renderizar_regiao(&cena, &camera, largura, altura, regiao, exposicao)
                .and_then(|rgba| png_saida::codificar(&rgba, largura, altura));
            match png {
                Ok(png) => responder(req, 200, "image/png", png),
                Err(e) => erro_json(req, 500, &format!("render GPU falhou: {e}")),
            }
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
                _ => match parte.strip_prefix("tile/").and_then(|n| n.parse::<usize>().ok()) {
                    Some(indice) => tile_do_job(req, &job, indice),
                    None => responder(req, 404, "text/plain", b"rota".to_vec()),
                },
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

/// Dimensões da prévia: largura fixa de 320 px, altura proporcional e no mínimo 1.
fn dimensoes_previa(largura: u32, altura: u32) -> (u32, u32) {
    let arredondado = u64::from(altura) * u64::from(LARGURA_PREVIA) + u64::from(largura) / 2;
    let ph = (arredondado / u64::from(largura)).max(1) as u32;
    (LARGURA_PREVIA, ph)
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

/// Resposta 503 quando não há GPU. A mensagem é a que `Motor::nativo()` devolveu na inicialização.
fn sem_gpu(req: Request, servico: &Servico) -> Result<(), String> {
    let mensagem = servico
        .erro_gpu
        .clone()
        .unwrap_or_else(|| "GPU indisponível".into());
    let corpo = json!({ "erro": mensagem, "gpu_disponivel": false }).to_string();
    responder(req, 503, "application/json", corpo.into_bytes())
}

fn erro_json(req: Request, status: u16, mensagem: &str) -> Result<(), String> {
    let corpo = json!({ "erro": mensagem }).to_string();
    responder(req, status, "application/json", corpo.into_bytes())
}

/// Decodifica o HSTR da requisição. Erro vira 400 no handler (cena inválida, não falha de GPU).
fn decodificar_cena(bytes: &[u8]) -> Result<Cena, String> {
    Cena::decodificar(bytes).map_err(|e| format!("cena inválida: {e}"))
}

/// Render síncrono da imagem inteira com o motor persistente, a partir de uma cena já decodificada.
/// Carrega a cena só para esta chamada (a cena de vídeo usa `POST /scenes`).
fn render_sincrono(
    motor: &Motor,
    cena: &Cena,
    largura: u32,
    altura: u32,
    exposicao: f64,
) -> Result<Vec<u8>, String> {
    let cena_gpu = motor
        .carregar_cena(cena)
        .map_err(|e| format!("render GPU falhou: {e}"))?;
    let regiao = Retangulo { x: 0, y: 0, w: largura, h: altura };
    let rgba = motor
        .renderizar_regiao(&cena_gpu, &cena.camera, largura, altura, regiao, exposicao)
        .map_err(|e| format!("render GPU falhou: {e}"))?;
    png_saida::codificar(&rgba, largura, altura).map_err(|e| format!("PNG falhou: {e}"))
}

fn atualizar(job: &Job, fase: &str, fracao: f64) {
    if let Ok(mut estado) = job.lock() {
        estado.fase = fase.to_string();
        estado.fracao = fracao;
    }
}

/// Se o job foi cancelado, marca a fase `cancelado` e devolve `true`.
fn cancelar_se_preciso(job: &Job) -> bool {
    let cancelado = job.lock().map(|e| e.cancelado).unwrap_or(true);
    if cancelado {
        if let Ok(mut estado) = job.lock() {
            estado.fase = "cancelado".into();
        }
    }
    cancelado
}

fn executar_job(
    id: String,
    cena: Cena,
    largura: u32,
    altura: u32,
    exposicao: f64,
    job: Job,
    motor: Arc<Motor>,
) {
    match rodar_job(&job, &motor, &cena, largura, altura, exposicao) {
        Ok(Fim::Concluido) => println!("render-service: job {id} concluído"),
        Ok(Fim::Cancelado) => println!("render-service: job {id} cancelado"),
        Err(e) => {
            eprintln!("render-service: job {id} falhou: {e}");
            if let Ok(mut estado) = job.lock() {
                estado.erro = Some(e);
                estado.fase = "erro".into();
            }
        }
    }
}

/// Fases: decodificando, previa, tiles, montando, concluido. Qualquer `Err` vira fase `erro`
/// em `executar_job`. A imagem final só entra em `resultado` no fim da fase `montando`.
/// A cena já chega decodificada (o handler recusa cena inválida antes de criar o job).
fn rodar_job(
    job: &Job,
    motor: &Motor,
    cena: &Cena,
    largura: u32,
    altura: u32,
    exposicao: f64,
) -> Result<Fim, String> {
    // Fase mantida para o contrato de `GET /jobs/{id}`; a decodificação já ocorreu antes do job.
    atualizar(job, "decodificando", 0.02);
    let cena_gpu = motor
        .carregar_cena(cena)
        .map_err(|e| format!("carga na GPU falhou: {e}"))?;
    if cancelar_se_preciso(job) {
        return Ok(Fim::Cancelado);
    }

    // Prévia: uma passada da imagem inteira em 320 px de largura. Não conta como tile.
    let (pw, ph) = dimensoes_previa(largura, altura);
    atualizar(job, "previa", 0.05);
    let regiao_previa = Retangulo { x: 0, y: 0, w: pw, h: ph };
    let rgba_previa = motor
        .renderizar_regiao(&cena_gpu, &cena.camera, pw, ph, regiao_previa, exposicao)
        .map_err(|e| format!("render da prévia falhou: {e}"))?;
    let png_previa =
        png_saida::codificar(&rgba_previa, pw, ph).map_err(|e| format!("PNG da prévia falhou: {e}"))?;
    if let Ok(mut estado) = job.lock() {
        estado.preview = Some(png_previa);
    }

    // Tiles: ordem espiral; cada um renderizado como recorte da imagem inteira, sem costura.
    let tiles = render_engine::ordenar_tiles_espiral(largura, altura, LADO_TILE)
        .map_err(|e| format!("tiles inválidos: {e}"))?;
    let total = tiles.len();
    if let Ok(mut estado) = job.lock() {
        estado.tiles_total = total;
    }
    atualizar(job, "tiles", 0.0);
    for (indice, regiao) in tiles.iter().copied().enumerate() {
        if cancelar_se_preciso(job) {
            return Ok(Fim::Cancelado);
        }
        let rgba = motor
            .renderizar_regiao(&cena_gpu, &cena.camera, largura, altura, regiao, exposicao)
            .map_err(|e| format!("render do tile {indice} falhou: {e}"))?;
        let png = png_saida::codificar(&rgba, regiao.w, regiao.h)
            .map_err(|e| format!("PNG do tile {indice} falhou: {e}"))?;
        let mut estado = job.lock().map_err(|e| e.to_string())?;
        estado.tiles.push(TileConcluido { indice, regiao, png, rgba });
        estado.fracao = estado.tiles.len() as f64 / total as f64;
    }

    if cancelar_se_preciso(job) {
        return Ok(Fim::Cancelado);
    }
    atualizar(job, "montando", 1.0);
    let rgba_final = {
        let estado = job.lock().map_err(|e| e.to_string())?;
        let partes: Vec<(Retangulo, &[u8])> = estado
            .tiles
            .iter()
            .map(|t| (t.regiao, t.rgba.as_slice()))
            .collect();
        montar_imagem(largura, altura, &partes)?
    };
    let png_final =
        png_saida::codificar(&rgba_final, largura, altura).map_err(|e| format!("PNG final falhou: {e}"))?;
    drop(rgba_final);

    let mut estado = job.lock().map_err(|e| e.to_string())?;
    for tile in estado.tiles.iter_mut() {
        tile.rgba = Vec::new();
    }
    estado.resultado = Some(png_final);
    estado.fase = "concluido".into();
    estado.fracao = 1.0;
    Ok(Fim::Concluido)
}

/// Recompõe a imagem `largura x altura` (RGBA8 sem padding) a partir dos tiles. Não renderiza:
/// só copia cada região. Erro se um tile sair da imagem, tiver tamanho errado ou se os tiles não
/// cobrirem todos os pixels.
fn montar_imagem(largura: u32, altura: u32, tiles: &[(Retangulo, &[u8])]) -> Result<Vec<u8>, String> {
    let (l, a) = (largura as usize, altura as usize);
    let mut imagem = vec![0u8; l * a * 4];
    let mut area = 0usize;
    for (regiao, rgba) in tiles {
        let (x, y) = (regiao.x as usize, regiao.y as usize);
        let (w, h) = (regiao.w as usize, regiao.h as usize);
        if w == 0 || h == 0 || x + w > l || y + h > a {
            return Err(format!("tile {regiao:?} fora da imagem {largura}x{altura}"));
        }
        if rgba.len() != w * h * 4 {
            return Err(format!(
                "tile {regiao:?} com {} bytes; esperado {}",
                rgba.len(),
                w * h * 4
            ));
        }
        for linha in 0..h {
            let origem = linha * w * 4;
            let destino = ((y + linha) * l + x) * 4;
            imagem[destino..destino + w * 4].copy_from_slice(&rgba[origem..origem + w * 4]);
        }
        area += w * h;
    }
    if area != l * a {
        return Err(format!("tiles cobrem {area} de {} pixels", l * a));
    }
    Ok(imagem)
}

fn status_json(req: Request, job: &Job) -> Result<(), String> {
    let estado = job.lock().map_err(|e| e.to_string())?;
    let mut corpo = json!({
        "fase": estado.fase,
        "fracao": estado.fracao,
        "pronto": estado.resultado.is_some(),
        "cancelado": estado.cancelado,
        "erro": estado.erro,
    });
    if matches!(estado.fase.as_str(), "tiles" | "montando" | "concluido") {
        let concluidos: Vec<_> = estado
            .tiles
            .iter()
            .map(|t| json!({ "i": t.indice, "x": t.regiao.x, "y": t.regiao.y, "w": t.regiao.w, "h": t.regiao.h }))
            .collect();
        corpo["tiles"] = json!({ "total": estado.tiles_total, "concluidos": concluidos });
    }
    let texto = corpo.to_string();
    drop(estado);
    responder(req, 200, "application/json", texto.into_bytes())
}

fn tile_do_job(req: Request, job: &Job, indice: usize) -> Result<(), String> {
    let png = {
        let estado = job.lock().map_err(|e| e.to_string())?;
        let achado = estado
            .tiles
            .iter()
            .find(|t| t.indice == indice)
            .map(|t| t.png.clone());
        achado
    };
    match png {
        Some(png) => responder(req, 200, "image/png", png),
        None => erro_json(req, 404, "tile inexistente ou ainda não concluído"),
    }
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

#[cfg(test)]
mod testes {
    use super::*;
    use render_engine::ordenar_tiles_espiral;

    /// Imagem sintética com cor única por pixel (sem repetição dentro de 5x3).
    fn imagem_sintetica(largura: u32, altura: u32) -> Vec<u8> {
        (0..altura)
            .flat_map(move |y| {
                (0..largura).flat_map(move |x| [x as u8, y as u8, (x * 31 + y * 17) as u8, 255])
            })
            .collect()
    }

    /// Recorta a região `t` da imagem (RGBA, sem padding), como faria um render por tile.
    fn recortar(imagem: &[u8], largura: u32, t: Retangulo) -> Vec<u8> {
        let mut saida = Vec::with_capacity((t.w * t.h * 4) as usize);
        for linha in t.y..t.y + t.h {
            let inicio = ((linha * largura + t.x) * 4) as usize;
            saida.extend_from_slice(&imagem[inicio..inicio + (t.w * 4) as usize]);
        }
        saida
    }

    #[test]
    fn montagem_reproduz_imagem_original() {
        let (largura, altura) = (5u32, 3u32);
        let original = imagem_sintetica(largura, altura);
        let tiles = ordenar_tiles_espiral(largura, altura, 2).unwrap();
        assert_eq!(tiles.len(), 6);
        let partes: Vec<(Retangulo, Vec<u8>)> = tiles
            .iter()
            .map(|&t| (t, recortar(&original, largura, t)))
            .collect();
        let refs: Vec<(Retangulo, &[u8])> = partes.iter().map(|(t, rgba)| (*t, rgba.as_slice())).collect();
        let montada = montar_imagem(largura, altura, &refs).unwrap();
        assert_eq!(montada, original);
    }

    #[test]
    fn montagem_recusa_tile_faltando() {
        let (largura, altura) = (5u32, 3u32);
        let original = imagem_sintetica(largura, altura);
        let tiles = ordenar_tiles_espiral(largura, altura, 2).unwrap();
        let refs: Vec<(Retangulo, Vec<u8>)> = tiles[..tiles.len() - 1]
            .iter()
            .map(|&t| (t, recortar(&original, largura, t)))
            .collect();
        let refs: Vec<(Retangulo, &[u8])> = refs.iter().map(|(t, rgba)| (*t, rgba.as_slice())).collect();
        assert!(montar_imagem(largura, altura, &refs).is_err());
    }

    #[test]
    fn bytes_invalidos_viram_erro_de_cena() {
        match decodificar_cena(b"lixo") {
            Ok(_) => panic!("bytes inválidos não podem decodificar"),
            Err(erro) => assert!(erro.starts_with("cena inválida: "), "mensagem inesperada: {erro}"),
        }
    }

    #[test]
    fn previa_mantem_proporcao_com_minimo_de_uma_linha() {
        assert_eq!(dimensoes_previa(640, 360), (320, 180));
        assert_eq!(dimensoes_previa(1920, 1080), (320, 180));
        assert_eq!(dimensoes_previa(10_000, 1), (320, 1));
    }
}
