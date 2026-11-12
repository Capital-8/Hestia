//! Constantes e tipos comuns da parede cortina no Rust (decisão 0056, fase 1): códigos dos enums das seções 100 a 105, limites de defesa, valores
//! padrão e as estruturas que ligam grade, peças, planta, quantidades e avisos (`cortina_pecas::Geom`).

/// Limites de defesa (ADR §4.3 e §6.4): acima deles a consulta devolve `LIMITE`.
pub const LIMITE_CELULAS: usize = 4096;
pub const LIMITE_LINHAS_EIXO: usize = 128;
pub const LIMITE_POSICOES_MANUAIS: usize = 128;
pub const LIMITE_INSTANCIAS: usize = 20_000;
/// Fase 2 (ADR §4.3): sobrescritas por cortina. Acima disso o Rust devolve `LIMITE`.
pub const LIMITE_LINHAS_EXTRAS: usize = 128;
pub const LIMITE_SEGMENTOS_REMOVIDOS: usize = 1024;
pub const LIMITE_LINHAS_SOBRESCRITAS: usize = 256;
pub const LIMITE_CELULAS_SOBRESCRITAS: usize = 1024;

/// Sobra fundida (m): sobra de ponta menor que isto é absorvida pela célula vizinha (ADR §5.1; configurável por eixo em `resto_minimo`).
pub const SOBRA_FUNDIDA_PADRAO: f64 = 0.05;
/// Célula mínima (m): célula livre com lado menor que isto gera aviso (ADR §5.8; configurável por tipo em `celula_minima`).
pub const CELULA_MINIMA_PADRAO: f64 = 0.15;
/// Quanto o painel entra no montante (m), para a área bruta do vidro (ADR §4.2: `GLASS_REBATE_DEFAULTS.depth`).
pub const ENCAIXE_PADRAO: f64 = 0.012;
/// A sobra fundida só gera aviso quando a célula resultante passa de `1,5 · d` (ADR §5.1).
pub const FATOR_SOBRA_AVISO: f64 = 1.5;
/// Folga das comparações com limiar (sobra, célula mínima, peça nula) e das contagens por divisão (`floor(A/d + EPS)` e `ceil(A/d − EPS)`): `1,1/0,1` dá `11,000000000000002`, que sem isto viraria 12 células.
pub const EPS_CONTAGEM: f64 = 1e-9;
/// Tolerância de soldagem de posições (m) e grade de saída (m = 1 µm), ADR §5.
pub const TOL_POS: f64 = 1e-6;
pub const GRADE_SAIDA: f64 = 1e-6;
/// Menor comprimento de eixo e menor altura que ainda geram cortina (m); abaixo disso a cortina é degenerada e fica de fora.
pub const COMPRIMENTO_MIN: f64 = 1e-4;
pub const ALTURA_MIN: f64 = 1e-6;
/// Lados da discretização de um perfil redondo (como o guarda-corpo): 16, ou 24 acima de 80 mm de diâmetro; no LOD grosso, 8.
pub const LADOS_REDONDO: usize = 16;
pub const LADOS_REDONDO_GRANDE: usize = 24;
pub const LADOS_REDONDO_GROSSO: usize = 8;
pub const DIAMETRO_GRANDE: f64 = 0.08;

/// `modo` de `grades_cortina`; 255 = herda (só na instância).
pub const MODO_NUMERO: u8 = 0;
pub const MODO_DIST_FIXA: u8 = 1;
pub const MODO_DIST_MAX: u8 = 2;
pub const MODO_MANUAL: u8 = 3;
pub const HERDA: u8 = 255;
/// `justificacao` e `ancora`.
pub const JUSTIF_INICIO: u8 = 0;
pub const JUSTIF_CENTRO: u8 = 1;
pub const JUSTIF_FIM: u8 = 2;
pub const ANCORA_INICIO: u8 = 0;
pub const ANCORA_FIM: u8 = 1;
/// `eixo`: U corre ao longo do eixo da parede, V é vertical.
pub const EIXO_U: u8 = 0;
pub const EIXO_V: u8 = 1;
/// `prioridade` de `tipos_cortina`: quem corre contínuo na interseção.
pub const PRIORIDADE_VERTICAL: u8 = 0;
pub const PRIORIDADE_HORIZONTAL: u8 = 1;
/// `forma` de `tipos_montante_cortina` (L, trapézio e canto chegam na fase 3).
pub const FORMA_RETANGULAR: u8 = 0;
pub const FORMA_REDONDA: u8 = 1;
pub const FORMA_L: u8 = 2;
pub const FORMA_TRAPEZIO: u8 = 3;
pub const FORMA_CORNER: u8 = 4;
/// `tipo` de `tipos_painel_cortina`.
pub const PAINEL_VIDRO: u8 = 0;
pub const PAINEL_SOLIDO: u8 = 1;
pub const PAINEL_VAZIO: u8 = 2;

