//! Pareamento por token (protocolo 1.1, docs/plugins/07-pareamento-por-token.md).
//!
//! O token (256 bits, em hexadecimal) é gerado na primeira execução e guardado num arquivo legível só pelo usuário. Ele
//! NUNCA trafega: cada lado prova que o conhece com HMAC-SHA256 sobre os dois nonces (desafio e resposta mútuos).
//!   prova do host   = HMAC(token, "hestia-host|"   + nonce_plugin + "|" + nonce_host)
//!   prova do plugin = HMAC(token, "hestia-plugin|" + nonce_plugin + "|" + nonce_host)
//! Os nonces vão em base64 como textos (a mesma cadeia entra no cálculo dos dois lados).

use base64::{engine::general_purpose::STANDARD, Engine as _};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

type HmacSha256 = Hmac<Sha256>;

/// Falhas seguidas de autenticação que bloqueiam novas conexões.
pub const MAX_FAILURES: u32 = 3;
/// Tempo de bloqueio depois de `MAX_FAILURES` falhas seguidas, em segundos.
pub const LOCK_SECONDS: u64 = 10;

fn bytes_aleatorios<const N: usize>() -> [u8; N] {
    let mut b = [0u8; N];
    getrandom::getrandom(&mut b).expect("o sistema não forneceu bytes aleatórios");
    b
}

/// Nonce de 16 bytes aleatórios, em base64.
pub fn novo_nonce() -> String {
    STANDARD.encode(bytes_aleatorios::<16>())
}

/// Token novo: 32 bytes aleatórios em hexadecimal (64 caracteres, 256 bits).
pub fn gerar_token() -> String {
    bytes_aleatorios::<32>().iter().map(|b| format!("{b:02x}")).collect()
}

fn mac(token: &str, rotulo: &str, nonce_plugin: &str, nonce_host: &str) -> HmacSha256 {
    let mut m = HmacSha256::new_from_slice(token.trim().as_bytes()).expect("HMAC aceita chave de qualquer tamanho");
    m.update(format!("{rotulo}|{nonce_plugin}|{nonce_host}").as_bytes());
    m
}

/// Prova (base64) de que quem fala conhece o token.
pub fn prova(token: &str, rotulo: &str, nonce_plugin: &str, nonce_host: &str) -> String {
    STANDARD.encode(mac(token, rotulo, nonce_plugin, nonce_host).finalize().into_bytes())
}

/// Confere a prova recebida em tempo constante (`verify_slice` compara sem sair no primeiro byte diferente).
pub fn confere(token: &str, rotulo: &str, nonce_plugin: &str, nonce_host: &str, prova_recebida: &str) -> bool {
    let Ok(bytes) = STANDARD.decode(prova_recebida) else { return false };
    mac(token, rotulo, nonce_plugin, nonce_host).verify_slice(&bytes).is_ok()
}

/// Bloqueio por falhas seguidas: depois de `MAX_FAILURES`, recusa novas tentativas por `LOCK_SECONDS`.
pub struct Lockout {
    failures: u32,
    locked_until: Option<Instant>,
    lock: Duration,
}

impl Default for Lockout {
    fn default() -> Self {
        Self::new(LOCK_SECONDS)
    }
}

impl Lockout {
    /// `lock_seconds` é a duração do bloqueio (o padrão é `LOCK_SECONDS`; `--lock-seconds` existe para os testes).
    pub fn new(lock_seconds: u64) -> Self {
        Self { failures: 0, locked_until: None, lock: Duration::from_secs(lock_seconds) }
    }

    pub fn is_locked(&self, now: Instant) -> bool {
        self.locked_until.is_some_and(|t| now < t)
    }

    pub fn record_failure(&mut self, now: Instant) {
        self.failures += 1;
        if self.failures >= MAX_FAILURES {
            self.locked_until = Some(now + self.lock);
            self.failures = 0;
        }
    }

    pub fn record_success(&mut self) {
        self.failures = 0;
        self.locked_until = None;
    }
}

/// Como o processo trata o token: `token = None` é o modo legado (`--no-require-token`, só para desenvolvimento).
pub struct AuthMode {
    pub token: Option<String>,
}

/// Arquivo padrão do token: `HESTIA_RENDERER_TOKEN_FILE`, ou a pasta de configuração do usuário.
pub fn caminho_padrao() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("HESTIA_RENDERER_TOKEN_FILE") {
        return Some(p.into());
    }
    let base = std::env::var_os("XDG_CONFIG_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("APPDATA").map(PathBuf::from))
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))?;
    Some(base.join("hestia-renderer").join("token"))
}

/// Resultado de carregar o token: o texto e se ele acabou de ser criado (para mostrá-lo uma única vez).
pub struct TokenCarregado {
    pub token: String,
    pub criado: bool,
}

