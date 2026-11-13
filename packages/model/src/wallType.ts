import type { Layer, WallType } from './types.ts';
import type { CurtainSpec } from './wallCurtainTypes.ts';

export const totalThickness = (t: { layers: readonly Layer[] }): number => t.layers.reduce((s, l) => s + l.thickness, 0);

/** Tipo de parede cortina válido: `family === 'curtain'` com o sistema preenchido (decisão 0056, §4.1). */
export const isCurtainType = (t: WallType | undefined): t is WallType & { family: 'curtain'; curtain: CurtainSpec } =>
  t?.family === 'curtain' && t.curtain !== undefined;

/**
 * Fonte ÚNICA da espessura de uma parede (decisão 0056, §4.1). Cortina: profundidade do sistema, nunca a soma da
 * camada-sombra. Básica: soma das camadas. Pisos, lajes e forros seguem com `totalThickness`.
 */
export function wallThicknessOf(t: WallType): number {
  return isCurtainType(t) ? t.curtain.depth : totalThickness(t);
}

/**
 * Faixa do núcleo: do primeiro ao último layer de estrutura (inclusive). Sem estrutura, o elemento inteiro.
 * Decisão 0002: derivado das funções em vez de marcador editável (o Revit tem marcador explícito).
 *
 * A mesma convenção vale para parede, piso e laje: na parede, a ordem é da face externa para a interna;
 * no piso e na laje, de cima para baixo.
 */
export function coreRange(t: { layers: readonly Layer[] }): { first: number; last: number } {
  let first = -1;
  let last = -1;
  t.layers.forEach((l, i) => {
    if (l.function === 'structure') {
      if (first < 0) first = i;
      last = i;
    }
  });
  if (first < 0) return { first: 0, last: Math.max(0, t.layers.length - 1) };
  return { first, last };
}

export interface LayerSpan {
  index: number;
  layer: Layer;
  /** Distância da face externa até o início da camada (m). */
  from: number;
  /** Distância da face externa até o fim da camada (m). */
  to: number;
}

/** Posição de cada camada medida a partir da face externa. */
export function layerSpans(t: { layers: readonly Layer[] }): LayerSpan[] {
  let d = 0;
  return t.layers.map((layer, index) => {
    const from = d;
    d += layer.thickness;
    return { index, layer, from, to: d };
  });
}

export function coreSpan(t: { layers: readonly Layer[] }): { from: number; to: number } {
  const spans = layerSpans(t);
  const { first, last } = coreRange(t);
  return { from: spans[first]?.from ?? 0, to: spans[last]?.to ?? totalThickness(t) };
}
