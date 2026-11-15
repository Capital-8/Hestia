/**
 * S5 / N1: nó de N >= 3 paredes inclinadas (retas). Função pura (docs/parede-formas/ESTADO.md, seção S5/N1).
 *
 * Em cada cota z o eixo de cada parede se desloca d(z) = z·tanθ para a esquerda da direção que SAI do nó e a espessura
 * horizontal cresce 1/cosθ (o mesmo modelo de `levelFrame`). As paredes são ordenadas por ângulo (anti-horário) e cada par
 * de faces VIZINHAS (a face esquerda de uma contra a face direita da seguinte) se cruza num ponto: esse ponto é o canto
 * esquerdo de uma parede e o canto direito da outra. Os pares são independentes (as três retas não precisam passar pelo
 * mesmo ponto), como no nó vertical (`joinNode`), por nível.
 *
 * Casos:
 *  - par colinear oposto (|sen| < 2°, sentidos opostos): "passante" (barra). A barra corta reto, num plano
 *    perpendicular ao eixo pelo nó; as demais (hastes) encostam nas faces da barra (nó em T e em X);
 *  - lacuna > 180°: o cruzamento das faces fica atrás do nó (canto externo, como o L); limitado por `PONTA_MAX` espessuras;
 *  - paredes na mesma direção ou ponta além do comprimento: falha tipada, o nó degrada;
 *  - miolo do nó: o polígono formado pelos cantos não é de nenhuma parede; a primeira parede de cada trecho de hastes o
 *    recebe como vértices extras (sem fresta, sem sobreposição).
 */
import type { Vec2 } from '@hestia/geom';
import type { Mesh, Vec3 } from './wallTiltJoin.ts';

export type { Mesh };

