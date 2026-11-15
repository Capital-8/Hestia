/**
 * Junção de paredes inclinadas (F2.4, promovida do spike S1; docs/parede-formas/METODOLOGIA.md §2): junção de duas paredes inclinadas por dois níveis + faces regradas.
 * Função pura; não altera joins.ts. Reusa as peças de junção existentes (joinPair, buttAgainst, toCenterline) sobre
 * quadros deslocados por d(z) = z·tan(tilt). A topologia sai SÓ da base (joinStatus nos eixos); nos demais níveis ela
 * é reaplicada aos eixos deslocados, sem procurar parceiros de novo.
 */
import { arcPointAt, arcTangentAt, perp, type Ring, type Vec2 } from '@hestia/geom';
import { layerSpans } from '@hestia/model';
import { faceCurve, intersectCurves, planeHit, pointAt, sAtDepth, tangentAt, toLocal, type Curve, type WallFrame } from './frame.ts';
import { joinStatus } from './joins.ts';
import { buttAgainst, both, flatEnd, setEnd, sOfDepth, miterPoint } from './joinSides.ts';
import { joinPair, toCenterline } from './joinPair.ts';
import { endPoint as layerEndPoint, layerQuad } from './layerGeom.ts';
import type { EndRef, SideSpec, WallEnds } from './joinTypes.ts';
import { noFailed, noLevel, noTopology, type NoLevel, type NoLine } from './wallTiltNo.ts';

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
/** Falha de um nível: o modelo de dois níveis não se aplica a esta combinação (limite geométrico, não erro de cálculo). */
export interface TiltJoinFail {
  fail: 'cone-invertido' | 'sem-cruzamento' | 'no-fora-da-parede' | 'corte-nulo' | 'no-inviavel';
  z?: number;
}
export const isFail = (r: TiltJoinResult | TiltJoinFail): r is TiltJoinFail => 'fail' in r;
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

