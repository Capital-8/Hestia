import type { MultiPolygon } from '@hestia/geom';
import type { Id, Project } from '@hestia/model';
import type { OpeningGeometry, ResolvedWall } from '@hestia/engine';
import type { PlanTheme, StrokeOp } from './types.ts';
import type { PlanView } from './view.ts';

/**
 * Parede inclinada na planta (F2.5): a hachura já vem deslocada por d(zCorte) em `layers[].cut`; aqui saem a projeção da
 * base (abaixo do corte, linha clara) e a do topo (acima do corte, tracejada). Só paredes cortadas e visíveis com `tiltPlan`.
 */
export function tiltProjectionStrokes(walls: Record<Id, ResolvedWall>, view: PlanView | null | undefined, hidden: ReadonlySet<Id> | undefined, theme: PlanTheme, proj: Partial<StrokeOp>): StrokeOp[] {
  const out: StrokeOp[] = [];
  const rings = (m: MultiPolygon) => m.flatMap((p) => p);
  for (const [id, rw] of Object.entries(walls)) {
    if (!rw.tiltPlan || hidden?.has(id) || (view && view.cls.get(id) !== 'cut')) continue;
    for (const pts of rings(rw.tiltPlan.base)) out.push({ ...proj, pts, closed: true, color: theme.inkSoft, alpha: 0.8 } as StrokeOp);
    for (const pts of rings(rw.tiltPlan.top)) out.push({ ...proj, pts, closed: true, color: theme.inkSoft, alpha: 0.8, dash: [6, 3] } as StrokeOp);
  }
  return out;
}

/**
 * Parede inclinada (C3): a planta corta a parede na cota `zRel` (relativa à base), onde o eixo saiu de z·tanθ ao longo de
 * n; o símbolo da abertura acompanha o vão. Parede vertical: a mesma geometria.
 */
export function simboloNaCotaDoCorte(p: Project, g: OpeningGeometry, zRel: number): OpeningGeometry {
  const host = p.elements[g.hostId];
  const tilt = host && host.kind === 'wall' ? host.tilt : undefined;
  if (!tilt) return g;
  const d = zRel * Math.tan((tilt * Math.PI) / 180);
  return { ...g, center: { x: g.center.x + g.n.x * d, y: g.center.y + g.n.y * d } };
}
