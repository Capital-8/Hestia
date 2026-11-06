//! Erros do modo pt (API pública de `Pt0`). Mensagens em português, prontas para a UI.

use std::fmt;

/// Falha do modo pt. Nunca há fallback para outro modo: quem chama devolve o erro.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ErroPt {
    /// O render (cena na GPU mais alvos) não cabe no orçamento do perfil. Os números são em bytes.
    Memoria { necessario: u64, orcamento: u64 },
    /// A cena foi recusada pelos mesmos limites do modo raster, ou não pode ser montada.
    Cena(String),
    /// Falha da GPU ou validação de um passe.
    Gpu(String),
    /// Argumento fora da faixa aceita.
    Argumentos(String),
    /// Cancelado pelo chamador entre dois passes.
    Cancelado,
}

impl fmt::Display for ErroPt {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ErroPt::Memoria { necessario, orcamento } => write!(
                f,
                "memória insuficiente para o modo pt: precisa de {:.1} MiB e o orçamento do perfil é {:.1} MiB. \
                 Use o modo raster, um perfil mais leve (RENDER_PERFIL=leve) ou uma resolução menor.",
                mebibytes(*necessario),
                mebibytes(*orcamento)
            ),
            ErroPt::Cena(mensagem) => write!(f, "cena recusada pelo modo pt: {mensagem}"),
            ErroPt::Gpu(mensagem) => write!(f, "GPU (modo pt): {mensagem}"),
            ErroPt::Argumentos(mensagem) => write!(f, "argumentos do modo pt: {mensagem}"),
            ErroPt::Cancelado => write!(f, "render pt cancelado"),
        }
    }
}

impl std::error::Error for ErroPt {}

fn mebibytes(bytes: u64) -> f64 {
    bytes as f64 / 1_048_576.0
}
