//! Serviço local do renderizador GPU nativo do Hestia.
//!
//! O navegador envia o snapshot HSTR e recebe PNG. O render roda em `render-engine` (Rust/wgpu).
//! Um único `Motor` é criado na inicialização e reusado por cenas, renders síncronos e jobs.
//! Sem adaptador GPU o processo continua de pé: `/health` informa `gpu_disponivel: false` e as
//! rotas de render respondem 503 com a mensagem. Não existe fallback de CPU.
//!
//! Rotas:
//! - `GET  /health`                     → JSON do serviço, da GPU e do perfil de qualidade (`perfil`)
//! - `POST /render?largura&altura`      → PNG (síncrono, imagem final)
//! - `POST /scenes`                     → `{id, hash}`; carrega a cena na GPU (ou reusa o cache)
//! - `POST /scenes/cache?hash=H`        → `{id, hash}` se H está no cache (200); 404 se não
//! - `POST /scenes/{id}/frame?...`      → PNG de um quadro (câmera no corpo)
//! - `DELETE /scenes/{id}`              → descarta a cena
//! - `POST /jobs?largura&altura`        → `{id, hash}`; render por tiles em background
//! - `POST /jobs/cache?hash=H&...`      → igual a `/jobs`, mas o corpo é só o trailer da câmera
//!   (148 bytes, o final do HSTR); 404 se H não está no cache
//! - `GET  /jobs/{id}`                  → JSON do andamento (fase, fracao, tiles)
//! - `GET  /jobs/{id}/tile/{i}`         → PNG do tile `i`, se já concluído
//! - `GET  /jobs/{id}/preview`          → prévia PNG (320 px de largura)
//! - `GET  /jobs/{id}/result`           → PNG final
//! - `DELETE /jobs/{id}`                → cancela (cooperativo entre tiles)
//!
//! Fases de um job, em ordem: `decodificando`, `previa`, `tiles`, `montando`, `concluido`.
//! Também: `cancelado` e `erro`. A imagem final só é publicada na fase `concluido`.
//!
//! Cache de cenas na GPU (protocolo):
//! - A chave é o `hash` (16 dígitos hex, 64 bits) do HSTR sem os últimos 148 bytes (trailer da
//!   câmera), misturado com o tamanho desse corpo. A câmera muda a cada quadro e fica fora da chave.
//! - Toda resposta JSON de `/jobs` e `/scenes` traz `hash`. Um corpo cujo hash já está no cache
//!   pula a decodificação e o `carregar_cena`; a câmera sempre vem do próprio corpo.
//! - Cliente: depois de enviar um HSTR completo, guarde o `hash`. Nas chamadas seguintes com o
//!   mesmo conteúdo, envie `POST /jobs/cache?hash=H` com só o trailer da câmera. Se vier 404, a cena
//!   saiu do cache: reenvie o HSTR completo em `POST /jobs`.
//! - No máximo `LIMITE_CACHE` cenas no cache; ao passar, sai a usada há mais tempo (LRU).
//! - Cenas de `POST /scenes` continuam até `DELETE /scenes/{id}`, como antes. Elas apontam para a
//!   mesma memória de GPU do cache (sem cópia), mas não contam no limite do cache.

use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::Hasher;
use std::io::Read;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;

use render_core::camera::Camera;
use render_core::Cena;
use render_engine::{ordenar_tiles_espiral, png_saida, CenaGpu, Motor, Retangulo};
use serde_json::json;
use tiny_http::{Header, Method, Request, Response, Server};

