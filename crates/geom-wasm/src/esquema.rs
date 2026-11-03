//! Constantes que espelham `schema/cena-v8.json` (fonte única do contrato, decisão 0046).
//!
//! O teste `contrato_confere_com_json` (no fim deste arquivo) lê o JSON e confere tudo daqui:
//! ids de seção, ordem e tipos das colunas, ids de consulta, saídas, códigos de erro e limites.
//! Mudou o JSON => sobe `VERSAO_ESQUEMA` e este arquivo.

/// `versao` de `cena-v8.json`.
pub const VERSAO_ESQUEMA: u32 = 8;
/// `abi` de `cena-v8.json`.
pub const VERSAO_ABI2: u32 = 2;

/// Códigos de retorno (3.1 do 0046).
pub const OK: u32 = 0;
pub const VERSAO: u32 = 1;
pub const HANDLE: u32 = 2;
pub const ENTRADA: u32 = 3;
pub const NAO_IMPLEMENTADO: u32 = 4;
pub const LIMITE: u32 = 5;
pub const INTERNO: u32 = 6;

/// Máximo de linhas por seção.
pub const LIMITE_LINHAS_POR_SECAO: u32 = 4_194_304;
/// Máximo de bytes por chamada de definir/upsert/remover.
pub const LIMITE_BYTES_POR_CHAMADA: u64 = 268_435_456;

/// `nivel_num` que significa "todos os níveis" nos argumentos de consulta.
pub const NIVEL_TODOS: u32 = 0xFFFF_FFFF;
/// Valor reservado de chave: "chave ausente".
pub const ID_AUSENTE: u32 = 0xFFFF_FFFF;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tipo {
    U32,
    I32,
    F64,
    U8,
}

impl Tipo {
    pub const fn bytes(self) -> usize {
        match self {
            Tipo::U32 | Tipo::I32 => 4,
            Tipo::F64 => 8,
            Tipo::U8 => 1,
        }
    }
    /// Código de tipo devolvido por `saida_tipo`.
    pub const fn codigo(self) -> u32 {
        match self {
            Tipo::U32 => 1,
            Tipo::I32 => 2,
            Tipo::F64 => 3,
            Tipo::U8 => 4,
        }
    }
}

pub struct Coluna {
    pub nome: &'static str,
    pub tipo: Tipo,
}

pub struct Secao {
    pub id: u32,
    pub nome: &'static str,
    pub chave: &'static str,
    pub colunas: &'static [Coluna],
}

pub const SECAO_PAREDES: u32 = 1;

pub const SECAO_PAREDES_QUADRO: u32 = 2;
pub const SECAO_TIPOS_PAREDE: u32 = 3;
pub const SECAO_CAMADAS: u32 = 4;
pub const SECAO_FAIXAS: u32 = 5;
pub const SECAO_PAREDES_Z: u32 = 6;
pub const SECAO_TIPOS_ABERTURA: u32 = 7;
pub const SECAO_ABERTURAS: u32 = 8;
pub const SECAO_PERFIS_Z: u32 = 9;
pub const SECAO_PISOS: u32 = 10;
pub const SECAO_LAJES: u32 = 11;
pub const SECAO_TIPOS_PISO: u32 = 12;
pub const SECAO_TIPOS_LAJE: u32 = 13;
pub const SECAO_CAMADAS_PISO: u32 = 14;
pub const SECAO_CAMADAS_LAJE: u32 = 15;
pub const SECAO_CONTORNOS_ESTATICOS: u32 = 16;
pub const SECAO_CONTORNOS_VINCULADOS: u32 = 17;
pub const SECAO_FUROS_NIVEL: u32 = 18;

const fn col(nome: &'static str, tipo: Tipo) -> Coluna {
    Coluna { nome, tipo }
}

/// Colunas de `pisos` (B1).
const COLUNAS_PISO: &[Coluna] = &[
    col("id_num", Tipo::U32),
    col("nivel_num", Tipo::U32),
    col("tipo_num", Tipo::U32),
    col("ordem", Tipo::F64),
    col("cota_nivel", Tipo::F64),
    col("desloc", Tipo::F64),
    col("modo", Tipo::U8),
    col("vinculado", Tipo::U8),
    col("tem_semente", Tipo::U8),
    col("extend_nucleo", Tipo::U8),
    col("problema", Tipo::U8),
];

