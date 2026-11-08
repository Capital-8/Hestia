//! Validação do aperto de mãos HTTP/WebSocket (docs/plugins/04-runtime-web.md, "Autenticação").
//!
//! O protocolo 1.0 não tem token. Sem ele, o que impede que QUALQUER página aberta no navegador converse com o
//! renderizador é: (1) escutar só em loopback, (2) conferir o `Origin` contra uma lista explícita e (3) conferir o
//! `Host` contra o endereço local (defesa contra "DNS rebinding"). Cliente sem `Origin` (processo nativo, não
//! navegador) só entra com `--allow-no-origin`.

/// Origens do Hestia aceitas por padrão: o app desktop (Tauri) e o servidor de desenvolvimento do Vite.
/// Outras origens (o site publicado, por exemplo) entram com `--allow-origin`.
pub const DEFAULT_ORIGINS: &[&str] = &[
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
];

pub struct Policy {
    pub port: u16,
    pub origins: Vec<String>,
    pub allow_no_origin: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Refusal {
    BadHost,
    NoOrigin,
    BadOrigin,
}

impl Refusal {
    pub fn message(&self) -> &'static str {
        match self {
            Refusal::BadHost => "Host fora do loopback",
            Refusal::NoOrigin => "Origin ausente",
            Refusal::BadOrigin => "Origin não permitida",
        }
    }
}

impl Policy {
    pub fn check(&self, host: Option<&str>, origin: Option<&str>) -> Result<(), Refusal> {
        let host_ok = host.is_some_and(|h| {
            [
                format!("127.0.0.1:{}", self.port),
                format!("localhost:{}", self.port),
                format!("[::1]:{}", self.port),
            ]
            .iter()
            .any(|ok| ok.eq_ignore_ascii_case(h))
        });
        if !host_ok {
            return Err(Refusal::BadHost);
        }
        match origin {
            None => {
                if self.allow_no_origin {
                    Ok(())
                } else {
                    Err(Refusal::NoOrigin)
                }
            }
            Some(o) if self.origins.iter().any(|a| a == o) => Ok(()),
            Some(_) => Err(Refusal::BadOrigin),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn policy(no_origin: bool) -> Policy {
        Policy {
            port: 47800,
            origins: DEFAULT_ORIGINS.iter().map(|s| s.to_string()).collect(),
            allow_no_origin: no_origin,
        }
    }

    #[test]
    fn aceita_origem_do_hestia_e_host_local() {
        assert_eq!(policy(false).check(Some("127.0.0.1:47800"), Some("tauri://localhost")), Ok(()));
        assert_eq!(policy(false).check(Some("localhost:47800"), Some("http://localhost:5173")), Ok(()));
    }

    #[test]
    fn recusa_origem_estranha_nula_e_ausente() {
        assert_eq!(
            policy(false).check(Some("127.0.0.1:47800"), Some("https://evil.example")),
            Err(Refusal::BadOrigin)
        );
        assert_eq!(policy(false).check(Some("127.0.0.1:47800"), Some("null")), Err(Refusal::BadOrigin));
        assert_eq!(policy(false).check(Some("127.0.0.1:47800"), None), Err(Refusal::NoOrigin));
        assert_eq!(policy(true).check(Some("127.0.0.1:47800"), None), Ok(()));
    }

    #[test]
    fn recusa_host_que_nao_e_loopback_mesmo_com_origem_boa() {
        assert_eq!(policy(true).check(Some("evil.example:47800"), Some("tauri://localhost")), Err(Refusal::BadHost));
        assert_eq!(policy(true).check(Some("127.0.0.1:9999"), None), Err(Refusal::BadHost));
        assert_eq!(policy(true).check(None, None), Err(Refusal::BadHost));
    }
}