const PORTA: u16 = 19787;
const MAX_CORPO: usize = 256 * 1024 * 1024;
/// Menor lado de tile que a medição pode pedir.
const LADO_TILE_MINIMO: u32 = 64;
/// Tempo de um tile de teste acima do qual o lado cai pela metade (risco de watchdog do Windows,
/// que reinicia o driver quando uma tarefa de GPU passa de cerca de 2 s).
const TILE_LENTO_MS: f64 = 500.0;
/// Tempo de um tile de teste abaixo do qual o lado pode dobrar (até o máximo do perfil).
const TILE_RAPIDO_MS: f64 = 100.0;
/// Largura da prévia em pixels; a altura segue a proporção da imagem.
const LARGURA_PREVIA: u32 = 320;
/// Cenas na GPU mantidas pelo cache por hash. Cada uma soma os bytes de textura medidos em
/// `CenaGpu::bytes_texturas` mais a malha; a casa de teste usa ~117 MiB de textura.
const LIMITE_CACHE: usize = 4;
/// Trailer do HSTR com a câmera (37 `f32`: view, projeção, posição, perto, longe). Fica fora da chave.
const TAMANHO_TRAILER_CAMERA: usize = 37 * 4;

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

/// Cache LRU de cenas já carregadas na GPU, por hash do conteúdo. Genérico só para testar a lógica
/// sem GPU. A entrada mais antiga (menos usada) sai quando passa de `limite`.
struct CacheCenas<V> {
    limite: usize,
    /// Da menos recente (início) à mais recente (fim).
    entradas: Vec<(u64, Arc<V>)>,
}

impl<V> CacheCenas<V> {
    fn novo(limite: usize) -> Self {
        Self {
            limite,
            entradas: Vec::new(),
        }
    }

    /// Devolve a cena com essa chave e a marca como a mais recente.
    fn buscar(&mut self, chave: u64) -> Option<Arc<V>> {
        let posicao = self.entradas.iter().position(|(c, _)| *c == chave)?;
        let entrada = self.entradas.remove(posicao);
        let valor = Arc::clone(&entrada.1);
        self.entradas.push(entrada);
        Some(valor)
    }

    /// Guarda a cena como a mais recente. Chave já presente é substituída, não duplicada.
    fn inserir(&mut self, chave: u64, valor: Arc<V>) {
        if let Some(posicao) = self.entradas.iter().position(|(c, _)| *c == chave) {
            self.entradas.remove(posicao);
        }
        self.entradas.push((chave, valor));
        while self.entradas.len() > self.limite {
            self.entradas.remove(0);
        }
    }
}

/// De onde vem a cena de um pedido: já na GPU (cache) ou decodificada agora e ainda não carregada.
enum Origem {
    Cache { chave: u64, gpu: Arc<CenaGpu> },
    Nova { chave: u64, cena: Box<Cena> },
}

impl Origem {
    fn chave(&self) -> u64 {
        match self {
            Origem::Cache { chave, .. } | Origem::Nova { chave, .. } => *chave,
        }
    }
}

/// Tudo o que um render precisa: a cena, a câmera do corpo e o tamanho da imagem.
struct Pedido {
    origem: Origem,
    camera: Camera,
    largura: u32,
    altura: u32,
    exposicao: f64,
}

struct Servico {
    /// Motor persistente, criado uma vez. `None` quando não há adaptador GPU.
    motor: Option<Arc<Motor>>,
    /// Motivo da falha ao criar o motor (presente só quando `motor` é `None`).
    erro_gpu: Option<String>,
    jobs: Mutex<HashMap<String, Job>>,
    /// Cenas registradas por `POST /scenes` (id → GPU), até `DELETE /scenes/{id}`.
    cenas: Mutex<HashMap<String, Arc<CenaGpu>>>,
    /// Cenas na GPU por hash do conteúdo, no máximo `LIMITE_CACHE` (ver o protocolo no topo).
    cache: Mutex<CacheCenas<CenaGpu>>,
    sequencia: AtomicU64,
}

/// Desfecho de um job que não falhou.
enum Fim {
    Concluido,
    Cancelado,
}