/// Colunas de `lajes` (B1): as de `pisos` e a inclinação.
const COLUNAS_LAJE: &[Coluna] = &[
    col("id_num", Tipo::U32),
    col("nivel_num", Tipo::U32),
    col("tipo_num", Tipo::U32),
    col("ordem", Tipo::F64),
    col("cota_nivel", Tipo::F64),
    col("desloc", Tipo::F64),
    col("modo", Tipo::U8),
    col("vinculado", Tipo::U8),
    col("tem_semente", Tipo::U8),
    col("extend_nucleo", Tipo::U8),
    col("problema", Tipo::U8),
    col("tem_inclinacao", Tipo::U8),
    col("inc_ox", Tipo::F64),
    col("inc_oy", Tipo::F64),
    col("inc_dx", Tipo::F64),
    col("inc_dy", Tipo::F64),
    col("inc_percentual", Tipo::F64),
];

/// Colunas de `camadas_piso` e de `camadas_laje` (B1).
const COLUNAS_CAMADA_B: &[Coluna] = &[
    col("id_num", Tipo::U32),
    col("tipo_num", Tipo::U32),
    col("indice", Tipo::U32),
    col("espessura", Tipo::F64),
    col("funcao", Tipo::U8),
    col("tem_prioridade", Tipo::U8),
    col("prioridade", Tipo::F64),
    col("material_num", Tipo::U32),
    col("termino", Tipo::U8),
    col("termino_valor", Tipo::F64),
    col("limite_externo", Tipo::U8),
];

