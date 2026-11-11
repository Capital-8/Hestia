/**
 * Tabelas do adaptador da parede cortina (decisão 0056, fase 1; esquema v14): nomes e colunas das seções 100 a 105, códigos dos enums e das saídas das
 * consultas 100, 101, 102, 104 e 105. Espelha `crates/geom-wasm/schema/cena-v11.json`; o teste `kernelCortina.test.ts` confere contra o esquema gerado e
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

export const NOMES_SECOES_CORTINA = ['cortinas', 'tipos_cortina', 'grades_cortina', 'grade_posicoes_cortina', 'tipos_montante_cortina', 'tipos_painel_cortina'] as const;
export type NomeSecaoCortina = (typeof NOMES_SECOES_CORTINA)[number];
export type ColunasCortina = Record<string, number[]>;

export const COLUNAS_CORTINA: Record<NomeSecaoCortina, readonly string[]> = {
  cortinas: ['id_num', 'nivel_num', 'tipo_num', 'ax', 'ay', 'bx', 'by', 'z_base', 'altura', 'sag', 'flipped', 'loc', 'flags', 'painel_padrao_num', 'hosp_num'],
  tipos_cortina: ['id_num', 'profundidade', 'painel_padrao_num', 'mont_int_v', 'mont_int_h', 'mont_borda_ini', 'mont_borda_fim', 'mont_borda_base', 'mont_borda_topo', 'mont_canto', 'prioridade', 'celula_minima', 'faceta_max', 'cadeia_grade'],
  grades_cortina: ['id_num', 'dono', 'dono_num', 'eixo', 'modo', 'numero', 'distancia', 'justificacao', 'ancora', 'deslocamento', 'angulo', 'resto_minimo'],
  grade_posicoes_cortina: ['id_num', 'grade_num', 'ordem', 'pos'],
  tipos_montante_cortina: ['id_num', 'forma', 'largura', 'profundidade', 'espessura', 'largura2', 'deslocamento', 'posicao', 'material_num'],
  tipos_painel_cortina: ['id_num', 'tipo', 'espessura', 'deslocamento', 'encaixe', 'material_num', 'vidro_tipo'],
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

/** Papel das peças em `quant_cortina`: montantes 0 a 5, painéis 10 a 12 e o sistema 20 (convenção da referência TS `cortinaRef`). */
export const PAPEL_QUANT_CORTINA = {
  interiorVertical: 0,
  interiorHorizontal: 1,
  bordaInicio: 2,
  bordaFim: 3,
  bordaBase: 4,
  bordaTopo: 5,
  painelVidro: 10,
  painelSolido: 11,
  painelVazio: 12,
  sistema: 20,
} as const;

/** `papel` das peças em `cortina_malha`. */
export const PAPEL_MALHA_CORTINA = { montante: 0, vidro: 1, solido: 2 } as const;
/** `papel` e `estilo` das linhas de `cortina_planta`. */
export const PAPEL_PLANTA_CORTINA = { contorno: 0, vidro: 1, montante: 2, solido: 3 } as const;
export const ESTILO_PLANTA_CORTINA = { cortado: 0, projetado: 1, oculto: 2 } as const;
/** Bit 0 de `cortina_grade.celulas.flags`: o menor lado livre é menor que a célula mínima. */
export const FLAGS_CELULA = { pequena: 1 } as const;

/** Códigos de `cortina_avisos.avisos[1]` (ADR §5.8; `AVISO_CORTINA_*` de `esquema.rs`). */
export const AVISO_CORTINA = {
  celulaPequena: 1,
  montanteSobreposto: 2,
  sobraFundida: 3,
  posicaoFora: 4,
  profundidadeMenorQuePerfil: 5,
  arcoNaoSuportado: 6,
} as const;

/** Código de um enum, ou erro claro com o nome do campo (o contrato não aceita valor fora do domínio). */
export function codigoCortina<T extends Record<string, number>>(tabela: T, chave: string, o_que: string): number {
  const v = tabela[chave];
  if (v === undefined) throw new Error(`kernelCortina: ${o_que} "${chave}" não existe no contrato`);
  return v;
}
