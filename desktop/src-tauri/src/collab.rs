//! Servidor WebSocket embutido (RFC 6455) para colaboração multiusuário em LAN/IP direto.
//! Zero dependências externas: usa apenas `std` e `serde`.

use serde::Serialize;
use std::io::{self, Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::Duration;

const WS_GUID: &str = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const DEFAULT_PORT: u16 = 41730;
const MAX_FRAME_BYTES: usize = 32 * 1024 * 1024;
const MAX_HTTP_HEADER_BYTES: usize = 16 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollabServerInfo {
    pub port: u16,
    pub lan_ip: String,
    pub ws_url: String,
    pub local_ws_url: String,
}

type ClientEntry = (u64, Arc<Mutex<TcpStream>>);
type ClientList = Arc<Mutex<Vec<ClientEntry>>>;

struct RunningServer {
    info: CollabServerInfo,
    running: Arc<AtomicBool>,
    clients: ClientList,
    accept_thread: Option<JoinHandle<()>>,
}

static SERVER_STATE: OnceLock<Mutex<Option<RunningServer>>> = OnceLock::new();
static NEXT_CLIENT_ID: AtomicU64 = AtomicU64::new(1);

fn server_slot() -> &'static Mutex<Option<RunningServer>> {
    SERVER_STATE.get_or_init(|| Mutex::new(None))
}

/// Descobre o IP local da interface de saída padrão sem enviar pacotes na rede.
pub fn detect_lan_ip() -> String {
    let Ok(sock) = UdpSocket::bind("0.0.0.0:0") else { return "127.0.0.1".into(); };
    if sock.connect("8.8.8.8:80").is_err() { return "127.0.0.1".into(); }
    sock.local_addr().map(|a| a.ip().to_string()).unwrap_or_else(|_| "127.0.0.1".into())
}

fn sha1(data: &[u8]) -> [u8; 20] {
    let mut h: [u32; 5] = [0x67452301, 0xEFCDAB89, 0x98BADCFE, 0x10325476, 0xC3D2E1F0];
    let mut msg = data.to_vec();
    msg.push(0x80);
    while msg.len() % 64 != 56 { msg.push(0); }
    msg.extend_from_slice(&((data.len() as u64).wrapping_mul(8)).to_be_bytes());
    for chunk in msg.chunks_exact(64) {
        let mut w = [0u32; 80];
        for i in 0..16 { w[i] = u32::from_be_bytes(chunk[i * 4..i * 4 + 4].try_into().unwrap()); }
        for i in 16..80 { w[i] = (w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]).rotate_left(1); }
        let [mut a, mut b, mut c, mut d, mut e] = h;
        for (i, &wi) in w.iter().enumerate() {
            let (f, k) = match i {
                0..=19 => ((b & c) | ((!b) & d), 0x5A827999),
                20..=39 => (b ^ c ^ d, 0x6ED9EBA1),
                40..=59 => ((b & c) | (b & d) | (c & d), 0x8F1BBCDC),
                _ => (b ^ c ^ d, 0xCA62C1D6),
            };
            let t = a.rotate_left(5).wrapping_add(f).wrapping_add(e).wrapping_add(k).wrapping_add(wi);
            e = d; d = c; c = b.rotate_left(30); b = a; a = t;
        }
        for (slot, delta) in h.iter_mut().zip([a, b, c, d, e]) {
            *slot = slot.wrapping_add(delta);
        }
    }
    let mut out = [0u8; 20];
    for (i, w) in h.iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&w.to_be_bytes());
    }
    out
}

fn base64_encode(input: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for c in input.chunks(3) {
        let n = ((c[0] as usize) << 16)
            | (c.get(1).copied().unwrap_or(0) as usize) << 8
            | (c.get(2).copied().unwrap_or(0) as usize);
        out.push(T[(n >> 18) & 0x3F] as char);
        out.push(T[(n >> 12) & 0x3F] as char);
        out.push(if c.len() > 1 { T[(n >> 6) & 0x3F] as char } else { '=' });
        out.push(if c.len() > 2 { T[n & 0x3F] as char } else { '=' });
    }
    out
}