pub const SECOES: &[Secao] = &[
    Secao {
        id: SECAO_PAREDES,
        nome: "paredes",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("nivel_num", Tipo::U32),
            col("ax", Tipo::F64),
            col("ay", Tipo::F64),
            col("bx", Tipo::F64),
            col("by", Tipo::F64),
            col("espessura", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_PAREDES_QUADRO,
        nome: "paredes_quadro",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("tipo_num", Tipo::U32),
            col("ordem", Tipo::F64),
            col("linha_loc", Tipo::U8),
            col("invertida", Tipo::U8),
            col("sem_junta_a", Tipo::U8),
            col("sem_junta_b", Tipo::U8),
            col("junta_a_tipo", Tipo::U8),
            col("junta_a_inverte", Tipo::U8),
            col("junta_b_tipo", Tipo::U8),
            col("junta_b_inverte", Tipo::U8),
            col("sag", Tipo::F64),
            col("z0", Tipo::F64),
            col("topo", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_TIPOS_PAREDE,
        nome: "tipos_parede",
        chave: "id_num",
        colunas: &[col("id_num", Tipo::U32), col("n_camadas", Tipo::U32), col("wrap_ends", Tipo::U8), col("n_faixas", Tipo::U32), col("wrap_inserts", Tipo::U8)],
    },
    Secao {
        id: SECAO_CAMADAS,
        nome: "camadas",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("tipo_num", Tipo::U32),
            col("indice", Tipo::U32),
            col("espessura", Tipo::F64),
            col("funcao", Tipo::U8),
            col("tem_prioridade", Tipo::U8),
            col("prioridade", Tipo::F64),
            col("material_num", Tipo::U32),
            col("envolve", Tipo::U8),
        ],
    },
    Secao {
        id: SECAO_FAIXAS,
        nome: "faixas",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("tipo_num", Tipo::U32),
            col("indice", Tipo::U32),
            col("lado", Tipo::U8),
            col("material_num", Tipo::U32),
            col("espessura", Tipo::F64),
            col("z0", Tipo::F64),
            col("z1", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_PAREDES_Z,
        nome: "paredes_z",
        chave: "id_num",
        colunas: &[col("id_num", Tipo::U32), col("z0", Tipo::F64), col("altura", Tipo::F64)],
    },
    Secao {
        id: SECAO_TIPOS_ABERTURA,
        nome: "tipos_abertura",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("largura", Tipo::F64),
            col("altura", Tipo::F64),
            col("peitoril", Tipo::F64),
            col("folga_w", Tipo::F64),
            col("folga_h", Tipo::F64),
            col("folhas", Tipo::U8),
            col("plano", Tipo::U8),
            col("janela", Tipo::U8),
            col("fechamento", Tipo::U8),
            col("tem_alizar", Tipo::U8),
            col("estilo_batente", Tipo::U8),
            col("modo_prof", Tipo::U8),
            col("prof_pedida", Tipo::F64),
            col("larg_batente", Tipo::F64),
            col("esp_folha", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_ABERTURAS,
        nome: "aberturas",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("tipo_num", Tipo::U32),
            col("parede_num", Tipo::U32),
            col("kind", Tipo::U8),
            col("deslocamento", Tipo::F64),
            col("flip_mao", Tipo::U8),
            col("flip_frente", Tipo::U8),
            col("tem_peitoril", Tipo::U8),
            col("peitoril", Tipo::F64),
            col("tem_altura", Tipo::U8),
            col("altura", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_PERFIS_Z,
        nome: "perfis_z",
        chave: "id_num",
        colunas: &[col("id_num", Tipo::U32), col("parede_num", Tipo::U32), col("lista", Tipo::U8), col("indice", Tipo::U32), col("t", Tipo::F64), col("h", Tipo::F64)],
    },
    Secao { id: SECAO_PISOS, nome: "pisos", chave: "id_num", colunas: COLUNAS_PISO },
    Secao { id: SECAO_LAJES, nome: "lajes", chave: "id_num", colunas: COLUNAS_LAJE },
    Secao { id: SECAO_TIPOS_PISO, nome: "tipos_piso", chave: "id_num", colunas: &[col("id_num", Tipo::U32), col("n_camadas", Tipo::U32)] },
    Secao { id: SECAO_TIPOS_LAJE, nome: "tipos_laje", chave: "id_num", colunas: &[col("id_num", Tipo::U32), col("n_camadas", Tipo::U32)] },
    Secao { id: SECAO_CAMADAS_PISO, nome: "camadas_piso", chave: "id_num", colunas: COLUNAS_CAMADA_B },
    Secao { id: SECAO_CAMADAS_LAJE, nome: "camadas_laje", chave: "id_num", colunas: COLUNAS_CAMADA_B },
    Secao {
        id: SECAO_CONTORNOS_ESTATICOS,
        nome: "contornos_estaticos",
        chave: "id_num",
        colunas: &[col("id_num", Tipo::U32), col("tipo_el", Tipo::U8), col("elemento_num", Tipo::U32), col("anel", Tipo::U32), col("indice", Tipo::U32), col("x", Tipo::F64), col("y", Tipo::F64)],
    },
    Secao {
        id: SECAO_CONTORNOS_VINCULADOS,
        nome: "contornos_vinculados",
        chave: "id_num",
        colunas: &[col("id_num", Tipo::U32), col("tipo_el", Tipo::U8), col("elemento_num", Tipo::U32), col("papel", Tipo::U8), col("anel", Tipo::U32), col("indice", Tipo::U32), col("x", Tipo::F64), col("y", Tipo::F64)],
    },
    Secao {
        id: SECAO_FUROS_NIVEL,
        nome: "furos_nivel",
        chave: "id_num",
        colunas: &[col("id_num", Tipo::U32), col("tipo_el", Tipo::U8), col("elemento_num", Tipo::U32), col("poligono", Tipo::U32), col("anel", Tipo::U32), col("indice", Tipo::U32), col("x", Tipo::F64), col("y", Tipo::F64)],
    },
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Elementos {
    Fixo(u32),
    /// `"n"`
    N,
    /// `"2n"`
    DoisN,
    /// `"Kn"` com `K >= 3` (K elementos por item)
    Multiplo(u32),
    /// `"livre"`: tamanho variável, descrito no esquema
    Livre,
}

pub struct SaidaDef {
    pub nome: &'static str,
    pub tipo: Tipo,
    pub elementos: Elementos,
}

pub struct Consulta {
    pub id: u32,
    pub nome: &'static str,
    pub args: &'static [&'static str],
    /// Aceita argumentos além dos fixos (`argsVariaveis` no JSON); o resto é definido pela consulta.
    pub args_variaveis: bool,
    pub saidas: &'static [SaidaDef],
}

pub const CONSULTA_ESTATISTICAS_NIVEL: u32 = 1;
pub const CONSULTA_PAREDES_NA_CAIXA: u32 = 2;
pub const CONSULTA_PARES_PROXIMOS: u32 = 3;
pub const CONSULTA_QUADROS_E_JUNCOES: u32 = 4;
pub const CONSULTA_ITENS_PINTADOS: u32 = 5;
pub const CONSULTA_ABERTURAS_GEOM: u32 = 6;
pub const CONSULTA_RETORNOS_GEOM: u32 = 7;
pub const CONSULTA_CLUSTER_RESOLVIDO: u32 = 8;
pub const CONSULTA_RESOLVER_NIVEL: u32 = 9;
pub const CONSULTA_PISOS_LAJES_NIVEL: u32 = 10;

pub const CONSULTAS: &[Consulta] = &[
    Consulta {
        id: CONSULTA_ESTATISTICAS_NIVEL,
        nome: "estatisticas_nivel",
        args: &["nivel_num"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "n_paredes", tipo: Tipo::U32, elementos: Elementos::Fixo(1) },
            SaidaDef { nome: "caixa", tipo: Tipo::F64, elementos: Elementos::Fixo(4) },
            SaidaDef { nome: "comprimento_total", tipo: Tipo::F64, elementos: Elementos::Fixo(1) },
        ],
    },
    Consulta {
        id: CONSULTA_PAREDES_NA_CAIXA,
        nome: "paredes_na_caixa",
        args: &["nivel_num", "minx", "miny", "maxx", "maxy"],
        args_variaveis: false,
        saidas: &[SaidaDef { nome: "ids", tipo: Tipo::U32, elementos: Elementos::N }],
    },
    Consulta {
        id: CONSULTA_PARES_PROXIMOS,
        nome: "pares_proximos",
        args: &["nivel_num", "tol"],
        args_variaveis: false,
        saidas: &[SaidaDef { nome: "pares", tipo: Tipo::U32, elementos: Elementos::DoisN }],
    },
    Consulta {
        id: CONSULTA_QUADROS_E_JUNCOES,
        nome: "quadros_e_juncoes",
        args: &["nivel_num", "tol_juncao"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "ids", tipo: Tipo::U32, elementos: Elementos::N },
            SaidaDef { nome: "quadro", tipo: Tipo::F64, elementos: Elementos::Multiplo(17) },
            SaidaDef { nome: "arco", tipo: Tipo::F64, elementos: Elementos::Multiplo(8) },
            SaidaDef { nome: "estado_pontas", tipo: Tipo::U32, elementos: Elementos::Multiplo(8) },
            SaidaDef { nome: "parceiros", tipo: Tipo::U32, elementos: Elementos::Livre },
            SaidaDef { nome: "pontas_cab", tipo: Tipo::U32, elementos: Elementos::Multiplo(6) },
            SaidaDef { nome: "pontas_dados", tipo: Tipo::F64, elementos: Elementos::Livre },
            SaidaDef { nome: "cordas_cab", tipo: Tipo::U32, elementos: Elementos::DoisN },
            SaidaDef { nome: "cordas", tipo: Tipo::F64, elementos: Elementos::Livre },
            SaidaDef { nome: "grupos", tipo: Tipo::U32, elementos: Elementos::N },
        ],
    },
    Consulta {
        id: CONSULTA_ITENS_PINTADOS,
        nome: "itens_pintados",
        args: &["nivel_num", "tol_juncao", "tem_corte_z", "corte_z", "n_contorno"],
        args_variaveis: true,
        saidas: &[
            SaidaDef { nome: "itens", tipo: Tipo::U32, elementos: Elementos::Multiplo(9) },
            SaidaDef { nome: "itens_num", tipo: Tipo::F64, elementos: Elementos::Multiplo(6) },
            SaidaDef { nome: "formas_cab", tipo: Tipo::U32, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "poligonos", tipo: Tipo::U32, elementos: Elementos::DoisN },
            SaidaDef { nome: "aneis", tipo: Tipo::U32, elementos: Elementos::DoisN },
            SaidaDef { nome: "pontos", tipo: Tipo::F64, elementos: Elementos::Livre },
        ],
    },
    Consulta {
        id: CONSULTA_ABERTURAS_GEOM,
        nome: "aberturas_geom",
        args: &["nivel_num"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "ids", tipo: Tipo::U32, elementos: Elementos::N },
            SaidaDef { nome: "dados", tipo: Tipo::U32, elementos: Elementos::Multiplo(7) },
            SaidaDef { nome: "medidas", tipo: Tipo::F64, elementos: Elementos::Multiplo(16) },
            SaidaDef { nome: "retangulo", tipo: Tipo::F64, elementos: Elementos::Multiplo(8) },
        ],
    },
    Consulta {
        id: CONSULTA_RETORNOS_GEOM,
        nome: "retornos_geom",
        args: &["nivel_num", "tol_juncao", "tem_corte_z", "corte_z", "n_contorno"],
        args_variaveis: true,
        saidas: &[
            SaidaDef { nome: "retornos", tipo: Tipo::U32, elementos: Elementos::Multiplo(5) },
            SaidaDef { nome: "formas_cab", tipo: Tipo::U32, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "poligonos", tipo: Tipo::U32, elementos: Elementos::DoisN },
            SaidaDef { nome: "aneis", tipo: Tipo::U32, elementos: Elementos::DoisN },
            SaidaDef { nome: "pontos", tipo: Tipo::F64, elementos: Elementos::Livre },
        ],
    },
    Consulta {
        id: CONSULTA_CLUSTER_RESOLVIDO,
        nome: "cluster_resolvido",
        args: &["nivel_num", "tol_juncao", "tem_corte_z", "corte_z", "n_contorno", "tem_aberturas_planta", "n_aberturas_planta"],
        args_variaveis: true,
        saidas: &[
            SaidaDef { nome: "camadas", tipo: Tipo::U32, elementos: Elementos::Multiplo(6) },
            SaidaDef { nome: "camadas_num", tipo: Tipo::F64, elementos: Elementos::N },
            SaidaDef { nome: "camadas_formas", tipo: Tipo::U32, elementos: Elementos::Multiplo(8) },
            SaidaDef { nome: "faixas", tipo: Tipo::F64, elementos: Elementos::DoisN },
            SaidaDef { nome: "faixas_forma", tipo: Tipo::U32, elementos: Elementos::DoisN },
            SaidaDef { nome: "regioes", tipo: Tipo::U32, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "silhuetas", tipo: Tipo::U32, elementos: Elementos::Multiplo(3) },
            SaidaDef { nome: "poligonos", tipo: Tipo::U32, elementos: Elementos::DoisN },
            SaidaDef { nome: "aneis", tipo: Tipo::U32, elementos: Elementos::DoisN },
            SaidaDef { nome: "pontos", tipo: Tipo::F64, elementos: Elementos::Livre },
        ],
    },
    Consulta {
        id: CONSULTA_RESOLVER_NIVEL,
        nome: "resolver_nivel",
        args: &["nivel_num", "tol_juncao", "tem_corte_z", "corte_z", "n_contorno", "tem_aberturas_planta", "n_aberturas_planta"],
        args_variaveis: true,
        saidas: &[
            SaidaDef { nome: "paredes", tipo: Tipo::U32, elementos: Elementos::Multiplo(8) },
            SaidaDef { nome: "paredes_num", tipo: Tipo::F64, elementos: Elementos::Multiplo(15) },
            SaidaDef { nome: "perfis", tipo: Tipo::F64, elementos: Elementos::DoisN },
            SaidaDef { nome: "membranas", tipo: Tipo::U32, elementos: Elementos::Multiplo(3) },
            SaidaDef { nome: "membranas_pts", tipo: Tipo::F64, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "camadas", tipo: Tipo::U32, elementos: Elementos::Multiplo(6) },
            SaidaDef { nome: "camadas_num", tipo: Tipo::F64, elementos: Elementos::N },
            SaidaDef { nome: "camadas_formas", tipo: Tipo::U32, elementos: Elementos::Multiplo(8) },
            SaidaDef { nome: "faixas", tipo: Tipo::F64, elementos: Elementos::Multiplo(11) },
            SaidaDef { nome: "faixas_forma", tipo: Tipo::U32, elementos: Elementos::DoisN },
            SaidaDef { nome: "regioes", tipo: Tipo::U32, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "silhuetas", tipo: Tipo::U32, elementos: Elementos::Multiplo(3) },
            SaidaDef { nome: "poligonos", tipo: Tipo::U32, elementos: Elementos::DoisN },
            SaidaDef { nome: "aneis", tipo: Tipo::U32, elementos: Elementos::DoisN },
            SaidaDef { nome: "pontos", tipo: Tipo::F64, elementos: Elementos::Livre },
        ],
    },
    Consulta {
        id: CONSULTA_PISOS_LAJES_NIVEL,
        nome: "pisos_lajes_nivel",
        args: &["nivel_num"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "elementos", tipo: Tipo::U32, elementos: Elementos::Multiplo(9) },
            SaidaDef { nome: "elementos_num", tipo: Tipo::F64, elementos: Elementos::Multiplo(7) },
            SaidaDef { nome: "camadas", tipo: Tipo::U32, elementos: Elementos::Multiplo(8) },
            SaidaDef { nome: "camadas_num", tipo: Tipo::F64, elementos: Elementos::Multiplo(3) },
            SaidaDef { nome: "poligonos", tipo: Tipo::U32, elementos: Elementos::DoisN },
            SaidaDef { nome: "aneis", tipo: Tipo::U32, elementos: Elementos::DoisN },
            SaidaDef { nome: "pontos", tipo: Tipo::F64, elementos: Elementos::Livre },
        ],
    },
];

