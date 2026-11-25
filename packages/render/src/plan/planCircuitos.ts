import { pegadaDoComponente } from '@hestia/engine';
import { coresPorComponente, type Project } from '@hestia/model';
import type { FillOp, StrokeOp } from './types.ts';

/*
 * Destaque por circuito elétrico na planta (ficha C4): cada componente que pertence a um circuito ganha um véu e um contorno na
 * cor do circuito, por cima do desenho normal. Sem circuitos no projeto não gera nada (custo zero para os demais projetos).
 */

/** Véu e contorno na cor do circuito para os componentes visíveis do nível. */
export function destaquesDeCircuitos(p: Project, levelId: string, hidden: ReadonlySet<string> | undefined): { fills: FillOp[]; strokes: StrokeOp[] } {
  const fills: FillOp[] = [];
  const strokes: StrokeOp[] = [];
  if (!p.circuitosEletricos) return { fills, strokes };
  for (const [id, cor] of coresPorComponente(p)) {
    const e = p.elements[id];
    if (e?.kind !== 'component' || e.levelId !== levelId || hidden?.has(id)) continue;
    const pegada = pegadaDoComponente(p, e);
    if (pegada.length === 0) continue;
    fills.push({ polygons: pegada, color: cor, alpha: 0.35 });
    for (const poly of pegada) for (const ring of poly) strokes.push({ pts: ring, closed: true, widthPx: 2.5, color: cor, alpha: 1 });
  }
  return { fills, strokes };
}