pub fn compute_accept_key(client_key: &str) -> String {
    let mut combined = Vec::with_capacity(client_key.len() + WS_GUID.len());
    combined.extend_from_slice(client_key.trim().as_bytes());
    combined.extend_from_slice(WS_GUID.as_bytes());
    base64_encode(&sha1(&combined))
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct WsFrame {
    fin: bool,
    opcode: u8,
    payload: Vec<u8>,
}

fn read_frame<R: Read>(reader: &mut R) -> io::Result<WsFrame> {
    let mut head = [0u8; 2];
    reader.read_exact(&mut head)?;
    let fin = (head[0] & 0x80) != 0;
    let opcode = head[0] & 0x0F;
    let masked = (head[1] & 0x80) != 0;
    let payload_len: usize = match head[1] & 0x7F {
        n @ 0..=125 => n as usize,
        126 => {
            let mut ext = [0u8; 2];
            reader.read_exact(&mut ext)?;
            u16::from_be_bytes(ext) as usize
        }
        _ => {
            let mut ext = [0u8; 8];
            reader.read_exact(&mut ext)?;
            usize::try_from(u64::from_be_bytes(ext))
                .map_err(|_| io::Error::new(io::ErrorKind::InvalidData, "frame grande"))?
        }
    };
    if payload_len > MAX_FRAME_BYTES {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "frame > 32 MB"));
    }
    let mask = if masked {
        let mut m = [0u8; 4];
        reader.read_exact(&mut m)?;
        Some(m)
    } else {
        None
    };
    let mut payload = vec![0u8; payload_len];
    if payload_len > 0 {
        reader.read_exact(&mut payload)?;
    }
    if let Some(m) = mask {
        for (i, b) in payload.iter_mut().enumerate() { *b ^= m[i % 4]; }
    }
    Ok(WsFrame { fin, opcode, payload })
}

fn encode_server_frame(opcode: u8, payload: &[u8]) -> Vec<u8> {
    let len = payload.len();
    let mut out = Vec::with_capacity(10 + len);
    out.push(0x80 | (opcode & 0x0F));
    if len < 126 {
        out.push(len as u8);
    } else if len <= 65535 {
        out.push(126);
        out.extend_from_slice(&(len as u16).to_be_bytes());
    } else {
        out.push(127);
        out.extend_from_slice(&(len as u64).to_be_bytes());
    }
    out.extend_from_slice(payload);
    out
}

fn write_server_frame<W: Write>(writer: &mut W, opcode: u8, payload: &[u8]) -> io::Result<()> {
    writer.write_all(&encode_server_frame(opcode, payload))?;
    writer.flush()
}

fn perform_handshake(stream: &mut TcpStream) -> io::Result<()> {
    let mut raw = Vec::with_capacity(512);
    let mut byte = [0u8; 1];
    while !raw.ends_with(b"\r\n\r\n") {
        if raw.len() >= MAX_HTTP_HEADER_BYTES {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "cabeçalho HTTP grande"));
        }
        if stream.read(&mut byte)? == 0 {
            return Err(io::Error::new(io::ErrorKind::UnexpectedEof, "conexão fechada"));
        }
        raw.push(byte[0]);
    }
    let req = String::from_utf8_lossy(&raw);
    let ws_key = req.lines().skip(1).find_map(|line| {
        let (name, value) = line.split_once(':')?;
        name.trim().eq_ignore_ascii_case("sec-websocket-key").then(|| value.trim().to_string())
    });
    let Some(key) = ws_key.filter(|k| !k.is_empty()) else {
        let _ = stream.write_all(b"HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
        return Err(io::Error::new(io::ErrorKind::InvalidData, "Sec-WebSocket-Key ausente"));
    };
    let accept = compute_accept_key(&key);
    let resp = format!(
        "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {accept}\r\n\r\n"
    );
    stream.write_all(resp.as_bytes())?;
    stream.flush()
}

fn broadcast_text(clients: &ClientList, sender_id: u64, payload: &[u8]) {
    let frame = encode_server_frame(0x1, payload);
    let targets: Vec<ClientEntry> = clients
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .iter()
        .filter(|(id, _)| *id != sender_id)
        .map(|(id, s)| (*id, Arc::clone(s)))
        .collect();
    let mut dead_ids = Vec::new();
    for (id, stream_arc) in targets {
        if let Ok(mut s) = stream_arc.lock() {
            if s.write_all(&frame).is_err() || s.flush().is_err() { dead_ids.push(id); }
        }
    }
    if !dead_ids.is_empty() {
        clients.lock().unwrap_or_else(|e| e.into_inner()).retain(|(id, _)| !dead_ids.contains(id));
    }
}