pub fn secao(id: u32) -> Option<&'static Secao> {
    SECOES.iter().find(|s| s.id == id)
}

pub fn consulta(id: u32) -> Option<&'static Consulta> {
    CONSULTAS.iter().find(|c| c.id == id)
}

/// Tamanho em bytes de uma coluna com `n` linhas, preenchida até múltiplo de 8 (3.2 do 0046).
pub fn bytes_coluna(tipo: Tipo, n: usize) -> Option<usize> {
    let b = n.checked_mul(tipo.bytes())?;
    b.checked_add(7).map(|x| x & !7)
}

/// Tamanho total de uma seção com `n` linhas. `ENTRADA` se a seção não existe; `LIMITE` se
/// `n` ou o total de bytes excedem os limites.
pub fn bytes_secao(secao_id: u32, n_linhas: u32) -> Result<usize, u32> {
    let s = secao(secao_id).ok_or(ENTRADA)?;
    if n_linhas > LIMITE_LINHAS_POR_SECAO {
        return Err(LIMITE);
    }
    let mut total: usize = 0;
    for c in s.colunas {
        let b = bytes_coluna(c.tipo, n_linhas as usize).ok_or(LIMITE)?;
        total = total.checked_add(b).ok_or(LIMITE)?;
    }
    if total as u64 > LIMITE_BYTES_POR_CHAMADA {
        return Err(LIMITE);
    }
    Ok(total)
}