/** Quadro com a extremidade `which` movida para o ponto `x` do eixo (a outra ponta não sai do lugar); null se a parede some. */
function retarget(f: WallFrame, which: 'a' | 'b', x: Vec2): WallFrame | null {
  const tx = toLocal(f, x).t;
  const start = which === 'a' ? tx : 0;
  const length = which === 'a' ? f.length - tx : tx;
  if (length < 1e-3) return null;
  const g: WallFrame = { ...f, length };
  if (f.arc) {
    const dir = f.arc.sweep < 0 ? -1 : 1;
    g.arc = { ...f.arc, a0: f.arc.a0 + (dir * start) / f.arc.radius, sweep: (dir * length) / f.arc.radius, length };
    g.a = arcPointAt(g.arc, 0, 0);
    g.b = arcPointAt(g.arc, length, 0);
    g.u = arcTangentAt(g.arc, 0);
    g.n = perp(g.u);
  } else {
    g.a = which === 'a' ? x : f.a;
    g.b = which === 'a' ? f.b : x;
  }
  return g;
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

type LevelFail = Pick<TiltJoinFail, 'fail'>;
const failed = (r: object): r is LevelFail => 'fail' in r;

/** Ligação decidida na base: canto entre duas pontas (`pair`) ou encosto de uma ponta no corpo de outra parede (`tee`). */
export type Relation =
  | { kind: 'pair'; a: { id: string; end: 'a' | 'b' }; b: { id: string; end: 'a' | 'b' } }
  | { kind: 'tee'; branch: { id: string; end: 'a' | 'b' }; host: string }
  /** Nó de 3 ou mais paredes retas no mesmo ponto (N1): cada par de faces vizinhas se cruza no nível (`wallTiltNo.ts`). */
  | { kind: 'node'; ends: Array<{ id: string; end: 'a' | 'b' }> };

/** Quadros e cortes de extremidade de um conjunto de paredes numa cota z, com a topologia dada (nunca procurada de novo). */
export interface LevelSet {
  frames: Map<string, WallFrame>;
  ends: Map<string, WallEnds>;
  /** Ponto do nó de cada ponta de canto (chave `id|a` ou `id|b`). */
  nodes: Map<string, Vec2>;
  /** Resultado de cada relação `node` (na ordem de `rels`, só as de nó) nesta cota (N1). */
  nodeLevels?: NoLevel[];
}

/**
 * Cruzamento de dois eixos de nível. Dois círculos de mesmo centro e mesmo raio (arcos tangentes de mesma inclinação)
 * coincidem: o nó é a projeção radial de `near` sobre o círculo. Círculos concêntricos de raios diferentes não se cruzam.
 */
function crossAxes(g: Curve, h: Curve, near: Vec2): Vec2 | null {
  if (g.kind === 'circle' && h.kind === 'circle' && Math.hypot(g.c.x - h.c.x, g.c.y - h.c.y) < 1e-4 && Math.abs(g.r - h.r) < 1e-4) {
    const dx = near.x - g.c.x, dy = near.y - g.c.y, d = Math.hypot(dx, dy);
    return d < 1e-12 ? null : { x: g.c.x + (dx / d) * g.r, y: g.c.y + (dy / d) * g.r };
  }
  return intersectCurves(g, h, near);
}

/**
 * Reaplica a topologia da base aos eixos deslocados por d(z): cada canto vira o cruzamento dos eixos do nível e cada
 * encosto é cortado pelo plano da hospedeira no nível. `fail` quando o modelo de dois níveis não se aplica.
 */
export function levelSet(walls: ReadonlyMap<string, TiltWall>, rels: readonly Relation[], z: number, base?: LevelSet, rawEnds?: ReadonlyMap<string, WallEnds>): LevelSet | TiltJoinFail {
  const frames = new Map<string, WallFrame>();
  for (const [id, tw] of walls) {
    const g = levelFrame(tw, z);
    if (!g) return { fail: 'cone-invertido', z };
    frames.set(id, g);
  }
  const nodes = new Map<string, Vec2>();
  const pairs: Array<{ r: Relation & { kind: 'pair' }; x: Vec2 }> = [];
  for (const r of rels) {
    if (r.kind !== 'pair') continue;
    const fa = frames.get(r.a.id)!, fb = frames.get(r.b.id)!;
    // O nó do nível é o cruzamento dos eixos deslocados; a ponta do par passa a ser esse ponto.
    // Com arco o cruzamento tem duas raízes (círculo×círculo, círculo×reta): vale a mais perto do nó da base.
    const x = crossAxes(faceCurve(fa, 0), faceCurve(fb, 0), base?.nodes.get(`${r.a.id}|${r.a.end}`) ?? endPoint(fa, r.a.end));
    if (!x) return { fail: 'sem-cruzamento', z };
    const ga = retarget(fa, r.a.end, x), gb = retarget(fb, r.b.end, x);
    if (!ga || !gb) return { fail: 'no-fora-da-parede', z }; // o cruzamento caiu fora de uma das paredes
    frames.set(r.a.id, ga);
    frames.set(r.b.id, gb);
    nodes.set(`${r.a.id}|${r.a.end}`, x);
    nodes.set(`${r.b.id}|${r.b.end}`, x);
    pairs.push({ r, x });
  }
  const ends = new Map<string, WallEnds>();
  for (const [id, f] of frames) ends.set(id, { a: flatEnd(0), b: flatEnd(f.length) });
  for (const { r, x } of pairs) {
    const fa = frames.get(r.a.id)!, fb = frames.get(r.b.id)!;
    joinPair(ends, { f: fa, which: r.a.end, o: x, dir: dirFrom(fa, r.a.end, x) }, { f: fb, which: r.b.end, o: x, dir: dirFrom(fb, r.b.end, x) });
  }
  for (const r of rels) {
    if (r.kind !== 'tee') continue;
    const f = frames.get(r.branch.id)!;
    // A ponta do ramo é o cruzamento do eixo dele com o eixo da hospedeira NO NÍVEL (o corpo da hospedeira se desloca com z).
    const host = frames.get(r.host)!;
    const o = intersectCurves(faceCurve(f, 0), faceCurve(host, 0), endPoint(f, r.branch.end)) ?? endPoint(f, r.branch.end);
    const ref: EndRef = { f, which: r.branch.end, o, dir: dirFrom(f, r.branch.end, o) };
    const spec = buttAgainst(ref, host) ?? toCenterline(ref, host);
    if (!spec) return { fail: 'corte-nulo', z };
    setEnd(ends, ref, both(spec));
  }
  const nodeLevels: NoLevel[] = [];
  for (const r of rels) {
    if (r.kind !== 'node') continue;
    // Nó de N paredes (N1): cantos = cruzamento das faces vizinhas. Com `rawEnds` (nível vertical da base) a ponta
    // da parede é a do resolvedor (corte reto no nó etc.); os cantos seguem calculados (alimentam `nodeWarp`).
    const lines: NoLine[] = [];
    for (const e of r.ends) {
      const g = frames.get(e.id)!;
      if (g.arc) return { fail: 'no-inviavel', z };
      const a = e.end === 'a';
      const u = a ? g.u : { x: -g.u.x, y: -g.u.y };
      lines.push({ id: e.id, o: a ? g.a : g.b, u, lo: a ? g.sLo : -g.sHi, hi: a ? g.sHi : -g.sLo, len: g.length });
    }
    const topo = noTopology(lines);
    if (noFailed(topo)) return { fail: 'no-inviavel', z };
    const lv = noLevel(lines, topo, z);
    if (noFailed(lv)) return { fail: 'no-inviavel', z };
    nodeLevels.push(lv);
    for (const e of r.ends) {
      const c = lv.corners.get(e.id)!;
      const w = rawEnds?.get(e.id);
      ends.get(e.id)![e.end] = w ? w[e.end] : both({ kind: 'plane', p: c.r, q: c.l, pts: [] });
      nodes.set(`${e.id}|${e.end}`, { x: (c.r.x + c.l.x) / 2, y: (c.r.y + c.l.y) / 2 });
    }
  }
  return { frames, ends, nodes, nodeLevels };
}

function levelPolys(A: TiltWall, B: TiltWall, topo: Topology, z: number): LevelPolys | LevelFail {
  const rels: Relation[] = [];
  if (topo.pair) rels.push({ kind: 'pair', a: { id: A.frame.wall.id, end: topo.pair.a }, b: { id: B.frame.wall.id, end: topo.pair.b } });
  for (const t of topo.tee) rels.push({ kind: 'tee', branch: { id: (t.branch === 0 ? A : B).frame.wall.id, end: t.end }, host: (t.host === 0 ? A : B).frame.wall.id });
  const ls = levelSet(new Map([[A.frame.wall.id, A], [B.frame.wall.id, B]]), rels, z);
  if (failed(ls)) return ls;
  const fa = ls.frames.get(A.frame.wall.id)!, fb = ls.frames.get(B.frame.wall.id)!;
  const nearOf = (f: WallFrame): { a: Vec2; b: Vec2 } => ({ a: ls.nodes.get(`${f.wall.id}|a`) ?? f.a, b: ls.nodes.get(`${f.wall.id}|b`) ?? f.b });
  const la = loopOf(fa, ls.ends.get(fa.wall.id)!, nearOf(fa));
  const lb = loopOf(fb, ls.ends.get(fb.wall.id)!, nearOf(fb));
  if (!la || !lb) return { fail: 'corte-nulo' };
  const node = topo.pair ? ls.nodes.get(`${A.frame.wall.id}|${topo.pair.a}`) ?? null : null;
  return { A: la.poly, B: lb.poly, node, idx: { A: la.idx, B: lb.idx }, warn: null };
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
export function wallTiltJoin(A: TiltWall, B: TiltWall, H: number, intermediate = 4, topoOverride?: Topology): TiltJoinResult | TiltJoinFail {
  const topo = topoOverride ?? baseTopology(A, B);
  const S = intermediate + 1;
  const zs = Array.from({ length: S + 1 }, (_, i) => (H * i) / S);
  const lv = zs.map((z) => levelPolys(A, B, topo, z));
  const bad = lv.findIndex(failed);
  if (bad >= 0) return { fail: (lv[bad] as LevelFail).fail, z: zs[bad]! };
  const ls = lv as LevelPolys[];
  const mk = (k: 'A' | 'B'): WallSolid => {
    const levels = ls.map((l) => l![k]);
    return { levels, mesh: meshOf(levels, zs, ls[0]!.idx[k]), endIdx: ls[0]!.idx[k] };
  };
  const p0 = ls[0]!, pm = levelPolys(A, B, topo, H / 2), pH = levelPolys(A, B, topo, H);
  if (failed(pm)) return { fail: pm.fail, z: H / 2 };
  if (failed(pH)) return { fail: pH.fail, z: H };
  return {
    H, zs, A: mk('A'), B: mk('B'),
    plan: { z0: [p0.A, p0.B], zMid: [pm.A, pm.B], zH: [pH.A, pH.B] },
    nodes: ls.map((l) => l.node), topology: topo, warn: ls.find((l) => l.warn)?.warn ?? null,
  };
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

/**
 * PLANO B (METODOLOGIA S1 "Não passou"): reta×reta usa a junção exata; com arco inclinado cada parede recebe corte de
 * topo simples (`noJoin` geométrico: pontas retas, sem junção) e o aviso `arcoInclinadoSemJuncao`.
 */
export function wallTiltJoinPlanoB(A: TiltWall, B: TiltWall, H: number, intermediate = 4): { r: TiltJoinResult | TiltJoinFail; aviso: string | null } {
  const comArco = !!(A.frame.arc || B.frame.arc) && (A.tiltDeg !== 0 || B.tiltDeg !== 0);
  if (!comArco) return { r: wallTiltJoin(A, B, H, intermediate), aviso: null };
  return { r: wallTiltJoin(A, B, H, intermediate, { pair: null, tee: [] }), aviso: 'arcoInclinadoSemJuncao' };
}

/** Anéis de planta de cada camada (com espessura) de uma parede do conjunto, na cota do `LevelSet`; camadas de espessura nula ficam de fora. */
export function levelRings(ls: LevelSet, id: string): Map<number, Ring> {
  const f = ls.frames.get(id)!;
  const e = ls.ends.get(id)!;
  const out = new Map<number, Ring>();
  for (const sp of layerSpans(f.type)) {
    if (sp.layer.thickness < 1e-6) continue;
    out.set(sp.index, layerQuad(f, e, sAtDepth(f, sp.from), sAtDepth(f, sp.to)));
  }
  return out;
}

/** Pontos de canto de um conjunto (as pontas de cada fronteira de camada de cada parede, mais os nós): dão o desvio entre níveis. */
function cornerPoints(ls: LevelSet): Vec2[] {
  const pts: Vec2[] = [...ls.nodes.values()];
  for (const [id, f] of ls.frames) {
    const e = ls.ends.get(id)!;
    for (const sp of layerSpans(f.type)) {
      for (const d of [sp.from, sp.to]) for (const w of ['a', 'b'] as const) pts.push(layerEndPoint(f, w, e[w], sAtDepth(f, d)));
    }
  }
  return pts;
}

/** Desvio padrão da corda (m) da curva do canto entre níveis: 0,5 mm. */
export const TOL_CORDA = 5e-4;
const MAX_NIVEIS = 65;

/**
 * Níveis adaptativos de 0 a H. A curva do canto de arcos inclinados não é reta em z: bisseção de cada intervalo até
 * o ponto médio (cota H/2 do intervalo) ficar a menos de `tol` da corda entre as pontas (interpolação linear em z).
 * Sempre inclui 0, H/2 e H. Reta×reta dá exatamente [0, H/2, H] (o canto é linear em z). `fail` se algum nível é inviável.
 */
export function levelSetAdaptive(walls: ReadonlyMap<string, TiltWall>, rels: readonly Relation[], H: number, tol = TOL_CORDA): { zs: number[]; sets: LevelSet[] } | TiltJoinFail {
  const s0 = levelSet(walls, rels, 0);
  if (failed(s0)) return s0;
  const memo = new Map<number, LevelSet>([[0, s0]]);
  const at = (z: number): LevelSet | TiltJoinFail => {
    const m = memo.get(z);
    if (m) return m;
    const r = levelSet(walls, rels, z, s0);
    if (!failed(r)) memo.set(z, r);
    return r;
  };
  const sH = at(H);
  if (failed(sH)) return sH;
  const pts = new Map<number, Vec2[]>();
  const ptsOf = (z: number): Vec2[] => pts.get(z) ?? (pts.set(z, cornerPoints(memo.get(z)!)), pts.get(z)!);
  let n = 2;
  const split = (z0: number, z1: number, force: boolean): number[] | TiltJoinFail => {
    const zm = (z0 + z1) / 2;
    const sm = at(zm);
    if (failed(sm)) return sm;
    const p0 = ptsOf(z0), p1 = ptsOf(z1), pm = ptsOf(zm);
    let dev = 0;
    if (p0.length !== p1.length || p0.length !== pm.length) dev = Infinity;
    else for (let i = 0; i < pm.length; i++) dev = Math.max(dev, Math.hypot(pm[i]!.x - (p0[i]!.x + p1[i]!.x) / 2, pm[i]!.y - (p0[i]!.y + p1[i]!.y) / 2));
    if (!force && (dev <= tol || n >= MAX_NIVEIS)) return [];
    n++;
    const a = split(z0, zm, false);
    if (!Array.isArray(a)) return a;
    const b = split(zm, z1, false);
    if (!Array.isArray(b)) return b;
    return [...a, zm, ...b];
  };
  const mids = split(0, H, true);
  if (!Array.isArray(mids)) return mids;
  const all = [0, ...mids, H];
  return { zs: all, sets: all.map((z) => memo.get(z)!) };
}

/** Anéis de cada camada de cada parede em todos os níveis adaptativos: `rings[i]` pertence a `zs[i]`. */
export interface LevelLayers {
  zs: number[];
  walls: Map<string, Array<{ layerIndex: number; rings: Ring[] }>>;
}
export function levelLayers(walls: ReadonlyMap<string, TiltWall>, rels: readonly Relation[], H: number, tol = TOL_CORDA): LevelLayers | TiltJoinFail {
  const r = levelSetAdaptive(walls, rels, H, tol);
  if (failed(r)) return r;
  const out: LevelLayers['walls'] = new Map();
  for (const id of walls.keys()) {
    const per = r.sets.map((ls) => levelRings(ls, id));
    out.set(id, [...per[0]!.keys()].map((layerIndex) => ({ layerIndex, rings: per.map((m) => m.get(layerIndex)!) })));
  }
  return { zs: r.zs, walls: out };
}
