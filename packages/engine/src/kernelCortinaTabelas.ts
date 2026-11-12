/**
 * Tabelas do adaptador da parede cortina (decisão 0056; fase 1 esquema v14, fase 2 esquema v15, fase 3 esquema v16, fase 5 esquema v17): nomes e colunas das seções 100 a 110, 112 e 113 e a 7 (`tipos_abertura`, o catálogo de esquadrias que a célula referencia), códigos dos enums e
 * das saídas das consultas 100, 101, 102, 104 e 105. Espelha `crates/geom-wasm/schema/cena-v11.json`; o teste `kernelCortina.test.ts` confere contra o esquema gerado e
 * o teste do wasm (`tests/kernel-cortina.wasm.test.ts`), contra o Rust real.
 */

/** `ID_AUSENTE` do esquema: "nenhum" onde o contrato permite (sem montante no papel, painel do tipo, hospedeiro). */
export const ID_AUSENTE_CORTINA = 0xffffffff;

/** Valores padrão do contrato (ADR 0056 §4.2 e §5): o Rust os aplica quando o campo vem NaN. */
export const SOBRA_FUNDIDA_PADRAO = 0.05;
export const CELULA_MINIMA_PADRAO = 0.15;
export const ENCAIXE_PADRAO = 0.012;

/** Limites de defesa (ADR §4.3 e §6.4): acima deles a consulta devolve `LIMITE`. */
export const LIMITES_CORTINA = { celulas: 4096, linhasPorEixo: 128, posicoesManuais: 128, instancias: 20_000 } as const;

export const NOMES_SECOES_CORTINA = [
  'cortinas',
  'tipos_cortina',
  'grades_cortina',
  'grade_posicoes_cortina',
  'tipos_montante_cortina',
  'tipos_painel_cortina',
  'cortina_linhas_extras',
  'cortina_segmentos_removidos',
  'cortina_linhas_sobrescritas',
  'cortina_celulas_sobrescritas',
  'cortina_extremidades',
  /** Fase 5: seção 7 (`tipos_abertura`, a mesma das paredes comuns), esquadria na célula (112) e cortina embutida (113). */
  'tipos_abertura',
  'cortina_celulas_abertura',
  'cortina_hospedes',
] as const;
export type NomeSecaoCortina = (typeof NOMES_SECOES_CORTINA)[number];
export type ColunasCortina = Record<string, number[]>;

