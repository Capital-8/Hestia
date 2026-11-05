import {
  add,
  arcFromSagitta,
  arcSample,
  closestOnSegment,
  cross,
  dist,
  dot,
  lerp,
  len,
  mid,
  mul,
  sub,
  type Vec2,
} from '@hestia/geom';
import { t, type DictKey, type Lang } from './i18nMessages.ts';

/** Reta (sag = 0) ou arco por flecha, mesma convenção de `arcFromSagitta`. Estrutura igual a `StairCurve` do modelo. */
export interface StairCurve {
  a: Vec2;
  b: Vec2;
  sag: number;
}

/** Croqui de um lance (decisão 0011 §2). Os limites são cadeias contínuas; o esquerdo fica à esquerda no sentido de subida. */
export interface StairRunSketch {
  boundaryLeft: StairCurve[];
  boundaryRight: StairCurve[];
  risers: StairCurve[];
  path: StairCurve[];
}

export interface StairLandingSketch {
  boundary: StairCurve[];
}

export interface StairSketchIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  /** Índice do espelho em `run.risers` (a ordem do vetor não tem relação com a subida). */
  riserIndex?: number;
}

/** Erro máximo de corda ao amostrar arcos: flecha de 0,3 mm. */
export const SAMPLE_TOL = 0.0003;
/** Continuidade entre segmentos de uma cadeia (m). */
export const CHAIN_TOL = 1e-6;
/** Toque ou cruzamento entre linhas (m). */
export const TOUCH_TOL = 1e-6;
/** Distância máxima para a caminhada encostar em um espelho (m). */
export const PATH_TOL = 1e-3;
const POINT_TOL = 1e-7;
const SEG_TOL = 1e-9;

/** Textos exatos da decisão 0011 §3 (pt-BR). Use `sketchIssue` para obter o texto no idioma pedido. */
const SKETCH_KEYS: Record<string, DictKey> = {
  'stair-boundaries-touch': 'egb_stair_sketch_boundaries_touch',
  'stair-boundary-gap': 'egb_stair_sketch_boundary_gap',
  'stair-riser-on-boundary': 'egb_stair_sketch_riser_on_boundary',
  'stair-riser-crossing': 'egb_stair_sketch_riser_crossing',
  'stair-riser-boundary-multi': 'egb_stair_sketch_riser_boundary_multi',
  'stair-riser-not-spanning': 'egb_stair_sketch_riser_not_spanning',
  'stair-riser-same-location': 'egb_stair_sketch_riser_same',
  'stair-path-ends': 'egb_stair_sketch_path_ends',
  'stair-path-misses-riser': 'egb_stair_sketch_path_misses',
  'stair-landing-open': 'egb_stair_sketch_landing_open',
};

export const STAIR_SKETCH_MESSAGES: Record<string, string> = Object.fromEntries(
  Object.entries(SKETCH_KEYS).map(([code, key]) => [code, t('pt', key)]),
);

/** Código do croqui e o texto no idioma pedido (sem chave conhecida, devolve o próprio código). */
export function stairSketchText(code: string, lang: Lang = 'pt'): string {
  const key = SKETCH_KEYS[code];
  return key ? t(lang, key) : code;
}

/** Erro de croqui. `message` substitui o texto padrão quando a mensagem traz o espelho, o limite ou a distância. */
export function sketchIssue(code: string, riserIndex?: number, message?: string, lang: Lang = 'pt'): StairSketchIssue {
  const issue: StairSketchIssue = { code, severity: 'error', message: message ?? stairSketchText(code, lang) };
  if (riserIndex !== undefined) issue.riserIndex = riserIndex;
  return issue;
}

/** Amostra uma reta (2 pontos) ou um arco em polilinha, com erro de corda ≤ `step` (padrão 0,3 mm). */
export function sampleCurve(c: StairCurve, step = SAMPLE_TOL): Vec2[] {
  const arc = Math.abs(c.sag) < 1e-6 ? null : arcFromSagitta(c.a, c.b, c.sag);
  if (!arc) return [{ ...c.a }, { ...c.b }];
  const pts = arcSample(arc, 0, arc.length, 0, step);
  pts[0] = { ...c.a };
  pts[pts.length - 1] = { ...c.b };
  return pts;
}

export function pushDistinct(out: Vec2[], p: Vec2): void {
  const last = out[out.length - 1];
  if (!last || dist(last, p) > POINT_TOL) out.push(p);
}

/** Cadeia amostrada sem pontos repetidos nas emendas. */
export function sampleChain(cs: StairCurve[]): Vec2[] {
  const out: Vec2[] = [];
  for (const c of cs) for (const p of sampleCurve(c)) pushDistinct(out, p);
  return out;
}

