import { isCurtainType, wallThicknessOf, type Id, type Wall } from '@hestia/model';
import type { Body } from './geometry.ts';
import type { Ctx } from './mapping.ts';

/**
 * Porta/janela sem `IfcRelVoidsElement`/`IfcRelFillsElement` (comum em IFC de terceiros: a peça só está posicionada
 * dentro da parede). A parede hospedeira é deduzida pela geometria: a caixa da peça precisa estar dentro da espessura
 * da parede, paralela a ela, entre as pontas e dentro da altura. Sem exatamente uma parede plausível, devolve null e a
 * peça fica genérica.
 */

/** Folgas da dedução (m). */
const SIDE = 0.1;
const ENDS = 0.05;
const VERT = 0.15;

const thicknessOf = (ctx: Ctx, w: Wall): number => {
  const type = ctx.p.wallTypes[w.typeId];
  return type ? wallThicknessOf(type) : 0;
};

export function hostByGeometry(ctx: Ctx, body: Body): Id | null {
  const v = body.tris;
  if (v.length < 9) return null;
  let found: Id | null = null;
  let best = Infinity;
  let ties = 0;
  for (const [, id] of ctx.walls) {
    const w = ctx.p.elements[id];
    if (!w || w.kind !== 'wall' || w.sag || isCurtainType(ctx.p.wallTypes[w.typeId])) continue;
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    if (len < 0.1) continue;
    const dx = (w.b.x - w.a.x) / len;
    const dy = (w.b.y - w.a.y) / len;
    const th = thicknessOf(ctx, w);
    const base = (ctx.p.levels.find((l) => l.id === w.levelId)?.elevation ?? 0) + w.baseOffset;
    let t0 = Infinity;
    let t1 = -Infinity;
    let n0 = Infinity;
    let n1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let i = 0; i + 2 < v.length; i += 3) {
      const x = v[i]! - w.a.x;
      const y = v[i + 1]! - w.a.y;
      const t = x * dx + y * dy;
      const n = -x * dy + y * dx;
      t0 = Math.min(t0, t);
      t1 = Math.max(t1, t);
      n0 = Math.min(n0, n);
      n1 = Math.max(n1, n);
      z0 = Math.min(z0, v[i + 2]!);
      z1 = Math.max(z1, v[i + 2]!);
    }
    // Dentro da espessura (centro da linha de base ± meia espessura), com a folga de peças que sobressaem do batente.
    const center = (n0 + n1) / 2;
    if (n1 - n0 > th + 2 * SIDE || Math.abs(center) > th / 2 + SIDE) continue;
    if (t1 - t0 < 0.3 || t0 < -ENDS || t1 > len + ENDS) continue;
    if (z0 < base - VERT || z1 > base + w.height + VERT || z1 - z0 < 0.3) continue;
    const score = Math.abs(center);
    if (Math.abs(score - best) < 0.02) ties++;
    else if (score < best) {
      best = score;
      found = id;
      ties = 0;
    }
  }
  // Duas paredes igualmente plausíveis (sobrepostas): não adivinha.
  return ties > 0 ? null : found;
}