fn handle_client(mut stream: TcpStream, clients: ClientList, running: Arc<AtomicBool>) {
    let _ = stream.set_nonblocking(false);
    let _ = stream.set_nodelay(true);
    if perform_handshake(&mut stream).is_err() { return; }
    let Ok(write_clone) = stream.try_clone() else { return; };
    let client_id = NEXT_CLIENT_ID.fetch_add(1, Ordering::Relaxed);
    let write_arc = Arc::new(Mutex::new(write_clone));
    clients.lock().unwrap_or_else(|e| e.into_inner()).push((client_id, Arc::clone(&write_arc)));

    let mut fragmented: Option<Vec<u8>> = None;
    while running.load(Ordering::Acquire) {
        let Ok(frame) = read_frame(&mut stream) else { break; };
        match frame.opcode {
            0x8 => {
                if let Ok(mut w) = write_arc.lock() { let _ = write_server_frame(&mut *w, 0x8, &[]); }
                break;
            }
            0x9 => {
                if let Ok(mut w) = write_arc.lock() {
                    if write_server_frame(&mut *w, 0xA, &frame.payload).is_err() { break; }
                }
            }
            0x1 => {
                if frame.fin {
                    fragmented = None;
                    broadcast_text(&clients, client_id, &frame.payload);
                } else {
                    fragmented = Some(frame.payload);
                }
            }
            0x0 => {
                if let Some(buf) = fragmented.as_mut() {
                    if buf.len().saturating_add(frame.payload.len()) > MAX_FRAME_BYTES { break; }
                    buf.extend_from_slice(&frame.payload);
                    if frame.fin {
                        let complete = fragmented.take().unwrap_or_default();
                        broadcast_text(&clients, client_id, &complete);
                    }
                }
            }
            _ => {}
        }
    }
    clients.lock().unwrap_or_else(|e| e.into_inner()).retain(|(id, _)| *id != client_id);
}

#[tauri::command]
pub fn collab_iniciar_servidor(porta: Option<u16>) -> Result<CollabServerInfo, String> {
    let mut slot = server_slot().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(existing) = slot.as_ref().filter(|s| s.running.load(Ordering::Acquire)) {
        return Ok(existing.info.clone());
    }
    let requested = porta.unwrap_or(DEFAULT_PORT);
    let listener = match TcpListener::bind(("0.0.0.0", requested)) {
        Ok(l) => l,
        Err(_) if requested != 0 => TcpListener::bind(("0.0.0.0", 0))
            .map_err(|e| format!("falha ao abrir porta do servidor colaborativo: {e}"))?,
        Err(e) => return Err(format!("falha ao abrir porta do servidor colaborativo: {e}")),
    };
    listener.set_nonblocking(true).map_err(|e| format!("falha ao configurar listener: {e}"))?;
    let port = listener.local_addr().map_err(|e| format!("falha ao ler porta: {e}"))?.port();
    let lan_ip = detect_lan_ip();
    let info = CollabServerInfo {
        port,
        ws_url: format!("ws://{lan_ip}:{port}"),
        local_ws_url: format!("ws://127.0.0.1:{port}"),
        lan_ip,
    };
    let running = Arc::new(AtomicBool::new(true));
    let clients: ClientList = Arc::new(Mutex::new(Vec::new()));
    let (run_flag, clients_ref) = (Arc::clone(&running), Arc::clone(&clients));
    let accept_thread = thread::spawn(move || {
        while run_flag.load(Ordering::Acquire) {
            match listener.accept() {
                Ok((stream, _)) => {
                    let (c_ref, r_flag) = (Arc::clone(&clients_ref), Arc::clone(&run_flag));
                    thread::spawn(move || handle_client(stream, c_ref, r_flag));
                }
                Err(err) if err.kind() == io::ErrorKind::WouldBlock => thread::sleep(Duration::from_millis(25)),
                Err(_) if !run_flag.load(Ordering::Acquire) => break,
                Err(_) => thread::sleep(Duration::from_millis(25)),
            }
        }
    });
    *slot = Some(RunningServer { info: info.clone(), running, clients, accept_thread: Some(accept_thread) });
    Ok(info)
}