/** Vazia, ou com emenda que não encosta (fim de um segmento ≠ início do seguinte). */
export function chainBroken(cs: StairCurve[]): boolean {
  if (cs.length === 0) return true;
  for (let i = 1; i < cs.length; i++) if (dist(cs[i - 1]!.b, cs[i]!.a) > CHAIN_TOL) return true;
  return false;
}

/** Polilinha com comprimento de arco acumulado (`cum[i]` é a distância do início até `pts[i]`). */
export interface Poly {
  pts: Vec2[];
  cum: number[];
}

export function makePoly(pts: Vec2[]): Poly {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + dist(pts[i - 1]!, pts[i]!));
  return { pts, cum };
}

export const polyLength = (p: Poly): number => p.cum[p.cum.length - 1] ?? 0;
const segCount = (p: Poly): number => Math.max(0, p.pts.length - 1);
const segLen = (p: Poly, i: number): number => p.cum[i + 1]! - p.cum[i]!;

/** Índice j do segmento que contém o comprimento `s` (cum[j] ≤ s ≤ cum[j+1]). */
export function segAt(p: Poly, s: number): number {
  let j = 0;
  while (j < segCount(p) - 1 && p.cum[j + 1]! < s) j++;
  return j;
}

/** Ponto à distância `s` do início (limitado às extremidades). */
export function pointAtLength(p: Poly, s: number): Vec2 {
  const n = p.pts.length;
  if (n === 1 || s <= 0) return p.pts[0]!;
  if (s >= polyLength(p)) return p.pts[n - 1]!;
  const j = segAt(p, s);
  const l = segLen(p, j);
  return lerp(p.pts[j]!, p.pts[j + 1]!, l < 1e-12 ? 0 : (s - p.cum[j]!) / l);
}

/** Ponto de um cruzamento entre espelho e outra polilinha: `s` no espelho, `sb` na outra. */
export interface Hit {
  p: Vec2;
  s: number;
  sb: number;
}

/** Interseção de dois segmentos fechados. Null se paralelos (inclusive colineares) ou sem interseção. */
export function segmentHit(
  p1: Vec2,
  p2: Vec2,
  q1: Vec2,
  q2: Vec2,
): { point: Vec2; t: number; u: number } | null {
  const d = sub(p2, p1);
  const e = sub(q2, q1);
  const den = cross(d, e);
  if (Math.abs(den) <= 1e-12 * len(d) * len(e)) return null;
  const qp = sub(q1, p1);
  const t = cross(qp, e) / den;
  const u = cross(qp, d) / den;
  if (t < -SEG_TOL || t > 1 + SEG_TOL || u < -SEG_TOL || u > 1 + SEG_TOL) return null;
  const tc = Math.min(1, Math.max(0, t));
  const uc = Math.min(1, Math.max(0, u));
  return { point: add(p1, mul(d, tc)), t: tc, u: uc };
}

/**
 * Todos os cruzamentos de `A` com `B`, sem tirar os que caem no mesmo ponto. Um caracol de mais de 360° passa pelo mesmo
 * ponto em planta uma vez por volta: o `sb` distingue as voltas. `s` vem de `A`, `sb` de `B`.
 */
export function crossingsAll(A: Poly, B: Poly): Hit[] {
  const out: Hit[] = [];
  const nB = segCount(B);
  // Caixa de cada segmento de B, folgada pela tolerância de `segmentHit`: descarta barato os pares distantes (mesmo
  // resultado, só sem chamar `segmentHit` em O(n·m) pares que não têm como se cruzar).
  const bx0: number[] = [];
  const bx1: number[] = [];
  const by0: number[] = [];
  const by1: number[] = [];
  for (let j = 0; j < nB; j++) {
    const q1 = B.pts[j]!;
    const q2 = B.pts[j + 1]!;
    const m = 2 * SEG_TOL * (Math.abs(q2.x - q1.x) + Math.abs(q2.y - q1.y)) + 1e-12;
    bx0.push(Math.min(q1.x, q2.x) - m);
    bx1.push(Math.max(q1.x, q2.x) + m);
    by0.push(Math.min(q1.y, q2.y) - m);
    by1.push(Math.max(q1.y, q2.y) + m);
  }
  for (let i = 0; i < segCount(A); i++) {
    const p1 = A.pts[i]!;
    const p2 = A.pts[i + 1]!;
    const ma = 2 * SEG_TOL * (Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y)) + 1e-12;
    const ax0 = Math.min(p1.x, p2.x) - ma;
    const ax1 = Math.max(p1.x, p2.x) + ma;
    const ay0 = Math.min(p1.y, p2.y) - ma;
    const ay1 = Math.max(p1.y, p2.y) + ma;
    for (let j = 0; j < nB; j++) {
      if (ax1 < bx0[j]! || ax0 > bx1[j]! || ay1 < by0[j]! || ay0 > by1[j]!) continue;
      const h = segmentHit(A.pts[i]!, A.pts[i + 1]!, B.pts[j]!, B.pts[j + 1]!);
      if (!h) continue;
      out.push({ p: h.point, s: A.cum[i]! + h.t * segLen(A, i), sb: B.cum[j]! + h.u * segLen(B, j) });
    }
  }
  return out;
}