/** Área com sinal (positiva = anti-horário) de um laço. */
export const polyArea = (p: readonly Vec2[]): number => p.reduce((s, q, i) => s + (q.x * p[(i + 1) % p.length]!.y - p[(i + 1) % p.length]!.x * q.y), 0) / 2;
/** Volume com sinal de uma malha fechada (tetraedros com a origem). */
export function meshVolume(m: Mesh): number {
  let s = 0;
  for (const [i, j, k] of m.t) {
    const a = m.v[i]!, b = m.v[j]!, c = m.v[k]!;
    s += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return s;
}

export type NoFailKind = 'poucas-paredes' | 'sobrepostas' | 'ponta-longa' | 'parede-curta' | 'degenerado' | 'nucleo-invalido';
export interface NoFail {
  fail: NoFailKind;
  z?: number;
  wallId?: string;
}
export const noFailed = (r: object): r is NoFail => 'fail' in r;

/** Abaixo disso (|sen|) duas paredes são colineares (mesma regra de `resolveNode`, ~2°). */
const COLINEAR = 0.035;
/** Máximo da distância do canto ao nó, em espessuras (canto externo de lacuna muito aguda). */
const PONTA_MAX = 12;
const RAD = Math.PI / 180;

/** Parede que sai do nó (dados da base). Inclinação positiva = topo à ESQUERDA da direção que sai do nó. */
export interface NoWall {
  id: string;
  /** Graus, direção que sai do nó. */
  angleDeg: number;
  tiltDeg: number;
  thickness: number;
  length: number;
  /** Faces em relação ao eixo (base): direita (negativo) e esquerda (positivo); padrão ∓thickness/2. */
  sLo?: number;
  sHi?: number;
  /** Menor = recebe o miolo do nó quando não há barra. */
  rank?: number;
}
/** Parede numa cota: eixo `o` (ponto da ponta do nó), direção unitária `u` que sai do nó, faces em `lo < 0 < hi` lateral. */
export interface NoLine {
  id: string;
  o: Vec2;
  u: Vec2;
  lo: number;
  hi: number;
  len: number;
  rank?: number;
}

const perp = (u: Vec2): Vec2 => ({ x: -u.y, y: u.x });
const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

/** Parede na cota z: eixo deslocado d(z) à esquerda, faces com a espessura horizontal 1/cosθ. */
export function noLineAt(w: NoWall, z: number): NoLine | NoFail {
  const th = w.tiltDeg * RAD;
  const c = Math.cos(th);
  if (!(c > 1e-3) || !(w.thickness > 0) || !(w.length > 0)) return { fail: 'degenerado', z, wallId: w.id };
  const a = w.angleDeg * RAD;
  const u = { x: Math.cos(a), y: Math.sin(a) };
  const n = perp(u);
  const d = z * Math.tan(th);
  return {
    id: w.id,
    o: { x: n.x * d, y: n.y * d },
    u,
    lo: (w.sLo ?? -w.thickness / 2) / c,
    hi: (w.sHi ?? w.thickness / 2) / c,
    len: w.length,
    ...(w.rank !== undefined ? { rank: w.rank } : {}),
  };
}

export interface NoCorner {
  /** Canto da face direita e da face esquerda (em relação à direção que sai do nó). */
  r: Vec2;
  l: Vec2;
}
/** Resultado de uma cota. `loops[id]` = laço CCW da parede: [R, longe R, longe L, L, ...vértices extras do miolo]. */
export interface NoLevel {
  order: string[];
  corners: Map<string, NoCorner>;
  loops: Map<string, Vec2[]>;
  /** Linhas das paredes na cota, na ordem angular (`order`). */
  lines: NoLine[];
  /** Miolo de cada dona: [R, L, ...vértices extras] (laço sem a parte longe da parede). */
  hubs: Array<{ owner: string; poly: Vec2[] }>;
}
/** Estrutura do nó (só depende dos ângulos): ordem, barra e quem recebe o miolo. */
export interface NoTopology {
  order: number[];
  bars: [number, number] | null;
  /** Para cada índice (em `order`) de parede dominante: índices (em `order`) dos cantos extras, nesta ordem. */
  fills: Map<number, Array<{ wall: number; side: 'r' | 'l' }>>;
}

const facePoint = (w: NoLine, lat: number): Vec2 => {
  const n = perp(w.u);
  return { x: w.o.x + n.x * lat, y: w.o.y + n.y * lat };
};
/** Cruzamento da face esquerda de `a` com a face direita de `b`; null se paralelas. */
function crossFaces(a: NoLine, b: NoLine): Vec2 | null {
  const pa = facePoint(a, a.hi), pb = facePoint(b, b.lo);
  const c = cross(a.u, b.u);
  if (Math.abs(c) < 1e-12) return null;
  const t = cross({ x: pb.x - pa.x, y: pb.y - pa.y }, b.u) / c;
  return { x: pa.x + a.u.x * t, y: pa.y + a.u.y * t };
}

/** Ordem angular, barra e preenchimento do miolo (só pelas direções). */
export function noTopology(lines: readonly NoLine[]): NoTopology | NoFail {
  const n = lines.length;
  if (n < 3) return { fail: 'poucas-paredes' };
  const ang = lines.map((l) => Math.atan2(l.u.y, l.u.x));
  const order = lines.map((_, i) => i).sort((x, y) => ang[x]! - ang[y]!);
  // Mesma direção (ou quase): sobrepostas.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = lines[i]!, b = lines[j]!;
      if (Math.abs(cross(a.u, b.u)) < COLINEAR && dot(a.u, b.u) > 0) return { fail: 'sobrepostas', wallId: a.id };
    }
  }
  // Barra: o par colinear oposto de maior espessura mínima (empate: o primeiro na ordem de entrada).
  let bars: [number, number] | null = null;
  let best = -1, bestIdx = Infinity;
  for (let p = 0; p < n; p++) {
    for (let q = p + 1; q < n; q++) {
      const a = lines[order[p]!]!, b = lines[order[q]!]!;
      if (Math.abs(cross(a.u, b.u)) >= COLINEAR || dot(a.u, b.u) >= 0) continue;
      const m = Math.min(a.hi - a.lo, b.hi - b.lo);
      const idx = order[p]! + order[q]!; // empate: o par que vem primeiro na entrada
      if (m > best + 1e-12 || (m > best - 1e-12 && idx < bestIdx)) { best = Math.max(best, m); bestIdx = idx; bars = [p, q]; }
    }
  }
  const fills = new Map<number, Array<{ wall: number; side: 'r' | 'l' }>>();
  const isBar = (p: number): boolean => !!bars && (p === bars[0] || p === bars[1]);
  if (!bars) {
    // Anel de cantos C_k = L_k (R_k = C_{k-1}); a parede de menor rank recebe C_{d+1} ... C_{d-2}.
    let d = 0;
    for (let p = 1; p < n; p++) if ((lines[order[p]!]!.rank ?? p) < (lines[order[d]!]!.rank ?? d)) d = p;
    const ex: Array<{ wall: number; side: 'r' | 'l' }> = [];
    for (let k = 1; k <= n - 2; k++) ex.push({ wall: (d + k) % n, side: 'l' });
    fills.set(d, ex);
  } else {
    // Cada trecho de hastes entre duas barras consecutivas (anti-horário): a primeira haste recebe L_2..L_m, R_Y e L_X.
    for (let p = 0; p < n; p++) {
      if (!isBar(p)) continue;
      let q = (p + 1) % n;
      const run: number[] = [];
      while (!isBar(q)) { run.push(q); q = (q + 1) % n; }
      if (run.length === 0) continue;
      const ex: Array<{ wall: number; side: 'r' | 'l' }> = [];
      for (let k = 1; k < run.length; k++) ex.push({ wall: run[k]!, side: 'l' });
      ex.push({ wall: q, side: 'r' }, { wall: p, side: 'l' });
      fills.set(run[0]!, ex);
    }
  }
  return { order, bars, fills };
}