/// Origem de uma linha em `cortina_grade.linhas`.
pub const ORIGEM_GERADA: u32 = 0;
pub const ORIGEM_EXTRA: u32 = 1;
pub const ORIGEM_MANUAL: u32 = 2;

/// Papel do montante (`quant_cortina`, peças): o papel da linha que o gera.
pub const PAPEL_INT_V: u32 = 0;
pub const PAPEL_INT_H: u32 = 1;
pub const PAPEL_BORDA_INI: u32 = 2;
pub const PAPEL_BORDA_FIM: u32 = 3;
pub const PAPEL_BORDA_BASE: u32 = 4;
pub const PAPEL_BORDA_TOPO: u32 = 5;
/// Montante de canto entre duas cortinas (fase 3, junção de cortinas).
pub const PAPEL_CANTO: u32 = 6;
/// Papéis de `quant_cortina` que não são montante: painéis por tipo e o sistema inteiro.
pub const PAPEL_PAINEL_VIDRO: u32 = 10;
pub const PAPEL_PAINEL_SOLIDO: u32 = 11;
pub const PAPEL_PAINEL_VAZIO: u32 = 12;
pub const PAPEL_SISTEMA: u32 = 20;

/// `papel` das peças em `cortina_malha` (protótipos, instâncias e grupos).
pub const MALHA_MONTANTE: u32 = 0;
pub const MALHA_VIDRO: u32 = 1;
pub const MALHA_SOLIDO: u32 = 2;

/// `papel` das linhas de `cortina_planta`.
pub const PLANTA_CONTORNO: u32 = 0;
pub const PLANTA_VIDRO: u32 = 1;
pub const PLANTA_MONTANTE: u32 = 2;
pub const PLANTA_SOLIDO: u32 = 3;
pub const ESTILO_CORTADO: u32 = 0;
pub const ESTILO_PROJETADO: u32 = 1;
pub const ESTILO_OCULTO: u32 = 2;

/// Bits de `cortina_grade.celulas.flags`: 0 o menor lado livre é menor que a célula mínima; 1 a célula tem sobrescrita de painel adotada; 2 a região
/// tem mais de uma célula (fusão por remoção de segmento).
pub const CELULA_PEQUENA: u32 = 1;
pub const CELULA_SOBRESCRITA: u32 = 2;
pub const CELULA_REGIAO_MULTIPLA: u32 = 4;

/// Um eixo da grade com tipo e instância já fundidos (campo a campo, ADR §4.3).
#[derive(Clone, Debug, PartialEq)]
pub struct EixoEfetivo {
    pub modo: u8,
    pub numero: u32,
    pub distancia: f64,
    pub justificacao: u8,
    pub posicoes: Vec<f64>,
    pub ancora: u8,
    pub deslocamento: f64,
    pub angulo: f64,
    pub resto_minimo: f64,
}

impl EixoEfetivo {
    pub fn numero(n: u32) -> EixoEfetivo {
        EixoEfetivo { modo: MODO_NUMERO, numero: n, ..EixoEfetivo::vazio() }
    }

    pub fn distancia_fixa(d: f64, justificacao: u8) -> EixoEfetivo {
        EixoEfetivo { modo: MODO_DIST_FIXA, distancia: d, justificacao, ..EixoEfetivo::vazio() }
    }

    pub fn distancia_maxima(d: f64) -> EixoEfetivo {
        EixoEfetivo { modo: MODO_DIST_MAX, distancia: d, ..EixoEfetivo::vazio() }
    }

    pub fn manual(posicoes: &[f64], ancora: u8) -> EixoEfetivo {
        EixoEfetivo { modo: MODO_MANUAL, posicoes: posicoes.to_vec(), ancora, ..EixoEfetivo::vazio() }
    }

    fn vazio() -> EixoEfetivo {
        EixoEfetivo {
            modo: MODO_NUMERO,
            numero: 1,
            distancia: f64::NAN,
            justificacao: JUSTIF_INICIO,
            posicoes: Vec::new(),
            ancora: ANCORA_INICIO,
            deslocamento: 0.0,
            angulo: 0.0,
            resto_minimo: SOBRA_FUNDIDA_PADRAO,
        }
    }
}

/// Arredonda à grade de saída (1 µm), igual ao `Math.round(v * 1e6) / 1e6` do TS (meio sobe), e devolve o valor decimal mais próximo.
pub fn na_grade(v: f64) -> f64 {
    (v * 1e6 + 0.5).floor() / 1e6
}