/** Cruzamentos de `A` com `B` (pontos distintos). `s` vem de `A`, `sb` de `B`. */
export function crossings(A: Poly, B: Poly): Hit[] {
  const out: Hit[] = [];
  for (const hit of crossingsAll(A, B)) if (!out.some((o) => dist(o.p, hit.p) <= TOUCH_TOL)) out.push(hit);
  return out;
}

/** Há trecho de sobreposição colinear (comprimento > TOUCH_TOL) entre `A` e `B`? */
export function overlapsCollinear(A: Poly, B: Poly): boolean {
  for (let i = 0; i < segCount(A); i++) {
    const p = A.pts[i]!;
    const q = A.pts[i + 1]!;
    const lp = len(sub(q, p));
    if (lp < 1e-9) continue;
    const du = mul(sub(q, p), 1 / lp);
    for (let j = 0; j < segCount(B); j++) {
      const r = B.pts[j]!;
      const s = B.pts[j + 1]!;
      const le = len(sub(s, r));
      if (le < 1e-9) continue;
      if (Math.abs(cross(du, mul(sub(s, r), 1 / le))) > 1e-9) continue;
      if (Math.abs(cross(du, sub(r, p))) > TOUCH_TOL || Math.abs(cross(du, sub(s, p))) > TOUCH_TOL) continue;
      const b0 = dot(sub(r, p), du);
      const b1 = dot(sub(s, p), du);
      const overlap = Math.min(lp, Math.max(b0, b1)) - Math.max(0, Math.min(b0, b1));
      if (overlap > TOUCH_TOL) return true;
    }
  }
  return false;
}

function ptSegDist(p: Vec2, a: Vec2, b: Vec2): number {
  return dist(p, closestOnSegment(p, a, b));
}

function segDist(p1: Vec2, p2: Vec2, q1: Vec2, q2: Vec2): number {
  if (segmentHit(p1, p2, q1, q2)) return 0;
  return Math.min(ptSegDist(p1, q1, q2), ptSegDist(p2, q1, q2), ptSegDist(q1, p1, p2), ptSegDist(q2, p1, p2));
}

function segsOf(pts: Vec2[]): Array<[Vec2, Vec2]> {
  if (pts.length === 1) return [[pts[0]!, pts[0]!]];
  const out: Array<[Vec2, Vec2]> = [];
  for (let i = 0; i + 1 < pts.length; i++) out.push([pts[i]!, pts[i + 1]!]);
  return out;
}

/** Menor distância entre duas polilinhas (um ponto é uma polilinha de 1 vértice). */
export function polyDist(a: Vec2[], b: Vec2[]): number {
  let best = Infinity;
  const sb = segsOf(b);
  for (const [p1, p2] of segsOf(a)) {
    for (const [q1, q2] of sb) {
      const d = segDist(p1, p2, q1, q2);
      if (d < best) best = d;
    }
  }
  return best;
}

/** Espelho preparado: amostra, cruzamentos com os limites e, se liga os dois limites, o trecho aparado. */
export interface RiserGeom {
  index: number;
  full: Poly;
  onBoundary: boolean;
  hitsL: Hit[];
  hitsR: Hit[];
  spans: boolean;
  /** Trecho aparado de `a` (no limite esquerdo) até `b` (no direito); null se não liga os dois. */
  trimmed: Vec2[] | null;
  /** Geometria usada para ordenar e para a caminhada: o trecho aparado, ou a amostra inteira. */
  geom: Poly;
}

export interface Prepared {
  L: Poly;
  R: Poly;
  risers: RiserGeom[];
}

function trimPoints(full: Poly, hl: Hit, hr: Hit): Vec2[] {
  const leftFirst = hl.s <= hr.s;
  const lo = leftFirst ? hl : hr;
  const hi = leftFirst ? hr : hl;
  const out: Vec2[] = [lo.p];
  full.pts.forEach((p, i) => {
    const s = full.cum[i]!;
    if (s > lo.s + SEG_TOL && s < hi.s - SEG_TOL) pushDistinct(out, p);
  });
  pushDistinct(out, hi.p);
  return leftFirst ? out : out.reverse();
}

