import { add, arcFromSagitta, cross, dist, dot, intersectCircleLine, intersectCircles, intersectLines, mul, norm, offsetArc, perp, sub, type Vec2 } from '@hestia/geom';
import { joinStatus, levelFrames, type WallFrame } from '@hestia/engine';
import type { Id, Project } from '@hestia/model';

/** Geometria nova de uma parede da cadeia deslocada. */
export interface ChainWall {
  id: Id;
  a: Vec2;
  b: Vec2;
  sag: number;
}

/** Pontas coincidentes (junção pair de verdade, não canto por zona) contam como ligadas. */
const JOIN_TOL = 1e-4;

type Curve = { kind: 'line'; p: Vec2; d: Vec2 } | { kind: 'circle'; c: Vec2; r: number };

/**
 * Cadeia de paredes ligadas em junção pair (duas paredes no mesmo ponto) a partir de `startId`. Cada parede leva o
 * deslocamento assinado (positivo = esquerda de a→b): o mesmo lado físico, então o sinal inverte quando a vizinha
 * está desenhada em sentido oposto (pontas a-a ou b-b).
 */
export function chainSides(project: Project, levelId: Id, startId: Id, signed: number): Map<Id, number> {
  const frames = levelFrames(project, levelId);
  const sides = new Map<Id, number>([[startId, signed]]);
  const fila: Id[] = [startId];
  while (fila.length) {
    const id = fila.shift()!;
    const f = frames.find((x) => x.wall.id === id);
    if (!f) continue;
    for (const end of ['a', 'b'] as const) {
      const st = joinStatus(frames, id, end);
      if (st.kind !== 'pair') continue;
      const q = st.partners[0]!;
      const other = frames.find((x) => x.wall.id === q.wallId);
      if (!other || sides.has(q.wallId)) continue;
      if (dist(end === 'a' ? f.a : f.b, q.end === 'a' ? other.a : other.b) > JOIN_TOL) continue;
      sides.set(q.wallId, end === q.end ? -(sides.get(id)!) : sides.get(id)!);
      fila.push(q.wallId);
    }
  }
  return sides;
}

const curveOf = (a: Vec2, b: Vec2, sag: number): Curve => {
  const arc = arcFromSagitta(a, b, sag);
  return arc ? { kind: 'circle', c: arc.center, r: arc.radius } : { kind: 'line', p: a, d: norm(sub(b, a)) };
};

function intersectCurves(x: Curve, y: Curve): Vec2[] {
  if (x.kind === 'line' && y.kind === 'line') {
    const r = intersectLines(x.p, x.d, y.p, y.d);
    return r ? [r.point] : [];
  }
  if (x.kind === 'circle' && y.kind === 'circle') return intersectCircles(x.c, x.r, y.c, y.r);
  return x.kind === 'circle' && y.kind === 'line' ? intersectCircleLine(x.c, x.r, y.p, y.d) : intersectCircleLine((y as { c: Vec2 }).c, (y as { r: number }).r, (x as { p: Vec2 }).p, (x as { d: Vec2 }).d);
}

/** Flecha (com sinal, + = esquerda de a→b) do arco de centro `c` e raio `r` entre as novas pontas. */
function sagOf(c: Vec2, r: number, a: Vec2, b: Vec2, sgn: number): number {
  const n = perp(norm(sub(b, a)));
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return dot(sub(c, m), n) + sgn * r;
}

/**
 * Desloca toda a cadeia pelo mesmo lado e recalcula os cantos (interseção das curvas deslocadas; em junção tangente,
 * como nos arcos do círculo e da elipse, a ponta deslocada de cada lado já coincide). Devolve null se algum arco colapsa.
 */
export function offsetChain(project: Project, levelId: Id, sides: ReadonlyMap<Id, number>): ChainWall[] | null {
  const frames = levelFrames(project, levelId);
  const byId = new Map<Id, WallFrame>(frames.map((f) => [f.wall.id, f]));
  const out = new Map<Id, ChainWall>();
  for (const [id, s] of sides) {
    const f = byId.get(id);
    if (!f) return null;
    if (f.arc) {
      const o = offsetArc(f.a, f.b, f.wall.sag, s);
      if (!o) return null;
      out.set(id, { id, ...o });
    } else {
      const n = perp(norm(sub(f.b, f.a)));
      out.set(id, { id, a: add(f.a, mul(n, s)), b: add(f.b, mul(n, s)), sag: 0 });
    }
  }
  const feito = new Set<string>();
  for (const [id] of sides) {
    const f = byId.get(id)!;
    for (const end of ['a', 'b'] as const) {
      if (feito.has(`${id}${end}`)) continue;
      const st = joinStatus(frames, id, end);
      if (st.kind !== 'pair' || !sides.has(st.partners[0]!.wallId)) continue;
      const q = st.partners[0]!;
      const g = byId.get(q.wallId)!;
      if (dist(end === 'a' ? f.a : f.b, q.end === 'a' ? g.a : g.b) > JOIN_TOL) continue;
      feito.add(`${id}${end}`);
      feito.add(`${q.wallId}${q.end}`);
      const w = out.get(id)!;
      const v = out.get(q.wallId)!;
      const pw = end === 'a' ? w.a : w.b;
      const pv = q.end === 'a' ? v.a : v.b;
      const media = { x: (pw.x + pv.x) / 2, y: (pw.y + pv.y) / 2 };
      const tw = f.arc ? tangent(f, end) : f.u;
      const tv = g.arc ? tangent(g, q.end) : g.u;
      let j = media;
      if (Math.abs(cross(tw, tv)) > 1e-3) {
        const cand = intersectCurves(curveOf(w.a, w.b, w.sag), curveOf(v.a, v.b, v.sag));
        cand.sort((p, q2) => dist(p, media) - dist(q2, media));
        if (cand[0]) j = cand[0];
      }
      if (end === 'a') w.a = j; else w.b = j;
      if (q.end === 'a') v.a = j; else v.b = j;
    }
  }
  // Arcos: mesmo centro e raio do deslocamento concêntrico, com as pontas novas.
  for (const [id] of sides) {
    const f = byId.get(id)!;
    const w = out.get(id)!;
    if (!f.arc) continue;
    const o = offsetArc(f.a, f.b, f.wall.sag, sides.get(id)!)!;
    const c = arcFromSagitta(o.a, o.b, o.sag);
    if (!c) return null;
    w.sag = sagOf(c.center, c.radius, w.a, w.b, Math.sign(f.wall.sag));
    if (dist(w.a, w.b) < 1e-3) return null;
  }
  return [...out.values()];
}

/** Direção da tangente na ponta do arco (perpendicular ao raio; o sentido não importa para o teste de tangência). */
function tangent(f: WallFrame, end: 'a' | 'b'): Vec2 {
  return perp(norm(sub(end === 'a' ? f.a : f.b, f.arc!.center)));
}
