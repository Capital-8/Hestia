/**
 * SPIKE S1 (docs/parede-formas/METODOLOGIA.md §2): junção de duas paredes inclinadas por dois níveis + faces regradas.
 * Função pura; não altera joins.ts. Reusa as peças de junção existentes (joinPair, buttAgainst, toCenterline) sobre
 * quadros deslocados por d(z) = z·tan(tilt). A topologia sai SÓ da base (joinStatus nos eixos); nos demais níveis ela
 * é reaplicada aos eixos deslocados, sem procurar parceiros de novo.
 */
import { arcPointAt, arcTangentAt, perp, type Vec2 } from '@hestia/geom';
import { faceCurve, intersectCurves, planeHit, pointAt, tangentAt, toLocal, type WallFrame } from './frame.ts';
import { joinStatus } from './joins.ts';
import { buttAgainst, both, flatEnd, setEnd, sOfDepth, miterPoint } from './joinSides.ts';
import { joinPair, toCenterline } from './joinPair.ts';
import type { EndRef, SideSpec, WallEnds } from './joinTypes.ts';

export interface TiltWall {
  frame: WallFrame;
  /** Graus; positivo = topo desloca para a esquerda de a→b. */
  tiltDeg: number;
}
export type Vec3 = [number, number, number];
export interface Mesh {
  v: Vec3[];
  /** Triângulos (índices), anti-horários vistos de fora. */
  t: Array<[number, number, number]>;
}
export interface WallSolid {
  /** Polígono de planta por nível da malha (mesma contagem de vértices em todos). */
  levels: Vec2[][];
  mesh: Mesh;
  /** Índices (no laço de cada nível) dos dois vértices de cada extremidade: [lo, hi]. */
  endIdx: { a: [number, number]; b: [number, number] };
}
export interface TiltJoinResult {
  H: number;
  zs: number[];
  A: WallSolid;
  B: WallSolid;
  /** Plantas em z=0, H/2 e z=H (A e B). */
  plan: { z0: [Vec2[], Vec2[]]; zMid: [Vec2[], Vec2[]]; zH: [Vec2[], Vec2[]] };
  /** Cruzamento dos eixos do par em cada nível da malha (null sem par). */
  nodes: Array<Vec2 | null>;
  topology: Topology;
  /** Motivo de degeneração (cone invertido, eixos sem cruzamento); null = tudo certo. */
  warn: string | null;
}
export interface Topology {
  pair: { a: 'a' | 'b'; b: 'a' | 'b' } | null; // extremidade da parede A e da B que formam o canto
  tee: Array<{ branch: 0 | 1; end: 'a' | 'b'; host: 0 | 1 }>;
}

const RAD = Math.PI / 180;

/** Quadro da parede na altura z: eixo deslocado d(z) à esquerda (ou raio R + k·d), espessura horizontal t/cosθ. */
export function levelFrame(tw: TiltWall, z: number): WallFrame | null {
  const f = tw.frame;
  const th = tw.tiltDeg * RAD;
  const sc = 1 / Math.cos(th);
  const d = z * Math.tan(th);
  const type = { ...f.type, layers: f.type.layers.map((l) => ({ ...l, thickness: l.thickness * sc })) };
  const g: WallFrame = {
    ...f, type, thickness: f.thickness * sc, extOffset: f.extOffset * sc,
    sExt: f.sExt * sc, sInt: f.sInt * sc, sHi: f.sHi * sc, sLo: f.sLo * sc, sMid: f.sMid * sc,
  };
  if (f.arc) {
    const R = f.arc.radius + f.arc.k * d;
    if (R <= 1e-3 || R + f.arc.k * g.sLo <= 1e-3 || R + f.arc.k * g.sHi <= 1e-3) return null; // cone invertido
    const arc = { ...f.arc, radius: R, length: R * Math.abs(f.arc.sweep) };
    g.arc = arc;
    g.length = arc.length;
    g.a = arcPointAt(arc, 0, 0);
    g.b = arcPointAt(arc, arc.length, 0);
    g.u = arcTangentAt(arc, 0);
    g.n = perp(g.u);
  } else {
    g.a = { x: f.a.x + f.n.x * d, y: f.a.y + f.n.y * d };
    g.b = { x: f.b.x + f.n.x * d, y: f.b.y + f.n.y * d };
  }
  return g;
}