export function prepareRun(run: StairRunSketch): Prepared {
  const L = makePoly(sampleChain(run.boundaryLeft));
  const R = makePoly(sampleChain(run.boundaryRight));
  const risers = run.risers.map((c, index): RiserGeom => {
    const full = makePoly(sampleCurve(c));
    const onBoundary = overlapsCollinear(full, L) || overlapsCollinear(full, R);
    const hitsL = onBoundary ? [] : crossings(full, L);
    const hitsR = onBoundary ? [] : crossings(full, R);
    const spans = !onBoundary && hitsL.length === 1 && hitsR.length === 1;
    const trimmed = spans ? trimPoints(full, hitsL[0]!, hitsR[0]!) : null;
    return { index, full, onBoundary, hitsL, hitsR, spans, trimmed, geom: trimmed ? makePoly(trimmed) : full };
  });
  return { L, R, risers };
}

/** Ponto médio por comprimento de arco da geometria do espelho. */
export function midOf(p: Poly): Vec2 {
  return pointAtLength(p, polyLength(p) / 2);
}

/**
 * Comprimento na caminhada (path) em que ela cruza o espelho (`hits` = cruzamentos de `geom` com `path`): o 1º; se não
 * cruza, o do ponto mais próximo.
 */
function pathParam(path: Poly, geom: Poly, hits: Hit[]): number {
  if (hits.length > 0) return Math.min(...hits.map((h) => h.sb));
  const m = midOf(geom);
  let best = Infinity;
  let s = 0;
  for (let j = 0; j < segCount(path); j++) {
    const c = closestOnSegment(m, path.pts[j]!, path.pts[j + 1]!);
    const d = dist(m, c);
    if (d < best) {
      best = d;
      s = path.cum[j]! + dist(path.pts[j]!, c);
    }
  }
  return s;
}

/**
 * Linha média entre os dois limites: pontos médios (L(f), R(f)) para f = 0..1 por fração de comprimento de cada limite.
 * Não usa o ponto médio das cordas: para um arco acima de 180° a corda inverte de lado. Sem orientação de subida.
 */
export function midlinePoly(L: Poly, R: Poly, steps = 200): Poly | null {
  if (L.pts.length < 2 || R.pts.length < 2) return null;
  const lt = polyLength(L);
  const rt = polyLength(R);
  const pts: Vec2[] = [];
  for (let k = 0; k <= steps; k++) {
    const f = k / steps;
    pushDistinct(pts, mid(pointAtLength(L, f * lt), pointAtLength(R, f * rt)));
  }
  const W = makePoly(pts);
  return polyLength(W) >= 1e-9 ? W : null;
}

/**
 * Linha média orientada na direção de subida: o limite esquerdo fica à esquerda de quem sobe (decisão 0011 §1), ou seja,
 * L − R = λ·perp(d) com λ > 0 no meio dos limites. A orientação é local, no meio: vale para qualquer varredura.
 */
function ascentWalk(P: Prepared): Poly | null {
  const W = midlinePoly(P.L, P.R);
  if (!W) return null;
  const v = sub(pointAtLength(P.L, polyLength(P.L) / 2), pointAtLength(P.R, polyLength(P.R) / 2));
  if (len(v) < 1e-9) return W;
  const d = { x: v.y / len(v), y: -v.x / len(v) };
  const total = polyLength(W);
  const delta = total * 1e-3;
  const s = total / 2;
  const t = sub(pointAtLength(W, s + delta), pointAtLength(W, s - delta));
  return dot(t, d) >= 0 ? W : makePoly([...W.pts].reverse());
}

/** Ordem de subida dos espelhos (`order`, índices do vetor) e a posição `s` de cada um na caminhada (por índice). */
export interface RiserWalk {
  order: number[];
  s: number[];
  /** Comprimento da caminhada usada (0 sem caminhada). */
  total: number;
}

/**
 * Ordem de subida. Com `byPath` e caminhada válida, a caminhada explícita; senão, a linha média orientada (vale para
 * qualquer varredura). Cada espelho cruza a caminhada uma vez, salvo no caracol de mais de uma volta, em que cruza uma
 * vez por volta (no mesmo ponto em planta). Nesse caso a posição do espelho é a do cruzamento mais próximo de um múltiplo
 * do passo uniforme L÷(N−1) (`uniformWalk`), que é a varredura de um caracol. Sem isso, vale o 1º cruzamento.
 */
