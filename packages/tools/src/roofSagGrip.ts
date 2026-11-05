import { dist, type Vec2 } from '@hestia/geom';
import { isRoof, roofEdgeSag, type Id } from '@hestia/model';
import { rawSag, sampleSagRing } from './perimeterRoofArcs.ts';
import { commitRoofPatch } from './roofCheck.ts';
import type { GripHold } from './selectGrips.ts';
import type { PointerInfo, ToolEnv } from './types.ts';

/** Alça do meio de um arco do contorno do telhado: o arco passa a atravessar o cursor (muda `edgeSag` da aresta). */
export interface RoofSagGrip {
  roofId: Id;
  /** Aresta i vai de boundary[i] a boundary[i+1]. */
  index: number;
  at: Vec2;
}

/** Flechas do telhado com a da aresta trocada; null se o telhado sumiu. */
function sagsWith(env: ToolEnv, g: RoofSagGrip, sag: number): { ring: Vec2[]; sags: number[] } | null {
  const r = env.project().elements[g.roofId];
  if (!isRoof(r)) return null;
  return { ring: r.boundary, sags: r.boundary.map((_, i) => (i === g.index ? sag : roofEdgeSag(r, i))) };
}

/**
 * Arrasta o meio do arco: a prévia mostra o contorno com o arco que passa pelo cursor; ao soltar grava a flecha.
 * Flecha maior que metade da corda (mais que um semicírculo) é recusada com aviso, sem alterar nada.
 */
export function roofSagHold(env: ToolEnv, g: RoofSagGrip): GripHold {
  let point: Vec2 = g.at;
  const sagAt = (pt: Vec2): number | null => {
    const r = env.project().elements[g.roofId];
    if (!isRoof(r)) return null;
    const a = r.boundary[g.index]!;
    const b = r.boundary[(g.index + 1) % r.boundary.length]!;
    const s = rawSag(a, pt, b);
    return Math.abs(s) > dist(a, b) / 2 + 1e-9 ? null : s;
  };
  return {
    at: g.at,
    keepsFocus: true,
    drag(p: PointerInfo) {
      point = p.raw;
      const r = env.project().elements[g.roofId];
      const s = sagAt(point);
      if (!isRoof(r) || s === null) return [];
      const next = sagsWith(env, g, s);
      return next ? [{ kind: 'polygon', ring: sampleSagRing(next.ring, next.sags).pts }] : [];
    },
    release() {
      if (dist(point, g.at) <= 1e-6) return;
      const s = sagAt(point);
      if (s === null) {
        env.say('A flecha do arco não pode passar de metade da corda (mais que um semicírculo). Arco não alterado.');
        return;
      }
      const next = sagsWith(env, g, s);
      if (next) commitRoofPatch(env, [g.roofId], { edgeSag: next.sags }, env.lang?.() ?? 'pt');
    },
  };
}