fn main() {
    let (motor, erro_gpu) = match Motor::nativo_auto() {
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
        cache: Mutex::new(CacheCenas::novo(LIMITE_CACHE)),
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
        println!(
            "render-service: perfil {} ({})",
            motor.perfil().perfil.nome,
            motor.perfil().motivo
        );
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
                "perfil": servico.motor.as_ref().map(|m| {
                    let escolha = m.perfil();
                    json!({
                        "nome": escolha.perfil.nome,
                        "motivo": escolha.motivo,
                        "lado_tile": escolha.perfil.lado_tile,
                        "lado_maximo_textura": escolha.perfil.lado_maximo_textura,
                        "amostras_msaa": escolha.perfil.amostras_msaa,
                        "forcado": escolha.forcado,
                    })
                }),
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
            let (origem, camera) = match resolver_corpo(&servico, &bytes) {
                Ok(r) => r,
                Err((status, e)) => return erro_json(req, status, &e),
            };
            match render_sincrono(&motor, &servico, origem, &camera, largura, altura, exposicao) {
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
            let (origem, camera) = match resolver_corpo(&servico, &bytes) {
                Ok(r) => r,
                Err((status, e)) => return erro_json(req, status, &e),
            };
            let pedido = Pedido { origem, camera, largura, altura, exposicao };
            iniciar_job(req, &servico, motor, pedido)
        }
        (Method::Post, "/jobs/cache") => {
            let (largura, altura) = dimensoes(consulta);
            let exposicao = fator_exposicao(consulta);
            let Some(chave) = hash_da_consulta(consulta) else {
                return erro_json(req, 400, "informe ?hash=<16 dígitos hex>");
            };
            let bytes = match ler_corpo(&mut req) {
                Ok(b) => b,
                Err(e) => return erro_json(req, 400, &e),
            };
            let Some(motor) = servico.motor.clone() else {
                return sem_gpu(req, &servico);
            };
            let gpu = match buscar_no_cache(&servico, chave) {
                Ok(Some(gpu)) => gpu,
                Ok(None) => return resposta_sem_cache(req, chave),
                Err(e) => return erro_json(req, 500, &e),
            };
            let camera = match camera_do_trailer(&bytes) {
                Ok(c) => c,
                Err(e) => return erro_json(req, 400, &e),
            };
            let origem = Origem::Cache { chave, gpu };
            let pedido = Pedido { origem, camera, largura, altura, exposicao };
            iniciar_job(req, &servico, motor, pedido)
        }
        (Method::Post, "/scenes") => {
            let bytes = match ler_corpo(&mut req) {
                Ok(b) => b,
                Err(e) => return erro_json(req, 400, &e),
            };
            let Some(motor) = servico.motor.clone() else {
                return sem_gpu(req, &servico);
            };
            let (origem, _camera) = match resolver_corpo(&servico, &bytes) {
                Ok(r) => r,
                Err((status, e)) => return erro_json(req, status, &e),
            };
            let chave = origem.chave();
            let gpu = match obter_gpu(&motor, &servico, origem) {
                Ok(g) => g,
                Err(e) => return erro_json(req, 500, &e),
            };
            let id = match registrar_cena(&servico, gpu) {
                Ok(id) => id,
                Err(e) => return erro_json(req, 500, &e),
            };
            let corpo = json!({ "id": id, "hash": formatar_hash(chave) }).to_string();
            responder(req, 200, "application/json", corpo.into_bytes())
        }
        (Method::Post, "/scenes/cache") => {
            let Some(chave) = hash_da_consulta(consulta) else {
                return erro_json(req, 400, "informe ?hash=<16 dígitos hex>");
            };
            let gpu = match buscar_no_cache(&servico, chave) {
                Ok(Some(gpu)) => gpu,
                Ok(None) => return resposta_sem_cache(req, chave),
                Err(e) => return erro_json(req, 500, &e),
            };
            let id = match registrar_cena(&servico, gpu) {
                Ok(id) => id,
                Err(e) => return erro_json(req, 500, &e),
            };
            let corpo = json!({ "id": id, "hash": formatar_hash(chave) }).to_string();
            responder(req, 200, "application/json", corpo.into_bytes())
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

/// Valor de `hash=` na consulta, em hex (o formato de `formatar_hash`).
fn hash_da_consulta(consulta: &str) -> Option<u64> {
    consulta
        .split('&')
        .find_map(|par| par.strip_prefix("hash="))
        .and_then(|valor| u64::from_str_radix(valor, 16).ok())
}

fn formatar_hash(chave: u64) -> String {
    format!("{chave:016x}")
}

/// Chave do cache de um HSTR completo: hash do corpo sem o trailer da câmera, misturado com o
/// tamanho desse corpo. `None` se o corpo é menor que o trailer.
fn chave_da_cena(bytes: &[u8]) -> Option<u64> {
    let fim = bytes.len().checked_sub(TAMANHO_TRAILER_CAMERA)?;
    let corpo = &bytes[..fim];
    let mut hasher = DefaultHasher::new();
    hasher.write(corpo);
    hasher.write_usize(corpo.len());
    Some(hasher.finish())
}

/// Câmera do trailer de 148 bytes (o mesmo `Camera::de_quadro` usado nos quadros de `/scenes`).
fn camera_do_trailer(trailer: &[u8]) -> Result<Camera, String> {
    Camera::de_quadro(trailer).map_err(|e| format!("câmera inválida: {e}"))
}

fn buscar_no_cache(servico: &Servico, chave: u64) -> Result<Option<Arc<CenaGpu>>, String> {
    let mut cache = servico.cache.lock().map_err(|e| e.to_string())?;
    Ok(cache.buscar(chave))
}

fn guardar_no_cache(servico: &Servico, chave: u64, gpu: Arc<CenaGpu>) -> Result<(), String> {
    let mut cache = servico.cache.lock().map_err(|e| e.to_string())?;
    cache.inserir(chave, gpu);
    Ok(())
}

/// Registra a cena na GPU sob um id novo (rota de `/scenes`). Compartilha a memória, não copia.
fn registrar_cena(servico: &Servico, gpu: Arc<CenaGpu>) -> Result<String, String> {
    let id = format!("cena-{}", servico.sequencia.fetch_add(1, Ordering::Relaxed));
    servico
        .cenas
        .lock()
        .map_err(|e| e.to_string())?
        .insert(id.clone(), gpu);
    Ok(id)
}

/// Resolve um HSTR completo. Se o conteúdo já está no cache, a cena vem de lá e só a câmera é
/// lida do corpo; senão o corpo é decodificado (e carregado depois, por `obter_gpu`).
/// Erro: `(status HTTP, mensagem)`.
fn resolver_corpo(servico: &Servico, bytes: &[u8]) -> Result<(Origem, Camera), (u16, String)> {
    let chave = chave_da_cena(bytes)
        .ok_or((400, "cena inválida: corpo menor que o trailer da câmera".to_string()))?;
    let achado = buscar_no_cache(servico, chave).map_err(|e| (500, e))?;
    if let Some(gpu) = achado {
        let camera = camera_do_trailer(&bytes[bytes.len() - TAMANHO_TRAILER_CAMERA..])
            .map_err(|e| (400, e))?;
        return Ok((Origem::Cache { chave, gpu }, camera));
    }
    let cena = decodificar_cena(bytes).map_err(|e| (400, e))?;
    let camera = cena.camera.clone();
    Ok((Origem::Nova { chave, cena: Box::new(cena) }, camera))
}

fn resposta_sem_cache(req: Request, chave: u64) -> Result<(), String> {
    let corpo = json!({ "erro": "cena não está no cache", "hash": formatar_hash(chave) }).to_string();
    responder(req, 404, "application/json", corpo.into_bytes())
}

/// Cena na GPU para `origem`: a do cache, ou carrega a recém-decodificada e a põe no cache.
fn obter_gpu(motor: &Motor, servico: &Servico, origem: Origem) -> Result<Arc<CenaGpu>, String> {
    match origem {
        Origem::Cache { gpu, .. } => Ok(gpu),
        Origem::Nova { chave, cena } => {
            let gpu = Arc::new(
                motor
                    .carregar_cena(&cena)
                    .map_err(|e| format!("carga na GPU falhou: {e}"))?,
            );
            println!(
                "render-service: cena {} na GPU, {:.1} MiB de texturas",
                formatar_hash(chave),
                gpu.bytes_texturas() as f64 / 1_048_576.0
            );
            guardar_no_cache(servico, chave, Arc::clone(&gpu))?;
            Ok(gpu)
        }
    }
}

/// Cria o job, a thread e responde `{id, hash}`.
fn iniciar_job(req: Request, servico: &Arc<Servico>, motor: Arc<Motor>, pedido: Pedido) -> Result<(), String> {
    let chave = pedido.origem.chave();
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
    let servico_thread = Arc::clone(servico);
    thread::spawn(move || executar_job(id_thread, pedido, job, motor, servico_thread));
    let corpo = json!({ "id": id, "hash": formatar_hash(chave) }).to_string();
    responder(req, 200, "application/json", corpo.into_bytes())
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

/// Render síncrono da imagem inteira, a partir da cena do cache ou recém-decodificada.
fn render_sincrono(
    motor: &Motor,
    servico: &Servico,
    origem: Origem,
    camera: &Camera,
    largura: u32,
    altura: u32,
    exposicao: f64,
) -> Result<Vec<u8>, String> {
    let gpu = obter_gpu(motor, servico, origem)?;
    let regiao = Retangulo { x: 0, y: 0, w: largura, h: altura };
    let rgba = motor
        .renderizar_regiao(&gpu, camera, largura, altura, regiao, exposicao)
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

fn executar_job(id: String, pedido: Pedido, job: Job, motor: Arc<Motor>, servico: Arc<Servico>) {
    match rodar_job(&job, &motor, &servico, pedido) {
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
/// A cena já chega decodificada ou vinda do cache (o handler recusa cena inválida antes de criar o job).
fn rodar_job(job: &Job, motor: &Motor, servico: &Servico, pedido: Pedido) -> Result<Fim, String> {
    let Pedido { origem, camera, largura, altura, exposicao } = pedido;
    // Fase mantida para o contrato de `GET /jobs/{id}`. Com cache hit, a carga na GPU é pulada.
    atualizar(job, "decodificando", 0.02);
    let cena_gpu = obter_gpu(motor, servico, origem)?;
    if cancelar_se_preciso(job) {
        return Ok(Fim::Cancelado);
    }

    // Prévia: uma passada da imagem inteira em 320 px de largura. Não conta como tile.
    let (pw, ph) = dimensoes_previa(largura, altura);
    atualizar(job, "previa", 0.05);
    let regiao_previa = Retangulo { x: 0, y: 0, w: pw, h: ph };
    let rgba_previa = motor
        .renderizar_regiao(&cena_gpu, &camera, pw, ph, regiao_previa, exposicao)
        .map_err(|e| format!("render da prévia falhou: {e}"))?;
    let png_previa =
        png_saida::codificar(&rgba_previa, pw, ph).map_err(|e| format!("PNG da prévia falhou: {e}"))?;
    if let Ok(mut estado) = job.lock() {
        estado.preview = Some(png_previa);
    }

    // Tiles: ordem espiral; cada um renderizado como recorte da imagem inteira, sem costura. O lado
    // vem de um tile de teste (ver `medir_lado_tile`), decidido antes da lista e fixo no job.
    if cancelar_se_preciso(job) {
        return Ok(Fim::Cancelado);
    }
    let lado = medir_lado_tile(motor, &cena_gpu, &camera, (largura, altura), exposicao)?;
    let tiles = ordenar_tiles_espiral(largura, altura, lado)
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
        let inicio = Instant::now();
        let rgba = motor
            .renderizar_regiao(&cena_gpu, &camera, largura, altura, regiao, exposicao)
            .map_err(|e| format!("render do tile {indice} falhou: {e}"))?;
        let ms = inicio.elapsed().as_secs_f64() * 1000.0;
        if ms > TILE_LENTO_MS {
            eprintln!(
                "render-service: tile {indice} ({}x{}) levou {ms:.0} ms, acima de {TILE_LENTO_MS:.0} ms (risco de watchdog)",
                regiao.w, regiao.h
            );
        }
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

/// Lado dos tiles do job, medido num tile de teste no canto da imagem. Esse tile é descartado: a
/// imagem final vem só dos tiles da lista, então nenhuma área sai duplicada nem falta. O lado é
/// decidido uma vez por job, antes da lista: trocá-lo no meio exigiria replanejar a área já
/// renderizada, e o tamanho muda o custo por tile, não a imagem. Imagem que cabe num tile do
/// perfil usa o lado inicial, sem medir.
fn medir_lado_tile(
    motor: &Motor,
    cena: &CenaGpu,
    camera: &Camera,
    (largura, altura): (u32, u32),
    exposicao: f64,
) -> Result<u32, String> {
    let perfil = motor.perfil().perfil;
    let inicial = perfil.lado_tile;
    if largura <= inicial && altura <= inicial {
        return Ok(inicial);
    }
    let teste = Retangulo {
        x: 0,
        y: 0,
        w: inicial.min(largura),
        h: inicial.min(altura),
    };
    let inicio = Instant::now();
    motor
        .renderizar_regiao(cena, camera, largura, altura, teste, exposicao)
        .map_err(|e| format!("render do tile de teste falhou: {e}"))?;
    let ms = inicio.elapsed().as_secs_f64() * 1000.0;
    let lado = decidir_lado_tile(inicial, perfil.lado_tile_maximo, ms);
    println!(
        "render-service: tile de teste {}x{} em {ms:.0} ms; lado dos tiles {lado} (perfil {})",
        teste.w, teste.h, perfil.nome
    );
    Ok(lado)
}

/// Lado dos tiles a partir do tempo de um tile de teste. Lento (acima de `TILE_LENTO_MS`) cai pela
/// metade, sem passar de `LADO_TILE_MINIMO`; rápido (abaixo de `TILE_RAPIDO_MS`) dobra, sem passar
/// do máximo do perfil; entre os dois, mantém. O resultado fica sempre entre o mínimo e o máximo.
fn decidir_lado_tile(lado_inicial: u32, lado_maximo: u32, tempo_ms: f64) -> u32 {
    let maximo = lado_maximo.max(LADO_TILE_MINIMO);
    let lado = lado_inicial.clamp(LADO_TILE_MINIMO, maximo);
    if tempo_ms > TILE_LENTO_MS {
        (lado / 2).max(LADO_TILE_MINIMO)
    } else if tempo_ms < TILE_RAPIDO_MS {
        (lado * 2).min(maximo)
    } else {
        lado
    }
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

/// Dimensões da prévia: largura fixa de 320 px, altura proporcional e no mínimo 1.
fn dimensoes_previa(largura: u32, altura: u32) -> (u32, u32) {
    let arredondado = u64::from(altura) * u64::from(LARGURA_PREVIA) + u64::from(largura) / 2;
    let ph = (arredondado / u64::from(largura)).max(1) as u32;
    (LARGURA_PREVIA, ph)
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
    use render_core::vetor::Vec3;

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

    #[test]
    fn cache_reaproveita_mesmo_hash() {
        let mut cache = CacheCenas::novo(4);
        let valor = Arc::new(7u32);
        cache.inserir(1, Arc::clone(&valor));
        let achado = cache.buscar(1).expect("mesmo hash deve reaproveitar");
        assert!(Arc::ptr_eq(&achado, &valor));
    }

    #[test]
    fn hash_diferente_nao_reaproveita() {
        let mut cache = CacheCenas::novo(4);
        cache.inserir(1, Arc::new(7u32));
        assert!(cache.buscar(2).is_none());
    }

    #[test]
    fn limite_descarta_a_mais_antiga() {
        let mut cache = CacheCenas::novo(4);
        for chave in 1..=4u64 {
            cache.inserir(chave, Arc::new(chave as u32));
        }
        cache.inserir(5, Arc::new(5));
        assert_eq!(cache.entradas.len(), 4);
        assert!(cache.buscar(1).is_none(), "a mais antiga deve sair");
        for chave in 2..=5u64 {
            assert!(cache.buscar(chave).is_some(), "chave {chave} deve ficar");
        }
    }

    #[test]
    fn uso_recente_protege_da_remocao() {
        let mut cache = CacheCenas::novo(2);
        cache.inserir(1, Arc::new(1u32));
        cache.inserir(2, Arc::new(2u32));
        assert!(cache.buscar(1).is_some());
        cache.inserir(3, Arc::new(3u32));
        assert!(cache.buscar(2).is_none(), "2 era a menos recente");
        assert!(cache.buscar(1).is_some());
        assert!(cache.buscar(3).is_some());
    }

    #[test]
    fn reinserir_mesma_chave_nao_duplica() {
        let mut cache = CacheCenas::novo(4);
        cache.inserir(1, Arc::new(1u32));
        let nova = Arc::new(2u32);
        cache.inserir(1, Arc::clone(&nova));
        assert_eq!(cache.entradas.len(), 1);
        assert!(Arc::ptr_eq(&cache.buscar(1).expect("presente"), &nova));
    }

    #[test]
    fn chave_ignora_so_a_camera() {
        let mut a = b"cabecalho e geometria".to_vec();
        a.extend_from_slice(&[1u8; TAMANHO_TRAILER_CAMERA]);
        let mut b = b"cabecalho e geometria".to_vec();
        b.extend_from_slice(&[2u8; TAMANHO_TRAILER_CAMERA]);
        assert_eq!(chave_da_cena(&a), chave_da_cena(&b));
        let mut c = b"outro cabecalho".to_vec();
        c.extend_from_slice(&[1u8; TAMANHO_TRAILER_CAMERA]);
        assert_ne!(chave_da_cena(&a), chave_da_cena(&c));
        assert_eq!(chave_da_cena(&[0u8; 10]), None);
    }

    #[test]
    fn hash_da_consulta_le_hex() {
        assert_eq!(hash_da_consulta("hash=00000000000000ff&largura=10"), Some(0xff));
        assert_eq!(hash_da_consulta("largura=10"), None);
        assert_eq!(hash_da_consulta("hash=zz"), None);
        assert_eq!(formatar_hash(0xff), "00000000000000ff");
        assert_eq!(hash_da_consulta(&format!("hash={}", formatar_hash(u64::MAX))), Some(u64::MAX));
    }

    /// Cena mínima (um triângulo) sem GPU: codifica, resolve pelo caminho de decodificação e
    /// confere que a chave do pedido bate com `chave_da_cena` e que a câmera vem do corpo.
    #[test]
    fn resolver_corpo_decodifica_e_devolve_chave_e_camera() {
        use render_core::cena::{PartesCena, Sol};
        let camera = render_core::camera::Camera::olhando_para(
            Vec3::de_array([0.0, -5.0, 2.0]),
            Vec3::de_array([0.0, 0.0, 0.0]),
            Vec3::de_array([0.0, 0.0, 1.0]),
            0.8,
            16.0 / 9.0,
            0.1,
            100.0,
        )
        .expect("câmera de teste");
        let cena = Cena::nova(PartesCena {
            posicoes: vec![0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
            indices: vec![0, 1, 2],
            normais: Vec::new(),
            materiais: Vec::new(),
            texturas: Vec::new(),
            lotes: Vec::new(),
            sol: Sol::padrao(),
            fundo: None,
            camera,
        })
        .expect("cena de teste");
        let bytes = cena.codificar();
        let servico = Servico {
            motor: None,
            erro_gpu: Some("teste sem GPU".into()),
            jobs: Mutex::new(HashMap::new()),
            cenas: Mutex::new(HashMap::new()),
            cache: Mutex::new(CacheCenas::novo(LIMITE_CACHE)),
            sequencia: AtomicU64::new(1),
        };
        let (origem, camera_do_corpo) = resolver_corpo(&servico, &bytes).expect("resolve");
        assert!(matches!(origem, Origem::Nova { .. }), "cache vazio deve decodificar");
        assert_eq!(origem.chave(), chave_da_cena(&bytes).expect("chave"));
        assert_eq!(camera_do_corpo.posicao.para_array(), cena.camera.posicao.para_array());
        let (status, _) = resolver_corpo(&servico, b"lixo").err().expect("lixo deve falhar");
        assert_eq!(status, 400);
    }

    #[test]
    fn tile_lento_reduz_o_lado_ate_o_minimo() {
        assert_eq!(decidir_lado_tile(256, 256, 600.0), 128);
        assert_eq!(decidir_lado_tile(128, 256, 900.0), 64);
        // Já no mínimo: não desce abaixo de 64.
        assert_eq!(decidir_lado_tile(64, 512, 2_000.0), 64);
    }

    #[test]
    fn tile_rapido_aumenta_ate_o_maximo_do_perfil() {
        assert_eq!(decidir_lado_tile(128, 256, 40.0), 256);
        // Já no máximo: não passa dele.
        assert_eq!(decidir_lado_tile(256, 256, 40.0), 256);
        assert_eq!(decidir_lado_tile(256, 512, 40.0), 512);
        assert_eq!(decidir_lado_tile(512, 512, 40.0), 512);
    }

    #[test]
    fn tile_no_meio_mantem_o_lado() {
        assert_eq!(decidir_lado_tile(256, 512, 100.0), 256);
        assert_eq!(decidir_lado_tile(256, 512, 300.0), 256);
        assert_eq!(decidir_lado_tile(256, 512, 500.0), 256);
    }

    #[test]
    fn sequencia_simulada_fica_sempre_dentro_dos_limites() {
        // Tempos simulados de tiles (ms): lentos, rápidos e intermediários, em sequência.
        let tempos = [900.0, 700.0, 30.0, 30.0, 30.0, 250.0, 60.0, 800.0, 20.0, 499.0];
        for (inicial, maximo) in [(128u32, 256u32), (256, 256), (256, 512), (64, 64)] {
            let mut lado = inicial;
            for &ms in &tempos {
                lado = decidir_lado_tile(lado, maximo, ms);
                assert!(
                    (LADO_TILE_MINIMO..=maximo.max(LADO_TILE_MINIMO)).contains(&lado),
                    "lado {lado} fora de {LADO_TILE_MINIMO}..={maximo} (inicial {inicial}, {ms} ms)"
                );
            }
        }
    }

    #[test]
    fn qualquer_lado_decidido_cobre_a_imagem_exatamente() {
        // Para cada lado que a medição pode escolher, a lista de tiles cobre cada pixel uma vez.
        for lado in [64u32, 128, 256, 512] {
            for (largura, altura) in [(1000u32, 600u32), (333, 187), (64, 64), (1, 1), (100, 900)] {
                let tiles = ordenar_tiles_espiral(largura, altura, lado).unwrap();
                let mut grade = vec![0u32; (largura * altura) as usize];
                for t in &tiles {
                    for yy in t.y..t.y + t.h {
                        for xx in t.x..t.x + t.w {
                            grade[(yy * largura + xx) as usize] += 1;
                        }
                    }
                }
                assert!(
                    grade.iter().all(|&c| c == 1),
                    "lado {lado} em {largura}x{altura} não cobre cada pixel uma vez"
                );
            }
        }
    }
}
