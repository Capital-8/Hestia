//! Constantes que espelham `schema/cena-v11.json` (fonte única do contrato, decisão 0046).
//!
//! O teste `contrato_confere_com_json` (no fim deste arquivo) lê o JSON e confere tudo daqui:
//! ids de seção, ordem e tipos das colunas, ids de consulta, saídas, códigos de erro e limites.
//! Mudou o JSON => sobe `VERSAO_ESQUEMA` e este arquivo.

/// `versao` de `cena-v11.json`.
pub const VERSAO_ESQUEMA: u32 = 19;
/// `abi` de `cena-v11.json`.
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
pub const SECAO_NIVEIS: u32 = 19;
pub const SECAO_PAREDES_Z_JUNCAO: u32 = 20;
pub const SECAO_PERFIS_Z_JUNCAO: u32 = 21;
pub const SECAO_FAIXAS_JUNCAO: u32 = 22;
pub const SECAO_PONTOS_FAIXAS_JUNCAO: u32 = 23;
pub const SECAO_CAMADAS_FORRO: u32 = 24;
pub const SECAO_PONTOS_FORRO: u32 = 25;
pub const SECAO_ESCADAS_GC: u32 = 60;
pub const SECAO_ESCADA_COMPONENTES_GC: u32 = 61;
pub const SECAO_ESCADA_CURVAS_GC: u32 = 62;
pub const SECAO_ESCADA_ESPELHOS_GC: u32 = 63;
pub const SECAO_ESCADA_PATAMARES_GC: u32 = 64;
pub const SECAO_RAMPAS_GC: u32 = 65;
pub const SECAO_RAMPA_LANCES_GC: u32 = 66;
pub const SECAO_RAMPA_PATAMARES_GC: u32 = 67;
pub const SECAO_GUARDAS_CORPO: u32 = 70;
pub const SECAO_GUARDA_CAMINHOS_MANUAIS: u32 = 71;
pub const SECAO_TIPOS_GUARDA: u32 = 72;
pub const SECAO_PERFIS_GUARDA: u32 = 73;
pub const SECAO_PERFIS_GUARDA_PONTOS: u32 = 74;
pub const SECAO_TRILHOS_GUARDA: u32 = 75;
pub const SECAO_CORRIMAOS_GUARDA: u32 = 76;
pub const SECAO_POSTES_GUARDA: u32 = 77;
pub const SECAO_PADROES_GUARDA: u32 = 78;
pub const SECAO_PADRAO_ELEMENTOS_GUARDA: u32 = 79;
pub const SECAO_PAINEIS_GUARDA: u32 = 80;
pub const SECAO_NORMAS_GUARDA: u32 = 81;
/// Parede cortina (decisão 0056, fase 1; esquema v14). Faixa reservada: seções 100 a 139.
pub const SECAO_CORTINAS: u32 = 100;
pub const SECAO_TIPOS_CORTINA: u32 = 101;
pub const SECAO_GRADES_CORTINA: u32 = 102;
pub const SECAO_GRADE_POSICOES_CORTINA: u32 = 103;
pub const SECAO_TIPOS_MONTANTE_CORTINA: u32 = 104;
pub const SECAO_TIPOS_PAINEL_CORTINA: u32 = 105;
/// Parede cortina, fase 2 (esquema v15): sobrescritas de grade e de célula (ADR 0056 §4.3 e §6.1).
pub const SECAO_CORTINA_LINHAS_EXTRAS: u32 = 106;
pub const SECAO_CORTINA_SEGMENTOS_REMOVIDOS: u32 = 107;
pub const SECAO_CORTINA_LINHAS_SOBRESCRITAS: u32 = 108;
pub const SECAO_CORTINA_CELULAS_SOBRESCRITAS: u32 = 109;
/// Parede cortina, fase 3 (esquema v16): a vizinhança de cada ponta (ADR 0056 §6.1 e §6.5).
pub const SECAO_CORTINA_EXTREMIDADES: u32 = 110;
/// Parede cortina, fase 5 (esquema v17): esquadria na célula e cortina embutida (ADR 0056 §6.1, §7 e §8). A 111 (`cortina_cadeias`) fica para a fase 4.
pub const SECAO_CORTINA_CELULAS_ABERTURA: u32 = 112;
pub const SECAO_CORTINA_HOSPEDES: u32 = 113;
/// Massa de estudo volumétrico (plano de massa, A.5; esquema v19). Faixa reservada: seções 140 a 159.
pub const SECAO_MASSAS: u32 = 140;
pub const SECAO_MASSA_SECOES: u32 = 141;
pub const SECAO_MASSA_PONTOS: u32 = 142;

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
    col("termino_ref", Tipo::U8),
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
    Secao { id: SECAO_NIVEIS, nome: "niveis", chave: "id_num", colunas: &[col("id_num", Tipo::U32), col("nivel_num", Tipo::U32), col("cota", Tipo::F64)] },
    Secao { id: SECAO_PAREDES_Z_JUNCAO, nome: "paredes_z_juncao", chave: "id_num", colunas: &[col("id_num", Tipo::U32), col("z0", Tipo::F64), col("altura", Tipo::F64)] },
    Secao {
        id: SECAO_PERFIS_Z_JUNCAO,
        nome: "perfis_z_juncao",
        chave: "id_num",
        colunas: &[col("id_num", Tipo::U32), col("parede_num", Tipo::U32), col("lista", Tipo::U8), col("indice", Tipo::U32), col("t", Tipo::F64), col("h", Tipo::F64)],
    },
    Secao {
        id: SECAO_FAIXAS_JUNCAO,
        nome: "faixas_juncao",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("nivel_num", Tipo::U32),
            col("parede_num", Tipo::U32),
            col("camada", Tipo::U32),
            col("banda", Tipo::U32),
            col("prioridade", Tipo::F64),
            col("nucleo", Tipo::U8),
            col("base_z", Tipo::F64),
            col("z0", Tipo::F64),
            col("z1", Tipo::F64),
            col("inclinada", Tipo::U8),
            col("o_x", Tipo::F64),
            col("o_y", Tipo::F64),
            col("d_x", Tipo::F64),
            col("d_y", Tipo::F64),
            col("t0", Tipo::F64),
            col("t1", Tipo::F64),
            col("h0", Tipo::F64),
            col("h1", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_PONTOS_FAIXAS_JUNCAO,
        nome: "pontos_faixas_juncao",
        chave: "id_num",
        colunas: &[col("id_num", Tipo::U32), col("faixa_num", Tipo::U32), col("poligono", Tipo::U32), col("anel", Tipo::U32), col("indice", Tipo::U32), col("x", Tipo::F64), col("y", Tipo::F64)],
    },
    Secao {
        id: SECAO_CAMADAS_FORRO,
        nome: "camadas_forro",
        chave: "id_num",
        colunas: &[col("id_num", Tipo::U32), col("forro_num", Tipo::U32), col("nivel_num", Tipo::U32), col("indice", Tipo::U32), col("espessura", Tipo::F64)],
    },
    Secao {
        id: SECAO_PONTOS_FORRO,
        nome: "pontos_forro",
        chave: "id_num",
        colunas: &[col("id_num", Tipo::U32), col("forro_num", Tipo::U32), col("poligono", Tipo::U32), col("anel", Tipo::U32), col("indice", Tipo::U32), col("x", Tipo::F64), col("y", Tipo::F64)],
    },
    Secao {
        id: SECAO_ESCADAS_GC,
        nome: "escadas_gc",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("nivel_num", Tipo::U32),
            col("z_base", Tipo::F64),
            col("z_topo", Tipo::F64),
            col("altura_espelho", Tipo::F64),
            col("profundidade_piso", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_ESCADA_COMPONENTES_GC,
        nome: "escada_componentes_gc",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("escada_num", Tipo::U32),
            col("indice", Tipo::U32),
            col("tipo", Tipo::U8),
            col("caracol", Tipo::U8),
            col("centro_x", Tipo::F64),
            col("centro_y", Tipo::F64),
            col("r_int", Tipo::F64),
            col("r_ext", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_ESCADA_CURVAS_GC,
        nome: "escada_curvas_gc",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("componente_num", Tipo::U32),
            col("lado", Tipo::U8),
            col("ordem", Tipo::U32),
            col("ax", Tipo::F64),
            col("ay", Tipo::F64),
            col("bx", Tipo::F64),
            col("by", Tipo::F64),
            col("sag", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_ESCADA_ESPELHOS_GC,
        nome: "escada_espelhos_gc",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("componente_num", Tipo::U32),
            col("indice", Tipo::U32),
            col("ax", Tipo::F64),
            col("ay", Tipo::F64),
            col("bx", Tipo::F64),
            col("by", Tipo::F64),
            col("z0", Tipo::F64),
            col("z1", Tipo::F64),
            col("bocel", Tipo::F64),
            col("z_piso", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_ESCADA_PATAMARES_GC,
        nome: "escada_patamares_gc",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("componente_num", Tipo::U32),
            col("indice", Tipo::U32),
            col("x", Tipo::F64),
            col("y", Tipo::F64),
            col("z", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_RAMPAS_GC,
        nome: "rampas_gc",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("nivel_num", Tipo::U32),
            col("z_base", Tipo::F64),
            col("z_topo", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_RAMPA_LANCES_GC,
        nome: "rampa_lances_gc",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("rampa_num", Tipo::U32),
            col("indice", Tipo::U32),
            col("sx", Tipo::F64),
            col("sy", Tipo::F64),
            col("ex", Tipo::F64),
            col("ey", Tipo::F64),
            col("ax", Tipo::F64),
            col("ay", Tipo::F64),
            col("bx", Tipo::F64),
            col("by", Tipo::F64),
            col("cx", Tipo::F64),
            col("cy", Tipo::F64),
            col("dx", Tipo::F64),
            col("dy", Tipo::F64),
            col("z0", Tipo::F64),
            col("z1", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_RAMPA_PATAMARES_GC,
        nome: "rampa_patamares_gc",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("rampa_num", Tipo::U32),
            col("componente", Tipo::U32),
            col("indice", Tipo::U32),
            col("x", Tipo::F64),
            col("y", Tipo::F64),
            col("z", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_GUARDAS_CORPO,
        nome: "guardas_corpo",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("nivel_num", Tipo::U32),
            col("tipo_num", Tipo::U32),
            col("hosp", Tipo::U8),
            col("hosp_num", Tipo::U32),
            col("lados", Tipo::U8),
            col("pos_base", Tipo::U8),
            col("desloc", Tipo::F64),
            col("altura", Tipo::F64),
            col("inverter", Tipo::U8),
            col("fechado", Tipo::U8),
            col("lado_desloc", Tipo::U8),
            col("cota_base", Tipo::F64),
            col("flags", Tipo::U8),
        ],
    },
    Secao {
        id: SECAO_GUARDA_CAMINHOS_MANUAIS,
        nome: "guarda_caminhos_manuais",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("guarda_num", Tipo::U32),
            col("indice", Tipo::U32),
            col("x", Tipo::F64),
            col("y", Tipo::F64),
            col("dz", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_TIPOS_GUARDA,
        nome: "tipos_guarda",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("altura", Tipo::F64),
            col("desloc", Tipo::F64),
            col("ajuste_patamar", Tipo::F64),
            col("folga_inferior", Tipo::F64),
            col("junc_angular", Tipo::U8),
            col("junc_tangente", Tipo::U8),
            col("conexao", Tipo::U8),
            col("tol_corda", Tipo::F64),
            col("norma_num", Tipo::U32),
        ],
    },
    Secao {
        id: SECAO_PERFIS_GUARDA,
        nome: "perfis_guarda",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("forma", Tipo::U8),
            col("largura", Tipo::F64),
            col("altura", Tipo::F64),
            col("n_pontos", Tipo::U32),
            col("lados", Tipo::U32),
        ],
    },
    Secao {
        id: SECAO_PERFIS_GUARDA_PONTOS,
        nome: "perfis_guarda_pontos",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("perfil_num", Tipo::U32),
            col("indice", Tipo::U32),
            col("x", Tipo::F64),
            col("y", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_TRILHOS_GUARDA,
        nome: "trilhos_guarda",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("tipo_num", Tipo::U32),
            col("indice", Tipo::U32),
            col("altura", Tipo::F64),
            col("desloc", Tipo::F64),
            col("perfil_num", Tipo::U32),
            col("material_num", Tipo::U32),
        ],
    },
    Secao {
        id: SECAO_CORRIMAOS_GUARDA,
        nome: "corrimaos_guarda",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("tipo_num", Tipo::U32),
            col("indice", Tipo::U32),
            col("funcao", Tipo::U8),
            col("posicao", Tipo::U8),
            col("altura", Tipo::F64),
            col("afastamento", Tipo::F64),
            col("perfil_num", Tipo::U32),
            col("material_num", Tipo::U32),
            col("ext_ini_estilo", Tipo::U8),
            col("ext_ini_comp", Tipo::F64),
            col("ext_ini_mais_piso", Tipo::U8),
            col("ext_fim_estilo", Tipo::U8),
            col("ext_fim_comp", Tipo::F64),
            col("ext_fim_mais_piso", Tipo::U8),
            col("sup_layout", Tipo::U8),
            col("sup_espac", Tipo::F64),
            col("sup_numero", Tipo::U32),
            col("sup_justif", Tipo::U8),
            col("sup_perfil_num", Tipo::U32),
            col("sup_comp", Tipo::F64),
            col("transicao", Tipo::U8),
            col("juncao", Tipo::U8),
            col("raio_filete", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_POSTES_GUARDA,
        nome: "postes_guarda",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("tipo_num", Tipo::U32),
            col("papel", Tipo::U8),
            col("ativo", Tipo::U8),
            col("perfil_num", Tipo::U32),
            col("material_num", Tipo::U32),
            col("acima", Tipo::F64),
            col("abaixo", Tipo::F64),
            col("ang_canto", Tipo::F64),
            col("modo", Tipo::U8),
            col("espacamento", Tipo::F64),
            col("numero", Tipo::U32),
        ],
    },
    Secao {
        id: SECAO_PADROES_GUARDA,
        nome: "padroes_guarda",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("tipo_num", Tipo::U32),
            col("indice", Tipo::U32),
            col("base_tipo", Tipo::U8),
            col("base_idx", Tipo::U32),
            col("topo_tipo", Tipo::U8),
            col("topo_idx", Tipo::U32),
            col("periodo", Tipo::F64),
            col("justif", Tipo::U8),
            col("sobra", Tipo::U8),
            col("quebra", Tipo::U8),
            col("ang_quebra", Tipo::F64),
            col("escopo", Tipo::U8),
            col("pd_ativo", Tipo::U8),
            col("pd_qtd", Tipo::U32),
            col("pd_dist", Tipo::F64),
            col("pd_perfil_num", Tipo::U32),
            col("pd_material_num", Tipo::U32),
        ],
    },
    Secao {
        id: SECAO_PADRAO_ELEMENTOS_GUARDA,
        nome: "padrao_elementos_guarda",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("padrao_num", Tipo::U32),
            col("indice", Tipo::U32),
            col("perfil_num", Tipo::U32),
            col("material_num", Tipo::U32),
            col("dist_anterior", Tipo::F64),
            col("desloc_lateral", Tipo::F64),
            col("desloc_base", Tipo::F64),
            col("desloc_topo", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_PAINEIS_GUARDA,
        nome: "paineis_guarda",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("tipo_num", Tipo::U32),
            col("indice", Tipo::U32),
            col("familia", Tipo::U8),
            col("base_tipo", Tipo::U8),
            col("base_idx", Tipo::U32),
            col("topo_tipo", Tipo::U8),
            col("topo_idx", Tipo::U32),
            col("desl_base", Tipo::F64),
            col("desl_topo", Tipo::F64),
            col("espessura", Tipo::F64),
            col("folga_lateral", Tipo::F64),
            col("largura_max", Tipo::F64),
            col("material_num", Tipo::U32),
            col("perf_diam", Tipo::F64),
            col("perf_passo_x", Tipo::F64),
            col("perf_passo_y", Tipo::F64),
            col("perf_alternado", Tipo::U8),
            col("tela_larg", Tipo::F64),
            col("tela_alt", Tipo::F64),
            col("tela_fio", Tipo::F64),
            col("cabo_diam", Tipo::F64),
            col("cabo_espac", Tipo::F64),
            col("cabo_orient", Tipo::U8),
        ],
    },
    Secao {
        id: SECAO_NORMAS_GUARDA,
        nome: "normas_guarda",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("n_flags", Tipo::U32),
            col("desnivel_exige_guarda", Tipo::F64),
            col("altura_minima", Tipo::F64),
            col("altura_minima_escada_interna", Tipo::F64),
            col("altura_alta_acima", Tipo::F64),
            col("altura_alta_altura", Tipo::F64),
            col("esfera_maxima", Tipo::F64),
            col("esfera_maxima_triangulo", Tipo::F64),
            col("folga_inferior_maxima", Tipo::F64),
            col("carga_linear_horizontal", Tipo::F64),
            col("carga_area_horizontal", Tipo::F64),
            col("carga_pontual_guarda", Tipo::F64),
            col("corrimao_altura_min", Tipo::F64),
            col("corrimao_altura_max", Tipo::F64),
            col("corrimao_altura_adicional_1", Tipo::F64),
            col("corrimao_altura_adicional_2", Tipo::F64),
            col("corrimao_altura_adicional_3", Tipo::F64),
            col("corrimao_altura_adicional_4", Tipo::F64),
            col("corrimao_diametro_min", Tipo::F64),
            col("corrimao_diametro_max", Tipo::F64),
            col("corrimao_afastamento_min", Tipo::F64),
            col("corrimao_extensao_min", Tipo::F64),
            col("corrimao_dois_lados", Tipo::U8),
            col("corrimao_continuo", Tipo::U8),
            col("corrimao_intermediario_largura", Tipo::F64),
            col("corrimao_intermediario_espacamento", Tipo::F64),
            col("carga_corrimao", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_CORTINAS,
        nome: "cortinas",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("nivel_num", Tipo::U32),
            col("tipo_num", Tipo::U32),
            col("ax", Tipo::F64),
            col("ay", Tipo::F64),
            col("bx", Tipo::F64),
            col("by", Tipo::F64),
            col("z_base", Tipo::F64),
            col("altura", Tipo::F64),
            col("sag", Tipo::F64),
            col("flipped", Tipo::U8),
            col("loc", Tipo::U8),
            col("flags", Tipo::U8),
            col("painel_padrao_num", Tipo::U32),
            col("hosp_num", Tipo::U32),
        ],
    },
    Secao {
        id: SECAO_TIPOS_CORTINA,
        nome: "tipos_cortina",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("profundidade", Tipo::F64),
            col("painel_padrao_num", Tipo::U32),
            col("mont_int_v", Tipo::U32),
            col("mont_int_h", Tipo::U32),
            col("mont_borda_ini", Tipo::U32),
            col("mont_borda_fim", Tipo::U32),
            col("mont_borda_base", Tipo::U32),
            col("mont_borda_topo", Tipo::U32),
            col("mont_canto", Tipo::U32),
            col("prioridade", Tipo::U8),
            col("celula_minima", Tipo::F64),
            col("faceta_max", Tipo::F64),
            col("cadeia_grade", Tipo::U8),
        ],
    },
    Secao {
        id: SECAO_GRADES_CORTINA,
        nome: "grades_cortina",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("dono", Tipo::U8),
            col("dono_num", Tipo::U32),
            col("eixo", Tipo::U8),
            col("modo", Tipo::U8),
            col("numero", Tipo::U32),
            col("distancia", Tipo::F64),
            col("justificacao", Tipo::U8),
            col("ancora", Tipo::U8),
            col("deslocamento", Tipo::F64),
            col("angulo", Tipo::F64),
            col("resto_minimo", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_GRADE_POSICOES_CORTINA,
        nome: "grade_posicoes_cortina",
        chave: "id_num",
        colunas: &[col("id_num", Tipo::U32), col("grade_num", Tipo::U32), col("ordem", Tipo::U32), col("pos", Tipo::F64)],
    },
    Secao {
        id: SECAO_TIPOS_MONTANTE_CORTINA,
        nome: "tipos_montante_cortina",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("forma", Tipo::U8),
            col("largura", Tipo::F64),
            col("profundidade", Tipo::F64),
            col("espessura", Tipo::F64),
            col("largura2", Tipo::F64),
            col("deslocamento", Tipo::F64),
            col("posicao", Tipo::U8),
            col("material_num", Tipo::U32),
        ],
    },
    Secao {
        id: SECAO_TIPOS_PAINEL_CORTINA,
        nome: "tipos_painel_cortina",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("tipo", Tipo::U8),
            col("espessura", Tipo::F64),
            col("deslocamento", Tipo::F64),
            col("encaixe", Tipo::F64),
            col("material_num", Tipo::U32),
            col("vidro_tipo", Tipo::U8),
        ],
    },
    Secao {
        id: SECAO_CORTINA_LINHAS_EXTRAS,
        nome: "cortina_linhas_extras",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("cortina_num", Tipo::U32),
            col("eixo", Tipo::U8),
            col("pos", Tipo::F64),
            col("travada", Tipo::U8),
            col("comp_gravado", Tipo::F64),
            col("montante_num", Tipo::U32),
        ],
    },
    Secao {
        id: SECAO_CORTINA_SEGMENTOS_REMOVIDOS,
        nome: "cortina_segmentos_removidos",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("cortina_num", Tipo::U32),
            col("eixo", Tipo::U8),
            col("origem", Tipo::U8),
            col("linha_num", Tipo::U32),
            col("pos_norm", Tipo::F64),
            col("n", Tipo::U32),
            col("k", Tipo::U32),
            col("nk", Tipo::U32),
            col("mid", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_CORTINA_LINHAS_SOBRESCRITAS,
        nome: "cortina_linhas_sobrescritas",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("cortina_num", Tipo::U32),
            col("eixo", Tipo::U8),
            col("linha_num", Tipo::U32),
            col("pos_norm", Tipo::F64),
            col("n", Tipo::U32),
            col("travada", Tipo::U8),
            col("pos", Tipo::F64),
            col("comp_gravado", Tipo::F64),
            col("montante_modo", Tipo::U8),
            col("montante_num", Tipo::U32),
        ],
    },
    Secao {
        id: SECAO_CORTINA_CELULAS_SOBRESCRITAS,
        nome: "cortina_celulas_sobrescritas",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("cortina_num", Tipo::U32),
            col("i", Tipo::U32),
            col("j", Tipo::U32),
            col("s", Tipo::F64),
            col("z", Tipo::F64),
            col("nu", Tipo::U32),
            col("nv", Tipo::U32),
            col("painel_num", Tipo::U32),
        ],
    },
    Secao {
        id: SECAO_CORTINA_EXTREMIDADES,
        nome: "cortina_extremidades",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("cortina_num", Tipo::U32),
            col("fim", Tipo::U8),
            col("vizinha_num", Tipo::U32),
            col("vizinha_tipo", Tipo::U8),
            col("lado", Tipo::U8),
            col("flags", Tipo::U8),
            col("angulo", Tipo::F64),
            col("face1_ax", Tipo::F64),
            col("face1_ay", Tipo::F64),
            col("face1_bx", Tipo::F64),
            col("face1_by", Tipo::F64),
            col("face2_ax", Tipo::F64),
            col("face2_ay", Tipo::F64),
            col("face2_bx", Tipo::F64),
            col("face2_by", Tipo::F64),
            col("espessura_vizinha", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_CORTINA_CELULAS_ABERTURA,
        nome: "cortina_celulas_abertura",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("cortina_num", Tipo::U32),
            col("i", Tipo::U32),
            col("j", Tipo::U32),
            col("s", Tipo::F64),
            col("z", Tipo::F64),
            col("nu", Tipo::U32),
            col("nv", Tipo::U32),
            col("tipo_abertura_num", Tipo::U32),
            col("flip_mao", Tipo::U8),
            col("flip_sentido", Tipo::U8),
            col("ajuste", Tipo::U8),
            col("alinhamento", Tipo::U8),
            col("soleira", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_CORTINA_HOSPEDES,
        nome: "cortina_hospedes",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("cortina_num", Tipo::U32),
            col("hospedeiro_num", Tipo::U32),
            col("deslocamento", Tipo::F64),
            col("largura", Tipo::F64),
            col("peitoril", Tipo::F64),
            col("altura", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_MASSAS,
        nome: "massas",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("nivel_num", Tipo::U32),
            col("ox", Tipo::F64),
            col("oy", Tipo::F64),
            col("z_base", Tipo::F64),
            col("interp", Tipo::U8),
            col("resolucao", Tipo::U32),
            col("arr_n", Tipo::U32),
            col("arr_cx", Tipo::F64),
            col("arr_cy", Tipo::F64),
            col("arr_ang", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_MASSA_SECOES,
        nome: "massa_secoes",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("massa_num", Tipo::U32),
            col("ordem", Tipo::U32),
            col("z", Tipo::F64),
            col("forma", Tipo::U8),
            col("p1", Tipo::F64),
            col("p2", Tipo::F64),
            col("lados", Tipo::U32),
            col("rot", Tipo::F64),
            col("escala", Tipo::F64),
            col("dx", Tipo::F64),
            col("dy", Tipo::F64),
        ],
    },
    Secao {
        id: SECAO_MASSA_PONTOS,
        nome: "massa_pontos",
        chave: "id_num",
        colunas: &[
            col("id_num", Tipo::U32),
            col("secao_num", Tipo::U32),
            col("ordem", Tipo::U32),
            col("x", Tipo::F64),
            col("y", Tipo::F64),
        ],
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
pub const CONSULTA_PISOS_LAJES_COM_PAREDES: u32 = 11;
pub const CONSULTA_JUNCTION_NIVEL: u32 = 12;
pub const CONSULTA_QUANT_PAREDES: u32 = 13;
pub const CONSULTA_QUANT_PISOS: u32 = 14;
pub const CONSULTA_QUANT_LAJES: u32 = 15;
pub const CONSULTA_QUANT_FORROS: u32 = 16;
pub const CONSULTA_GUARDA_CAMINHOS: u32 = 60;
pub const CONSULTA_GUARDA_MALHA: u32 = 61;
pub const CONSULTA_GUARDA_PLANTA: u32 = 62;
pub const CONSULTA_GUARDA_CORTE: u32 = 63;
pub const CONSULTA_QUANT_GUARDA: u32 = 64;
pub const CONSULTA_GUARDA_AVISOS: u32 = 65;
/// Parede cortina (decisão 0056, fase 1). Faixa reservada: consultas 100 a 119 (a 103, `cortina_corte`, é da fase 6).
pub const CONSULTA_CORTINA_GRADE: u32 = 100;
pub const CONSULTA_CORTINA_MALHA: u32 = 101;
pub const CONSULTA_CORTINA_PLANTA: u32 = 102;
pub const CONSULTA_QUANT_CORTINA: u32 = 104;
pub const CONSULTA_CORTINA_AVISOS: u32 = 105;
/// Fase 5 (esquema v17): recorte da cortina embutida no hospedeiro e vão virtual da esquadria na célula.
pub const CONSULTA_CORTINA_RECORTE_HOSPEDEIRO: u32 = 106;
pub const CONSULTA_CORTINA_CELULA_PORTA: u32 = 107;
/// Massa (esquema v19). Faixa reservada: consultas 140 a 159. Sem implementação até a ficha R1: devolvem `NAO_IMPLEMENTADO`.
pub const CONSULTA_MASSA_MALHA: u32 = 140;
pub const CONSULTA_MASSA_PLANTA: u32 = 141;
pub const CONSULTA_MASSA_FATIAS: u32 = 142;
pub const CONSULTA_MASSA_CORTE: u32 = 143;
pub const CONSULTA_QUANT_MASSA: u32 = 144;
pub const CONSULTA_MASSA_AVISOS: u32 = 145;

/// Códigos de `cortina_avisos.avisos[1]` (ADR 0056 §5.8): o TS decide o texto e a severidade.
pub const AVISO_CORTINA_CELULA_PEQUENA: u32 = 1;
pub const AVISO_CORTINA_MONTANTE_SOBREPOSTO: u32 = 2;
pub const AVISO_CORTINA_SOBRA_FUNDIDA: u32 = 3;
pub const AVISO_CORTINA_POSICAO_FORA: u32 = 4;
pub const AVISO_CORTINA_PROFUNDIDADE_MENOR_QUE_PERFIL: u32 = 5;
pub const AVISO_CORTINA_ARCO_NAO_SUPORTADO: u32 = 6;
/// Fase 2 (§4.4 e §5.2). Órfã: a sobrescrita de célula (7), de linha (8) ou de segmento (9) não se aplica à grade nova e sai do modelo na próxima
/// edição (`normalizarSobrescritas`). Os três são o aviso `cortina-override-orfao` do ADR; o código separa o alvo para "Ir para".
pub const AVISO_CORTINA_OVERRIDE_ORFAO_CELULA: u32 = 7;
pub const AVISO_CORTINA_OVERRIDE_ORFAO_LINHA: u32 = 8;
pub const AVISO_CORTINA_OVERRIDE_ORFAO_SEGMENTO: u32 = 9;
/// Remoção de segmento recusada: a região fundida deixaria de ser retângulo (ADR §5.2). `i` e `j` são a célula de referência.
pub const AVISO_CORTINA_CELULA_NAO_RETANGULAR: u32 = 10;
/// Fase 5 (§7.5): a largura livre da célula é menor que a folha mínima do tipo (11); porta sem soleira numa fileira acima do piso (12); a esquadria nominal
/// (`ajuste` grid) é maior que a célula livre e o vão foi limitado a ela (13). `i`, `j` = a célula. Os dois primeiros são o `cortina-porta-folha-minima` e o
/// `cortina-porta-fora-do-piso` do ADR.
pub const AVISO_CORTINA_PORTA_FOLHA_MINIMA: u32 = 11;
pub const AVISO_CORTINA_PORTA_FORA_DO_PISO: u32 = 12;
pub const AVISO_CORTINA_ESQUADRIA_MAIOR_QUE_CELULA: u32 = 13;

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
    Consulta {
        id: CONSULTA_PISOS_LAJES_COM_PAREDES,
        nome: "pisos_lajes_com_paredes",
        args: &["nivel_num", "tol_juncao"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "elementos", tipo: Tipo::U32, elementos: Elementos::Multiplo(9) },
            SaidaDef { nome: "elementos_num", tipo: Tipo::F64, elementos: Elementos::Multiplo(7) },
            SaidaDef { nome: "camadas", tipo: Tipo::U32, elementos: Elementos::Multiplo(7) },
            SaidaDef { nome: "camadas_num", tipo: Tipo::F64, elementos: Elementos::Multiplo(3) },
            SaidaDef { nome: "poligonos", tipo: Tipo::U32, elementos: Elementos::DoisN },
            SaidaDef { nome: "aneis", tipo: Tipo::U32, elementos: Elementos::DoisN },
            SaidaDef { nome: "pontos", tipo: Tipo::F64, elementos: Elementos::Livre },
        ],
    },
    Consulta {
        id: CONSULTA_JUNCTION_NIVEL,
        nome: "junction_nivel",
        args: &["nivel_num", "tol_juncao"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "cortadores", tipo: Tipo::U32, elementos: Elementos::Multiplo(3) },
            SaidaDef { nome: "pecas", tipo: Tipo::U32, elementos: Elementos::Multiplo(11) },
            SaidaDef { nome: "pecas_num", tipo: Tipo::F64, elementos: Elementos::Multiplo(16) },
            SaidaDef { nome: "elementos", tipo: Tipo::U32, elementos: Elementos::Multiplo(7) },
            SaidaDef { nome: "camadas", tipo: Tipo::U32, elementos: Elementos::DoisN },
            SaidaDef { nome: "camadas_indice", tipo: Tipo::F64, elementos: Elementos::N },
            SaidaDef { nome: "paredes", tipo: Tipo::U32, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "faixas", tipo: Tipo::U32, elementos: Elementos::Multiplo(3) },
            SaidaDef { nome: "faixas_camada", tipo: Tipo::F64, elementos: Elementos::N },
            SaidaDef { nome: "partes", tipo: Tipo::U32, elementos: Elementos::DoisN },
            SaidaDef { nome: "partes_z", tipo: Tipo::F64, elementos: Elementos::DoisN },
            SaidaDef { nome: "poligonos", tipo: Tipo::U32, elementos: Elementos::DoisN },
            SaidaDef { nome: "aneis", tipo: Tipo::U32, elementos: Elementos::DoisN },
            SaidaDef { nome: "pontos", tipo: Tipo::F64, elementos: Elementos::Livre },
        ],
    },
    Consulta {
        id: CONSULTA_QUANT_PAREDES,
        nome: "quant_paredes",
        args: &["nivel_num", "tol_juncao"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "linhas", tipo: Tipo::U32, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "valores", tipo: Tipo::F64, elementos: Elementos::Multiplo(5) },
        ],
    },
    Consulta {
        id: CONSULTA_QUANT_PISOS,
        nome: "quant_pisos",
        args: &["nivel_num", "tol_juncao"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "linhas", tipo: Tipo::U32, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "valores", tipo: Tipo::F64, elementos: Elementos::Multiplo(5) },
        ],
    },
    Consulta {
        id: CONSULTA_QUANT_LAJES,
        nome: "quant_lajes",
        args: &["nivel_num", "tol_juncao"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "linhas", tipo: Tipo::U32, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "valores", tipo: Tipo::F64, elementos: Elementos::Multiplo(5) },
        ],
    },
    Consulta {
        id: CONSULTA_QUANT_FORROS,
        nome: "quant_forros",
        args: &["nivel_num", "tol_juncao"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "linhas", tipo: Tipo::U32, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "valores", tipo: Tipo::F64, elementos: Elementos::Multiplo(5) },
        ],
    },
    Consulta {
        id: CONSULTA_GUARDA_CAMINHOS,
        nome: "guarda_caminhos",
        args: &["nivel_num", "tol_juncao"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "trechos", tipo: Tipo::U32, elementos: Elementos::Multiplo(5) },
            SaidaDef { nome: "nos", tipo: Tipo::F64, elementos: Elementos::Multiplo(3) },
            SaidaDef { nome: "avisos", tipo: Tipo::U32, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "valores", tipo: Tipo::F64, elementos: Elementos::Multiplo(5) },
        ],
    },
    Consulta {
        id: CONSULTA_GUARDA_MALHA,
        nome: "guarda_malha",
        args: &["nivel_num", "lod"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "grupos", tipo: Tipo::U32, elementos: Elementos::Multiplo(5) },
            SaidaDef { nome: "vertices", tipo: Tipo::F64, elementos: Elementos::Multiplo(3) },
            SaidaDef { nome: "indices", tipo: Tipo::U32, elementos: Elementos::N },
        ],
    },
    Consulta {
        id: CONSULTA_GUARDA_PLANTA,
        nome: "guarda_planta",
        args: &["nivel_num", "corte_z", "detalhe"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "linhas", tipo: Tipo::U32, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "pontos", tipo: Tipo::F64, elementos: Elementos::DoisN },
        ],
    },
    Consulta {
        id: CONSULTA_GUARDA_CORTE,
        nome: "guarda_corte",
        args: &["nivel_num", "ox", "oy", "dx", "dy", "profundidade"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "linhas", tipo: Tipo::U32, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "pontos", tipo: Tipo::F64, elementos: Elementos::DoisN },
            SaidaDef { nome: "poligonos", tipo: Tipo::F64, elementos: Elementos::Livre },
        ],
    },
    Consulta {
        id: CONSULTA_QUANT_GUARDA,
        nome: "quant_guarda",
        args: &["nivel_num"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "linhas", tipo: Tipo::U32, elementos: Elementos::Multiplo(5) },
            SaidaDef { nome: "valores", tipo: Tipo::F64, elementos: Elementos::Multiplo(4) },
        ],
    },
    Consulta {
        id: CONSULTA_GUARDA_AVISOS,
        nome: "guarda_avisos",
        args: &["nivel_num", "norma_num"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "avisos", tipo: Tipo::U32, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "valores", tipo: Tipo::F64, elementos: Elementos::Multiplo(5) },
        ],
    },
    Consulta {
        id: CONSULTA_CORTINA_GRADE,
        nome: "cortina_grade",
        args: &["nivel_num"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "linhas", tipo: Tipo::U32, elementos: Elementos::Multiplo(5) },
            SaidaDef { nome: "linhas_pos", tipo: Tipo::F64, elementos: Elementos::N },
            SaidaDef { nome: "celulas", tipo: Tipo::U32, elementos: Elementos::Multiplo(6) },
            SaidaDef { nome: "celulas_ret", tipo: Tipo::F64, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "segmentos", tipo: Tipo::U32, elementos: Elementos::Multiplo(5) },
            SaidaDef { nome: "segmentos_ext", tipo: Tipo::F64, elementos: Elementos::DoisN },
        ],
    },
    Consulta {
        id: CONSULTA_CORTINA_MALHA,
        nome: "cortina_malha",
        args: &["nivel_num", "lod"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "prototipos", tipo: Tipo::U32, elementos: Elementos::Multiplo(8) },
            SaidaDef { nome: "vertices", tipo: Tipo::F64, elementos: Elementos::Multiplo(3) },
            SaidaDef { nome: "indices", tipo: Tipo::U32, elementos: Elementos::N },
            SaidaDef { nome: "instancias", tipo: Tipo::U32, elementos: Elementos::Multiplo(6) },
            SaidaDef { nome: "matrizes", tipo: Tipo::F64, elementos: Elementos::Multiplo(12) },
            SaidaDef { nome: "grupos", tipo: Tipo::U32, elementos: Elementos::Multiplo(6) },
            SaidaDef { nome: "vertices_av", tipo: Tipo::F64, elementos: Elementos::Multiplo(3) },
            SaidaDef { nome: "indices_av", tipo: Tipo::U32, elementos: Elementos::N },
        ],
    },
    Consulta {
        id: CONSULTA_CORTINA_PLANTA,
        nome: "cortina_planta",
        args: &["nivel_num", "corte_z", "detalhe"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "linhas", tipo: Tipo::U32, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "pontos", tipo: Tipo::F64, elementos: Elementos::DoisN },
        ],
    },
    Consulta {
        id: CONSULTA_QUANT_CORTINA,
        nome: "quant_cortina",
        args: &["nivel_num"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "linhas", tipo: Tipo::U32, elementos: Elementos::Multiplo(5) },
            SaidaDef { nome: "valores", tipo: Tipo::F64, elementos: Elementos::Multiplo(4) },
        ],
    },
    Consulta {
        id: CONSULTA_CORTINA_AVISOS,
        nome: "cortina_avisos",
        args: &["nivel_num"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "avisos", tipo: Tipo::U32, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "valores", tipo: Tipo::F64, elementos: Elementos::Multiplo(5) },
        ],
    },
    Consulta {
        id: CONSULTA_CORTINA_RECORTE_HOSPEDEIRO,
        nome: "cortina_recorte_hospedeiro",
        args: &["nivel_num"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "recortes", tipo: Tipo::U32, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "retangulos", tipo: Tipo::F64, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "colisoes", tipo: Tipo::U32, elementos: Elementos::Multiplo(3) },
            SaidaDef { nome: "colisoes_ret", tipo: Tipo::F64, elementos: Elementos::Multiplo(4) },
        ],
    },
    Consulta {
        id: CONSULTA_CORTINA_CELULA_PORTA,
        nome: "cortina_celula_porta",
        args: &["nivel_num"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "portas", tipo: Tipo::U32, elementos: Elementos::Multiplo(10) },
            SaidaDef { nome: "vaos", tipo: Tipo::F64, elementos: Elementos::Multiplo(10) },
            SaidaDef { nome: "linhas", tipo: Tipo::U32, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "linhas_pos", tipo: Tipo::F64, elementos: Elementos::N },
        ],
    },
    Consulta {
        id: CONSULTA_MASSA_MALHA,
        nome: "massa_malha",
        args: &["nivel_num", "lod"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "grupos", tipo: Tipo::U32, elementos: Elementos::Multiplo(5) },
            SaidaDef { nome: "vertices", tipo: Tipo::F64, elementos: Elementos::Multiplo(3) },
            SaidaDef { nome: "indices", tipo: Tipo::U32, elementos: Elementos::N },
        ],
    },
    Consulta {
        id: CONSULTA_MASSA_PLANTA,
        nome: "massa_planta",
        args: &["nivel_num", "corte_z", "z_min", "z_max"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "linhas", tipo: Tipo::U32, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "pontos", tipo: Tipo::F64, elementos: Elementos::DoisN },
        ],
    },
    Consulta {
        id: CONSULTA_MASSA_FATIAS,
        nome: "massa_fatias",
        args: &["nivel_num"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "fatias", tipo: Tipo::U32, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "pontos", tipo: Tipo::F64, elementos: Elementos::DoisN },
            SaidaDef { nome: "valores", tipo: Tipo::F64, elementos: Elementos::Multiplo(3) },
        ],
    },
    Consulta {
        id: CONSULTA_MASSA_CORTE,
        nome: "massa_corte",
        args: &["nivel_num", "ox", "oy", "dx", "dy", "profundidade"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "linhas", tipo: Tipo::U32, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "pontos", tipo: Tipo::F64, elementos: Elementos::DoisN },
        ],
    },
    Consulta {
        id: CONSULTA_QUANT_MASSA,
        nome: "quant_massa",
        args: &["nivel_num"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "linhas", tipo: Tipo::U32, elementos: Elementos::N },
            SaidaDef { nome: "valores", tipo: Tipo::F64, elementos: Elementos::Multiplo(5) },
        ],
    },
    Consulta {
        id: CONSULTA_MASSA_AVISOS,
        nome: "massa_avisos",
        args: &["nivel_num"],
        args_variaveis: false,
        saidas: &[
            SaidaDef { nome: "avisos", tipo: Tipo::U32, elementos: Elementos::Multiplo(4) },
            SaidaDef { nome: "valores", tipo: Tipo::F64, elementos: Elementos::Multiplo(5) },
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

    const JSON: &str = include_str!("../schema/cena-v11.json");

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
