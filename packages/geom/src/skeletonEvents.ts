import { cross, dot, mul, sub } from './vec.ts';
import { type Sim } from './skeletonCore.ts';

/** Tolerância temporal (m/velocidade) para eventos de colisão quase simultâneos ao instante atual. */
const EPS_T = 1e-6;

/** Enfileira o encolhimento da aresta entre `a` e `b` se ela encolhe a partir de `now`. */
export function queueShrink(sim: Sim, a: number, b: number, now: number): void {
  const ca = sim.corners[a]!;
  const cb = sim.corners[b]!;
  const d = sim.edges[ca.right]!.dir;
  const p0a = sub(ca.p, mul(ca.v, ca.t));
  const p0b = sub(cb.p, mul(cb.v, cb.t));
  const c = dot(sub(p0b, p0a), d);
  const k = dot(sub(cb.v, ca.v), d);
  const together = Math.abs(c + k * now) <= sim.eps && k < 1e-9;
  const t = together ? now : Math.max(-c / k, now);
  if ((together || k < -1e-12) && Number.isFinite(t)) {
    sim.queue.push({ t, kind: 'shrink', a, b });
  }
}

/** Enfileira colisões futuras de um vértice reflexo `c` contra todas as demais arestas. */
export function queueSplits(sim: Sim, c: number, now: number): void {
  const corner = sim.corners[c]!;
  if (corner.stuck) return;
  const dl = sim.edges[corner.left]!.dir;
  const dr = sim.edges[corner.right]!.dir;
  if (cross(dl, dr) >= -1e-12) return;
  const p0 = sub(corner.p, mul(corner.v, corner.t));
  for (let f = 0; f < sim.edges.length; f++) {
    if (f === corner.left || f === corner.right) continue;
    const e = sim.edges[f]!;
    const k = dot(corner.v, e.n) - e.speed;
    if (k >= -1e-12) continue;
    const t = -dot(sub(p0, e.a), e.n) / k;
    if (Number.isFinite(t) && t >= now - EPS_T) {
      sim.queue.push({ t: Math.max(t, now), kind: 'split', v: c, f });
    }
  }
}
