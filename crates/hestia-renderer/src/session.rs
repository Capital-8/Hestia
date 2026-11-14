//! Lado do plugin do protocolo 1.1 (docs/plugins/02-protocolo.md): `hello`, pareamento por token (`auth`/`auth.ok`),
//! `ack`, heartbeat, snapshot e deltas, câmera, modo de câmera e substituições. Uma conexão por vez; o estado da cena
//! sobrevive entre conexões para a retomada. Com token exigido, nada além de `ack`/`ping`/`pong`/`bye`/`error` é
//! processado antes de o host provar que conhece o token.

use crate::auth::{self, AuthMode, Lockout};
use crate::state::State;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::net::TcpStream;
use std::sync::mpsc::Receiver;
use std::time::{Duration, Instant};
use tungstenite::{Error as WsError, Message, WebSocket};

/// Comandos de controle (stdin do processo): são o que o "usuário do renderizador" faria na interface dele.
#[derive(Debug)]
pub enum Cmd {
    SetMode(String),
    DriveCamera(Value),
    SetOverride(String, Value),
    ClearOverride(String),
    Resync,
    Cancel(String),
    Raw(Value),
    Quit,
}

/// Última sessão conhecida, enviada em `hello.resume` ao reconectar.
#[derive(Default)]
pub struct Retained {
    pub session_id: Option<String>,
}

const NUMBERED_FROM_HOST: &[&str] = &[
    "welcome",
    "scene.snapshot",
    "scene.delta",
    "event.connection",
    "camera.update",
    "camera.mode",
    "overrides.state",
    "auth",
];
const NUMBERED_TO_HOST: &[&str] = &[
    "hello",
    "scene.resync",
    "camera.mode.set",
    "camera.set",
    "overrides.set",
    "overrides.clear",
    "cancel",
    "auth.ok",
];

pub enum End {
    Closed(String),
    Quit,
}

struct Peer {
    ws: WebSocket<TcpStream>,
    next_seq: u64,
    last_rx: u64,
    pending: HashMap<u64, Instant>,
    last_seen: Instant,
    last_ping: Instant,
    ping_n: u64,
    heartbeat: Duration,
    cam_rev: u64,
    req_n: u64,
    last_report: Instant,
    /// Token exigido e o host ainda não provou que o conhece.
    auth_required: bool,
    authed: bool,
    nonce_plugin: String,
}

impl Peer {
    fn send(&mut self, mut v: Value) -> Result<(), WsError> {
        let t = v["t"].as_str().unwrap_or_default().to_owned();
        if NUMBERED_TO_HOST.contains(&t.as_str()) {
            let seq = self.next_seq;
            self.next_seq += 1;
            v["seq"] = json!(seq);
            self.pending.insert(seq, Instant::now());
        }
        self.ws.send(Message::text(v.to_string()))
    }

    fn next_id(&mut self, prefix: &str) -> String {
        self.req_n += 1;
        format!("{prefix}{}", self.req_n)
    }
}

fn manifest() -> Value {
    json!({
        "id": "dev.hestia.renderer-rust",
        "name": "Renderizador arquitetônico (Rust)",
        "version": env!("CARGO_PKG_VERSION"),
        "hestiaApi": "1.0",
        "kind": "renderer",
        "capabilities": ["scene.read", "camera.read", "events.subscribe", "camera.write", "overrides.write"],
    })
}

