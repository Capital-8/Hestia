import { dist, dot, mul, sub, type Vec2 } from './vec.ts';
import { SkeletonFail, linkCorners, mkCorner, posAt, pushNode, type Sim } from './skeletonCore.ts';
import { queueShrink, queueSplits } from './skeletonEvents.ts';

function distToSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const u = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
  return dist(p, { x: a.x + ab.x * u, y: a.y + ab.y * u });
}

function emitArc(sim: Sim, alive: Set<number>, c: number, node: number): void {
  const k = sim.corners[c]!;
  if (k.node !== node) {
    sim.arcs.push({ a: k.node, b: node, left: k.left, right: k.right });
  }
  k.alive = false;
  alive.delete(c);
}

/** Funde dois vértices vizinhos `a` e `b` em `p` no instante `t`. */
function mergeCorners(sim: Sim, alive: Set<number>, a: number, b: number, p: Vec2, t: number): void {
  const ca = sim.corners[a]!;
  const cb = sim.corners[b]!;
  const prev = ca.prev;
  const next = cb.next;
  if (prev === next) {
    const peak = pushNode(sim, p, t);
    emitArc(sim, alive, a, peak);
    emitArc(sim, alive, b, peak);
    emitArc(sim, alive, next, peak);
    return;
  }
  const n = pushNode(sim, p, t);
  const left = ca.left;
  const right = cb.right;
  emitArc(sim, alive, a, n);
  emitArc(sim, alive, b, n);
  const c = mkCorner(sim, p, t, left, right, n);
  alive.add(c);
  linkCorners(sim, prev, c, next);
  settleCorner(sim, alive, c, t);
}

/** Fecha laços de 2 vértices, resolve vértices paralelos (`stuck`) ou enfileira eventos do novo vértice. */
function settleCorner(sim: Sim, alive: Set<number>, c: number, now: number): void {
  const k = sim.corners[c]!;
  const prev = k.prev;
  const next = k.next;
  if (next === c) {
    k.alive = false;
    alive.delete(c);
    return;
  }
  if (next === prev) {
    const o = sim.corners[next]!;
    if (k.node !== o.node) {
      sim.arcs.push({ a: k.node, b: o.node, left: k.left, right: k.right });
    }
    k.alive = false;
    o.alive = false;
    alive.delete(c);
    alive.delete(next);
    return;
  }
  if (k.stuck) {
    const l = sim.edges[k.left]!;
    const r = sim.edges[k.right]!;
    const back = posAt(sim.corners[prev]!, now);
    const on = posAt(sim.corners[next]!, now);
    if (dot(l.n, r.n) > 0) {
      if (dist(k.p, back) <= sim.eps) mergeCorners(sim, alive, prev, c, back, now);
      else if (dist(k.p, on) <= sim.eps) mergeCorners(sim, alive, c, next, on, now);
      else throw new SkeletonFail('vértice reto entre trechos colineares de pesos diferentes (limite conhecido do esqueleto)', [k.p]);
    } else {
      const behind = dist(k.p, back) <= dist(k.p, on);
      if (behind) mergeCorners(sim, alive, prev, c, back, now);
      else mergeCorners(sim, alive, c, next, on, now);
    }
    return;
  }
  queueShrink(sim, prev, c, now);
  queueShrink(sim, c, next, now);
  queueSplits(sim, c, now);
}

interface Ray {
  ang: number;
  edge: number;
  other: number;
  incoming: boolean;
}

/**
 * Resolve todos os encontros simultâneos em `p` no instante `t`: vértices em `must` ou a menos de `eps` de `p`,
 * mais arestas que passam por `p`. Emparelha raios de entrada e saída pelo menor giro anti-horário (material à esquerda).
 */
