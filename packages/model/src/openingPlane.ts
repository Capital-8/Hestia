import type { Opening, OpeningPlane } from './openingTypes.ts';

export const isOpeningPlane = (v: unknown): v is OpeningPlane => v === 'vertical' || v === 'inclinado';

/**
 * Plano efetivo do vão (F2.8, revisto em P1): o declarado, ou 'inclinado' para porta e janela. Só tem efeito em parede
 * com tilt ≠ 0 (parede vertical: o sólido, o corte e a esquadria são idênticos nos dois modos); em arco o modo inclinado
 * só vale dentro de w² ≤ 0,4·R (fora, o motor usa o vertical e avisa `aberturaPlanoVerticalNoArco`).
 */
export const openingPlaneOf = (o: Pick<Opening, 'kind' | 'plano'>): OpeningPlane => o.plano ?? 'inclinado';