/** Cantos e laços do nó numa cota (`topo` calculada uma vez por nó). */
export function noLevel(lines: readonly NoLine[], topo: NoTopology, z?: number): NoLevel | NoFail {
  const n = lines.length;
  const L = topo.order.map((i) => lines[i]!);
  const isBar = (p: number): boolean => !!topo.bars && (p === topo.bars[0] || p === topo.bars[1]);
  const R: Vec2[] = new Array(n), Lc: Vec2[] = new Array(n);
  // Plano da barra: perpendicular ao eixo, pelo ponto médio das duas pontas.
  let plane: { p: Vec2; w: Vec2 } | null = null;
  if (topo.bars) {
    const a = L[topo.bars[0]]!, b = L[topo.bars[1]]!;
    const w = { x: a.u.x - b.u.x, y: a.u.y - b.u.y };
    const m = Math.hypot(w.x, w.y);
    plane = { p: { x: (a.o.x + b.o.x) / 2, y: (a.o.y + b.o.y) / 2 }, w: { x: w.x / m, y: w.y / m } };
  }
  const onPlane = (w: NoLine, lat: number): Vec2 | null => {
    const p0 = facePoint(w, lat);
    const den = dot(w.u, plane!.w);
    if (Math.abs(den) < 1e-9) return null;
    const t = -dot({ x: p0.x - plane!.p.x, y: p0.y - plane!.p.y }, plane!.w) / den;
    return { x: p0.x + w.u.x * t, y: p0.y + w.u.y * t };
  };
  for (let p = 0; p < n; p++) {
    if (isBar(p)) {
      const r = onPlane(L[p]!, L[p]!.lo), l = onPlane(L[p]!, L[p]!.hi);
      if (!r || !l) return { fail: 'degenerado', z, wallId: L[p]!.id };
      R[p] = r; Lc[p] = l;
    }
  }
  const cutOf = (p: number): Vec2 | null => crossFaces(L[p]!, L[(p + 1) % n]!);
  for (let p = 0; p < n; p++) {
    const q = (p + 1) % n;
    if (isBar(p) && isBar(q)) continue; // as duas barras vizinhas já cortam no plano
    const P = cutOf(p);
    if (!P) return { fail: 'degenerado', z, wallId: L[p]!.id };
    if (!isBar(p)) Lc[p] = P;
    if (!isBar(q)) R[q] = P;
  }
  // Haste que encosta na face da barra: o cruzamento tem de cair no corpo dessa metade (a menos que as duas metades tenham a mesma face).
  if (topo.bars && plane) {
    const [b0, b1] = topo.bars;
    const off = (w: NoLine, P: Vec2, lat: number): number => Math.abs(cross(w.u, { x: P.x - facePoint(w, lat).x, y: P.y - facePoint(w, lat).y }));
    for (let p = 0; p < n; p++) {
      const q = (p + 1) % n;
      if (isBar(p) === isBar(q)) continue;
      const bw = isBar(p) ? p : q;
      const other = bw === b0 ? b1 : b0;
      const W = L[bw]!, O = L[other]!;
      const lat = isBar(p) ? W.hi : W.lo, latO = isBar(p) ? O.lo : O.hi;
      const Q = isBar(p) ? R[q]! : Lc[p]!;
      const along = dot({ x: Q.x - plane.p.x, y: Q.y - plane.p.y }, W.u);
      if (along >= -1e-9) continue;
      if (off(O, Q, latO) < 1e-9 && off(W, Q, lat) < 1e-9) continue;
      return { fail: 'parede-curta', z, wallId: W.id };
    }
  }
  const maxT = Math.max(...L.map((w) => w.hi - w.lo));
  const cx = L.reduce((s, w) => s + w.o.x, 0) / n, cy = L.reduce((s, w) => s + w.o.y, 0) / n;
  const corners = new Map<string, NoCorner>();
  const loops = new Map<string, Vec2[]>();
  const hubs: NoLevel['hubs'] = [];
  for (let p = 0; p < n; p++) {
    const w = L[p]!;
    const r = R[p]!, l = Lc[p]!;
    for (const q of [r, l]) {
      if (!Number.isFinite(q.x) || !Number.isFinite(q.y)) return { fail: 'degenerado', z, wallId: w.id };
      if (Math.hypot(q.x - cx, q.y - cy) > PONTA_MAX * maxT) return { fail: 'ponta-longa', z, wallId: w.id };
      if (dot({ x: q.x - w.o.x, y: q.y - w.o.y }, w.u) > w.len - 1e-3) return { fail: 'parede-curta', z, wallId: w.id };
    }
    corners.set(w.id, { r, l });
  }
  for (let p = 0; p < n; p++) {
    const w = L[p]!;
    const r = R[p]!, l = Lc[p]!;
    const far = (lat: number): Vec2 => ((q) => ({ x: q.x + w.u.x * w.len, y: q.y + w.u.y * w.len }))(facePoint(w, lat));
    const loop: Vec2[] = [r, far(w.lo), far(w.hi), l];
    for (const e of topo.fills.get(p) ?? []) loop.push(e.side === 'l' ? Lc[e.wall]! : R[e.wall]!);
    if (!(polyArea(loop) > 1e-9) || !simple(loop)) return { fail: 'nucleo-invalido', z, wallId: w.id };
    loops.set(w.id, loop);
    if (loop.length > 4) hubs.push({ owner: w.id, poly: [loop[0]!, loop[3]!, ...loop.slice(4)] });
  }
  return { order: L.map((w) => w.id), corners, loops, lines: L, hubs };
}