function meetAt(sim: Sim, alive: Set<number>, p: Vec2, t: number, must: number[]): void {
  const here = new Set<number>(must);
  for (const i of alive) {
    const c = sim.corners[i]!;
    if (!here.has(i) && dist(posAt(c, t), p) < sim.eps) here.add(i);
  }
  const rays: Ray[] = [];
  const angle = (d: Vec2): number => Math.atan2(d.y, d.x);
  for (const i of here) {
    const c = sim.corners[i]!;
    if (!here.has(c.prev)) {
      const d = sim.edges[c.left]!.dir;
      rays.push({ ang: angle(mul(d, -1)), edge: c.left, other: c.prev, incoming: true });
    }
    if (!here.has(c.next)) {
      const d = sim.edges[c.right]!.dir;
      rays.push({ ang: angle(d), edge: c.right, other: c.next, incoming: false });
    }
  }
  for (const x of alive) {
    const c = sim.corners[x]!;
    if (here.has(x) || here.has(c.next)) continue;
    const a = posAt(c, t);
    const b = posAt(sim.corners[c.next]!, t);
    if (distToSeg(p, a, b) < sim.eps) {
      const d = sim.edges[c.right]!.dir;
      rays.push({ ang: angle(mul(d, -1)), edge: c.right, other: x, incoming: true });
      rays.push({ ang: angle(d), edge: c.right, other: c.next, incoming: false });
    }
  }
  const node = pushNode(sim, p, t);
  for (const i of here) emitArc(sim, alive, i, node);

  const outs = rays.filter((r) => !r.incoming);
  const ins = rays.filter((r) => r.incoming);
  if (outs.length !== ins.length) {
    sim.broken = true;
    return;
  }
  const TAU = Math.PI * 2;
  const pairs: Array<{ turn: number; i: number; j: number }> = [];
  for (let i = 0; i < outs.length; i++) {
    const o = outs[i]!;
    for (let j = 0; j < ins.length; j++) {
      const c = ins[j]!;
      let turn = (((c.ang - o.ang) % TAU) + TAU) % TAU;
      if (turn > TAU - 1e-9) turn = 0;
      pairs.push({ turn, i, j });
    }
  }
  pairs.sort((a, b) => a.turn - b.turn);
  const usedOut = new Array<boolean>(outs.length).fill(false);
  const usedIn = new Array<boolean>(ins.length).fill(false);
  const made: number[] = [];
  for (const { i, j } of pairs) {
    if (usedOut[i] || usedIn[j]) continue;
    usedOut[i] = true;
    usedIn[j] = true;
    const c = mkCorner(sim, p, t, ins[j]!.edge, outs[i]!.edge, node);
    alive.add(c);
    linkCorners(sim, ins[j]!.other, c, outs[i]!.other);
    made.push(c);
  }
  for (const c of made) {
    if (sim.corners[c]!.alive) settleCorner(sim, alive, c, t);
  }
}

/** Roda a frente de onda até todos os anéis se encerrarem. */
export function runSim(sim: Sim): void {
  const n = sim.corners.length;
  const alive = new Set<number>();
  for (let i = 0; i < n; i++) alive.add(i);
  for (let i = 0; i < n; i++) {
    if (sim.corners[i]?.alive) settleCorner(sim, alive, i, 0);
  }
  let budget = Math.min(20000, 100 * n * n + 1000);
  while (sim.queue.length > 0) {
    if (--budget <= 0) throw new SkeletonFail('limite de eventos atingido');
    const ev = sim.queue.pop()!;
    if (ev.kind === 'shrink') {
      const ca = sim.corners[ev.a]!;
      const cb = sim.corners[ev.b]!;
      if (ca.alive && cb.alive && ca.next === ev.b) {
        meetAt(sim, alive, posAt(ca, ev.t), ev.t, [ev.a, ev.b]);
      }
    } else {
      const cv = sim.corners[ev.v]!;
      if (!cv.alive) continue;
      const p = posAt(cv, ev.t);
      let hit = false;
      for (const xIdx of alive) {
        const x = sim.corners[xIdx]!;
        if (x.right !== ev.f) continue;
        if (distToSeg(p, posAt(x, ev.t), posAt(sim.corners[x.next]!, ev.t)) < sim.eps) {
          hit = true;
          break;
        }
      }
      if (hit) meetAt(sim, alive, p, ev.t, [ev.v]);
    }
    if (sim.broken) break;
  }
  const left = [...alive].map((i) => sim.corners[i]!);
  if (sim.broken || left.length > 0) {
    const allGable = left.length > 0 && left.every((c) => sim.edges[c.left]!.speed <= 0 && sim.edges[c.right]!.speed <= 0);
    throw new SkeletonFail(
      allGable ? 'frente de onda cercada por empenas sem inclinação' : 'frente de onda sem eventos: geometria não converge',
      left.map((c) => c.p),
    );
  }
}
