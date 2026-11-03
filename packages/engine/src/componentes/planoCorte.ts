import type { LinhaLista, VeioNaLista } from './listaPecas.ts';

/*
 * Plano de corte (arranjo das peças nas chapas). FICHA E6-corte: implementar as funções abaixo. Testes em `planoCorte.test.ts`
 * (invariantes: nada fora da chapa, nada sobreposto, kerf respeitado, veio respeitado, cada peça uma vez). Puras, numéricas e
 * DETERMINÍSTICAS (o Rust vai reproduzir posições idênticas a 1 µm: use sempre o mesmo desempate). Medidas em milímetros.
 * Sistema da chapa: origem no canto inferior esquerdo, X ao longo de `largura`, Y ao longo de `altura`; a área útil é
 * `[refilo, largura − refilo] × [refilo, altura − refilo]`. O veio da chapa corre ao longo de X.
 */

export interface PecaParaCorte {
  /** Identificação para a interface (por exemplo o nome da peça e o número da unidade). */
  id: string;
  /** Maior e menor dimensão da peça (mm). */
  comprimento: number;
  largura: number;
  veio: VeioNaLista;
}

export interface ChapaParaCorte {
  largura: number;
  altura: number;
  refilo: number;
  /** A chapa tem veio: peça com veio 'comprimento' fica com o comprimento ao longo de X, com 'largura' fica com a largura ao longo de X. */
  veio: boolean;
  /** Espessura da serra (mm): folga mínima entre duas peças vizinhas. */
  kerf: number;
}

export interface Posicionada {
  /** Índice da peça na lista de entrada. */
  peca: number;
  /** Canto inferior esquerdo e tamanho ocupado na chapa (mm). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** `true` quando o comprimento da peça ficou ao longo de Y (peça girada 90°). */
  girada: boolean;
}

export interface ChapaCortada {
  posicoes: Posicionada[];
  /** Soma das áreas das peças desta chapa (mm2). */
  areaUsada: number;
}

export interface PlanoCorte {
  chapas: ChapaCortada[];
  /** Peças que não cabem nem na chapa vazia (índices na lista de entrada, em ordem crescente). */
  naoCouberam: number[];
  /** Soma das áreas das peças colocadas (mm2) e `n × (área útil)` (mm2). */
  areaPecas: number;
  areaChapas: number;
  /** `areaPecas / areaChapas`; 0 quando não há chapa. */
  aproveitamento: number;
}

/**
 * Orientações permitidas de uma peça: sem veio na chapa (`chapa.veio` falso), ou peça com veio 'livre' ou `null`: as duas
 * (comprimento ao longo de X, e girada). Com veio na chapa: 'comprimento' só com o comprimento ao longo de X; 'largura' só girada
 * (comprimento ao longo de Y). Devolve as orientações como `girada: boolean`, a não girada primeiro.
 */
export function orientacoesPermitidas(p: PecaParaCorte, chapa: ChapaParaCorte): boolean[] {
  void p;
  void chapa;
  throw new Error('não implementado: ficha E6-corte');
}

/**
 * Plano de corte guilhotina com kerf. Método (siga-o para a saída ser idêntica no Rust): ordene os índices por área decrescente (empate: comprimento
 * decrescente, depois índice crescente). Cada chapa nova começa com UM retângulo livre (a área útil). Para cada peça, na ordem, procure, nas chapas já
 * abertas (da primeira à última) e dentro de cada uma nos retângulos livres (na ordem em que foram criados), a melhor posição pelo critério "melhor
 * lado curto": para cada orientação permitida em que a peça cabe no retângulo, o sobrante do lado curto `min(Wlivre − w, Hlivre − h)`; vence o menor
 * sobrante, depois o menor sobrante do lado longo, depois a orientação não girada, depois o retângulo mais antigo. Se nenhuma chapa aberta serve, abra
 * uma nova; se a peça não cabe nem na chapa nova, vai para `naoCouberam`. A peça é colocada no canto inferior esquerdo do retângulo livre escolhido e
 * este é dividido em dois retângulos guilhotinados, descontando o kerf: DIREITA = `(x + w + kerf, y, Wlivre − w − kerf, h)` (se a largura sobrante for
 * maior que 0) e ACIMA = `(x, y + h + kerf, Wlivre, Hlivre − h − kerf)` (se a altura sobrante for maior que 0); a divisão é sempre nesta ordem
 * (primeiro DIREITA, depois ACIMA) e retângulos de largura ou altura ≤ 0 não são criados. O resultado lista as chapas na ordem de abertura e as posições na ordem de colocação.
 */
export function planoDeCorte(pecas: readonly PecaParaCorte[], chapa: ChapaParaCorte): PlanoCorte {
  void pecas;
  void chapa;
  throw new Error('não implementado: ficha E6-corte');
}

/** Uma `PecaParaCorte` por UNIDADE de cada linha (`quantidade` vezes), com `id` = `<nome> #<k>` (k de 1 a quantidade), na ordem das linhas. */
export function pecasParaCorte(linhas: readonly LinhaLista[]): PecaParaCorte[] {
  void linhas;
  throw new Error('não implementado: ficha E6-corte');
}