/** Polígono sem arestas que se cruzam (arestas não adjacentes; toque em vértice conta como cruzamento só se atravessar). */
function simple(p: readonly Vec2[]): boolean {
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[i]!, b = p[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      const c = p[j]!, d = p[(j + 1) % n]!;
      const d1 = cross({ x: b.x - a.x, y: b.y - a.y }, { x: c.x - a.x, y: c.y - a.y });
      const d2 = cross({ x: b.x - a.x, y: b.y - a.y }, { x: d.x - a.x, y: d.y - a.y });
      const d3 = cross({ x: d.x - c.x, y: d.y - c.y }, { x: a.x - c.x, y: a.y - c.y });
      const d4 = cross({ x: d.x - c.x, y: d.y - c.y }, { x: b.x - c.x, y: b.y - c.y });
      const e = 1e-12;
      if (((d1 > e && d2 < -e) || (d1 < -e && d2 > e)) && ((d3 > e && d4 < -e) || (d3 < -e && d4 > e))) return false;
    }
  }
  return true;
}

/** Triangulação por orelhas (índices) de um laço, qualquer sentido; vazio se a área é nula. */
export function triangulaMiolo(poly: readonly Vec2[]): Array<[number, number, number]> {
  const a = polyArea(poly);
  if (Math.abs(a) < 1e-9) return [];
  if (a > 0) return earClip(poly);
  const rev = [...poly].reverse();
  const n = poly.length;
  return earClip(rev).map(([i, j, k]) => [n - 1 - i, n - 1 - j, n - 1 - k]);
}