/** Topologia decidida SÓ na base, pelos eixos (mesma regra de hoje). */
export function baseTopology(A: TiltWall, B: TiltWall): Topology {
  const frames = [A.frame, B.frame];
  const topo: Topology = { pair: null, tee: [] };
  frames.forEach((f, i) => {
    for (const which of ['a', 'b'] as const) {
      const st = joinStatus(frames, f.wall.id, which);
      if (st.kind === 'pair' && i === 0) {
        const p = st.partners.find((x) => x.wallId === B.frame.wall.id);
        if (p && !topo.pair) topo.pair = { a: which, b: p.end };
      } else if (st.kind === 'tee') {
        topo.tee.push({ branch: i as 0 | 1, end: which, host: (1 - i) as 0 | 1 });
      }
    }
  });
  // pair visto só pelo lado B (zona de extremidade assimétrica)
  if (!topo.pair) {
    for (const which of ['a', 'b'] as const) {
      const st = joinStatus(frames, B.frame.wall.id, which);
      if (st.kind === 'pair') {
        const p = st.partners.find((x) => x.wallId === A.frame.wall.id);
        if (p) topo.pair = { a: p.end, b: which };
      }
    }
  }
  return topo;
}

const endPoint = (f: WallFrame, which: 'a' | 'b'): Vec2 => pointAt(f, which === 'a' ? 0 : f.length, 0);
const dirFrom = (f: WallFrame, which: 'a' | 'b', at: Vec2): Vec2 => {
  const t = tangentAt(f, toLocal(f, at).t);
  return which === 'a' ? t : { x: -t.x, y: -t.y };
};

interface LevelPolys {
  A: Vec2[];
  B: Vec2[];
  node: Vec2 | null;
  idx: { A: WallSolid['endIdx']; B: WallSolid['endIdx'] };
  warn: string | null;
}

/** Ponto da extremidade, na face de coordenada s, segundo o corte. */
function sidePoint(f: WallFrame, side: SideSpec, s: number, near: Vec2): Vec2 | null {
  switch (side.kind) {
    case 'flat':
      return pointAt(f, side.t, s);
    case 'miter': {
      const T = side.self.sHi - side.self.sLo;
      const atZero = Math.abs(sOfDepth(side.self, 0) - s) < 1e-9;
      return miterPoint(side.self, side.other, atZero ? 0 : T);
    }
    case 'plane':
      return planeHit(f, s, side.p, side.q, near);
    case 'steps': {
      const r = side.runs[0]!;
      const useHigh = r.s1 !== undefined && Math.abs(r.s1 - s) < 1e-9 && Math.abs(r.s - s) > 1e-9;
      return pointAt(f, useHigh ? (r.t1 ?? r.t) : r.t, s);
    }
  }
}

const SAMPLES = 24;

