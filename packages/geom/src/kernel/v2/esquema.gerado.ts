// ARQUIVO GERADO por scripts/gerar-esquema-kernel.mjs a partir de crates/geom-wasm/schema/cena-v1.json.
// Não edite à mão: mude o JSON e rode `node scripts/gerar-esquema-kernel.mjs`.

export const ESQUEMA_VERSAO = 1;
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