/**
 * Deformação contínua do nó (N1): leva um ponto da planta VERTICAL do nó (zona de cada parede + miolo) à planta na cota z.
 * Cada parede tem a sua faixa (R, L, longe), o miolo é triangulado. Tudo é LINEAR em z (retas): guarda-se z=0 e a inclinação por metro.
 */
export interface NodeWarp {
  walls: Array<{
    id: string; o: Vec2; u: Vec2; len: number; lo: number; hi: number; tan: number; inv: number;
    /** Cantos verticais (base, sem inclinação) e cantos inclinados em z=0 com a variação por metro de cota. */
    Rv: Vec2; Lv: Vec2; R0: Vec2; L0: Vec2; dR: Vec2; dL: Vec2;
  }>;
  hubs: Array<{ vert: Vec2[]; p0: Vec2[]; dp: Vec2[]; tri: Array<[number, number, number]> }>;
}
export function nodeWarp(vert: NoLevel, t0: NoLevel, t1: NoLevel, zr: number, tiltDeg: ReadonlyMap<string, number>): NodeWarp {
  const walls = vert.lines.map((w) => {
    const th = (tiltDeg.get(w.id) ?? 0) * RAD;
    const c0 = t0.corners.get(w.id)!, c1 = t1.corners.get(w.id)!, cv = vert.corners.get(w.id)!;
    return {
      id: w.id, o: w.o, u: w.u, len: w.len, lo: w.lo, hi: w.hi, tan: Math.tan(th), inv: 1 / Math.cos(th),
      Rv: cv.r, Lv: cv.l, R0: c0.r, L0: c0.l,
      dR: { x: (c1.r.x - c0.r.x) / zr, y: (c1.r.y - c0.r.y) / zr }, dL: { x: (c1.l.x - c0.l.x) / zr, y: (c1.l.y - c0.l.y) / zr },
    };
  });
  const hubs = vert.hubs.flatMap((h, i) => {
    const tri = triangulaMiolo(h.poly);
    if (!tri.length) return [];
    const a = t0.hubs[i]!.poly, b = t1.hubs[i]!.poly;
    return [{ vert: h.poly, p0: a, dp: a.map((q, k) => ({ x: (b[k]!.x - q.x) / zr, y: (b[k]!.y - q.y) / zr })), tri }];
  });
  return { walls, hubs };
}

export interface NoResult {
  zs: number[];
  order: string[];
  bars: [string, string] | null;
  levels: NoLevel[];
}
/** Nó completo nas cotas `zs` (paredes retas com inclinação). */
export function wallTiltNo(walls: readonly NoWall[], zs: readonly number[]): NoResult | NoFail {
  const base: NoLine[] = [];
  for (const w of walls) {
    const l = noLineAt(w, 0);
    if (noFailed(l)) return l;
    base.push(l);
  }
  const topo = noTopology(base);
  if (noFailed(topo)) return topo;
  const levels: NoLevel[] = [];
  for (const z of zs) {
    const lines: NoLine[] = [];
    for (const w of walls) lines.push(noLineAt(w, z) as NoLine);
    const lv = noLevel(lines, topo, z);
    if (noFailed(lv)) return lv;
    levels.push(lv);
  }
  const bars = topo.bars ? ([base[topo.order[topo.bars[0]]!]!.id, base[topo.order[topo.bars[1]]!]!.id] as [string, string]) : null;
  return { zs: [...zs], order: topo.order.map((i) => base[i]!.id), bars, levels };
}

