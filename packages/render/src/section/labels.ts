import { paperMmToPx } from '@hestia/model';
import type { LabelOp } from '../plan/types.ts';
import { resolverRotulos } from '../plan/zoomOps.ts';

/**
 * Rótulos da vista de corte/elevação no zoom corrente: as medidas de papel (mm × escala da vista) viram `fontPx`,
 * `widthPx` e deslocamento em pixels, exatamente como o `PlanFrame` faz na planta.
 *
 * Sem esta passagem, o rótulo da anotação chega à camada HTML sem `fontPx` e cai no estilo de "chip" da interface
 * (`dim-label`): o valor da cota saía dentro de uma caixa, com fonte e posição diferentes das da planta.
 */
export function sectionLabelsAt(labels: readonly LabelOp[], zoom: number): LabelOp[] {
  return resolverRotulos(labels, zoom);
}

/** O rótulo já está resolvido para pixels (tem `fontPx`)? Usado pelo diagnóstico e pelos testes da vista. */
export const isResolvedLabel = (l: LabelOp): boolean => l.fontPx !== undefined;

/** Corpo da fonte em px de um rótulo de papel num zoom, para os testes da vista. */
export const labelFontPxAt = (fontMm: number, scale: number, zoom: number): number => paperMmToPx(fontMm, zoom, scale);