/// Trata uma conexão até ela terminar. Escreve o relatório de estado depois de cada mensagem e de cada comando.
pub fn run_connection(
    ws: WebSocket<TcpStream>,
    state: &mut State,
    retained: &mut Retained,
    mode: &AuthMode,
    lockout: &mut Lockout,
    cmds: &Receiver<Cmd>,
    report: &dyn Fn(&State),
) -> End {
    let mut p = Peer {
        ws,
        next_seq: 1,
        last_rx: 0,
        pending: HashMap::new(),
        last_seen: Instant::now(),
        last_ping: Instant::now(),
        ping_n: 0,
        heartbeat: Duration::from_millis(5000),
        cam_rev: 0,
        req_n: 0,
        last_report: Instant::now(),
        auth_required: mode.token.is_some(),
        authed: false,
        nonce_plugin: auth::novo_nonce(),
    };
    state.auth_required = p.auth_required;
    state.authenticated = false;
    state.connections += 1;
    state.connected = true;
    state.last_close.clear();
    state.session_id = None;

    // Com token: só fala 1.1 (um host 1.0 não sabe autenticar e é recusado). Sem token (desenvolvimento): 1.0 legado.
    let mut hello = if p.auth_required {
        json!({ "t": "hello", "protocol": { "min": "1.1", "max": "1.1" }, "manifest": manifest(), "auth": { "nonce": p.nonce_plugin } })
    } else {
        json!({ "t": "hello", "protocol": { "min": "1.0", "max": "1.0" }, "manifest": manifest() })
    };
    if let Some(sid) = &retained.session_id {
        hello["resume"] = json!({ "sessionId": sid, "lastRevision": state.scene.revision });
    }
    if let Err(e) = p.send(hello) {
        return finish(state, report, format!("hello: {e}"));
    }
    report(state);

    loop {
        // 1. Comandos de controle.
        while let Ok(cmd) = cmds.try_recv() {
            if matches!(cmd, Cmd::Quit) {
                let _ = p.send(json!({ "t": "bye", "reason": "quit" }));
                state.connected = false;
                report(state);
                return End::Quit;
            }
            if let Err(e) = run_cmd(&mut p, cmd) {
                return finish(state, report, format!("envio: {e}"));
            }
            report(state);
        }

        // 2. Quadros da rede (a leitura expira em ~30 ms para o laço seguir).
        match p.ws.read() {
            Ok(Message::Text(txt)) => {
                p.last_seen = Instant::now();
                match handle(&mut p, state, retained, mode, lockout, &txt) {
                    Ok(true) => report(state),
                    Ok(false) => return finish(state, report, "encerrado pelo host".into()),
                    Err(e) => return finish(state, report, format!("falha: {e}")),
                }
            }
            Ok(Message::Close(_)) => return finish(state, report, "fechado pelo host".into()),
            Ok(_) => {}
            Err(WsError::Io(e)) if matches!(e.kind(), std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut) => {}
            Err(e) => return finish(state, report, format!("{e}")),
        }

        // 3. Heartbeat e prazos.
        let now = Instant::now();
        if now.duration_since(p.last_report) >= Duration::from_millis(250) {
            p.last_report = now;
            report(state); // reescreve o relatório: se uma gravação falhou, a próxima corrige
        }
        if now.duration_since(p.last_seen) > p.heartbeat.mul_f32(2.5) {
            return finish(state, report, "heartbeat_timeout".into());
        }
        if p.pending.values().any(|t| now.duration_since(*t) > p.heartbeat * 4) {
            return finish(state, report, "ack_timeout".into());
        }
        if now.duration_since(p.last_ping) >= p.heartbeat {
            p.last_ping = now;
            p.ping_n += 1;
            let n = p.ping_n;
            if let Err(e) = p.send(json!({ "t": "ping", "n": n })) {
                return finish(state, report, format!("ping: {e}"));
            }
        }
    }
}

fn finish(state: &mut State, report: &dyn Fn(&State), reason: String) -> End {
    state.connected = false;
    state.last_close = reason.clone();
    report(state);
    End::Closed(reason)
}

fn run_cmd(p: &mut Peer, cmd: Cmd) -> Result<(), WsError> {
    match cmd {
        Cmd::SetMode(mode) => p.send(json!({ "t": "camera.mode.set", "mode": mode })),
        Cmd::DriveCamera(camera) => {
            p.cam_rev += 1;
            let rev = p.cam_rev;
            p.send(json!({ "t": "camera.set", "camera": camera, "cameraRev": rev }))
        }
        Cmd::SetOverride(material_id, ov) => p.send(json!({ "t": "overrides.set", "materialId": material_id, "override": ov })),
        Cmd::ClearOverride(material_id) => p.send(json!({ "t": "overrides.clear", "materialId": material_id })),
        Cmd::Resync => {
            let id = p.next_id("r");
            p.send(json!({ "t": "scene.resync", "id": id }))
        }
        Cmd::Cancel(target) => p.send(json!({ "t": "cancel", "target": target })),
        Cmd::Raw(v) => p.send(v),
        Cmd::Quit => Ok(()),
    }
}