/** Triangulação por orelhas de um laço CCW (índices do laço). */
function earClip(p: readonly Vec2[]): Array<[number, number, number]> {
  const idx = p.map((_, i) => i);
  const out: Array<[number, number, number]> = [];
  const inTri = (q: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean =>
    cross({ x: b.x - a.x, y: b.y - a.y }, { x: q.x - a.x, y: q.y - a.y }) >= -1e-12 &&
    cross({ x: c.x - b.x, y: c.y - b.y }, { x: q.x - b.x, y: q.y - b.y }) >= -1e-12 &&
    cross({ x: a.x - c.x, y: a.y - c.y }, { x: q.x - c.x, y: q.y - c.y }) >= -1e-12;
  let guard = 0;
  while (idx.length > 3 && guard++ < 1000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length]!, i1 = idx[k]!, i2 = idx[(k + 1) % idx.length]!;
      const a = p[i0]!, b = p[i1]!, c = p[i2]!;
      if (cross({ x: b.x - a.x, y: b.y - a.y }, { x: c.x - b.x, y: c.y - b.y }) <= 1e-14) continue;
      if (idx.some((j) => j !== i0 && j !== i1 && j !== i2 && inTri(p[j]!, a, b, c))) continue;
      out.push([i0, i1, i2]);
      idx.splice(k, 1);
      cut = true;
      break;
    }
    if (!cut) { // laço com vértices colineares: corta o primeiro vértice
      const i0 = idx[idx.length - 1]!, i1 = idx[0]!, i2 = idx[1]!;
      out.push([i0, i1, i2]);
      idx.shift();
    }
  }
  if (idx.length === 3) out.push([idx[0]!, idx[1]!, idx[2]!]);
  return out;
}

const key2 = (p: Vec2): string => `${p.x.toFixed(9)},${p.y.toFixed(9)}`; // units-ok: chave interna de vértice

/**
 * Malha fechada de uma parede do nó nas cotas de `res.zs`: tampa e base trianguladas, faces laterais regradas entre níveis.
 * Cada quadrilátero lateral usa a diagonal escolhida pela posição dos vértices (não pela ordem do laço), então duas paredes
 * que dividem a face usam os mesmos triângulos (sem fresta e sem sobreposição entre elas).
 */
export function noWallMesh(res: NoResult, id: string): Mesh {
  const loops = res.levels.map((l) => l.loops.get(id)!);
  const n = loops[0]!.length;
  const v: Vec3[] = loops.flatMap((poly, i) => poly.map((q): Vec3 => [q.x, q.y, res.zs[i]!]));
  const t: Mesh['t'] = [];
  const ear = earClip(loops[0]!);
  const last = (loops.length - 1) * n;
  for (const [a, b, c] of ear) {
    t.push([a, c, b]); // base: normal -z
    t.push([last + a, last + b, last + c]); // topo: normal +z
  }
  for (let l = 0; l < loops.length - 1; l++) {
    for (let j = 0; j < n; j++) {
      const j1 = (j + 1) % n;
      const p0 = l * n + j, q0 = l * n + j1, q1 = (l + 1) * n + j1, p1 = (l + 1) * n + j;
      // diagonal: do vértice de menor chave (na cota de baixo) para o de cima do outro
      if (key2(loops[l]![j]!) <= key2(loops[l]![j1]!)) t.push([p0, q0, q1], [p0, q1, p1]);
      else t.push([p0, q0, p1], [q0, q1, p1]);
    }
  }
  return { v, t: t.filter(([a, b, c]) => triArea(v[a]!, v[b]!, v[c]!) > 1e-14) };
}
const triArea = (a: Vec3, b: Vec3, c: Vec3): number => {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return Math.hypot(u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!) / 2;
};
