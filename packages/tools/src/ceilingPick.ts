import { dist, pointInMulti, type Vec2 } from '@hestia/geom';
import { ceilingOutline, resolveCeilings, roomsById, type RoomsById } from '@hestia/engine';
import { isCeiling, viewRangeOf, type Id, type Project } from '@hestia/model';

/**
 * Forro sob o cursor, só na planta de forro (direção 'up'): dentro da geometria do forro (contorno menos furos) ou sobre a
 * borda do contorno efetivo (o do ambiente, quando acompanha). O mais recente vence. Na planta baixa forro não é desenhado,
 * então não é clicável (decisão 0021).
 */
export function pickCeilingAt(p: Project, levelId: Id, at: Vec2, mpp: number): Id | null {
  if (viewRangeOf(p, levelId).direction !== 'up') return null;
  const tol = 4 * mpp;
  const list = resolveCeilings(p, levelId);
  const rooms = roomsById(p, levelId);
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i]!;
    if (pointInMulti(at, c.polygon)) return c.ceilingId;
    const e = p.elements[c.ceilingId];
    if (isCeiling(e) && ceilingOutline(p, e, rooms).boundary.some((a, k, r) => distToSeg(at, a, r[(k + 1) % r.length]!) <= tol)) return c.ceilingId;
  }
  return null;
}

/** Alça de um forro: vértice (índice do contorno efetivo) ou meio de uma aresta (aresta i vai de i a i+1). */
export interface CeilingGrip {
  ceilingId: Id;
  kind: 'vertex' | 'edge';
  index: number;
  at: Vec2;
}

/**
 * Alça sob o cursor entre os forros selecionados, sobre o contorno efetivo (o do ambiente quando o forro acompanha, para a
 * alça aparecer onde o forro está). Vértices têm prioridade sobre o meio das arestas.
 */
export function ceilingGripAt(p: Project, ids: Id[], at: Vec2, mpp: number): CeilingGrip | null {
  const tol = 9 * mpp;
  const rooms = new Map<Id, RoomsById>();
  const rings = ids.map((id) => p.elements[id]).filter(isCeiling).map((c) => {
    if (!rooms.has(c.levelId)) rooms.set(c.levelId, roomsById(p, c.levelId));
    return { id: c.id, r: ceilingOutline(p, c, rooms.get(c.levelId)).boundary };
  });
  for (const { id, r } of rings) {
    const i = r.findIndex((q) => dist(q, at) <= tol);
    if (i >= 0) return { ceilingId: id, kind: 'vertex', index: i, at: r[i]! };
  }
  for (const { id, r } of rings) {
    for (let i = 0; i < r.length; i++) {
      const m = { x: (r[i]!.x + r[(i + 1) % r.length]!.x) / 2, y: (r[i]!.y + r[(i + 1) % r.length]!.y) / 2 };
      if (dist(m, at) <= tol) return { ceilingId: id, kind: 'edge', index: i, at: m };
    }
  }
  return null;
}

function distToSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
