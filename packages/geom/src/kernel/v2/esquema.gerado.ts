// ARQUIVO GERADO por scripts/gerar-esquema-kernel.mjs a partir de crates/geom-wasm/schema/cena-v6.json.
// Não edite à mão: mude o JSON e rode `node scripts/gerar-esquema-kernel.mjs`.

export const ESQUEMA_VERSAO = 6;
export const ABI_VERSAO = 2;
export const NIVEL_TODOS = 4294967295;

export const TIPOS = {
  "u32": {
    "bytes": 4,
    "arrayTs": "Uint32Array",
    "codigo": 1
  },
  "i32": {
    "bytes": 4,
    "arrayTs": "Int32Array",
    "codigo": 2
  },
  "f64": {
    "bytes": 8,
    "arrayTs": "Float64Array",
    "codigo": 3
  },
  "u8": {
    "bytes": 1,
    "arrayTs": "Uint8Array",
    "codigo": 4
  }
} as const;

export const SECOES = {
  "paredes": {
    "id": 1,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "nivel_num",
        "tipo": "u32"
      },
      {
        "nome": "ax",
        "tipo": "f64"
      },
      {
        "nome": "ay",
        "tipo": "f64"
      },
      {
        "nome": "bx",
        "tipo": "f64"
      },
      {
        "nome": "by",
        "tipo": "f64"
      },
      {
        "nome": "espessura",
        "tipo": "f64"
      }
    ]
  },
  "paredes_quadro": {
    "id": 2,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "tipo_num",
        "tipo": "u32"
      },
      {
        "nome": "ordem",
        "tipo": "f64"
      },
      {
        "nome": "linha_loc",
        "tipo": "u8"
      },
      {
        "nome": "invertida",
        "tipo": "u8"
      },
      {
        "nome": "sem_junta_a",
        "tipo": "u8"
      },
      {
        "nome": "sem_junta_b",
        "tipo": "u8"
      },
      {
        "nome": "junta_a_tipo",
        "tipo": "u8"
      },
      {
        "nome": "junta_a_inverte",
        "tipo": "u8"
      },
      {
        "nome": "junta_b_tipo",
        "tipo": "u8"
      },
      {
        "nome": "junta_b_inverte",
        "tipo": "u8"
      },
      {
        "nome": "sag",
        "tipo": "f64"
      },
      {
        "nome": "z0",
        "tipo": "f64"
      },
      {
        "nome": "topo",
        "tipo": "f64"
      }
    ]
  },
  "tipos_parede": {
    "id": 3,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "n_camadas",
        "tipo": "u32"
      },
      {
        "nome": "wrap_ends",
        "tipo": "u8"
      },
      {
        "nome": "n_faixas",
        "tipo": "u32"
      },
      {
        "nome": "wrap_inserts",
        "tipo": "u8"
      }
    ]
  },
  "camadas": {
    "id": 4,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "tipo_num",
        "tipo": "u32"
      },
      {
        "nome": "indice",
        "tipo": "u32"
      },
      {
        "nome": "espessura",
        "tipo": "f64"
      },
      {
        "nome": "funcao",
        "tipo": "u8"
      },
      {
        "nome": "tem_prioridade",
        "tipo": "u8"
      },
      {
        "nome": "prioridade",
        "tipo": "f64"
      },
      {
        "nome": "material_num",
        "tipo": "u32"
      },
      {
        "nome": "envolve",
        "tipo": "u8"
      }
    ]
  },
  "faixas": {
    "id": 5,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "tipo_num",
        "tipo": "u32"
      },
      {
        "nome": "indice",
        "tipo": "u32"
      },
      {
        "nome": "lado",
        "tipo": "u8"
      },
      {
        "nome": "material_num",
        "tipo": "u32"
      },
      {
        "nome": "espessura",
        "tipo": "f64"
      },
      {
        "nome": "z0",
        "tipo": "f64"
      },
      {
        "nome": "z1",
        "tipo": "f64"
      }
    ]
  },
  "paredes_z": {
    "id": 6,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "z0",
        "tipo": "f64"
      },
      {
        "nome": "altura",
        "tipo": "f64"
      }
    ]
  },
  "tipos_abertura": {
    "id": 7,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "largura",
        "tipo": "f64"
      },
      {
        "nome": "altura",
        "tipo": "f64"
      },
      {
        "nome": "peitoril",
        "tipo": "f64"
      },
      {
        "nome": "folga_w",
        "tipo": "f64"
      },
      {
        "nome": "folga_h",
        "tipo": "f64"
      },
      {
        "nome": "folhas",
        "tipo": "u8"
      },
      {
        "nome": "plano",
        "tipo": "u8"
      },
      {
        "nome": "janela",
        "tipo": "u8"
      },
      {
        "nome": "fechamento",
        "tipo": "u8"
      },
      {
        "nome": "tem_alizar",
        "tipo": "u8"
      },
      {
        "nome": "estilo_batente",
        "tipo": "u8"
      },
      {
        "nome": "modo_prof",
        "tipo": "u8"
      },
      {
        "nome": "prof_pedida",
        "tipo": "f64"
      },
      {
        "nome": "larg_batente",
        "tipo": "f64"
      },
      {
        "nome": "esp_folha",
        "tipo": "f64"
      }
    ]
  },
  "aberturas": {
    "id": 8,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "tipo_num",
        "tipo": "u32"
      },
      {
        "nome": "parede_num",
        "tipo": "u32"
      },
      {
        "nome": "kind",
        "tipo": "u8"
      },
      {
        "nome": "deslocamento",
        "tipo": "f64"
      },
      {
        "nome": "flip_mao",
        "tipo": "u8"
      },
      {
        "nome": "flip_frente",
        "tipo": "u8"
      },
      {
        "nome": "tem_peitoril",
        "tipo": "u8"
      },
      {
        "nome": "peitoril",
        "tipo": "f64"
      },
      {
        "nome": "tem_altura",
        "tipo": "u8"
      },
      {
        "nome": "altura",
        "tipo": "f64"
      }
    ]
  }
} as const;

