import { add, dist, dot, mul, sub, type Vec2 } from '@hestia/geom';
import {
  dimRefAt,
  gridOf,
  isElementRef,
  isOpening,
  isWallDimRef,
  projectGrids,
  resolveDimEnd,
  type DimensionElementRef,
  type Id,
  type Project,
  type WallDimRef,
} from '@hestia/model';
import type { DimContext } from './types.ts';

/** Alvo personalizado de uma ponta de cota temporária (arrastado para outro elemento ou eixo/grade). */
export type DimCustomTarget =
  | { kind: 'element'; ref: DimensionElementRef }
  | { kind: 'grid'; gridId: Id };

/**
 * Resolve a referência (`WallDimRef`) de uma ponta específica da cota temporária:
 * 1) `${dimKey}:${slot}` (troca persistente daquela cota/ponta),
 * 2) `${providerId}:${slot}`,
 * 3) fallbacks legados (ex.: `'wall:wall'`, `'column:axisX'`, `'beam:lateral'`),
 * 4) `defaultRef`.
 */
export function dimOverrideRef(
  ctx: DimContext,
  dimKey: string,
  slot: string,
  fallbacks: readonly string[],
  defaultRef: WallDimRef,
): WallDimRef {
  const providerId = dimKey.split(':')[0] ?? '';
  for (const k of [`${dimKey}:${slot}`, `${providerId}:${slot}`, ...fallbacks]) {
    const v = ctx.overrides[k];
    if (isWallDimRef(v)) return v;
  }
  return defaultRef;
}

/** Alvo personalizado guardado para uma `TempDim` (`customTargets[dimKey]`), se houver. */
export function customTargetOf(ctx: DimContext, dimKey: string): DimCustomTarget | null {
  return ctx.customTargets?.[dimKey] ?? null;
}

function closestOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return a;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

function projectOnLine(p: Vec2, a: Vec2, b: Vec2): Vec2 | null {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-6) return null;
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  return add(a, mul(u, dot(sub(p, a), u)));
}

/**
 * Encontra a feição de elemento ou grade/eixo reto mais próxima de `point` (dentro de `tol`), ignorando `excludeIds`.
 */
export function hitCustomDimTarget(
  project: Project,
  levelId: Id,
  point: Vec2,
  tol: number,
  excludeIds: readonly Id[] = [],
): { target: DimCustomTarget; point: Vec2 } | null {
  const skip = new Set(excludeIds);
  const elements: Project['elements'] = {};
  for (const [id, el] of Object.entries(project.elements)) {
    if (skip.has(id)) continue;
    if (isOpening(el) && skip.has(el.hostId)) continue;
    elements[id] = el;
  }
  const filtered: Project = { ...project, elements };
  const elHit = dimRefAt(filtered, levelId, point, tol);
  let best: { target: DimCustomTarget; point: Vec2; dist: number } | null =
    elHit && isElementRef(elHit.ref)
      ? { target: { kind: 'element', ref: elHit.ref }, point: elHit.point, dist: dist(elHit.point, point) }
      : null;

  for (const g of projectGrids(project)) {
    if (skip.has(g.id) || g.sag !== 0 || g.points.length < 2) continue;
    const pt = closestOnSegment(point, g.points[0]!, g.points[g.points.length - 1]!);
    const d = dist(pt, point);
    if (d <= tol && (!best || d < best.dist - 1e-9)) {
      best = { target: { kind: 'grid', gridId: g.id }, point: pt, dist: d };
    }
  }
  return best ? { target: best.target, point: best.point } : null;
}

/** Resolve o ponto alvo de `target` ao longo da linha de medição passando por `anchor` na direção unitária `dir`. */
export function applyCustomTargetToGap(
  project: Project,
  target: DimCustomTarget,
  anchor: Vec2,
  dir: Vec2,
): { b: Vec2; signedDelta: number; distance: number } | null {
  let targetPt: Vec2 | null = null;
  if (target.kind === 'grid') {
    const g = gridOf(project, target.gridId);
    if (!g || g.sag !== 0 || g.points.length < 2) return null;
    targetPt = projectOnLine(anchor, g.points[0]!, g.points[g.points.length - 1]!);
  } else {
    if (!project.elements[target.ref.elementId]) return null;
    targetPt = resolveDimEnd(project, target.ref, anchor);
  }
  if (!targetPt) return null;
  const signedDelta = dot(sub(targetPt, anchor), dir);
  if (Math.abs(signedDelta) <= 1e-6) return null;
  return { b: add(anchor, mul(dir, signedDelta)), signedDelta, distance: Math.abs(signedDelta) };
}

/** Translação do elemento hospedeiro ao editar uma cota apontada para alvo personalizado. */
export function customTargetTranslation(dir: Vec2, signedDelta: number, newValue: number): Vec2 {
  const side = signedDelta >= 0 ? 1 : -1;
  return mul(dir, signedDelta - side * newValue);
}
