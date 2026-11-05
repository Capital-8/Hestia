import {
  add,
  arcFromSagitta,
  asMulti,
  dist,
  len,
  mul,
  perp,
  ringArea,
  sub,
  union,
  type MultiPolygon,
  type Ring,
  type Vec2,
} from '@hestia/geom';
import type { Lang } from './i18nMessages.ts';
import {
  between,
  chainBroken,
  crossingsAll,
  makePoly,
  midlinePoly,
  pointAtLength,
  polyLength,
  prepareRun,
  pushDistinct,
  segAt,
  sampleChain,
  sketchIssue,
  walkOf,
  CHAIN_TOL,
  type Poly,
  type Prepared,
  type RiserGeom,
  type RiserWalk,
  type StairCurve,
  type StairLandingSketch,
  type StairRunSketch,
  type StairSketchIssue,
} from './stairSketchGeom.ts';
import { validatePrepared } from './stairSketchValidate.ts';
import { spiralSweepOf } from './stairSpiral.ts';

export {
  autoPath,
  orderRisers,
  sampleChain,
  sampleCurve,
  trimRisers,
  STAIR_SKETCH_MESSAGES,
  type StairCurve,
  type StairLandingSketch,
  type StairRunSketch,
  type StairSketchIssue,
} from './stairSketchGeom.ts';
export { validateRunSketch, type RunSketchOptions } from './stairSketchValidate.ts';

export interface StairRunStepsOptions {
  /** Cota de base do lance (m). */
  baseZ: number;
  /** Altura real do espelho h = H ÷ N (m). */
  riserHeight: number;
  /** Varredura (rad, com sinal) de um caracol. Sem ela, vale a do metadado `spiral` do lance, se houver. */
  sweep?: number;
  /** Pula a validação quadrática de pares de espelhos: só para fatias geradas por construção (rampa). */
  skipPairCheck?: boolean;
  /** Idioma das mensagens de erro (padrão `'pt'`). */
  lang?: Lang;
}

export interface StairRunStepsResult {
  /** Degrau k (1..N−1), entre os espelhos k e k+1; topo em baseZ + k·h. */
  treads: Array<{ index: number; polygon: Ring; z: number }>;
  /** Espelho k (1..N) na ordem de subida, de baseZ + (k−1)·h a baseZ + k·h. */
  risers: Array<{ index: number; a: Vec2; b: Vec2; points: Vec2[]; z0: number; z1: number }>;
  /** União dos degraus. */
  footprint: MultiPolygon;
  issues: StairSketchIssue[];
}

/** Degraus e espelhos do lance (decisão 0011 §4). Com erro de validação, devolve listas vazias e os erros. */
export function stairRunSteps(run: StairRunSketch, opts: StairRunStepsOptions): StairRunStepsResult {
  const P = prepareRun(run);
  const issues = validatePrepared(run, P, opts.sweep ?? spiralSweepOf(run), opts.skipPairCheck === true, opts.lang ?? 'pt');
  if (issues.some((i) => i.severity === 'error')) return { treads: [], risers: [], footprint: [], issues };
  const walk = walkOf(P, run, true);
  const ordered = walk.order.map((i) => P.risers[i]!);
  const bounds = ordered.map((g) => boundsOf(P, g, walk));
  const { baseZ, riserHeight: h } = opts;
  const risers = ordered.map((g, k) => {
    const pts = trimmedOf(g);
    return {
      index: k + 1,
      a: pts[0]!,
      b: pts[pts.length - 1]!,
      points: pts,
      z0: baseZ + k * h,
      z1: baseZ + (k + 1) * h,
    };
  });
  const treads: StairRunStepsResult['treads'] = [];
  for (let k = 0; k + 1 < ordered.length; k++) {
    treads.push({
      index: k + 1,
      polygon: treadRing(P, ordered[k]!, ordered[k + 1]!, bounds[k]!, bounds[k + 1]!),
      z: baseZ + (k + 1) * h,
    });
  }
  const footprint: MultiPolygon = treads.length ? union(...treads.map((t) => asMulti(t.polygon))) : [];
  return { treads, risers, footprint, issues };
}

function trimmedOf(g: RiserGeom): Vec2[] {
  return g.trimmed ?? g.full.pts;
}

/** Parâmetros (comprimento de arco) de um espelho nos dois limites. */
interface Bounds {
  l: number;
  r: number;
}

/**
 * Onde o espelho está em cada limite. Em caracol de mais de uma volta, o espelho cruza cada limite uma vez por volta, no
 * mesmo ponto em planta: pega-se o cruzamento cuja posição na caminhada é a do espelho (fração `s ÷ total`, que vale para
 * os dois limites porque têm a mesma varredura). Num lance de uma volta há um só cruzamento e nada muda.
 */
function boundsOf(P: Prepared, g: RiserGeom, walk: RiserWalk): Bounds {
  const f = walk.total > 0 ? (walk.s[g.index] ?? 0) / walk.total : 0;
  return {
    l: boundaryParam(P.L, g, f, g.hitsL[0]!.sb),
    r: boundaryParam(P.R, g, f, g.hitsR[0]!.sb),
  };
}

function boundaryParam(poly: Poly, g: RiserGeom, f: number, fallback: number): number {
  const target = f * polyLength(poly);
  let best = fallback;
  let bestD = Infinity;
  for (const h of crossingsAll(g.full, poly)) {
    const d = Math.abs(h.sb - target);
    if (d < bestD) {
      bestD = d;
      best = h.sb;
    }
  }
  return best;
}

