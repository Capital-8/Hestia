//! `hestia-renderer`: renderizador arquitetônico independente, plugin do Hestia em PROCESSO SEPARADO.
//!
//! Escuta só em loopback (127.0.0.1), fala o protocolo de plugins 1.1 (docs/plugins/02-protocolo.md), valida
//! `Origin` e `Host` no aperto de mãos e exige o token de pareamento (padrão; `--no-require-token` só para
//! desenvolvimento). Esta fatia mantém o espelho da cena e o relatório de estado; o desenho (pipeline gráfico) não faz
//! parte dela.

mod auth;
mod security;
mod session;
mod state;

use auth::{AuthMode, Lockout};
use security::{Policy, DEFAULT_ORIGINS};
use session::{run_connection, Cmd, End, Retained};
use state::State;
use std::io::{BufRead, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener};
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;
use tungstenite::handshake::server::{ErrorResponse, Request, Response};

struct Args {
    port: u16,
    state_file: Option<PathBuf>,
    control_stdin: bool,
    origins: Vec<String>,
    allow_no_origin: bool,
    require_token: bool,
    token_file: Option<PathBuf>,
    lock_seconds: u64,
}

fn parse_args() -> Result<Args, String> {
    let mut a = Args {
        port: 47800,
        state_file: None,
        control_stdin: false,
        origins: DEFAULT_ORIGINS.iter().map(|s| s.to_string()).collect(),
        allow_no_origin: false,
        require_token: true,
        token_file: None,
        lock_seconds: auth::LOCK_SECONDS,
    };
    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "--port" => a.port = it.next().and_then(|v| v.parse().ok()).ok_or("--port precisa de um número")?,
            "--state-file" => a.state_file = Some(it.next().ok_or("--state-file precisa de um caminho")?.into()),
            "--control-stdin" => a.control_stdin = true,
            "--allow-origin" => a.origins.push(it.next().ok_or("--allow-origin precisa de um valor")?),
            "--allow-no-origin" => a.allow_no_origin = true,
            "--require-token" => a.require_token = true,
            "--no-require-token" => a.require_token = false,
            "--lock-seconds" => a.lock_seconds = it.next().and_then(|v| v.parse().ok()).ok_or("--lock-seconds precisa de um número")?,
            "--token-file" => a.token_file = Some(it.next().ok_or("--token-file precisa de um caminho")?.into()),
            "--help" | "-h" => {
                println!("hestia-renderer [--port N] [--state-file F] [--control-stdin] [--allow-origin O]... [--require-token | --no-require-token] [--token-file F] [--allow-no-origin]");
                std::process::exit(0);
            }
            other => return Err(format!("argumento desconhecido: {other}")),
        }
    }
    Ok(a)
}

fn event(v: serde_json::Value) {
    let mut out = std::io::stdout().lock();
    let _ = writeln!(out, "{v}");
    let _ = out.flush();
}

fn spawn_stdin(tx: mpsc::Sender<Cmd>) {
    std::thread::spawn(move || {
        for line in std::io::stdin().lock().lines().map_while(Result::ok) {
            let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) else { continue };
            let s = |k: &str| v[k].as_str().unwrap_or_default().to_owned();
            let cmd = match v["cmd"].as_str().unwrap_or_default() {
                "set_mode" => Cmd::SetMode(s("mode")),
                "drive_camera" => Cmd::DriveCamera(v["camera"].clone()),
                "set_override" => Cmd::SetOverride(s("materialId"), v["override"].clone()),
                "clear_override" => Cmd::ClearOverride(s("materialId")),
                "resync" => Cmd::Resync,
                "cancel" => Cmd::Cancel(s("target")),
                "raw" => Cmd::Raw(v["message"].clone()),
                "quit" => Cmd::Quit,
                _ => continue,
            };
            if tx.send(cmd).is_err() {
                break;
            }
        }
    });
}

fn write_state(path: &PathBuf, st: &State) {
    // Escrita atômica: o leitor (outro processo) nunca vê arquivo pela metade.
    let tmp = path.with_extension("tmp");
    if std::fs::write(&tmp, st.report().to_string()).is_err() {
        return;
    }
    // No Windows o rename falha enquanto o leitor está com o arquivo aberto: tenta de novo.
    for _ in 0..5 {
        if std::fs::rename(&tmp, path).is_ok() {
            return;
        }
        std::thread::sleep(Duration::from_millis(3));
    }
}

