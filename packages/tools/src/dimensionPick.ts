import type { Vec2 } from '@hestia/geom';
import type { DimensionElementRef, DimensionRef, WallLineHit } from '@hestia/model';

type AnyRef = DimensionRef | DimensionElementRef;
export type DimMode = 'aligned' | 'horizontal' | 'vertical';

/** Candidatos de referência de uma ponta: pontos de feição, linhas de parede e (modo parede inteira) uma ref forçada. */
export interface RefCands {
  forced?: AnyRef;
  points: Array<{ ref: DimensionElementRef; point: Vec2 }>;
  lines: WallLineHit[];
}

export const NO_CANDS: RefCands = { points: [], lines: [] };
/** Raio (px) em que o cursor "pega" a face/eixo de uma parede sem precisar de um snap de ponto. */
export const HOVER_PX = 8;
/** Snaps de ponto que valem mais que a linha sob o cursor. */
export const STRONG_SNAPS = new Set(['endpoint', 'face', 'core', 'midpoint', 'intersection', 'center']);
export const LINE_RANK: Record<string, number> = { 'face-hi': 0, 'face-lo': 0, axis: 1, 'core-hi': 2, 'core-lo': 2 };
/** Uma linha só vale como referência de uma cota horizontal/vertical se for perpendicular à direção de medida. */
const PERP = 0.9999;

const isOpeningRef = (r: DimensionElementRef): boolean => r.feature.startsWith('opening');

/**
 * Escolhe a referência de cada ponta (o que o Revit faz ao clicar numa face ou num eixo): esquadria vence; depois a
 * LINHA de parede perpendicular à medida (a cota segue a parede ao movê-la); por fim o ponto de feição. Em cota
 * alinhada, duas linhas paralelas viram medida perpendicular entre elas.
 */
export function chooseRefs(a: RefCands | undefined, b: RefCands | undefined, mode: DimMode): { ra?: AnyRef; rb?: AnyRef } {
  const A = a ?? NO_CANDS;
  const B = b ?? NO_CANDS;
  const pointOf = (c: RefCands): AnyRef | undefined => c.forced ?? c.points[0]?.ref;
  const opening = (c: RefCands): AnyRef | undefined => c.forced ?? c.points.find((x) => isOpeningRef(x.ref))?.ref;
  if (mode === 'aligned') {
    if (!A.forced && !B.forced && !opening(A) && !opening(B)) {
      let best: { x: WallLineHit; y: WallLineHit; d: number } | null = null;
      for (const x of A.lines) for (const y of B.lines) {
        if (Math.abs(x.normal.x * y.normal.y - x.normal.y * y.normal.x) > 1e-6) continue;
        if (x.ref.elementId === y.ref.elementId && x.ref.line === y.ref.line) continue;
        const d = x.distance + y.distance;
        if (!best || d < best.d - 1e-9) best = { x, y, d };
      }
      if (best) return { ra: best.x.ref, rb: best.y.ref };
    }
    return { ...(pointOf(A) ? { ra: pointOf(A) } : {}), ...(pointOf(B) ? { rb: pointOf(B) } : {}) };
  }
  const dir: Vec2 = mode === 'horizontal' ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const pick = (c: RefCands): AnyRef | undefined => {
    const o = opening(c);
    if (o) return o;
    const line = c.lines.find((l) => Math.abs(l.normal.x * dir.x + l.normal.y * dir.y) >= PERP);
    return line ? line.ref : pointOf(c);
  };
  const ra = pick(A);
  const rb = pick(B);
  return { ...(ra ? { ra } : {}), ...(rb ? { rb } : {}) };
}

