import { cross, dot, type Vec2 } from './vec.ts';

/**
 * Falha de validação ou de topologia do esqueleto; vira ok:false com `reason`. `at` são os pontos (em planta) onde a
 * frente de onda não fecha, quando a falha tem um lugar definido; o engine os mostra ao usuário.
 */
export class SkeletonFail extends Error {
  constructor(
    message: string,
    readonly at: Vec2[] = [],
  ) {
    super(message);
  }
}

/** Aresta inicial (ou grupo de colineares de mesmo peso): interior à esquerda (`n = perp(dir)`). */
export interface Edge {
  id: number;
  a: Vec2;
  dir: Vec2;
  n: Vec2;
  /** Avanço horizontal por unidade de altura: 1/w quando w > 0, ou 0 para empena vertical. */
  speed: number;
  w: number;
}

/** Vértice ativo da frente de onda no instante `t`, entre as arestas `left` e `right`. */
export interface Corner {
  p: Vec2;
  t: number;
  v: Vec2;
  left: number;
  right: number;
  prev: number;
  next: number;
  node: number;
  alive: boolean;
  /** Verdadeiro entre arestas paralelas sem velocidade única (resolvido imediatamente em `settle`). */
  stuck: boolean;
}

/** Ponto do grafo do esqueleto (planta + altura). */
export interface Node {
  x: number;
  y: number;
  z: number;
}

/** Arco deixado por um vértice da frente de onda entre as faces `left` e `right`. */
export interface Arc {
  a: number;
  b: number;
  left: number;
  right: number;
}

export type SimEvent =
  | { t: number; kind: 'shrink'; a: number; b: number }
  | { t: number; kind: 'split'; v: number; f: number };

/** Fila de prioridade mínima: menor `t` primeiro; em empate, `shrink` antes de `split`. */
export class EventQueue {
  private readonly items: SimEvent[] = [];

  get length(): number {
    return this.items.length;
  }

  push(e: SimEvent): void {
    this.items.push(e);
    this.siftUp(this.items.length - 1);
  }

  pop(): SimEvent | undefined {
    const n = this.items.length;
    if (n === 0) return undefined;
    const top = this.items[0]!;
    const last = this.items.pop()!;
    if (n > 1) {
      this.items[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private less(i: number, j: number): boolean {
    const a = this.items[i]!;
    const b = this.items[j]!;
    if (a.t !== b.t) return a.t < b.t;
    return a.kind === 'shrink' && b.kind === 'split';
  }

  private siftUp(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      [this.items[i], this.items[p]] = [this.items[p]!, this.items[i]!];
      i = p;
    }
  }

  private siftDown(i: number): void {
    const n = this.items.length;
    while (true) {
      let best = i;
      const l = 2 * i + 1;
      const r = l + 1;
      if (l < n && this.less(l, best)) best = l;
      if (r < n && this.less(r, best)) best = r;
      if (best === i) break;
      [this.items[i], this.items[best]] = [this.items[best]!, this.items[i]!];
      i = best;
    }
  }
}

export interface Sim {
  edges: Edge[];
  corners: Corner[];
  nodes: Node[];
  arcs: Arc[];
  queue: EventQueue;
  eps: number;
  broken: boolean;
}

export const newSim = (eps: number): Sim => ({
  edges: [],
  corners: [],
  nodes: [],
  arcs: [],
  queue: new EventQueue(),
  eps,
  broken: false,
});

export const pushNode = (sim: Sim, p: Vec2, z: number): number => {
  sim.nodes.push({ x: p.x, y: p.y, z });
  return sim.nodes.length - 1;
};

export const posAt = (c: Corner, t: number): Vec2 => ({
  x: c.p.x + c.v.x * (t - c.t),
  y: c.p.y + c.v.y * (t - c.t),
});

/** Cria vértice entre `left` e `right` em `p` no instante `t`, partindo de `node`. */
export function mkCorner(sim: Sim, p: Vec2, t: number, left: number, right: number, node: number): number {
  const l = sim.edges[left]!;
  const r = sim.edges[right]!;
  const det = cross(l.n, r.n);
  let v: Vec2;
  let stuck = false;
  if (Math.abs(det) > 1e-9) {
    v = {
      x: (l.speed * r.n.y - l.n.y * r.speed) / det,
      y: (l.n.x * r.speed - l.speed * r.n.x) / det,
    };
  } else if (dot(l.n, r.n) > 0 && Math.abs(l.speed - r.speed) < 1e-12) {
    v = { x: l.n.x * l.speed, y: l.n.y * l.speed };
  } else {
    v = { x: 0, y: 0 };
    stuck = true;
  }
  sim.corners.push({ p, t, v, left, right, prev: -1, next: -1, node, alive: true, stuck });
  return sim.corners.length - 1;
}

export function linkCorners(sim: Sim, prev: number, c: number, next: number): void {
  sim.corners[prev]!.next = c;
  sim.corners[c]!.prev = prev;
  sim.corners[c]!.next = next;
  sim.corners[next]!.prev = c;
}