fn main() {
    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("erro: {e}");
            std::process::exit(2);
        }
    };
    // Token de pareamento: obrigatório por padrão. Gerado na primeira execução e mostrado uma única vez.
    let mode = if args.require_token {
        let Some(path) = args.token_file.clone().or_else(auth::caminho_padrao) else {
            eprintln!("erro: não há onde guardar o token; informe --token-file");
            std::process::exit(2);
        };
        match auth::carregar_ou_criar(&path) {
            Ok(t) => {
                if t.criado {
                    eprintln!("Token de pareamento gerado (mostrado só agora; cole-o em Ferramentas externas, no Hestia):\n{}\nArquivo: {}", t.token, path.display());
                    event(serde_json::json!({ "event": "token_created", "path": path.display().to_string() }));
                }
                AuthMode { token: Some(t.token) }
            }
            Err(e) => {
                eprintln!("erro: {e}");
                std::process::exit(2);
            }
        }
    } else {
        eprintln!("AVISO: --no-require-token desliga o pareamento; qualquer programa deste computador pode ler a cena. Só para desenvolvimento.");
        AuthMode { token: None }
    };
    if args.allow_no_origin {
        eprintln!("AVISO: --allow-no-origin aceita clientes sem Origin; o Hestia (navegador ou Tauri) sempre envia Origin. Só para desenvolvimento e testes.");
    }
    let mut lockout = Lockout::new(args.lock_seconds);

    // Loopback IPv4 fixo: nunca 0.0.0.0.
    let listener = match TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, args.port))) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("erro: não foi possível escutar em 127.0.0.1:{}: {e}", args.port);
            std::process::exit(1);
        }
    };
    let port = listener.local_addr().map(|a| a.port()).unwrap_or(args.port);
    listener.set_nonblocking(true).expect("listener não bloqueante");
    let policy = Policy {
        port,
        origins: args.origins.clone(),
        allow_no_origin: args.allow_no_origin,
    };

    let (tx, rx) = mpsc::channel();
    if args.control_stdin {
        spawn_stdin(tx);
    }
    let mut state = State::default();
    let mut retained = Retained::default();
    let report = |st: &State| {
        if let Some(p) = &args.state_file {
            write_state(p, st);
        }
    };
    report(&state);
    event(serde_json::json!({ "event": "listening", "addr": format!("127.0.0.1:{port}"), "pid": std::process::id() }));

    loop {
        // Fora de uma conexão, `quit` encerra o processo.
        while let Ok(cmd) = rx.try_recv() {
            if matches!(cmd, Cmd::Quit) {
                return;
            }
        }
        let stream = match listener.accept() {
            Ok((s, _)) => s,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(20));
                continue;
            }
            Err(_) => continue,
        };
        // Três falhas seguidas de autenticação: recusa novas conexões por alguns segundos (a porta não responde).
        if lockout.is_locked(std::time::Instant::now()) {
            event(serde_json::json!({ "event": "refused", "reason": "bloqueado por falhas de autenticação" }));
            drop(stream);
            continue;
        }
        let _ = stream.set_nonblocking(false);
        let _ = stream.set_nodelay(true);
        let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));

        let check = |req: &Request, resp: Response| -> Result<Response, ErrorResponse> {
            let h = |k: &str| req.headers().get(k).and_then(|v| v.to_str().ok());
            match policy.check(h("host"), h("origin")) {
                Ok(()) => Ok(resp),
                Err(r) => {
                    event(serde_json::json!({ "event": "refused", "reason": r.message(), "origin": h("origin"), "host": h("host") }));
                    let mut e = ErrorResponse::new(Some(r.message().to_owned()));
                    *e.status_mut() = tungstenite::http::StatusCode::FORBIDDEN;
                    Err(e)
                }
            }
        };
        let cfg = tungstenite::protocol::WebSocketConfig {
            max_message_size: Some(64 << 20),
            max_frame_size: Some(64 << 20),
            ..Default::default()
        };
        let ws = match tungstenite::accept_hdr_with_config(stream, check, Some(cfg)) {
            Ok(ws) => ws,
            Err(_) => continue,
        };
        let _ = ws.get_ref().set_read_timeout(Some(Duration::from_millis(30)));
        event(serde_json::json!({ "event": "connected" }));
        match run_connection(ws, &mut state, &mut retained, &mode, &mut lockout, &rx, &report) {
            End::Quit => return,
            End::Closed(why) => event(serde_json::json!({ "event": "closed", "reason": why })),
        }
    }
}
