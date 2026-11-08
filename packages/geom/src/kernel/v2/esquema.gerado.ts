// ARQUIVO GERADO por scripts/gerar-esquema-kernel.mjs a partir de crates/geom-wasm/schema/cena-v11.json.
// Não edite à mão: mude o JSON e rode `node scripts/gerar-esquema-kernel.mjs`.

export const ESQUEMA_VERSAO = 13;
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
  },
  "escadas_gc": {
    "id": 60,
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
        "nome": "z_base",
        "tipo": "f64"
      },
      {
        "nome": "z_topo",
        "tipo": "f64"
      },
      {
        "nome": "altura_espelho",
        "tipo": "f64"
      },
      {
        "nome": "profundidade_piso",
        "tipo": "f64"
      }
    ]
  },
  "escada_componentes_gc": {
    "id": 61,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "escada_num",
        "tipo": "u32"
      },
      {
        "nome": "indice",
        "tipo": "u32"
      },
      {
        "nome": "tipo",
        "tipo": "u8"
      },
      {
        "nome": "caracol",
        "tipo": "u8"
      },
      {
        "nome": "centro_x",
        "tipo": "f64"
      },
      {
        "nome": "centro_y",
        "tipo": "f64"
      },
      {
        "nome": "r_int",
        "tipo": "f64"
      },
      {
        "nome": "r_ext",
        "tipo": "f64"
      }
    ]
  },
  "escada_curvas_gc": {
    "id": 62,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "componente_num",
        "tipo": "u32"
      },
      {
        "nome": "lado",
        "tipo": "u8"
      },
      {
        "nome": "ordem",
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
        "nome": "sag",
        "tipo": "f64"
      }
    ]
  },
  "escada_espelhos_gc": {
    "id": 63,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "componente_num",
        "tipo": "u32"
      },
      {
        "nome": "indice",
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
        "nome": "z0",
        "tipo": "f64"
      },
      {
        "nome": "z1",
        "tipo": "f64"
      }
    ]
  },
  "escada_patamares_gc": {
    "id": 64,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "componente_num",
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
      },
      {
        "nome": "z",
        "tipo": "f64"
      }
    ]
  },
  "rampas_gc": {
    "id": 65,
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
        "nome": "z_base",
        "tipo": "f64"
      },
      {
        "nome": "z_topo",
        "tipo": "f64"
      }
    ]
  },
  "rampa_lances_gc": {
    "id": 66,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "rampa_num",
        "tipo": "u32"
      },
      {
        "nome": "indice",
        "tipo": "u32"
      },
      {
        "nome": "sx",
        "tipo": "f64"
      },
      {
        "nome": "sy",
        "tipo": "f64"
      },
      {
        "nome": "ex",
        "tipo": "f64"
      },
      {
        "nome": "ey",
        "tipo": "f64"
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
        "nome": "cx",
        "tipo": "f64"
      },
      {
        "nome": "cy",
        "tipo": "f64"
      },
      {
        "nome": "dx",
        "tipo": "f64"
      },
      {
        "nome": "dy",
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
  "rampa_patamares_gc": {
    "id": 67,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "rampa_num",
        "tipo": "u32"
      },
      {
        "nome": "componente",
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
      },
      {
        "nome": "z",
        "tipo": "f64"
      }
    ]
  },
  "guardas_corpo": {
    "id": 70,
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
        "nome": "hosp",
        "tipo": "u8"
      },
      {
        "nome": "hosp_num",
        "tipo": "u32"
      },
      {
        "nome": "lados",
        "tipo": "u8"
      },
      {
        "nome": "pos_base",
        "tipo": "u8"
      },
      {
        "nome": "desloc",
        "tipo": "f64"
      },
      {
        "nome": "altura",
        "tipo": "f64"
      },
      {
        "nome": "inverter",
        "tipo": "u8"
      },
      {
        "nome": "fechado",
        "tipo": "u8"
      },
      {
        "nome": "lado_desloc",
        "tipo": "u8"
      },
      {
        "nome": "cota_base",
        "tipo": "f64"
      },
      {
        "nome": "flags",
        "tipo": "u8"
      }
    ]
  },
  "guarda_caminhos_manuais": {
    "id": 71,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "guarda_num",
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
      },
      {
        "nome": "dz",
        "tipo": "f64"
      }
    ]
  },
  "tipos_guarda": {
    "id": 72,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "altura",
        "tipo": "f64"
      },
      {
        "nome": "desloc",
        "tipo": "f64"
      },
      {
        "nome": "ajuste_patamar",
        "tipo": "f64"
      },
      {
        "nome": "folga_inferior",
        "tipo": "f64"
      },
      {
        "nome": "junc_angular",
        "tipo": "u8"
      },
      {
        "nome": "junc_tangente",
        "tipo": "u8"
      },
      {
        "nome": "conexao",
        "tipo": "u8"
      },
      {
        "nome": "tol_corda",
        "tipo": "f64"
      },
      {
        "nome": "norma_num",
        "tipo": "u32"
      }
    ]
  },
  "perfis_guarda": {
    "id": 73,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "forma",
        "tipo": "u8"
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
        "nome": "n_pontos",
        "tipo": "u32"
      },
      {
        "nome": "lados",
        "tipo": "u32"
      }
    ]
  },
  "perfis_guarda_pontos": {
    "id": 74,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "perfil_num",
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
  "trilhos_guarda": {
    "id": 75,
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
        "nome": "altura",
        "tipo": "f64"
      },
      {
        "nome": "desloc",
        "tipo": "f64"
      },
      {
        "nome": "perfil_num",
        "tipo": "u32"
      },
      {
        "nome": "material_num",
        "tipo": "u32"
      }
    ]
  },
  "corrimaos_guarda": {
    "id": 76,
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
        "nome": "funcao",
        "tipo": "u8"
      },
      {
        "nome": "posicao",
        "tipo": "u8"
      },
      {
        "nome": "altura",
        "tipo": "f64"
      },
      {
        "nome": "afastamento",
        "tipo": "f64"
      },
      {
        "nome": "perfil_num",
        "tipo": "u32"
      },
      {
        "nome": "material_num",
        "tipo": "u32"
      },
      {
        "nome": "ext_ini_estilo",
        "tipo": "u8"
      },
      {
        "nome": "ext_ini_comp",
        "tipo": "f64"
      },
      {
        "nome": "ext_ini_mais_piso",
        "tipo": "u8"
      },
      {
        "nome": "ext_fim_estilo",
        "tipo": "u8"
      },
      {
        "nome": "ext_fim_comp",
        "tipo": "f64"
      },
      {
        "nome": "ext_fim_mais_piso",
        "tipo": "u8"
      },
      {
        "nome": "sup_layout",
        "tipo": "u8"
      },
      {
        "nome": "sup_espac",
        "tipo": "f64"
      },
      {
        "nome": "sup_numero",
        "tipo": "u32"
      },
      {
        "nome": "sup_justif",
        "tipo": "u8"
      },
      {
        "nome": "sup_perfil_num",
        "tipo": "u32"
      },
      {
        "nome": "sup_comp",
        "tipo": "f64"
      },
      {
        "nome": "transicao",
        "tipo": "u8"
      },
      {
        "nome": "juncao",
        "tipo": "u8"
      },
      {
        "nome": "raio_filete",
        "tipo": "f64"
      }
    ]
  },
  "postes_guarda": {
    "id": 77,
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
        "nome": "papel",
        "tipo": "u8"
      },
      {
        "nome": "ativo",
        "tipo": "u8"
      },
      {
        "nome": "perfil_num",
        "tipo": "u32"
      },
      {
        "nome": "material_num",
        "tipo": "u32"
      },
      {
        "nome": "acima",
        "tipo": "f64"
      },
      {
        "nome": "abaixo",
        "tipo": "f64"
      },
      {
        "nome": "ang_canto",
        "tipo": "f64"
      },
      {
        "nome": "modo",
        "tipo": "u8"
      },
      {
        "nome": "espacamento",
        "tipo": "f64"
      },
      {
        "nome": "numero",
        "tipo": "u32"
      }
    ]
  },
  "padroes_guarda": {
    "id": 78,
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
        "nome": "base_tipo",
        "tipo": "u8"
      },
      {
        "nome": "base_idx",
        "tipo": "u32"
      },
      {
        "nome": "topo_tipo",
        "tipo": "u8"
      },
      {
        "nome": "topo_idx",
        "tipo": "u32"
      },
      {
        "nome": "periodo",
        "tipo": "f64"
      },
      {
        "nome": "justif",
        "tipo": "u8"
      },
      {
        "nome": "sobra",
        "tipo": "u8"
      },
      {
        "nome": "quebra",
        "tipo": "u8"
      },
      {
        "nome": "ang_quebra",
        "tipo": "f64"
      },
      {
        "nome": "escopo",
        "tipo": "u8"
      },
      {
        "nome": "pd_ativo",
        "tipo": "u8"
      },
      {
        "nome": "pd_qtd",
        "tipo": "u32"
      },
      {
        "nome": "pd_dist",
        "tipo": "f64"
      },
      {
        "nome": "pd_perfil_num",
        "tipo": "u32"
      },
      {
        "nome": "pd_material_num",
        "tipo": "u32"
      }
    ]
  },
  "padrao_elementos_guarda": {
    "id": 79,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "padrao_num",
        "tipo": "u32"
      },
      {
        "nome": "indice",
        "tipo": "u32"
      },
      {
        "nome": "perfil_num",
        "tipo": "u32"
      },
      {
        "nome": "material_num",
        "tipo": "u32"
      },
      {
        "nome": "dist_anterior",
        "tipo": "f64"
      },
      {
        "nome": "desloc_lateral",
        "tipo": "f64"
      },
      {
        "nome": "desloc_base",
        "tipo": "f64"
      },
      {
        "nome": "desloc_topo",
        "tipo": "f64"
      }
    ]
  },
  "paineis_guarda": {
    "id": 80,
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
        "nome": "familia",
        "tipo": "u8"
      },
      {
        "nome": "base_tipo",
        "tipo": "u8"
      },
      {
        "nome": "base_idx",
        "tipo": "u32"
      },
      {
        "nome": "topo_tipo",
        "tipo": "u8"
      },
      {
        "nome": "topo_idx",
        "tipo": "u32"
      },
      {
        "nome": "desl_base",
        "tipo": "f64"
      },
      {
        "nome": "desl_topo",
        "tipo": "f64"
      },
      {
        "nome": "espessura",
        "tipo": "f64"
      },
      {
        "nome": "folga_lateral",
        "tipo": "f64"
      },
      {
        "nome": "largura_max",
        "tipo": "f64"
      },
      {
        "nome": "material_num",
        "tipo": "u32"
      },
      {
        "nome": "perf_diam",
        "tipo": "f64"
      },
      {
        "nome": "perf_passo_x",
        "tipo": "f64"
      },
      {
        "nome": "perf_passo_y",
        "tipo": "f64"
      },
      {
        "nome": "perf_alternado",
        "tipo": "u8"
      },
      {
        "nome": "tela_larg",
        "tipo": "f64"
      },
      {
        "nome": "tela_alt",
        "tipo": "f64"
      },
      {
        "nome": "tela_fio",
        "tipo": "f64"
      },
      {
        "nome": "cabo_diam",
        "tipo": "f64"
      },
      {
        "nome": "cabo_espac",
        "tipo": "f64"
      },
      {
        "nome": "cabo_orient",
        "tipo": "u8"
      }
    ]
  },
  "normas_guarda": {
    "id": 81,
    "chave": "id_num",
    "colunas": [
      {
        "nome": "id_num",
        "tipo": "u32"
      },
      {
        "nome": "n_flags",
        "tipo": "u32"
      },
      {
        "nome": "desnivel_exige_guarda",
        "tipo": "f64"
      },
      {
        "nome": "altura_minima",
        "tipo": "f64"
      },
      {
        "nome": "altura_minima_escada_interna",
        "tipo": "f64"
      },
      {
        "nome": "altura_alta_acima",
        "tipo": "f64"
      },
      {
        "nome": "altura_alta_altura",
        "tipo": "f64"
      },
      {
        "nome": "esfera_maxima",
        "tipo": "f64"
      },
      {
        "nome": "esfera_maxima_triangulo",
        "tipo": "f64"
      },
      {
        "nome": "folga_inferior_maxima",
        "tipo": "f64"
      },
      {
        "nome": "carga_linear_horizontal",
        "tipo": "f64"
      },
      {
        "nome": "carga_area_horizontal",
        "tipo": "f64"
      },
      {
        "nome": "carga_pontual_guarda",
        "tipo": "f64"
      },
      {
        "nome": "corrimao_altura_min",
        "tipo": "f64"
      },
      {
        "nome": "corrimao_altura_max",
        "tipo": "f64"
      },
      {
        "nome": "corrimao_altura_adicional_1",
        "tipo": "f64"
      },
      {
        "nome": "corrimao_altura_adicional_2",
        "tipo": "f64"
      },
      {
        "nome": "corrimao_altura_adicional_3",
        "tipo": "f64"
      },
      {
        "nome": "corrimao_altura_adicional_4",
        "tipo": "f64"
      },
      {
        "nome": "corrimao_diametro_min",
        "tipo": "f64"
      },
      {
        "nome": "corrimao_diametro_max",
        "tipo": "f64"
      },
      {
        "nome": "corrimao_afastamento_min",
        "tipo": "f64"
      },
      {
        "nome": "corrimao_extensao_min",
        "tipo": "f64"
      },
      {
        "nome": "corrimao_dois_lados",
        "tipo": "u8"
      },
      {
        "nome": "corrimao_continuo",
        "tipo": "u8"
      },
      {
        "nome": "corrimao_intermediario_largura",
        "tipo": "f64"
      },
      {
        "nome": "corrimao_intermediario_espacamento",
        "tipo": "f64"
      },
      {
        "nome": "carga_corrimao",
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
  },
  "guarda_caminhos": {
    "id": 60,
    "args": [
      "nivel_num",
      "tol_juncao"
    ],
    "saidas": [
      {
        "nome": "trechos",
        "tipo": "u32",
        "elementos": "5n"
      },
      {
        "nome": "nos",
        "tipo": "f64",
        "elementos": "3n"
      },
      {
        "nome": "avisos",
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
  "guarda_malha": {
    "id": 61,
    "args": [
      "nivel_num",
      "lod"
    ],
    "saidas": [
      {
        "nome": "grupos",
        "tipo": "u32",
        "elementos": "5n"
      },
      {
        "nome": "vertices",
        "tipo": "f64",
        "elementos": "3n"
      },
      {
        "nome": "indices",
        "tipo": "u32",
        "elementos": "n"
      }
    ]
  },
  "guarda_planta": {
    "id": 62,
    "args": [
      "nivel_num",
      "corte_z",
      "detalhe"
    ],
    "saidas": [
      {
        "nome": "linhas",
        "tipo": "u32",
        "elementos": "4n"
      },
      {
        "nome": "pontos",
        "tipo": "f64",
        "elementos": "2n"
      }
    ]
  },
  "guarda_corte": {
    "id": 63,
    "args": [
      "nivel_num",
      "ox",
      "oy",
      "dx",
      "dy",
      "profundidade"
    ],
    "saidas": [
      {
        "nome": "linhas",
        "tipo": "u32",
        "elementos": "4n"
      },
      {
        "nome": "pontos",
        "tipo": "f64",
        "elementos": "2n"
      },
      {
        "nome": "poligonos",
        "tipo": "f64",
        "elementos": "livre"
      }
    ]
  },
  "quant_guarda": {
    "id": 64,
    "args": [
      "nivel_num"
    ],
    "saidas": [
      {
        "nome": "linhas",
        "tipo": "u32",
        "elementos": "5n"
      },
      {
        "nome": "valores",
        "tipo": "f64",
        "elementos": "4n"
      }
    ]
  },
  "guarda_avisos": {
    "id": 65,
    "args": [
      "nivel_num",
      "norma_num"
    ],
    "saidas": [
      {
        "nome": "avisos",
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