/** Anel do degrau entre o espelho A (k) e B (k+1): A, limite direito até B, B invertido, limite esquerdo até A. */
function treadRing(P: Prepared, A: RiserGeom, B: RiserGeom, bA: Bounds, bB: Bounds): Ring {
  const ring: Ring = [];
  const pushAll = (pts: Vec2[]): void => pts.forEach((p) => pushDistinct(ring, p));
  pushAll(trimmedOf(A));
  pushAll(between(P.R, bA.r, bB.r));
  pushAll([...trimmedOf(B)].reverse());
  pushAll(between(P.L, bB.l, bA.l));
  while (ring.length > 1 && dist(ring[0]!, ring[ring.length - 1]!) <= CHAIN_TOL) ring.pop();
  if (ringArea(ring) < 0) ring.reverse();
  return ring;
}

/** Contorno do patamar: laço fechado de retas e arcos, `stair-landing-open` se não fechar. */
export function stairLandingPolygon(l: StairLandingSketch, lang: Lang = 'pt'): { polygon: Ring | null; issues: StairSketchIssue[] } {
  const cs = l.boundary;
  const pts = sampleChain(cs);
  const closed = cs.length > 0 && !chainBroken(cs) && dist(cs[cs.length - 1]!.b, cs[0]!.a) <= CHAIN_TOL;
  if (pts.length >= 2 && dist(pts[0]!, pts[pts.length - 1]!) <= CHAIN_TOL) pts.pop();
  if (closed && pts.length >= 3 && Math.abs(ringArea(pts)) > 1e-9) return { polygon: pts, issues: [] };
  return { polygon: null, issues: [sketchIssue('stair-landing-open', undefined, undefined, lang)] };
}

/**
 * Acelerador: `count` espelhos igualmente espaçados em comprimento ao longo da caminhada automática (linha média
 * entre os limites), do 1º ao último ponto, cada um perpendicular à caminhada. Com dois arcos concêntricos, espelhos
 * radiais ao centro. `count` = 1 coloca o espelho no início da caminhada.
 */
export function distributeRisers(run: StairRunSketch, count: number): StairCurve[] {
  const n = Math.floor(count);
  if (!(n >= 1)) return [];
  const radial = concentricWalk(run);
  return radial ? radialRisers(radial, n) : walkRisers(run, n);
}

interface RadialWalk {
  c: Vec2;
  rm: number;
  th0: number;
  dth: number;
  rMax: number;
}

/** Dois arcos concêntricos de mesmo sentido (um por limite): a linha média é o arco de raio médio. */
function concentricWalk(run: StairRunSketch): RadialWalk | null {
  const l = run.boundaryLeft[0];
  const r = run.boundaryRight[0];
  if (run.boundaryLeft.length !== 1 || run.boundaryRight.length !== 1 || !l || !r) return null;
  const al = arcFromSagitta(l.a, l.b, l.sag);
  const ar = arcFromSagitta(r.a, r.b, r.sag);
  if (!al || !ar) return null;
  if (len(sub(al.center, ar.center)) > 1e-6 * Math.max(1, al.radius)) return null;
  if (Math.sign(al.sweep) !== Math.sign(ar.sweep)) return null;
  const turn = Math.atan2(Math.sin(ar.a0 - al.a0), Math.cos(ar.a0 - al.a0));
  return {
    c: al.center,
    rm: (al.radius + ar.radius) / 2,
    th0: al.a0 + turn / 2,
    dth: (al.sweep + ar.sweep) / 2,
    rMax: Math.max(al.radius, ar.radius),
  };
}

function radialRisers(w: RadialWalk, n: number): StairCurve[] {
  const H = 2 * w.rMax + 1;
  const out: StairCurve[] = [];
  for (let i = 0; i < n; i++) {
    const th = n === 1 ? w.th0 : w.th0 + (w.dth * i) / (n - 1);
    const d = { x: Math.cos(th), y: Math.sin(th) };
    const p = add(w.c, mul(d, w.rm));
    out.push({ a: sub(p, mul(d, H)), b: add(p, mul(d, H)), sag: 0 });
  }
  return out;
}

/** Espelhos igualmente espaçados em comprimento ao longo da linha média dos limites (`midlinePoly`). */
function walkRisers(run: StairRunSketch, n: number): StairCurve[] {
  const L = sampleChain(run.boundaryLeft);
  const R = sampleChain(run.boundaryRight);
  if (L.length === 0 || R.length === 0) return [];
  const W = midlinePoly(makePoly(L), makePoly(R));
  if (!W) return [];
  const total = polyLength(W);
  const all = [...L, ...R];
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const H = diag + 1;
  const out: StairCurve[] = [];
  for (let i = 0; i < n; i++) {
    const s = n === 1 ? 0 : (i * total) / (n - 1);
    const p = pointAtLength(W, s);
    const j = segAt(W, s);
    const d = sub(W.pts[j + 1]!, W.pts[j]!);
    const nrm = mul(perp(d), 1 / Math.max(len(d), 1e-12));
    out.push({ a: sub(p, mul(nrm, H)), b: add(p, mul(nrm, H)), sag: 0 });
  }
  return out;
}