function loopOf(f: WallFrame, e: WallEnds, nodeNear: { a: Vec2; b: Vec2 }): { poly: Vec2[]; idx: WallSolid['endIdx'] } | null {
  const pt = (end: 'a' | 'b', s: number): Vec2 | null => sidePoint(f, e[end].hi, s, nodeNear[end]);
  const aLo = pt('a', f.sLo), aHi = pt('a', f.sHi), bLo = pt('b', f.sLo), bHi = pt('b', f.sHi);
  if (!aLo || !aHi || !bLo || !bHi) return null;
  if (!f.arc) return { poly: [aLo, bLo, bHi, aHi], idx: { a: [0, 3], b: [1, 2] } };
  const chain = (s: number, p0: Vec2, p1: Vec2): Vec2[] => {
    const t0 = toLocal(f, p0).t, t1 = toLocal(f, p1).t;
    return Array.from({ length: SAMPLES + 1 }, (_, i) => (i === 0 ? p0 : i === SAMPLES ? p1 : pointAt(f, t0 + ((t1 - t0) * i) / SAMPLES, s)));
  };
  const lo = chain(f.sLo, aLo, bLo);
  const hi = chain(f.sHi, bHi, aHi); // volta de b para a
  return { poly: [...lo, ...hi], idx: { a: [0, 2 * SAMPLES + 1], b: [SAMPLES, SAMPLES + 1] } };
}

function levelPolys(A: TiltWall, B: TiltWall, topo: Topology, z: number): LevelPolys | null {
  const fa = levelFrame(A, z), fb = levelFrame(B, z);
  if (!fa || !fb) return null;
  const fr = [fa, fb];
  const out = new Map<string, WallEnds>([
    [fa.wall.id, { a: flatEnd(0), b: flatEnd(fa.length) }],
    [fb.wall.id, { a: flatEnd(0), b: flatEnd(fb.length) }],
  ]);
  const near = { A: { a: fa.a, b: fa.b }, B: { a: fb.a, b: fb.b } };
  let node: Vec2 | null = null;
  let warn: string | null = null;
  if (topo.pair) {
    const x = intersectCurves(faceCurve(fa, 0), faceCurve(fb, 0), endPoint(fa, topo.pair.a));
    if (!x) warn = 'eixos deslocados sem cruzamento';
    else {
      node = x;
      const ra: EndRef = { f: fa, which: topo.pair.a, o: x, dir: dirFrom(fa, topo.pair.a, x) };
      const rb: EndRef = { f: fb, which: topo.pair.b, o: x, dir: dirFrom(fb, topo.pair.b, x) };
      joinPair(out, ra, rb);
      near.A[topo.pair.a] = x;
      near.B[topo.pair.b] = x;
    }
  }
  for (const t of topo.tee) {
    const r: EndRef = { f: fr[t.branch]!, which: t.end, o: endPoint(fr[t.branch]!, t.end), dir: dirFrom(fr[t.branch]!, t.end, endPoint(fr[t.branch]!, t.end)) };
    const spec = buttAgainst(r, fr[t.host]!) ?? toCenterline(r, fr[t.host]!);
    if (spec) setEnd(out, r, both(spec));
  }
  const la = loopOf(fa, out.get(fa.wall.id)!, near.A);
  const lb = loopOf(fb, out.get(fb.wall.id)!, near.B);
  if (!la || !lb) return null;
  return { A: la.poly, B: lb.poly, node, idx: { A: la.idx, B: lb.idx }, warn };
}

const lift = (p: Vec2, z: number): Vec3 => [p.x, p.y, z];

/** Malha fechada de um prisma regrado a partir de laços de planta (CCW) por nível. */
function meshOf(levels: Vec2[][], zs: number[], idx: WallSolid['endIdx']): Mesh {
  const n = levels[0]!.length;
  const v: Vec3[] = levels.flatMap((poly, i) => poly.map((p) => lift(p, zs[i]!)));
  const t: Mesh['t'] = [];
  const half = idx.b[0]; // lo = 0..half, hi = half+1..n-1
  const strip = (base: number, flip: boolean): void => {
    for (let i = 0; i < half; i++) {
      const lo0 = base + i, lo1 = base + i + 1;
      // o laço volta de b para a no lado hi: o par de lo[i] é o índice n-1-i
      const hiI = base + (n - 1 - i), hiI1 = base + (n - 1 - (i + 1));
      const q: Array<[number, number, number]> = [
        [lo0, lo1, hiI1],
        [lo0, hiI1, hiI],
      ];
      for (const tri of q) t.push(flip ? [tri[0], tri[2], tri[1]] : tri);
    }
  };
  strip(0, true); // base: normal para -z
  strip((levels.length - 1) * n, false); // topo: normal para +z
  for (let l = 0; l < levels.length - 1; l++) {
    for (let j = 0; j < n; j++) {
      const j1 = (j + 1) % n;
      const p00 = l * n + j, p10 = l * n + j1, p11 = (l + 1) * n + j1, p01 = (l + 1) * n + j;
      t.push([p00, p10, p11], [p00, p11, p01]);
    }
  }
  return { v, t };
}

