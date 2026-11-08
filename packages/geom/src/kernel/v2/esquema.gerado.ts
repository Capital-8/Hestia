// ARQUIVO GERADO por scripts/gerar-esquema-kernel.mjs a partir de crates/geom-wasm/schema/cena-v11.json.
// Não edite à mão: mude o JSON e rode `node scripts/gerar-esquema-kernel.mjs`.

export const ESQUEMA_VERSAO = 12;
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
  },
  "perfis_z": {
    "id": 9,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "parede_num",
        "tipo": "u32"
      },
      {
        "nome": "lista",
        "tipo": "u8"
      },
      {
        "nome": "indice",
        "tipo": "u32"
      },
      {
        "nome": "t",
        "tipo": "f64"
      },
      {
        "nome": "h",
        "tipo": "f64"
      }
    ]
  },
  "pisos": {
    "id": 10,
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
        "nome": "tipo_num",
        "tipo": "u32"
      },
      {
        "nome": "ordem",
        "tipo": "f64"
      },
      {
        "nome": "cota_nivel",
        "tipo": "f64"
      },
      {
        "nome": "desloc",
        "tipo": "f64"
      },
      {
        "nome": "modo",
        "tipo": "u8"
      },
      {
        "nome": "vinculado",
        "tipo": "u8"
      },
      {
        "nome": "tem_semente",
        "tipo": "u8"
      },
      {
        "nome": "extend_nucleo",
        "tipo": "u8"
      },
      {
        "nome": "problema",
        "tipo": "u8"
      }
    ]
  },
  "lajes": {
    "id": 11,
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
        "nome": "tipo_num",
        "tipo": "u32"
      },
      {
        "nome": "ordem",
        "tipo": "f64"
      },
      {
        "nome": "cota_nivel",
        "tipo": "f64"
      },
      {
        "nome": "desloc",
        "tipo": "f64"
      },
      {
        "nome": "modo",
        "tipo": "u8"
      },
      {
        "nome": "vinculado",
        "tipo": "u8"
      },
      {
        "nome": "tem_semente",
        "tipo": "u8"
      },
      {
        "nome": "extend_nucleo",
        "tipo": "u8"
      },
      {
        "nome": "problema",
        "tipo": "u8"
      },
      {
        "nome": "tem_inclinacao",
        "tipo": "u8"
      },
      {
        "nome": "inc_ox",
        "tipo": "f64"
      },
      {
        "nome": "inc_oy",
        "tipo": "f64"
      },
      {
        "nome": "inc_dx",
        "tipo": "f64"
      },
      {
        "nome": "inc_dy",
        "tipo": "f64"
      },
      {
        "nome": "inc_percentual",
        "tipo": "f64"
      }
    ]
  },
  "tipos_piso": {
    "id": 12,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "n_camadas",
        "tipo": "u32"
      }
    ]
  },
  "tipos_laje": {
    "id": 13,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "n_camadas",
        "tipo": "u32"
      }
    ]
  },
  "camadas_piso": {
    "id": 14,
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
        "nome": "termino",
        "tipo": "u8"
      },
      {
        "nome": "termino_valor",
        "tipo": "f64"
      },
      {
        "nome": "limite_externo",
        "tipo": "u8"
      }
    ]
  },
  "camadas_laje": {
    "id": 15,
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
        "nome": "termino",
        "tipo": "u8"
      },
      {
        "nome": "termino_valor",
        "tipo": "f64"
      },
      {
        "nome": "limite_externo",
        "tipo": "u8"
      }
    ]
  },
  "contornos_estaticos": {
    "id": 16,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "tipo_el",
        "tipo": "u8"
      },
      {
        "nome": "elemento_num",
        "tipo": "u32"
      },
      {
        "nome": "anel",
        "tipo": "u32"
      },
      {
        "nome": "indice",
        "tipo": "u32"
      },
      {
        "nome": "x",
        "tipo": "f64"
      },
      {
        "nome": "y",
        "tipo": "f64"
      }
    ]
  },
  "contornos_vinculados": {
    "id": 17,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "tipo_el",
        "tipo": "u8"
      },
      {
        "nome": "elemento_num",
        "tipo": "u32"
      },
      {
        "nome": "papel",
        "tipo": "u8"
      },
      {
        "nome": "anel",
        "tipo": "u32"
      },
      {
        "nome": "indice",
        "tipo": "u32"
      },
      {
        "nome": "x",
        "tipo": "f64"
      },
      {
        "nome": "y",
        "tipo": "f64"
      }
    ]
  },
  "furos_nivel": {
    "id": 18,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "tipo_el",
        "tipo": "u8"
      },
      {
        "nome": "elemento_num",
        "tipo": "u32"
      },
      {
        "nome": "poligono",
        "tipo": "u32"
      },
      {
        "nome": "anel",
        "tipo": "u32"
      },
      {
        "nome": "indice",
        "tipo": "u32"
      },
      {
        "nome": "x",
        "tipo": "f64"
      },
      {
        "nome": "y",
        "tipo": "f64"
      }
    ]
  },
  "niveis": {
    "id": 19,
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
        "nome": "cota",
        "tipo": "f64"
      }
    ]
  },
  "paredes_z_juncao": {
    "id": 20,
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
  "perfis_z_juncao": {
    "id": 21,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "parede_num",
        "tipo": "u32"
      },
      {
        "nome": "lista",
        "tipo": "u8"
      },
      {
        "nome": "indice",
        "tipo": "u32"
      },
      {
        "nome": "t",
        "tipo": "f64"
      },
      {
        "nome": "h",
        "tipo": "f64"
      }
    ]
  },
  "faixas_juncao": {
    "id": 22,
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
        "nome": "parede_num",
        "tipo": "u32"
      },
      {
        "nome": "camada",
        "tipo": "u32"
      },
      {
        "nome": "banda",
        "tipo": "u32"
      },
      {
        "nome": "prioridade",
        "tipo": "f64"
      },
      {
        "nome": "nucleo",
        "tipo": "u8"
      },
      {
        "nome": "base_z",
        "tipo": "f64"
      },
      {
        "nome": "z0",
        "tipo": "f64"
      },
      {
        "nome": "z1",
        "tipo": "f64"
      },
      {
        "nome": "inclinada",
        "tipo": "u8"
      },
      {
        "nome": "o_x",
        "tipo": "f64"
      },
      {
        "nome": "o_y",
        "tipo": "f64"
      },
      {
        "nome": "d_x",
        "tipo": "f64"
      },
      {
        "nome": "d_y",
        "tipo": "f64"
      },
      {
        "nome": "t0",
        "tipo": "f64"
      },
      {
        "nome": "t1",
        "tipo": "f64"
      },
      {
        "nome": "h0",
        "tipo": "f64"
      },
      {
        "nome": "h1",
        "tipo": "f64"
      }
    ]
  },
  "pontos_faixas_juncao": {
    "id": 23,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "faixa_num",
        "tipo": "u32"
      },
      {
        "nome": "poligono",
        "tipo": "u32"
      },
      {
        "nome": "anel",
        "tipo": "u32"
      },
      {
        "nome": "indice",
        "tipo": "u32"
      },
      {
        "nome": "x",
        "tipo": "f64"
      },
      {
        "nome": "y",
        "tipo": "f64"
      }
    ]
  },
  "camadas_forro": {
    "id": 24,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "forro_num",
        "tipo": "u32"
      },
      {
        "nome": "nivel_num",
        "tipo": "u32"
      },
      {
        "nome": "indice",
        "tipo": "u32"
      },
      {
        "nome": "espessura",
        "tipo": "f64"
      }
    ]
  },
  "pontos_forro": {
    "id": 25,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "forro_num",
        "tipo": "u32"
      },
      {
        "nome": "poligono",
        "tipo": "u32"
      },
      {
        "nome": "anel",
        "tipo": "u32"
      },
      {
        "nome": "indice",
        "tipo": "u32"
      },
      {
        "nome": "x",
        "tipo": "f64"
      },
      {
        "nome": "y",
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
  },
  "resolver_nivel": {
    "id": 9,
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
        "nome": "paredes",
        "tipo": "u32",
        "elementos": "8n"
      },
      {
        "nome": "paredes_num",
        "tipo": "f64",
        "elementos": "15n"
      },
      {
        "nome": "perfis",
        "tipo": "f64",
        "elementos": "2n"
      },
      {
        "nome": "membranas",
        "tipo": "u32",
        "elementos": "3n"
      },
      {
        "nome": "membranas_pts",
        "tipo": "f64",
        "elementos": "4n"
      },
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
        "elementos": "11n"
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
  },
  "pisos_lajes_nivel": {
    "id": 10,
    "args": [
      "nivel_num"
    ],
    "saidas": [
      {
        "nome": "elementos",
        "tipo": "u32",
        "elementos": "9n"
      },
      {
        "nome": "elementos_num",
        "tipo": "f64",
        "elementos": "7n"
      },
      {
        "nome": "camadas",
        "tipo": "u32",
        "elementos": "8n"
      },
      {
        "nome": "camadas_num",
        "tipo": "f64",
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
  },
  "pisos_lajes_com_paredes": {
    "id": 11,
    "args": [
      "nivel_num",
      "tol_juncao"
    ],
    "saidas": [
      {
        "nome": "elementos",
        "tipo": "u32",
        "elementos": "9n"
      },
      {
        "nome": "elementos_num",
        "tipo": "f64",
        "elementos": "7n"
      },
      {
        "nome": "camadas",
        "tipo": "u32",
        "elementos": "7n"
      },
      {
        "nome": "camadas_num",
        "tipo": "f64",
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
  },
  "junction_nivel": {
    "id": 12,
    "args": [
      "nivel_num",
      "tol_juncao"
    ],
    "saidas": [
      {
        "nome": "cortadores",
        "tipo": "u32",
        "elementos": "3n"
      },
      {
        "nome": "pecas",
        "tipo": "u32",
        "elementos": "11n"
      },
      {
        "nome": "pecas_num",
        "tipo": "f64",
        "elementos": "16n"
      },
      {
        "nome": "elementos",
        "tipo": "u32",
        "elementos": "7n"
      },
      {
        "nome": "camadas",
        "tipo": "u32",
        "elementos": "2n"
      },
      {
        "nome": "camadas_indice",
        "tipo": "f64",
        "elementos": "n"
      },
      {
        "nome": "paredes",
        "tipo": "u32",
        "elementos": "4n"
      },
      {
        "nome": "faixas",
        "tipo": "u32",
        "elementos": "3n"
      },
      {
        "nome": "faixas_camada",
        "tipo": "f64",
        "elementos": "n"
      },
      {
        "nome": "partes",
        "tipo": "u32",
        "elementos": "2n"
      },
      {
        "nome": "partes_z",
        "tipo": "f64",
        "elementos": "2n"
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
  "quant_paredes": {
    "id": 13,
    "args": [
      "nivel_num",
      "tol_juncao"
    ],
    "saidas": [
      {
        "nome": "linhas",
        "tipo": "u32",
        "elementos": "4n"
      },
      {
        "nome": "valores",
        "tipo": "f64",
        "elementos": "5n"
      }
    ]
  },
  "quant_pisos": {
    "id": 14,
    "args": [
      "nivel_num",
      "tol_juncao"
    ],
    "saidas": [
      {
        "nome": "linhas",
        "tipo": "u32",
        "elementos": "4n"
      },
      {
        "nome": "valores",
        "tipo": "f64",
        "elementos": "5n"
      }
    ]
  },
  "quant_lajes": {
    "id": 15,
    "args": [
      "nivel_num",
      "tol_juncao"
    ],
    "saidas": [
      {
        "nome": "linhas",
        "tipo": "u32",
        "elementos": "4n"
      },
      {
        "nome": "valores",
        "tipo": "f64",
        "elementos": "5n"
      }
    ]
  },
  "quant_forros": {
    "id": 16,
    "args": [
      "nivel_num",
      "tol_juncao"
    ],
    "saidas": [
      {
        "nome": "linhas",
        "tipo": "u32",
        "elementos": "4n"
      },
      {
        "nome": "valores",
        "tipo": "f64",
        "elementos": "5n"
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
