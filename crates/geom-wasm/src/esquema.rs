//! Constantes que espelham `schema/cena-v1.json` (fonte única do contrato, decisão 0046).
//!
//! O teste `contrato_confere_com_json` (no fim deste arquivo) lê o JSON e confere tudo daqui:
//! ids de seção, ordem e tipos das colunas, ids de consulta, saídas, códigos de erro e limites.
//! Mudou o JSON => sobe `VERSAO_ESQUEMA` e este arquivo.

/// `versao` de `cena-v1.json`.
pub const VERSAO_ESQUEMA: u32 = 1;
/// `abi` de `cena-v1.json`.
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

pub const SECOES: &[Secao] = &[Secao {
    id: SECAO_PAREDES,
    nome: "paredes",
    chave: "id_num",
    colunas: &[
        Coluna { nome: "id_num", tipo: Tipo::U32 },
        Coluna { nome: "nivel_num", tipo: Tipo::U32 },
        Coluna { nome: "ax", tipo: Tipo::F64 },
        Coluna { nome: "ay", tipo: Tipo::F64 },
        Coluna { nome: "bx", tipo: Tipo::F64 },
        Coluna { nome: "by", tipo: Tipo::F64 },
        Coluna { nome: "espessura", tipo: Tipo::F64 },
    ],
}];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Elementos {
    Fixo(u32),
    /// `"n"`
    N,
    /// `"2n"`
    DoisN,
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
    pub saidas: &'static [SaidaDef],
}

pub const CONSULTA_ESTATISTICAS_NIVEL: u32 = 1;
pub const CONSULTA_PAREDES_NA_CAIXA: u32 = 2;
pub const CONSULTA_PARES_PROXIMOS: u32 = 3;

pub const CONSULTAS: &[Consulta] = &[
    Consulta {
        id: CONSULTA_ESTATISTICAS_NIVEL,
        nome: "estatisticas_nivel",
        args: &["nivel_num"],
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
        saidas: &[SaidaDef { nome: "ids", tipo: Tipo::U32, elementos: Elementos::N }],
    },
    Consulta {
        id: CONSULTA_PARES_PROXIMOS,
        nome: "pares_proximos",
        args: &["nivel_num", "tol"],
        saidas: &[SaidaDef { nome: "pares", tipo: Tipo::U32, elementos: Elementos::DoisN }],
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

    const JSON: &str = include_str!("../schema/cena-v1.json");

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
            let saidas = jc["saidas"].as_array().expect("saidas");
            assert_eq!(saidas.len(), rc.saidas.len());
            for (js, rs) in saidas.iter().zip(rc.saidas) {
                assert_eq!(js["nome"].as_str(), Some(rs.nome));
                assert_eq!(tipo_de(js["tipo"].as_str().expect("tipo")), rs.tipo);
                let el = match &js["elementos"] {
                    Value::Number(n) => Elementos::Fixo(n.as_u64().expect("u64") as u32),
                    Value::String(s) if s == "n" => Elementos::N,
                    Value::String(s) if s == "2n" => Elementos::DoisN,
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