#[tauri::command]
pub fn collab_parar_servidor() -> Result<(), String> {
    let mut server = server_slot().lock().unwrap_or_else(|e| e.into_inner()).take();
    if let Some(ref mut srv) = server {
        srv.running.store(false, Ordering::Release);
        for (_, stream_arc) in srv.clients.lock().unwrap_or_else(|e| e.into_inner()).drain(..) {
            if let Ok(s) = stream_arc.lock() { let _ = s.shutdown(Shutdown::Both); }
        }
        if let Some(handle) = srv.accept_thread.take() { let _ = handle.join(); }
    }
    Ok(())
}

#[tauri::command]
pub fn collab_status_servidor() -> Option<CollabServerInfo> {
    let slot = server_slot().lock().unwrap_or_else(|e| e.into_inner());
    slot.as_ref().filter(|s| s.running.load(Ordering::Acquire)).map(|s| s.info.clone())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn encode_masked_client_frame(opcode: u8, payload: &[u8], mask: [u8; 4]) -> Vec<u8> {
        let len = payload.len();
        let mut out = Vec::with_capacity(len + 14);
        out.push(0x80 | (opcode & 0x0F));
        if len < 126 {
            out.push(0x80 | (len as u8));
        } else if len <= 65535 {
            out.push(0x80 | 126);
            out.extend_from_slice(&(len as u16).to_be_bytes());
        } else {
            out.push(0x80 | 127);
            out.extend_from_slice(&(len as u64).to_be_bytes());
        }
        out.extend_from_slice(&mask);
        for (i, b) in payload.iter().enumerate() { out.push(b ^ mask[i % 4]); }
        out
    }

    fn connect_ws_client(port: u16, key: &str) -> TcpStream {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("tcp connect");
        stream.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
        let req = format!(
            "GET / HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        );
        stream.write_all(req.as_bytes()).unwrap();
        stream.flush().unwrap();
        let mut resp = Vec::new();
        let mut b = [0u8; 1];
        while !resp.ends_with(b"\r\n\r\n") {
            assert!(stream.read(&mut b).unwrap() > 0, "handshake EOF");
            resp.push(b[0]);
        }
        let resp_str = String::from_utf8_lossy(&resp);
        assert!(resp_str.starts_with("HTTP/1.1 101"), "unexpected handshake: {resp_str}");
        assert!(resp_str.contains(&compute_accept_key(key)), "missing accept key");
        stream
    }

    #[test]
    fn rfc6455_accept_key_vector() {
        assert_eq!(compute_accept_key("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
    }

    #[test]
    fn frame_roundtrip_small_medium_large() {
        let mask = [0x37, 0xFA, 0x21, 0x3D];
        for size in [12usize, 300usize, 70_000usize] {
            let payload: Vec<u8> = (0..size).map(|i| (i % 251) as u8).collect();
            let mut c_cur = Cursor::new(encode_masked_client_frame(0x1, &payload, mask));
            let decoded = read_frame(&mut c_cur).expect("decode client frame");
            assert!(decoded.fin && decoded.opcode == 0x1 && decoded.payload == payload);
            let mut s_cur = Cursor::new(encode_server_frame(0x1, &decoded.payload));
            let redecoded = read_frame(&mut s_cur).expect("decode server frame");
            assert!(redecoded.fin && redecoded.opcode == 0x1 && redecoded.payload == payload);
        }
    }

    #[test]
    fn relay_broadcasts_between_two_clients() {
        let info = collab_iniciar_servidor(Some(0)).expect("start collab server");
        assert!(collab_status_servidor().is_some());
        let mut c1 = connect_ws_client(info.port, "dGhlIHNhbXBsZSBub25jZQ==");
        let mut c2 = connect_ws_client(info.port, "x3JJHMbDL1EzLkh9GBhXDw==");
        thread::sleep(Duration::from_millis(40));

        let msg = br#"{"type":"hello","user":"Ana"}"#;
        c1.write_all(&encode_masked_client_frame(0x1, msg, [0x11, 0x22, 0x33, 0x44])).unwrap();
        c1.flush().unwrap();

        let received = read_frame(&mut c2).expect("client 2 must receive relay");
        assert_eq!(received.opcode, 0x1);
        assert_eq!(received.payload, msg);

        c1.set_read_timeout(Some(Duration::from_millis(120))).unwrap();
        assert!(read_frame(&mut c1).is_err(), "client 1 must not receive echo");

        drop(c1);
        drop(c2);
        collab_parar_servidor().expect("stop collab server");
        assert!(collab_status_servidor().is_none());
    }
}