/**
 * Junção das duas paredes inclinadas. `intermediate` = N níveis intermediários entre base e topo da malha
 * (N+2 níveis). As plantas em z=0, H/2 e z=H são calculadas à parte (não dependem de N).
 */
export function wallTiltJoin(A: TiltWall, B: TiltWall, H: number, intermediate = 4): TiltJoinResult | null {
  const topo = baseTopology(A, B);
  const S = intermediate + 1;
  const zs = Array.from({ length: S + 1 }, (_, i) => (H * i) / S);
  const ls = zs.map((z) => levelPolys(A, B, topo, z));
  if (ls.some((l) => !l)) return null;
  const mk = (k: 'A' | 'B'): WallSolid => {
    const levels = ls.map((l) => l![k]);
    return { levels, mesh: meshOf(levels, zs, ls[0]!.idx[k]), endIdx: ls[0]!.idx[k] };
  };
  const p0 = levelPolys(A, B, topo, 0)!, pm = levelPolys(A, B, topo, H / 2), pH = levelPolys(A, B, topo, H);
  if (!pm || !pH) return null;
  return {
    H, zs, A: mk('A'), B: mk('B'),
    plan: { z0: [p0.A, p0.B], zMid: [pm.A, pm.B], zH: [pH.A, pH.B] },
    nodes: ls.map((l) => l!.node), topology: topo, warn: ls.find((l) => l!.warn)?.warn ?? null,
  };
}

/** Maior desvio (m) entre os vértices da face de junção interpolados linearmente entre níveis e os exatos em z intermediários. */
export function joinFaceDeviation(A: TiltWall, B: TiltWall, H: number, intermediate: number, perSegment = 8): number | null {
  const topo = baseTopology(A, B);
  if (!topo.pair) return 0;
  const S = intermediate + 1;
  const at = (z: number): Vec2[] | null => {
    const l = levelPolys(A, B, topo, z);
    if (!l) return null;
    const p = [[l.A, l.idx.A[topo.pair!.a]], [l.B, l.idx.B[topo.pair!.b]]] as const;
    return p.flatMap(([poly, ix]) => ix.map((i) => poly[i]!));
  };
  let worst = 0;
  for (let s = 0; s < S; s++) {
    const z0 = (H * s) / S, z1 = (H * (s + 1)) / S;
    const p0 = at(z0), p1 = at(z1);
    if (!p0 || !p1) return null;
    for (let k = 1; k < perSegment; k++) {
      const w = k / perSegment;
      const ex = at(z0 + (z1 - z0) * w);
      if (!ex) return null;
      ex.forEach((e, i) => {
        const ix = p0[i]!.x + (p1[i]!.x - p0[i]!.x) * w, iy = p0[i]!.y + (p1[i]!.y - p0[i]!.y) * w;
        worst = Math.max(worst, Math.hypot(e.x - ix, e.y - iy));
      });
    }
  }
  return worst;
}

export const polyArea = (p: Vec2[]): number => p.reduce((s, q, i) => s + (q.x * p[(i + 1) % p.length]!.y - p[(i + 1) % p.length]!.x * q.y), 0) / 2;

export function meshVolume(m: Mesh): number {
  let s = 0;
  for (const [i, j, k] of m.t) {
    const a = m.v[i]!, b = m.v[j]!, c = m.v[k]!;
    s += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return s;
}