export const CONSULTAS = {
  "estatisticas_nivel": {
    "id": 1,
    "args": [
      "nivel_num"
    ],
    "saidas": [
      {
        "nome": "n_paredes",
        "tipo": "u32",
        "elementos": 1
      },
      {
        "nome": "caixa",
        "tipo": "f64",
        "elementos": 4
      },
      {
        "nome": "comprimento_total",
        "tipo": "f64",
        "elementos": 1
      }
    ]
  },
  "paredes_na_caixa": {
    "id": 2,
    "args": [
      "nivel_num",
      "minx",
      "miny",
      "maxx",
      "maxy"
    ],
    "saidas": [
      {
        "nome": "ids",
        "tipo": "u32",
        "elementos": "n"
      }
    ]
  },
  "pares_proximos": {
    "id": 3,
    "args": [
      "nivel_num",
      "tol"
    ],
    "saidas": [
      {
        "nome": "pares",
        "tipo": "u32",
        "elementos": "2n"
      }
    ]
  },
  "quadros_e_juncoes": {
    "id": 4,
    "args": [
      "nivel_num",
      "tol_juncao"
    ],
    "saidas": [
      {
        "nome": "ids",
        "tipo": "u32",
        "elementos": "n"
      },
      {
        "nome": "quadro",
        "tipo": "f64",
        "elementos": "17n"
      },
      {
        "nome": "arco",
        "tipo": "f64",
        "elementos": "8n"
      },
      {
        "nome": "estado_pontas",
        "tipo": "u32",
        "elementos": "8n"
      },
      {
        "nome": "parceiros",
        "tipo": "u32",
        "elementos": "livre"
      },
      {
        "nome": "pontas_cab",
        "tipo": "u32",
        "elementos": "6n"
      },
      {
        "nome": "pontas_dados",
        "tipo": "f64",
        "elementos": "livre"
      },
      {
        "nome": "cordas_cab",
        "tipo": "u32",
        "elementos": "2n"
      },
      {
        "nome": "cordas",
        "tipo": "f64",
        "elementos": "livre"
      },
      {
        "nome": "grupos",
        "tipo": "u32",
        "elementos": "n"
      }
    ]
  },
  "itens_pintados": {
    "id": 5,
    "args": [
      "nivel_num",
      "tol_juncao",
      "tem_corte_z",
      "corte_z",
      "n_contorno"
    ],
    "argsVariaveis": true,
    "saidas": [
      {
        "nome": "itens",
        "tipo": "u32",
        "elementos": "9n"
      },
      {
        "nome": "itens_num",
        "tipo": "f64",
        "elementos": "6n"
      },
      {
        "nome": "formas_cab",
        "tipo": "u32",
        "elementos": "4n"
      },
      {
        "nome": "poligonos",
        "tipo": "u32",
        "elementos": "2n"
      },
      {
        "nome": "aneis",
        "tipo": "u32",
        "elementos": "2n"
      },
      {
        "nome": "pontos",
        "tipo": "f64",
        "elementos": "livre"
      }
    ]
  },
  "aberturas_geom": {
    "id": 6,
    "args": [
      "nivel_num"
    ],
    "saidas": [
      {
        "nome": "ids",
        "tipo": "u32",
        "elementos": "n"
      },
      {
        "nome": "dados",
        "tipo": "u32",
        "elementos": "7n"
      },
      {
        "nome": "medidas",
        "tipo": "f64",
        "elementos": "16n"
      },
      {
        "nome": "retangulo",
        "tipo": "f64",
        "elementos": "8n"
      }
    ]
  },
  "retornos_geom": {
    "id": 7,
    "args": [
      "nivel_num",
      "tol_juncao",
      "tem_corte_z",
      "corte_z",
      "n_contorno"
    ],
    "argsVariaveis": true,
    "saidas": [
      {
        "nome": "retornos",
        "tipo": "u32",
        "elementos": "5n"
      },
      {
        "nome": "formas_cab",
        "tipo": "u32",
        "elementos": "4n"
      },
      {
        "nome": "poligonos",
        "tipo": "u32",
        "elementos": "2n"
      },
      {
        "nome": "aneis",
        "tipo": "u32",
        "elementos": "2n"
      },
      {
        "nome": "pontos",
        "tipo": "f64",
        "elementos": "livre"
      }
    ]
  },
  "cluster_resolvido": {
    "id": 8,
    "args": [
      "nivel_num",
      "tol_juncao",
      "tem_corte_z",
      "corte_z",
      "n_contorno",
      "tem_aberturas_planta",
      "n_aberturas_planta"
    ],
    "argsVariaveis": true,
    "saidas": [
      {
        "nome": "camadas",
        "tipo": "u32",
        "elementos": "6n"
      },
      {
        "nome": "camadas_num",
        "tipo": "f64",
        "elementos": "n"
      },
      {
        "nome": "camadas_formas",
        "tipo": "u32",
        "elementos": "8n"
      },
      {
        "nome": "faixas",
        "tipo": "f64",
        "elementos": "2n"
      },
      {
        "nome": "faixas_forma",
        "tipo": "u32",
        "elementos": "2n"
      },
      {
        "nome": "regioes",
        "tipo": "u32",
        "elementos": "4n"
      },
      {
        "nome": "silhuetas",
        "tipo": "u32",
        "elementos": "3n"
      },
      {
        "nome": "poligonos",
        "tipo": "u32",
        "elementos": "2n"
      },
      {
        "nome": "aneis",
        "tipo": "u32",
        "elementos": "2n"
      },
      {
        "nome": "pontos",
        "tipo": "f64",
        "elementos": "livre"
      }
    ]
  }
} as const;

export const CODIGOS = {
  "OK": 0,
  "VERSAO": 1,
  "HANDLE": 2,
  "ENTRADA": 3,
  "NAO_IMPLEMENTADO": 4,
  "LIMITE": 5,
  "INTERNO": 6
} as const;

export const LIMITES = {
  "linhas_por_secao": 4194304,
  "bytes_por_chamada": 268435456
} as const;