#[cfg(test)]
mod testes {
    use super::*;
    use serde_json::Value;

    const JSON: &str = include_str!("../schema/cena-v8.json");

    fn tipo_de(nome: &str) -> Tipo {
        match nome {
            "u32" => Tipo::U32,
            "i32" => Tipo::I32,
            "f64" => Tipo::F64,
            "u8" => Tipo::U8,
            outro => panic!("tipo desconhecido no JSON: {outro}"),
        }
    }

    #[test]
    fn contrato_confere_com_json() {
        let j: Value = serde_json::from_str(JSON).expect("JSON válido");
        assert_eq!(j["versao"].as_u64(), Some(VERSAO_ESQUEMA as u64));
        assert_eq!(j["abi"].as_u64(), Some(VERSAO_ABI2 as u64));

        // tipos
        for (nome, t) in [("u32", Tipo::U32), ("i32", Tipo::I32), ("f64", Tipo::F64), ("u8", Tipo::U8)] {
            assert_eq!(j["tipos"][nome]["bytes"].as_u64(), Some(t.bytes() as u64), "bytes de {nome}");
            assert_eq!(j["tipos"][nome]["codigo"].as_u64(), Some(t.codigo() as u64), "código de {nome}");
        }
        assert_eq!(j["tipos"].as_object().map(|o| o.len()), Some(4));

        // seções
        let secoes = j["secoes"].as_array().expect("secoes");
        assert_eq!(secoes.len(), SECOES.len());
        for (js, rs) in secoes.iter().zip(SECOES) {
            assert_eq!(js["id"].as_u64(), Some(rs.id as u64));
            assert_eq!(js["nome"].as_str(), Some(rs.nome));
            assert_eq!(js["chave"].as_str(), Some(rs.chave));
            let cols = js["colunas"].as_array().expect("colunas");
            assert_eq!(cols.len(), rs.colunas.len(), "nº de colunas de {}", rs.nome);
            for (jc, rc) in cols.iter().zip(rs.colunas) {
                assert_eq!(jc["nome"].as_str(), Some(rc.nome));
                assert_eq!(tipo_de(jc["tipo"].as_str().expect("tipo")), rc.tipo, "coluna {}", rc.nome);
            }
        }

        // consultas
        let consultas = j["consultas"].as_array().expect("consultas");
        assert_eq!(consultas.len(), CONSULTAS.len());
        for (jc, rc) in consultas.iter().zip(CONSULTAS) {
            assert_eq!(jc["id"].as_u64(), Some(rc.id as u64));
            assert_eq!(jc["nome"].as_str(), Some(rc.nome));
            let args: Vec<&str> = jc["args"].as_array().expect("args").iter().filter_map(|a| a.as_str()).collect();
            assert_eq!(args, rc.args, "args de {}", rc.nome);
            assert_eq!(jc["argsVariaveis"].is_string(), rc.args_variaveis, "argsVariaveis de {}", rc.nome);
            let saidas = jc["saidas"].as_array().expect("saidas");
            assert_eq!(saidas.len(), rc.saidas.len());
            for (js, rs) in saidas.iter().zip(rc.saidas) {
                assert_eq!(js["nome"].as_str(), Some(rs.nome));
                assert_eq!(tipo_de(js["tipo"].as_str().expect("tipo")), rs.tipo);
                let el = match &js["elementos"] {
                    Value::Number(n) => Elementos::Fixo(n.as_u64().expect("u64") as u32),
                    Value::String(s) if s == "n" => Elementos::N,
                    Value::String(s) if s == "2n" => Elementos::DoisN,
                    Value::String(s) if s == "livre" => Elementos::Livre,
                    Value::String(s) if s.ends_with('n') && s[..s.len() - 1].parse::<u32>().is_ok() => {
                        Elementos::Multiplo(s[..s.len() - 1].parse::<u32>().expect("K"))
                    }
                    outro => panic!("elementos inesperado: {outro}"),
                };
                assert_eq!(el, rs.elementos, "elementos de {}.{}", rc.nome, rs.nome);
            }
        }

        // argumentos
        assert_eq!(j["args"]["nivel_todos"].as_u64(), Some(NIVEL_TODOS as u64));

        // códigos
        let cod = j["codigos"].as_object().expect("codigos");
        let esperados = [
            ("OK", OK),
            ("VERSAO", VERSAO),
            ("HANDLE", HANDLE),
            ("ENTRADA", ENTRADA),
            ("NAO_IMPLEMENTADO", NAO_IMPLEMENTADO),
            ("LIMITE", LIMITE),
            ("INTERNO", INTERNO),
        ];
        for (nome, v) in esperados {
            assert_eq!(cod[nome].as_u64(), Some(v as u64), "código {nome}");
        }
        // 7 códigos + o campo `$comentario`
        assert_eq!(cod.keys().filter(|k| !k.starts_with('$')).count(), esperados.len());

        // limites
        assert_eq!(j["limites"]["linhas_por_secao"].as_u64(), Some(LIMITE_LINHAS_POR_SECAO as u64));
        assert_eq!(j["limites"]["bytes_por_chamada"].as_u64(), Some(LIMITE_BYTES_POR_CHAMADA));
    }

