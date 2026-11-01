import { add, dot, mul, type Vec2 } from '@hestia/geom';
import { openingsOfWall, resolveDimRef, wallDimFrame, wallsOnLevel, type DimensionElementRef, type DimensionRef, type Project, type Wall } from '@hestia/model';
import type { ToolOptions } from './types.ts';

type AnyRef = DimensionRef | DimensionElementRef;

/**
 * Pontos de referência ao longo da parede, em ordem e sem repetição (esquadrias e paredes cruzadas ganham da ponta):
 * o que o modo "parede inteira" da cota usa para montar a sequência.
 */
export function wallChainPoints(project: Project, w: Wall, o: ToolOptions): Array<{ t: number; point: Vec2; ref: AnyRef }> {
  const fr = wallDimFrame(project, w);
  if (!fr) return [];
  const want = o.dimensionRef ?? 'face';
  const lines = want === 'axis' ? (['axis'] as const) : want === 'core' ? (['core-hi', 'core-lo'] as const) : (['face-hi', 'face-lo'] as const);
  const out: Array<{ t: number; point: Vec2; ref: AnyRef; pr: number }> = [];
  const onAxis = (t: number): Vec2 => add(fr.a, mul(fr.u, t));
  const ends: DimensionElementRef[] = want === 'axis'
    ? [{ elementId: w.id, feature: 'wall-axis-a' }, { elementId: w.id, feature: 'wall-axis-b' }]
    : [{ elementId: w.id, feature: 'wall-face-hi', index: 0 }, { elementId: w.id, feature: 'wall-face-hi', index: 1 }];
  out.push({ t: 0, point: onAxis(0), ref: ends[0]!, pr: 2 }, { t: fr.length, point: onAxis(fr.length), ref: ends[1]!, pr: 2 });
  for (const op of openingsOfWall(project, w.id)) {
    const feats = (o.dimensionOpenings ?? 'widths') === 'centers' ? (['opening-center'] as const) : (['opening-edge-a', 'opening-edge-b'] as const);
    for (const feature of feats) {
      const ref: DimensionElementRef = { elementId: op.id, feature };
      const pt = resolveDimRef(project, ref);
      if (pt) { const t = dot({ x: pt.x - fr.a.x, y: pt.y - fr.a.y }, fr.u); out.push({ t, point: onAxis(t), ref, pr: 0 }); }
    }
  }
  const half = (fr.sHi - fr.sLo) / 2 + 0.02;
  for (const c of wallsOnLevel(project, w.levelId)) {
    if (c.id === w.id || c.sag !== 0) continue;
    const fc = wallDimFrame(project, c);
    if (!fc) continue;
    const den = fr.u.x * fc.u.y - fr.u.y * fc.u.x;
    if (Math.abs(den) < 0.2) continue;
    const sAxis = ((fc.a.x - fr.a.x) * fr.u.y - (fc.a.y - fr.a.y) * fr.u.x) / den;
    if (sAxis < -half || sAxis > fc.length + half) continue;
    for (const line of lines) {
      const sc = line === 'axis' ? 0 : line === 'face-hi' || line === 'core-hi' ? fc.sHi : fc.sLo;
      const base = { x: fc.a.x + fc.n.x * sc - fr.a.x, y: fc.a.y + fc.n.y * sc - fr.a.y };
      const t = (base.x * fc.u.y - base.y * fc.u.x) / den;
      if (t < -0.001 || t > fr.length + 0.001) continue;
      const pt = onAxis(t);
      const along = Math.min(fc.length, Math.max(0, dot({ x: pt.x - fc.a.x, y: pt.y - fc.a.y }, fc.u)));
      out.push({ t, point: pt, ref: { elementId: c.id, feature: 'wall-line', line, along }, pr: 1 });
    }
  }
  out.sort((x, y) => x.t - y.t || x.pr - y.pr);
  const merged: typeof out = [];
  for (const q of out) {
    const prev = merged[merged.length - 1];
    if (prev && Math.abs(q.t - prev.t) < 0.002) { if (q.pr < prev.pr) merged[merged.length - 1] = q; } else merged.push(q);
  }
  return merged;
}
