import type { PecaResolvida, UsinagemResolvida } from './pecas.ts';

/*
 * Furação automática de cavilhas entre peças em contato (marcenaria; ADR 0049 §3.3). FICHA E5-furacao: implementar as três funções
 * abaixo. Testes em `furacao.test.ts`. Pura e numérica (metros); geometria que o Rust vai espelhar. A ideia: onde uma peça encosta
 * em outra, gera os furos das duas, alinhados (um na FACE da chapa que recebe, outro na BORDA da chapa que encosta).
 * Só caixas: `contorno` é ignorado e peças vazias não entram. Mapeamento dos eixos do plano de cada peça (ver `pecas.ts`):
 * eixo x → (U, V, T) = (y, z, x); eixo y → (x, z, y); eixo z → (x, y, z), onde T é o eixo da espessura.
 */

export type EixoMundo = 'x' | 'y' | 'z';

export interface Contato {
  /** Peça do lado de MENOR coordenada no eixo do contato, e a do lado de maior (índices na lista de entrada, `baixo` ≠ `cima`). */
  baixo: number;
  cima: number;
  /** Eixo da normal do plano de contato e a coordenada (m) do plano. */
  eixo: EixoMundo;
  plano: number;
  /** Os outros dois eixos, em ordem x < y < z, e a sobreposição [mín, máx] (m) das duas peças em cada um. */
  eixos: [EixoMundo, EixoMundo];
  faixa1: [number, number];
  faixa2: [number, number];
}

/**
 * Contatos entre caixas: para cada par (i < j) de peças NÃO vazias e para cada eixo, em ordem (i, j, x, y, z), há contato quando a face
 * de uma toca a face da outra (`|max_i − min_j| ≤ tol` ou `|max_j − min_i| ≤ tol`) e a sobreposição nos outros dois eixos é MAIOR
 * que `tol` nos dois. Cada par encosta em no máximo um eixo; se mais de um satisfizer, vale o primeiro na ordem x, y, z.
 */
export function detectarContatos(pecas: readonly PecaResolvida[], tol = 1e-6): Contato[] {
  void pecas;
  void tol;
  throw new Error('não implementado: ficha E5-furacao');
}

export interface RegraCavilha {
  /** Diâmetro do furo (m). */
  diametro: number;
  /** Profundidade máxima do furo na FACE da chapa que recebe e na BORDA da chapa que encosta (m). */
  profundidadeFace: number;
  profundidadeBorda: number;
  /** Distância da ponta do contato ao primeiro/último furo (m). */
  margem: number;
  /** Espaçamento máximo entre furos ao longo do contato (m). */
  espacamentoMax: number;
  /** Mínimo de furos por contato (quando couber). */
  minimoPorContato: number;
}

export const REGRA_CAVILHA_PADRAO: RegraCavilha = { diametro: 0.008, profundidadeFace: 0.012, profundidadeBorda: 0.03, margem: 0.05, espacamentoMax: 0.25, minimoPorContato: 2 };

export interface FuracaoGerada {
  /** Índice da peça na lista de entrada. */
  peca: number;
  usinagem: UsinagemResolvida;
}

/**
 * Gera furos de cavilha. Para cada contato (na ordem de `detectarContatos`) só gera se EXATAMENTE uma das peças tem `eixo` igual ao do
 * contato (a "F", que recebe o furo na FACE) e a outra não (a "E", que recebe na BORDA); face com face ou borda com borda não geram nada.
 *  - Linha dos furos: na E, o eixo da espessura (T) é um dos dois eixos do contato; o outro é o eixo AO LONGO da borda. Sejam `[s0, s1]`
 *    a sobreposição ao longo da borda (comprimento `L = s1 − s0`) e `cT` o meio da sobreposição no eixo T. Se a sobreposição em T for
 *    menor que `regra.diametro`, ou `L < 2·margem`, o contato não gera nada.
 *  - Quantidade: `n = max(minimoPorContato, ceil((L − 2·margem) / espacamentoMax) + 1)`; se o espaçamento resultante,
 *    `(L − 2·margem) / (n − 1)`, ficar menor que `2·diametro`, reduza para `n = floor((L − 2·margem) / (2·diametro)) + 1`; se `n` der 1, um
 *    furo só no MEIO (`s0 + L/2`). Posições com n ≥ 2: `s0 + margem + k·(L − 2·margem)/(n − 1)`, k = 0..n−1.
 *  - Profundidades: na F, `min(profundidadeFace, espessuraF − 0.004)`; na E, `min(profundidadeBorda, extensão da E ao longo do eixo do
 *    contato − 0.004)`. Se qualquer uma ficar ≤ 0.004, o contato inteiro não gera nada.
 *  - Face da F: se a F é a peça `cima` (a chapa começa no plano) o furo entra pela face 'a'; se é a `baixo`, pela 'b'. Posição (u, v) = coordenada
 *    no mundo menos a origem da F, nos eixos (U, V) da F.
 *  - Borda da E: os eixos do plano da E são (U_E, V_E). Se o eixo do contato é U_E: E = `cima` → borda 'o', E = `baixo` → 'l'; se é V_E:
 *    E = `cima` → 's', E = `baixo` → 'n'. Na usinagem da borda, `u` = coordenada ao longo da borda menos a origem da E nesse eixo, `v` =
 *    cT menos a origem da E no eixo T (distância da face 'a').
 *  - Cada furo gera DUAS entradas (primeiro a da F, depois a da E): `tipo: 'furo'`, `diametro` = `regra.diametro`, `largura` = `comprimento` = 0,
 *    `id` = `cav<baixo>-<cima>-<k>` (k = posição do furo no contato, de 0), profundidades acima.
 *  - Peças de papel `porta`, `frente_gaveta` e `fundo` NÃO recebem cavilha: contatos que as envolvem são ignorados por esta função (dobradiça, corrediça
 *    e rasgo de fundo são outros assuntos).
 * Não altera `pecas`. Determinística.
 */
export function gerarCavilhas(pecas: readonly PecaResolvida[], regra: RegraCavilha = REGRA_CAVILHA_PADRAO, tol = 1e-6): FuracaoGerada[] {
  void pecas;
  void regra;
  void tol;
  throw new Error('não implementado: ficha E5-furacao');
}

/** Cópia das peças com as usinagens geradas acrescentadas ao fim da lista de cada peça, na ordem de geração. Não altera a entrada. */
export function aplicarFuracao(pecas: readonly PecaResolvida[], gerada: readonly FuracaoGerada[]): PecaResolvida[] {
  void pecas;
  void gerada;
  throw new Error('não implementado: ficha E5-furacao');
}