    #[test]
    fn layout_de_secao_preenche_a_multiplo_de_8() {
        // (a seção `paredes` é a primeira e não mudou de forma na v2)
        // paredes: u32 e u32 (n*4 cada, arredondado a 8) + 5 f64
        assert_eq!(bytes_secao(SECAO_PAREDES, 0), Ok(0));
        assert_eq!(bytes_secao(SECAO_PAREDES, 1), Ok(8 + 8 + 5 * 8));
        assert_eq!(bytes_secao(SECAO_PAREDES, 3), Ok(16 + 16 + 5 * 24));
        assert_eq!(bytes_secao(SECAO_PAREDES, 2), Ok(8 + 8 + 5 * 16));
    }

    #[test]
    fn bytes_secao_erros() {
        assert_eq!(bytes_secao(99, 1), Err(ENTRADA));
        assert_eq!(bytes_secao(SECAO_PAREDES, LIMITE_LINHAS_POR_SECAO + 1), Err(LIMITE));
        assert_eq!(bytes_secao(SECAO_PAREDES, u32::MAX), Err(LIMITE));
    }

    #[test]
    fn limite_de_bytes_vem_do_esquema() {
        // 4194304 linhas * (4+4+5*8) = 192 MiB < 256 MiB: a seção cheia cabe em uma chamada.
        assert!(bytes_secao(SECAO_PAREDES, LIMITE_LINHAS_POR_SECAO).is_ok());
    }
}
