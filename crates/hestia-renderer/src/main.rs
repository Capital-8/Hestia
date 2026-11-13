//! `hestia-renderer`: renderizador arquitetônico independente, plugin do Hestia em PROCESSO SEPARADO.
//!
//! Escuta só em loopback (127.0.0.1), fala o protocolo de plugins 1.0 (docs/plugins/02-protocolo.md) e valida
//! `Origin` e `Host` no aperto de mãos. Esta fatia mantém o espelho da cena e o relatório de estado; o desenho
//! (pipeline gráfico) não faz parte dela.

mod auth;
mod security;
mod session;
mod state;

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
    token_file: Option<PathBuf>,
    init_token: Option<PathBuf>,
    show_token: bool,
    insecure_no_auth: bool,
}

fn parse_args() -> Result<Args, String> {
    let mut a = Args {
        port: 47800,
        state_file: None,
        control_stdin: false,
        origins: DEFAULT_ORIGINS.iter().map(|s| s.to_string()).collect(),
        allow_no_origin: false,
        token_file: None,
        init_token: None,
        show_token: false,
        insecure_no_auth: false,
    };
    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "--port" => a.port = it.next().and_then(|v| v.parse().ok()).ok_or("--port precisa de um número")?,
            "--state-file" => a.state_file = Some(it.next().ok_or("--state-file precisa de um caminho")?.into()),
            "--control-stdin" => a.control_stdin = true,
            "--allow-origin" => a.origins.push(it.next().ok_or("--allow-origin precisa de um valor")?),
            "--allow-no-origin" => a.allow_no_origin = true,
            "--token-file" => a.token_file = Some(it.next().ok_or("--token-file precisa de um caminho")?.into()),
            "--init-token" => a.init_token = Some(it.next().ok_or("--init-token precisa de um caminho")?.into()),
            "--show-token" => a.show_token = true,
            "--insecure-no-auth" => a.insecure_no_auth = true,
            "--help" | "-h" => {
                println!("hestia-renderer --token-file F [--port N] [--state-file F] [--control-stdin] [--allow-origin O]...\n  hestia-renderer --init-token F [--show-token]   (cria o token de pareamento e sai)\n  --insecure-no-auth: SEM autenticacao, somente testes locais");
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
    if let Some(path) = &args.init_token {
        match auth::init_token(path) {
            Ok(token) => {
                println!("token criado em {} (copie-o para o Hestia, em Ferramentas externas)", path.display());
                if args.show_token {
                    println!("{token}"); // única forma de o token aparecer na saída: pedido explícito
                }
                return;
            }
            Err(e) => {
                eprintln!("erro: {e}");
                std::process::exit(1);
            }
        }
    }
    // Autenticação é OBRIGATÓRIA por padrão. O modo sem token existe só para testes locais e é declarado em alto e bom som.
    let token = match (&args.token_file, args.insecure_no_auth) {
        (Some(path), false) => match auth::load_token(path) {
            Ok(t) => Some(t),
            Err(e) => {
                eprintln!("erro: {e}");
                std::process::exit(2);
            }
        },
        (None, true) => {
            eprintln!("AVISO: --insecure-no-auth desliga a autenticação. Use SOMENTE em testes locais.");
            None
        }
        (Some(_), true) => {
            eprintln!("erro: --token-file e --insecure-no-auth são excludentes");
            std::process::exit(2);
        }
        (None, false) => {
            eprintln!("erro: autenticação obrigatória. Crie um token com --init-token ARQUIVO e inicie com --token-file ARQUIVO (somente testes locais: --insecure-no-auth).");
            std::process::exit(2);
        }
    };
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
        // Com token, cliente sem Origin (não é navegador) pode tentar: o token é quem decide. Sem token, só com a opção explícita.
        allow_no_origin: args.allow_no_origin || token.is_some(),
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
    event(serde_json::json!({ "event": "listening", "addr": format!("127.0.0.1:{port}"), "pid": std::process::id(), "auth": token.is_some() }));

    loop {
        // Fora de uma conexão, `quit` encerra o processo.
        while let Ok(cmd) = rx.try_recv() {
            if matches!(cmd, Cmd::Quit) {
                return;
            }
        }
        // Três falhas de pareamento seguidas: atrasa a próxima tentativa (1 s a mais por falha, no máximo 5 s).
        if state.auth_consecutive >= 3 {
            std::thread::sleep(Duration::from_millis(u64::from(state.auth_consecutive - 2).min(5) * 1000));
        }
        let stream = match listener.accept() {
            Ok((s, _)) => s,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(20));
                continue;
            }
            Err(_) => continue,
        };
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
        match run_connection(ws, &mut state, &mut retained, &rx, &report, token.as_deref()) {
            End::Quit => return,
            End::Closed(why) => event(serde_json::json!({ "event": "closed", "reason": why })),
        }
    }
}