export function walkOf(P: Prepared, run: StairRunSketch, byPath: boolean): RiserWalk {
  const path = byPath && run.path.length > 0 ? makePoly(sampleChain(run.path)) : null;
  const guide = path && path.pts.length >= 2 ? path : ascentWalk(P);
  if (!guide) {
    const keyed = P.risers.map((g) => ({ i: g.index, k: midOf(g.geom).x }));
    keyed.sort((x, y) => x.k - y.k || x.i - y.i);
    return { order: keyed.map((o) => o.i), s: [], total: 0 };
  }
  const total = polyLength(guide);
  const hits = P.risers.map((g) => crossingsAll(g.geom, guide));
  const multi = hits.some((hs) => hs.some((h1) => hs.some((h2) => Math.abs(h1.sb - h2.sb) > TOUCH_TOL)));
  const uniform = multi ? uniformWalk(P, hits, total) : null;
  if (uniform) return uniform;
  const keyed = P.risers.map((g, j) => ({ i: g.index, k: pathParam(guide, g.geom, hits[j]!) }));
  keyed.sort((x, y) => x.k - y.k || x.i - y.i);
  const s: number[] = [];
  for (const o of keyed) s[o.i] = o.k;
  return { order: keyed.map((o) => o.i), s, total };
}

/**
 * Espelhos de um caracol de várias voltas: o espelho de ordem k cai em s = k·L÷(N−1). Cada cruzamento de espelho com a
 * caminhada que cai a até um quarto do passo de um múltiplo do passo é candidato a essa posição; atribui-se pela menor
 * folga, uma vez por espelho e uma vez por ordem. Null se não sobrar uma atribuição completa.
 */
function uniformWalk(P: Prepared, hits: Hit[][], total: number): RiserWalk | null {
  const N = P.risers.length;
  if (N < 2 || !(total > 0)) return null;
  const step = total / (N - 1);
  const cands: Array<{ i: number; k: number; s: number; r: number }> = [];
  P.risers.forEach((g, j) => {
    for (const h of hits[j]!) {
      const k = Math.round(h.sb / step);
      if (k < 0 || k > N - 1) continue;
      const r = Math.abs(h.sb - k * step);
      if (r <= step / 4) cands.push({ i: g.index, k, s: h.sb, r });
    }
  });
  cands.sort((x, y) => x.r - y.r || x.i - y.i || x.k - y.k);
  const byRiser = new Map<number, { k: number; s: number }>();
  const taken = new Set<number>();
  for (const c of cands) {
    if (byRiser.has(c.i) || taken.has(c.k)) continue;
    byRiser.set(c.i, { k: c.k, s: c.s });
    taken.add(c.k);
  }
  if (byRiser.size !== N) return null;
  const order = [...byRiser.entries()].sort((a, b) => a[1].k - b[1].k).map(([i]) => i);
  const s: number[] = [];
  for (const [i, c] of byRiser) s[i] = c.s;
  return { order, s, total };
}

/** Índices (em `run.risers`) na ordem de subida (ver `walkOf`). */
export function orderBy(P: Prepared, run: StairRunSketch, byPath: boolean): number[] {
  return walkOf(P, run, byPath).order;
}

/** Índices dos espelhos (em `run.risers`) na ordem de subida (pela caminhada, se houver). */
export function orderRisers(run: StairRunSketch): number[] {
  return orderBy(prepareRun(run), run, true);
}

/** Espelhos aparados, na ordem do vetor `run.risers` (um por espelho; sem interseção válida, a amostra inteira). */
export function trimRisers(run: StairRunSketch): Array<{ a: Vec2; b: Vec2; points: Vec2[] }> {
  return prepareRun(run).risers.map((g) => {
    const pts = g.geom.pts;
    return { a: pts[0]!, b: pts[pts.length - 1]!, points: pts };
  });
}

/** Caminhada automática: pontos médios dos espelhos aparados, na ordem de subida. */
export function autoPath(run: StairRunSketch): Vec2[] {
  const P = prepareRun(run);
  return orderBy(P, run, true).map((i) => midOf(P.risers[i]!.geom));
}

/** Trecho de `p` estritamente entre os comprimentos s0 e s1, na direção de s0 para s1. */
export function between(p: Poly, s0: number, s1: number): Vec2[] {
  const lo = Math.min(s0, s1) + SEG_TOL;
  const hi = Math.max(s0, s1) - SEG_TOL;
  const out: Vec2[] = [];
  p.pts.forEach((q, i) => {
    const s = p.cum[i]!;
    if (s > lo && s < hi) out.push(q);
  });
  return s0 <= s1 ? out : out.reverse();
}
