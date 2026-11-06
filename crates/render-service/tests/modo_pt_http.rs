//! Teste de integração do modo pt pelo HTTP, com o binário `render-service` de verdade numa porta de
//! teste. Marcado `#[ignore]` (precisa de GPU): rode com
//! `cargo test --test modo_pt_http -- --ignored --nocapture --test-threads=1`.
//!
//! Cena: `HESTIA_CENA_PT` aponta para um `.hstr` (ex.: a casa com textura); sem ela, usa o fixture
//! `render-engine/tests/fixtures/cena-h1.hstr`. Porta: `HESTIA_PORTA_TESTE` (padrão 19797).

use std::io::{Read, Write};
use std::net::TcpStream;
use std::process::{Child, Command, Stdio};
use std::thread::sleep;
use std::time::{Duration, Instant};

use serde_json::Value;

/// Mata o serviço ao sair do teste, mesmo se o teste falhar.
struct Servico(Child);

impl Drop for Servico {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn porta() -> u16 {
    std::env::var("HESTIA_PORTA_TESTE")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(19797)
}

/// Requisição HTTP/1.1 mínima (uma conexão por pedido). Devolve (status, corpo).
fn http(metodo: &str, caminho: &str, corpo: &[u8]) -> (u16, Vec<u8>) {
    let mut fluxo = TcpStream::connect(("127.0.0.1", porta())).expect("conectar ao serviço");
    fluxo.set_read_timeout(Some(Duration::from_secs(600))).ok();
    let cabecalho = format!(
        "{metodo} {caminho} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: {}\r\nContent-Type: application/octet-stream\r\nConnection: close\r\n\r\n",
        corpo.len()
    );
    fluxo.write_all(cabecalho.as_bytes()).expect("escrever cabeçalho");
    fluxo.write_all(corpo).expect("escrever corpo");
    let mut resposta = Vec::new();
    fluxo.read_to_end(&mut resposta).expect("ler resposta");
    let fim = resposta
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .expect("resposta sem cabeçalho");
    let cabecalho = String::from_utf8_lossy(&resposta[..fim]).to_string();
    let status: u16 = cabecalho
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .expect("status HTTP");
    let corpo = &resposta[fim + 4..];
    if cabecalho.to_ascii_lowercase().contains("transfer-encoding: chunked") {
        return (status, decodificar_chunked(corpo));
    }
    (status, corpo.to_vec())
}

/// Corpo em `Transfer-Encoding: chunked` (o serviço usa para respostas grandes): tamanho em hex, linha,
/// dados, linha, até o bloco de tamanho zero.
fn decodificar_chunked(mut corpo: &[u8]) -> Vec<u8> {
    let mut saida = Vec::new();
    loop {
        let fim_linha = corpo.windows(2).position(|w| w == b"\r\n").expect("linha de tamanho");
        let tamanho = usize::from_str_radix(String::from_utf8_lossy(&corpo[..fim_linha]).trim(), 16)
            .expect("tamanho hexadecimal");
        corpo = &corpo[fim_linha + 2..];
        if tamanho == 0 {
            return saida;
        }
        saida.extend_from_slice(&corpo[..tamanho]);
        corpo = &corpo[tamanho + 2..];
    }
}

fn json(corpo: &[u8]) -> Value {
    serde_json::from_slice(corpo).unwrap_or_else(|e| panic!("JSON inválido ({e}): {}", String::from_utf8_lossy(corpo)))
}

fn cena() -> Vec<u8> {
    let caminho = std::env::var("HESTIA_CENA_PT").unwrap_or_else(|_| {
        concat!(env!("CARGO_MANIFEST_DIR"), "/../render-engine/tests/fixtures/cena-h1.hstr").to_string()
    });
    std::fs::read(&caminho).unwrap_or_else(|e| panic!("cena {caminho}: {e}"))
}

/// Decodifica um PNG RGBA8 e devolve (largura, altura, média RGB de 0 a 255).
fn analisar_png(bytes: &[u8]) -> (u32, u32, f64) {
    assert!(
        bytes.starts_with(&[0x89, b'P', b'N', b'G']),
        "corpo não é PNG ({} bytes): {:?}",
        bytes.len(),
        String::from_utf8_lossy(&bytes[..bytes.len().min(200)])
    );
    let mut leitor = png::Decoder::new(std::io::Cursor::new(bytes)).read_info().expect("PNG");
    let mut buffer = vec![0u8; leitor.output_buffer_size()];
    let info = leitor.next_frame(&mut buffer).expect("quadro PNG");
    let quadros = &buffer[..info.buffer_size()];
    let soma: u64 = quadros
        .chunks_exact(4)
        .map(|c| u64::from(c[0]) + u64::from(c[1]) + u64::from(c[2]))
        .sum();
    let media = soma as f64 / (f64::from(info.width) * f64::from(info.height) * 3.0);
    (info.width, info.height, media)
}

fn esperar_servico() -> Servico {
    let exe = env!("CARGO_BIN_EXE_render-service");
    let filho = Command::new(exe)
        .env("RENDER_SERVICE_PORTA", porta().to_string())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn()
        .expect("iniciar render-service");
    let servico = Servico(filho);
    let inicio = Instant::now();
    loop {
        if TcpStream::connect(("127.0.0.1", porta())).is_ok() {
            return servico;
        }
        assert!(inicio.elapsed() < Duration::from_secs(60), "serviço não subiu em 60 s");
        sleep(Duration::from_millis(200));
    }
}

/// Espera o job até uma fase final. Devolve (fase final, amostras feitas vistas em ordem, tempo ms).
fn acompanhar(id: &str) -> (String, Vec<u64>, f64) {
    let inicio = Instant::now();
    let mut feitas = Vec::new();
    loop {
        let (status, corpo) = http("GET", &format!("/jobs/{id}"), &[]);
        assert_eq!(status, 200);
        let estado = json(&corpo);
        let fase = estado["fase"].as_str().unwrap_or_default().to_string();
        if let Some(n) = estado["amostras"]["feitas"].as_u64() {
            if feitas.last() != Some(&n) {
                feitas.push(n);
            }
        }
        if matches!(fase.as_str(), "concluido" | "cancelado" | "erro") {
            return (fase, feitas, inicio.elapsed().as_secs_f64() * 1000.0);
        }
        assert!(inicio.elapsed() < Duration::from_secs(900), "job {id} não terminou em 15 min");
        sleep(Duration::from_millis(50));
    }
}

fn criar_job(consulta: &str, corpo: &[u8]) -> Value {
    let (status, resposta) = http("POST", &format!("/jobs{consulta}"), corpo);
    assert_eq!(status, 200, "criar job: {}", String::from_utf8_lossy(&resposta));
    json(&resposta)
}

#[test]
#[ignore = "requer GPU e o binário"]
fn modo_pt_pelo_http() {
    let _servico = esperar_servico();
    let cena = cena();

    // /health anuncia os dois modos e a versão do pt.
    let (status, saude) = http("GET", "/health", &[]);
    assert_eq!(status, 200);
    let saude = json(&saude);
    assert_eq!(saude["modos"], serde_json::json!(["raster", "pt"]), "saúde: {saude}");
    assert!(saude["versao_pt"].is_string(), "saúde: {saude}");
    println!("health: perfil {}, modos {}, versão pt {}", saude["perfil"]["nome"], saude["modos"], saude["versao_pt"]);

    // Job pt, 16 amostras, sem denoise. Prévia visível durante o andamento; resultado em cheio.
    let job = criar_job("?modo=pt&amostras=16&largura=1280&altura=720", &cena);
    let id = job["id"].as_str().expect("id").to_string();
    let hash = job["hash"].as_str().expect("hash").to_string();
    assert_eq!(job["modo"], "pt");
    let (fase, feitas, ms) = acompanhar(&id);
    assert_eq!(fase, "concluido");
    println!("pt 16 amostras, sem denoise: {ms:.0} ms; amostras vistas {feitas:?}");
    assert!(feitas.windows(2).all(|w| w[0] < w[1]), "amostras devem crescer: {feitas:?}");
    assert_eq!(*feitas.last().unwrap(), 16);
    let (status, estado) = http("GET", &format!("/jobs/{id}"), &[]);
    assert_eq!(status, 200);
    let estado = json(&estado);
    assert_eq!(estado["modo"], "pt");
    assert_eq!(estado["amostras"]["feitas"], 16);
    assert_eq!(estado["amostras"]["total"], 16);
    assert_eq!(estado["denoise"], false);
    let (status, png) = http("GET", &format!("/jobs/{id}/result"), &[]);
    assert_eq!(status, 200);
    let (w, h, media) = analisar_png(&png);
    assert_eq!((w, h), (1280, 720));
    println!("resultado 1280x720, média RGB {media:.1}");
    assert!(media > 5.0, "imagem final praticamente preta ({media:.1})");
    let (status, previa) = http("GET", &format!("/jobs/{id}/preview"), &[]);
    assert_eq!(status, 200);
    assert_eq!(analisar_png(&previa).0, 320, "prévia com 320 px de largura");

    // O mesmo com denoise: tempo e a flag no status.
    let job = criar_job("?modo=pt&amostras=16&denoise=1&largura=1280&altura=720", &cena);
    let id_d = job["id"].as_str().expect("id").to_string();
    let (fase, _, ms_d) = acompanhar(&id_d);
    assert_eq!(fase, "concluido");
    println!("pt 16 amostras, com denoise: {ms_d:.0} ms");
    let (_, estado) = http("GET", &format!("/jobs/{id_d}"), &[]);
    assert_eq!(json(&estado)["denoise"], true);
    let (status, png) = http("GET", &format!("/jobs/{id_d}/result"), &[]);
    assert_eq!(status, 200);
    assert!(analisar_png(&png).2 > 5.0, "imagem com denoise praticamente preta");

    // Cache do modo pt: pelo hash, só o trailer da câmera (aqui, o corpo inteiro serve de trailer).
    let trailer = &cena[cena.len() - 148..];
    let (status, _) = http("POST", &format!("/jobs/cache?hash={hash}&modo=pt&amostras=2&largura=320&altura=180"), trailer);
    assert_eq!(status, 200, "cena do modo pt deve estar no cache");
    let (status, _) = http("POST", "/jobs/cache?hash=0000000000000001&modo=pt&amostras=2", trailer);
    assert_eq!(status, 404, "hash desconhecido deve ser 404");

    // Cancelamento no meio: para entre passes, sem resultado.
    let job = criar_job("?modo=pt&amostras=512&largura=1280&altura=720", &cena);
    let id_c = job["id"].as_str().expect("id").to_string();
    let inicio = Instant::now();
    loop {
        let (_, estado) = http("GET", &format!("/jobs/{id_c}"), &[]);
        if json(&estado)["amostras"]["feitas"].as_u64().unwrap_or(0) >= 2 {
            break;
        }
        assert!(inicio.elapsed() < Duration::from_secs(300), "job não andou");
        sleep(Duration::from_millis(50));
    }
    let (status, _) = http("DELETE", &format!("/jobs/{id_c}"), &[]);
    assert_eq!(status, 200);
    let (fase, _, _) = acompanhar(&id_c);
    assert_eq!(fase, "cancelado");
    let (_, estado) = http("GET", &format!("/jobs/{id_c}"), &[]);
    let feitas_c = json(&estado)["amostras"]["feitas"].as_u64().unwrap();
    assert!((2..512).contains(&feitas_c), "cancelou entre passes: {feitas_c}");
    let (status, _) = http("GET", &format!("/jobs/{id_c}/result"), &[]);
    assert_eq!(status, 404, "sem resultado quando cancelado");
    println!("cancelado em {feitas_c} de 512 amostras");

    // Recusas: modo desconhecido, parâmetro de pt no raster e memória estourada.
    let (status, _) = http("POST", "/jobs?modo=cpu", &cena);
    assert_eq!(status, 400);
    let (status, _) = http("POST", "/jobs?amostras=16", &cena);
    assert_eq!(status, 400);
    let (status, corpo) = http("POST", "/jobs?modo=pt&largura=16384&altura=16384&denoise=1", &cena);
    assert_eq!(status, 507, "memória: {}", String::from_utf8_lossy(&corpo));
    let erro = json(&corpo)["erro"].as_str().unwrap_or_default().to_string();
    assert!(erro.contains("MiB") && erro.contains("raster"), "mensagem de memória: {erro}");
    println!("recusa de memória: {erro}");

    // O raster continua como antes: sem as chaves do pt no status.
    let job = criar_job("?largura=320&altura=180", &cena);
    let id_r = job["id"].as_str().expect("id").to_string();
    let (fase, _, _) = acompanhar(&id_r);
    assert_eq!(fase, "concluido");
    let (_, estado) = http("GET", &format!("/jobs/{id_r}"), &[]);
    let estado = json(&estado);
    assert!(estado.get("modo").is_none(), "raster não traz o modo: {estado}");
    assert!(estado.get("amostras").is_none(), "raster não traz amostras: {estado}");
}
