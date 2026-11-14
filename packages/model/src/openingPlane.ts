import type { Opening, OpeningPlane } from './openingTypes.ts';

export const isOpeningPlane = (v: unknown): v is OpeningPlane => v === 'vertical' || v === 'inclinado';

/** Plano efetivo do vão (F2.8): o declarado, ou o padrão do tipo (janela inclinado, porta vertical). */
export const openingPlaneOf = (o: Pick<Opening, 'kind' | 'plano'>): OpeningPlane => o.plano ?? (o.kind === 'window' ? 'inclinado' : 'vertical');