export const COLUNAS_CORTINA: Record<NomeSecaoCortina, readonly string[]> = {
  cortinas: ['id_num', 'nivel_num', 'tipo_num', 'ax', 'ay', 'bx', 'by', 'z_base', 'altura', 'sag', 'flipped', 'loc', 'flags', 'painel_padrao_num', 'hosp_num'],
  tipos_cortina: ['id_num', 'profundidade', 'painel_padrao_num', 'mont_int_v', 'mont_int_h', 'mont_borda_ini', 'mont_borda_fim', 'mont_borda_base', 'mont_borda_topo', 'mont_canto', 'prioridade', 'celula_minima', 'faceta_max', 'cadeia_grade'],
  grades_cortina: ['id_num', 'dono', 'dono_num', 'eixo', 'modo', 'numero', 'distancia', 'justificacao', 'ancora', 'deslocamento', 'angulo', 'resto_minimo'],
  grade_posicoes_cortina: ['id_num', 'grade_num', 'ordem', 'pos'],
  tipos_montante_cortina: ['id_num', 'forma', 'largura', 'profundidade', 'espessura', 'largura2', 'deslocamento', 'posicao', 'material_num'],
  tipos_painel_cortina: ['id_num', 'tipo', 'espessura', 'deslocamento', 'encaixe', 'material_num', 'vidro_tipo'],
  cortina_linhas_extras: ['id_num', 'cortina_num', 'eixo', 'pos', 'travada', 'comp_gravado', 'montante_num'],
  cortina_segmentos_removidos: ['id_num', 'cortina_num', 'eixo', 'origem', 'linha_num', 'pos_norm', 'n', 'k', 'nk', 'mid'],
  cortina_linhas_sobrescritas: ['id_num', 'cortina_num', 'eixo', 'linha_num', 'pos_norm', 'n', 'travada', 'pos', 'comp_gravado', 'montante_modo', 'montante_num'],
  cortina_celulas_sobrescritas: ['id_num', 'cortina_num', 'i', 'j', 's', 'z', 'nu', 'nv', 'painel_num'],
  cortina_extremidades: [
    'id_num',
    'cortina_num',
    'fim',
    'vizinha_num',
    'vizinha_tipo',
    'lado',
    'flags',
    'angulo',
    'face1_ax',
    'face1_ay',
    'face1_bx',
    'face1_by',
    'face2_ax',
    'face2_ay',
    'face2_bx',
    'face2_by',
    'espessura_vizinha',
  ],
  tipos_abertura: ['id_num', 'largura', 'altura', 'peitoril', 'folga_w', 'folga_h', 'folhas', 'plano', 'janela', 'fechamento', 'tem_alizar', 'estilo_batente', 'modo_prof', 'prof_pedida', 'larg_batente', 'esp_folha'],
  cortina_celulas_abertura: ['id_num', 'cortina_num', 'i', 'j', 's', 'z', 'nu', 'nv', 'tipo_abertura_num', 'flip_mao', 'flip_sentido', 'ajuste', 'alinhamento', 'soleira'],
  cortina_hospedes: ['id_num', 'cortina_num', 'hospedeiro_num', 'deslocamento', 'largura', 'peitoril', 'altura'],
};

/** Valor de "herda do tipo" nas colunas `u8` da grade da instância (`modo`, `justificacao`, `ancora`). Nas `u32` é `ID_AUSENTE_CORTINA`; nas `f64`, NaN. */
export const HERDA_CORTINA = 255;

/** Códigos dos enums, na ordem do JSON. */
export const ENUM_CORTINA = {
  modo: { fixedNumber: 0, fixedDistance: 1, maxDistance: 2, manual: 3 },
  justificacao: { start: 0, center: 1, end: 2 },
  ancora: { start: 0, end: 1 },
  eixo: { u: 0, v: 1 },
  dono: { tipo: 0, instancia: 1 },
  prioridade: { vertical: 0, horizontal: 1 },
  forma: { rect: 0, round: 1, L: 2, trapezoid: 3, corner: 4 },
  painel: { glass: 0, solid: 1, empty: 2 },
  posicao: { normalToFace: 0, parallelToGround: 1 },
  /** Linha de localização da parede (a mesma de `paredes_quadro.linha_loc`). */
  locationLine: { wallCenter: 0, coreCenter: 1, finishExterior: 2, finishInterior: 3, coreExterior: 4, coreInterior: 5 },
} as const;

/** `origem` de `cortina_grade.linhas`. */
export const ORIGEM_LINHA = { gerada: 0, extra: 1, manual: 2 } as const;

/** Papel das peças em `quant_cortina`: montantes 0 a 6, painéis 10 a 12 e o sistema 20 (convenção da referência TS `cortinaRef`). */
export const PAPEL_QUANT_CORTINA = {
  interiorVertical: 0,
  interiorHorizontal: 1,
  bordaInicio: 2,
  bordaFim: 3,
  bordaBase: 4,
  bordaTopo: 5,
  /** Montante de canto entre duas cortinas (fase 3): uma peça de altura total, emitida pela cortina de menor id. */
  canto: 6,
  painelVidro: 10,
  painelSolido: 11,
  painelVazio: 12,
  sistema: 20,
  /** Fase 5: esquadria na célula (n e área do vão), folha e batente (volume) e vidro da esquadria (área e volume); o vidro da esquadria NÃO é vidro de fachada. */
  esquadria: 30,
  esquadriaFolha: 31,
  esquadriaVidro: 32,
} as const;

