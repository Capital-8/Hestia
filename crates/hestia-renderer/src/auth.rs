//! Pareamento autenticado do protocolo 1.1 (docs/plugins/07-pareamento-por-token.md).
//!
//! Desafio e resposta mútuos com HMAC-SHA256. O token compartilhado NUNCA trafega, não é registrado em log nem entra no
//! relatório de estado: só as provas (HMAC) e os nonces aparecem na conexão. As provas amarram os dois nonces da conexão.

use base64::{engine::general_purpose::STANDARD, Engine};
use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::path::Path;

type HmacSha256 = Hmac<Sha256>;

/// Tamanho mínimo do token, em caracteres (o mesmo do lado do Hestia).
pub const MIN_TOKEN_LEN: usize = 32;

#[derive(Clone, Copy)]
pub enum Role {
    Host,
    Plugin,
}

impl Role {
    fn label(self) -> &'static str {
        match self {
            Role::Host => "hestia-host",
            Role::Plugin => "hestia-plugin",
        }
    }
}

fn random_bytes<const N: usize>() -> [u8; N] {
    let mut b = [0u8; N];
    getrandom::getrandom(&mut b).expect("fonte de aleatoriedade do sistema indisponível");
    b
}

/// Token novo: 256 bits em hexadecimal (64 caracteres).
pub fn generate_token() -> String {
    random_bytes::<32>().iter().map(|b| format!("{b:02x}")).collect()
}

/// Nonce de 16 bytes em base64 padrão (24 caracteres, com `==`).
pub fn nonce() -> String {
    STANDARD.encode(random_bytes::<16>())
}

fn mac(token: &str, role: Role, n_plugin: &str, n_host: &str) -> HmacSha256 {
    let mut m = HmacSha256::new_from_slice(token.as_bytes()).expect("HMAC aceita chave de qualquer tamanho");
    m.update(format!("{}|{}|{}", role.label(), n_plugin, n_host).as_bytes());
    m
}

pub fn proof(token: &str, role: Role, n_plugin: &str, n_host: &str) -> String {
    STANDARD.encode(mac(token, role, n_plugin, n_host).finalize().into_bytes())
}

/// Confere uma prova em tempo constante (`verify_slice`).
pub fn verify(token: &str, role: Role, n_plugin: &str, n_host: &str, proof_b64: &str) -> bool {
    match STANDARD.decode(proof_b64) {
        Ok(bytes) => mac(token, role, n_plugin, n_host).verify_slice(&bytes).is_ok(),
        Err(_) => false,
    }
}

pub fn valid_token(t: &str) -> bool {
    t.len() >= MIN_TOKEN_LEN && t.len() <= 256
}

pub fn load_token(path: &Path) -> Result<String, String> {
    let raw = std::fs::read_to_string(path).map_err(|e| format!("não foi possível ler o arquivo de token ({}): {e}", path.display()))?;
    let t = raw.trim().to_owned();
    if valid_token(&t) {
        Ok(t)
    } else {
        Err(format!("token inválido em {} (mínimo {MIN_TOKEN_LEN} caracteres)", path.display()))
    }
}

/// Cria o arquivo de token (falha se já existir: nunca sobrescreve). No Unix fica legível só pelo dono.
pub fn init_token(path: &Path) -> Result<String, String> {
    use std::io::Write;
    let token = generate_token();
    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut f = opts.open(path).map_err(|e| format!("não foi possível criar {} (já existe?): {e}", path.display()))?;
    f.write_all(token.as_bytes()).map_err(|e| e.to_string())?;
    Ok(token)
}

#[cfg(test)]
mod tests {
    use super::*;

    const T: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    #[test]
    fn prova_confere_so_com_o_mesmo_token_papel_e_nonces() {
        let (np, nh) = (nonce(), nonce());
        let p = proof(T, Role::Host, &np, &nh);
        assert!(verify(T, Role::Host, &np, &nh, &p));
        assert!(!verify("outro-token-outro-token-outro-token-xx", Role::Host, &np, &nh, &p));
        assert!(!verify(T, Role::Plugin, &np, &nh, &p), "prova de um papel não vale para o outro");
        assert!(!verify(T, Role::Host, &nonce(), &nh, &p), "prova capturada não vale com nonce novo");
        assert!(!verify(T, Role::Host, &np, &nh, "lixo"));
    }

    /// Vetores calculados com o WebCrypto do Node; o teste TypeScript (plugins.test.ts) fixa os MESMOS valores.
    #[test]
    fn vetor_fixo_igual_ao_do_lado_typescript() {
        let (np, nh) = ("AAAAAAAAAAAAAAAAAAAAAA==", "BBBBBBBBBBBBBBBBBBBBBB==");
        assert_eq!(proof(T, Role::Host, np, nh), "ee6ZJLkKce+oaVKpc8wRmc8AnOzpS+ror65AwTwKLSY=");
        assert_eq!(proof(T, Role::Plugin, np, nh), "pkiqvzN+kIf4STO/1ClJqHrwtmVY2HPTihukJBJEqU0=");
    }

    #[test]
    fn nonce_e_token_tem_formato_esperado() {
        assert_eq!(nonce().len(), 24);
        assert!(nonce().ends_with("=="));
        assert_eq!(generate_token().len(), 64);
        assert_ne!(generate_token(), generate_token());
    }
}