/// Lê o token do arquivo; se não existir, gera e grava (permissão 0600 em sistemas Unix; no Windows, a pasta do perfil do
/// usuário já é privada). Um token curto demais (menos de 32 caracteres) é recusado: o usuário o editou à mão.
pub fn carregar_ou_criar(path: &Path) -> Result<TokenCarregado, String> {
    match std::fs::read_to_string(path) {
        Ok(s) => {
            let t = s.trim().to_owned();
            if t.len() < 32 {
                return Err(format!("o token em {} tem menos de 32 caracteres (128 bits); apague o arquivo para gerar outro", path.display()));
            }
            Ok(TokenCarregado { token: t, criado: false })
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            if let Some(dir) = path.parent() {
                std::fs::create_dir_all(dir).map_err(|e| format!("não foi possível criar {}: {e}", dir.display()))?;
            }
            let token = gerar_token();
            grava_privado(path, &token).map_err(|e| format!("não foi possível gravar {}: {e}", path.display()))?;
            Ok(TokenCarregado { token, criado: true })
        }
        Err(e) => Err(format!("não foi possível ler {}: {e}", path.display())),
    }
}

#[cfg(unix)]
fn grava_privado(path: &Path, conteudo: &str) -> std::io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let mut f = std::fs::OpenOptions::new().write(true).create_new(true).mode(0o600).open(path)?;
    f.write_all(conteudo.as_bytes())
}

#[cfg(not(unix))]
fn grava_privado(path: &Path, conteudo: &str) -> std::io::Result<()> {
    use std::io::Write;
    let mut f = std::fs::OpenOptions::new().write(true).create_new(true).open(path)?;
    f.write_all(conteudo.as_bytes())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prova_certa_confere_e_errada_nao() {
        let t = gerar_token();
        let (np, nh) = (novo_nonce(), novo_nonce());
        let p = prova(&t, "hestia-host", &np, &nh);
        assert!(confere(&t, "hestia-host", &np, &nh, &p));
        assert!(!confere(&gerar_token(), "hestia-host", &np, &nh, &p), "token diferente");
        assert!(!confere(&t, "hestia-plugin", &np, &nh, &p), "rótulo diferente: a prova do host não vale como a do plugin");
        assert!(!confere(&t, "hestia-host", &novo_nonce(), &nh, &p), "nonce do plugin diferente (repetição)");
        assert!(!confere(&t, "hestia-host", &np, &novo_nonce(), &p), "nonce do host diferente");
        assert!(!confere(&t, "hestia-host", &np, &nh, "lixo!!"), "base64 inválido");
        assert!(!confere(&t, "hestia-host", &np, &nh, ""), "prova vazia");
    }

    #[test]
    fn vetor_conhecido_do_hmac_sha256() {
        // RFC 4231, caso 2, com chave "Jefe": aqui só conferimos que o cálculo é HMAC-SHA256 padrão sobre a mensagem montada.
        let mut m = HmacSha256::new_from_slice(b"Jefe").unwrap();
        m.update(b"what do ya want for nothing?");
        let hex: String = m.finalize().into_bytes().iter().map(|b| format!("{b:02x}")).collect();
        assert_eq!(hex, "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
    }

    #[test]
    fn token_tem_256_bits_e_nonce_16_bytes() {
        let t = gerar_token();
        assert_eq!(t.len(), 64);
        assert!(t.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(t, gerar_token());
        assert_eq!(STANDARD.decode(novo_nonce()).unwrap().len(), 16);
    }

    #[test]
    fn tres_falhas_seguidas_bloqueiam_e_sucesso_zera() {
        let t0 = Instant::now();
        let mut l = Lockout::default();
        l.record_failure(t0);
        l.record_failure(t0);
        assert!(!l.is_locked(t0));
        l.record_success();
        l.record_failure(t0);
        l.record_failure(t0);
        assert!(!l.is_locked(t0), "o sucesso zerou a contagem");
        l.record_failure(t0);
        assert!(l.is_locked(t0));
        assert!(l.is_locked(t0 + Duration::from_secs(LOCK_SECONDS - 1)));
        assert!(!l.is_locked(t0 + Duration::from_secs(LOCK_SECONDS + 1)));
    }

    #[test]
    fn token_e_criado_uma_vez_e_relido() {
        let dir = std::env::temp_dir().join(format!("hestia-token-teste-{}", std::process::id()));
        let f = dir.join("sub").join("token");
        let a = carregar_ou_criar(&f).unwrap();
        assert!(a.criado);
        let b = carregar_ou_criar(&f).unwrap();
        assert!(!b.criado);
        assert_eq!(a.token, b.token);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(std::fs::metadata(&f).unwrap().permissions().mode() & 0o777, 0o600, "legível só pelo usuário");
        }
        std::fs::write(&f, "curto").unwrap();
        assert!(carregar_ou_criar(&f).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