/** `papel` das peças em `cortina_malha`. */
export const PAPEL_MALHA_CORTINA = { montante: 0, vidro: 1, solido: 2, /** Fase 5, só em `grupos`: folha e batente (opaco) e vidro da esquadria (transparente). */ esquadria: 3, vidroEsquadria: 4 } as const;
/** `papel` e `estilo` das linhas de `cortina_planta`. */
export const PAPEL_PLANTA_CORTINA = { contorno: 0, vidro: 1, montante: 2, solido: 3, /** Fase 5: contorno do vão da esquadria e giro, arco ou traço da folha. */ esquadria: 4, giro: 5 } as const;
export const ESTILO_PLANTA_CORTINA = { cortado: 0, projetado: 1, oculto: 2 } as const;
/** Bits de `cortina_grade.celulas.flags`: menor lado livre menor que a célula mínima; célula com sobrescrita adotada; região com mais de uma célula. */
export const FLAGS_CELULA = { pequena: 1, sobrescrita: 2, regiaoMultipla: 4, /** Fase 5: a região é uma esquadria, sem painel. */ esquadria: 8 } as const;
/** `ajuste` e `alinhamento` de `cortina_celulas_abertura` (fase 5). */
export const AJUSTE_ESQUADRIA = { preencher: 0, grade: 1 } as const;
export const ALINHAMENTO_ESQUADRIA = { center: 0, start: 1, end: 2 } as const;
/** Bits de `flags` das esquadrias em `cortina_celula_porta.portas` (fase 5). */
export const FLAGS_ESQUADRIA = { soleiraDerivada: 1, limitada: 2, folhaMinima: 4, foraDoPiso: 8, regiaoMultipla: 16 } as const;
/** Bit 1 de `cortinas.flags`: a cortina é embutida num hospedeiro (fase 5). */
export const FLAG_CORTINA_HOSPEDADA = 2;
/** Bits de `cortina_extremidades.flags`: junção desligada nesta ponta (`noJoin`); (bit 1 reservado); a vizinha atravessa o nó (T). */
export const FLAGS_EXTREMIDADE = { semJuncao: 1, atravessa: 4 } as const;
/** Bit 0 de `cortina_grade.linhas.flags`: linha travada. */
export const FLAGS_LINHA = { travada: 1 } as const;
/** `montante_modo` de `cortina_linhas_sobrescritas`: herda do eixo, sem montante (null), ou um tipo. */
export const MONTANTE_MODO_CORTINA = { herda: 0, semMontante: 1, tipo: 2 } as const;

/** Códigos de `cortina_avisos.avisos[1]` (ADR §5.8; `AVISO_CORTINA_*` de `esquema.rs`). */
export const AVISO_CORTINA = {
  celulaPequena: 1,
  montanteSobreposto: 2,
  sobraFundida: 3,
  posicaoFora: 4,
  profundidadeMenorQuePerfil: 5,
  arcoNaoSuportado: 6,
  /** Fase 2: órfã de célula, de linha e de segmento (o ADR chama as três de `cortina-override-orfao`). */
  orfaoCelula: 7,
  orfaoLinha: 8,
  orfaoSegmento: 9,
  /** Fase 2: remoção de segmento recusada, a região fundida deixaria de ser retângulo. */
  celulaNaoRetangular: 10,
  /** Fase 5: largura livre menor que a folha mínima (`cortina-porta-folha-minima`), porta sem soleira acima do piso (`cortina-porta-fora-do-piso`) e esquadria nominal maior que a célula. */
  portaFolhaMinima: 11,
  portaForaDoPiso: 12,
  esquadriaMaiorQueCelula: 13,
} as const;

/** Código de um enum, ou erro claro com o nome do campo (o contrato não aceita valor fora do domínio). */
export function codigoCortina<T extends Record<string, number>>(tabela: T, chave: string, o_que: string): number {
  const v = tabela[chave];
  if (v === undefined) throw new Error(`kernelCortina: ${o_que} "${chave}" não existe no contrato`);
  return v;
}