/// Trata um quadro do host. `Ok(false)` = encerrar a conexão.
fn handle(p: &mut Peer, state: &mut State, retained: &mut Retained, mode: &AuthMode, lockout: &mut Lockout, txt: &str) -> Result<bool, WsError> {
    let Ok(m) = serde_json::from_str::<Value>(txt) else {
        state.errors.push(json!({ "code": "bad_frame", "message": "JSON inválido recebido do host" }));
        return Ok(true);
    };
    let t = m["t"].as_str().unwrap_or_default().to_owned();

    if NUMBERED_FROM_HOST.contains(&t.as_str()) {
        let Some(seq) = m["seq"].as_u64() else {
            state.errors.push(json!({ "code": "bad_frame", "message": format!("{t} sem seq") }));
            return Ok(true);
        };
        if seq <= p.last_rx {
            p.ws.send(Message::text(json!({ "t": "ack", "ack": seq }).to_string()))?; // duplicata: reconfirma e ignora
            return Ok(true);
        }
        if seq != p.last_rx + 1 {
            state
                .errors
                .push(json!({ "code": "out_of_order", "message": format!("seq {seq} depois de {}", p.last_rx) }));
            return Ok(false);
        }
        p.last_rx = seq;
        p.ws.send(Message::text(json!({ "t": "ack", "ack": seq }).to_string()))?;
    }

    // Antes da autenticação, nenhuma mensagem de cena, câmera ou substituição é processada.
    if p.auth_required && !p.authed {
        match t.as_str() {
            "ack" | "ping" | "pong" | "bye" | "error" => {}
            "auth" => return on_auth(p, state, mode, lockout, &m),
            other => {
                let msg = format!("mensagem \"{other}\" antes da autenticação");
                return auth_fail(p, state, &msg).map(|_| false);
            }
        }
    }

    match t.as_str() {
        "ack" => {
            if let Some(a) = m["ack"].as_u64() {
                p.pending.remove(&a);
            }
        }
        "ping" => p.ws.send(Message::text(json!({ "t": "pong", "n": m["n"] }).to_string()))?,
        "pong" => {}
        "welcome" => {
            state.session_id = m["sessionId"].as_str().map(str::to_owned);
            retained.session_id = state.session_id.clone();
            state.protocol = m["protocol"].as_str().unwrap_or_default().to_owned();
            state.api = m["api"].as_str().unwrap_or_default().to_owned();
            state.granted = strings(&m["granted"]);
            state.denied = strings(&m["denied"]);
            state.resumed = m["resumed"].as_bool().unwrap_or(false);
            state.camera_mode = m["cameraMode"].as_str().unwrap_or("follow-hestia").to_owned();
            if let Some(ms) = m["heartbeatMs"].as_u64() {
                p.heartbeat = Duration::from_millis(ms.max(50));
            }
        }
        "scene.snapshot" => {
            state.scene.load_snapshot(&m["snapshot"]);
            state.snapshots += 1;
        }
        "scene.delta" => {
            if state.scene.apply_delta(&m["delta"]) {
                state.deltas += 1;
            } else {
                // Não parte da nossa revisão: perdemos algo. Pede o estado completo.
                state.resyncs += 1;
                let id = p.next_id("r");
                p.send(json!({ "t": "scene.resync", "id": id }))?;
            }
        }
        // O renderizador só ADOTA a câmera do Hestia; nunca a reenvia como `camera.set` (isso criaria eco).
        "camera.update" => {
            state.camera = Some(m["camera"].clone());
            state.camera_rev = m["cameraRev"].as_u64().unwrap_or(0);
            state.camera_updates += 1;
        }
        "camera.mode" => state.camera_mode = m["mode"].as_str().unwrap_or("follow-hestia").to_owned(),
        "overrides.state" => {
            state.overrides = m["overrides"].as_object().cloned().unwrap_or_default();
        }
        "error" => {
            state.errors.push(m["error"].clone());
            if m["error"]["fatal"].as_bool().unwrap_or(false) {
                return Ok(false);
            }
        }
        "bye" => return Ok(false),
        _ => {}
    }
    Ok(true)
}

fn strings(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_owned)).collect())
        .unwrap_or_default()
}

/// Registra e envia `error auth_failed` (fatal). O chamador encerra a conexão.
fn auth_fail(p: &mut Peer, state: &mut State, message: &str) -> Result<(), WsError> {
    let error = json!({ "code": "auth_failed", "message": message, "fatal": true });
    state.errors.push(error.clone());
    p.send(json!({ "t": "error", "error": error }))
}

/// Confere a prova do host (`auth`) e responde com a nossa (`auth.ok`). Prova errada conta para o bloqueio.
fn on_auth(p: &mut Peer, state: &mut State, mode: &AuthMode, lockout: &mut Lockout, m: &Value) -> Result<bool, WsError> {
    let token = mode.token.as_deref().unwrap_or_default();
    let (nonce_host, proof) = (m["nonce"].as_str().unwrap_or_default(), m["proof"].as_str().unwrap_or_default());
    if nonce_host.is_empty() || !auth::confere(token, "hestia-host", &p.nonce_plugin, nonce_host, proof) {
        lockout.record_failure(Instant::now());
        auth_fail(p, state, "o host não provou conhecer o token de pareamento")?;
        return Ok(false);
    }
    p.authed = true;
    state.authenticated = true;
    lockout.record_success();
    let proof = auth::prova(token, "hestia-plugin", &p.nonce_plugin, nonce_host);
    p.send(json!({ "t": "auth.ok", "proof": proof }))?;
    Ok(true)
}
