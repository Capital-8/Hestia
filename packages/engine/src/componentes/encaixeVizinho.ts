import type { CaixaLocal, Corpo, EncaixeNoVizinho, Guia, Pose } from './encaixeTipos.ts';

/**
 * Cola o móvel no vizinho mais próximo: se a rotação difere da do vizinho por até `anguloMax` (rad, padrão 15°) de um múltiplo de 90°,
 * alinha a rotação; depois encosta a lateral (esquerda ou direita, a que estiver mais perto) na lateral do vizinho com a folga pedida
 * (padrão 0) e alinha a FRENTE (y mínimo) com a do vizinho. Só vale se a distância entre as laterais for ≤ `distanciaMax` (m, padrão 0,10).
 * Considera apenas vizinhos à mesma altura de base (|Δz| ≤ 1 mm) ou que se sobreponham em altura. Sem vizinho ao alcance: null.
 */
export function encaixarNoVizinho(
  _pose: Pose,
  _caixa: CaixaLocal,
  _vizinhos: readonly Corpo[],
  _opcoes: { distanciaMax?: number; anguloMax?: number; folga?: number } = {},
): EncaixeNoVizinho | null {
  throw new Error('não implementado');
}

/**
 * Guias de alinhamento do móvel com os outros: linhas (frente, fundo, esquerda, direita, centro) que coincidem dentro de `tolerancia`
 * (m, padrão 0,01) com a mesma linha de outro móvel de rotação paralela (mesmo múltiplo de 90°). Cada guia vai de uma ponta à outra
 * dos dois móveis (envolve ambos). Ordem determinística: por id do outro e depois pelo tipo na ordem declarada em `Guia.tipo`.
 */
export function guiasDeAlinhamento(_pose: Pose, _caixa: CaixaLocal, _outros: readonly Corpo[], _tolerancia = 0.01): Guia[] {
  throw new Error('não implementado');
}
