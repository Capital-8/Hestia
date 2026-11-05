//! Erros do CLI nativo, com mensagens em português e sem `panic` para entrada ruim.

use std::fmt;
use std::path::PathBuf;

/// Falha de argumento, arquivo, cena, GPU ou escrita do PNG.
#[derive(Debug)]
pub enum ErroRender {
    /// Uso incorreto da linha de comando.
    Argumentos(String),
    /// Não foi possível ler a cena de entrada.
    Entrada {
        caminho: PathBuf,
        fonte: std::io::Error,
    },
    /// O arquivo existe, mas não decodifica como HSTR v1 válido.
    Cena(String),
    /// Nenhum adaptador, dispositivo indisponível ou limite de GPU insuficiente.
    Gpu(String),
    /// Falha ao gravar o PNG (a cena em si já foi renderizada).
    Png(String),
    /// Falha inesperada de escrita auxiliar.
    Interno(String),
}

impl fmt::Display for ErroRender {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Argumentos(texto) => f.write_str(texto),
            Self::Entrada { caminho, fonte } => {
                write!(f, "não foi possível ler '{}': {fonte}", caminho.display())
            }
            Self::Cena(texto) => write!(f, "cena HSTR inválida: {texto}"),
            Self::Gpu(texto) => write!(f, "GPU indisponível: {texto}"),
            Self::Png(texto) => write!(f, "falha ao gravar o PNG: {texto}"),
            Self::Interno(texto) => write!(f, "erro interno: {texto}"),
        }
    }
}

impl std::error::Error for ErroRender {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Entrada { fonte, .. } => Some(fonte),
            _ => None,
        }
    }
}
