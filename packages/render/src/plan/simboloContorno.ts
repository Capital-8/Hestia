import { openingPlanSymbolPaths, rotaDoVao, type OpeningGeometry } from '@hestia/engine';
import type { Project } from '@hestia/model';
import { espessuraVezes } from './espessura.ts';
import { espessuraDeCorte, espessuraDeProjecao, paintOps, type PlanPaint } from './style.ts';
import type { ViewClass } from '@hestia/engine';
import { pesoEmClasse } from './symbols.ts';
import type { Espessura, PlanTheme, StrokeOp } from './types.ts';

/**
 * Símbolo de planta do vão livre com forma (troca atômica do furo, docs/estudo-esquadrias/26): os traços do caixilho abrem pela
 * largura REAL do contorno na cota de corte (`openingPlanSymbolPaths`/`cutHalfWidth`). `null` quando o vão não vai por contorno ou
 * tem folha (esquadria com folha segue o símbolo do modelo, que assume caixa retangular: fase 3); o chamador usa o de sempre.
 */
export function simboloDoVaoComContorno(p: Project, g: OpeningGeometry, baseZ: number, cls: ViewClass | undefined, cutAbs: number | undefined, theme: PlanTheme, pt: PlanPaint, fillBase: string): StrokeOp[] | null {
  const host = p.elements[g.hostId];
  const tilt = host && host.kind === 'wall' ? host.tilt : undefined;
  if (!g.forma || g.leaves !== 0 || rotaDoVao(g, { tilt }).via !== 'contorno') return null;
  const emCorte = cls === undefined || cls === 'cut';
  const cutZ = emCorte ? (cutAbs ?? baseZ + 1.2) : baseZ + g.sill + g.forma.height / 2; // fora do corte: a meia altura do vão
  const largura: Espessura = emCorte ? espessuraDeCorte(pt) : espessuraDeProjecao(pt);
  const soft = cls === 'projection-below' || cls === 'beyond';
  const strokes = openingPlanSymbolPaths(
    { kind: g.kind, center: g.center, u: g.u, n: g.n, width: g.forma.width, thickness: g.thickness, sHi: g.sHi, sLo: g.sLo, leaves: g.leaves, plan: g.plan, flipHand: g.flipHand, flipFacing: g.flipFacing },
    g.forma,
    { along: g.offset, sill: baseZ + g.sill },
    cutZ,
  );
  const ops = strokes.map((s): StrokeOp => ({ pts: s.pts, closed: s.closed, ...espessuraVezes(largura, pesoEmClasse(s.weight)), color: soft || s.tone === 'soft' ? theme.inkSoft : theme.ink, alpha: 1, ...(s.dash ? { dash: s.dash } : {}), role: 'contorno' }));
  return paintOps({ fills: [], strokes: ops, labels: [] }, pt, fillBase).strokes;
}