import { dist, lerp, type Vec2 } from '@hestia/geom';
import { stairBaseZ, stairTopZ } from './queries.ts';
import type { Project, Stair, StairCurve, StairRun } from './types.ts';

/** Tolerância para considerar duas pontas de espelho no mesmo ponto (1 mm, igual à do motor). */
const SHARE_TOL = 1e-3;
/** Tolerância numérica do reajuste (1e-9). */
const FIT_TOL = 1e-9;
/** Altura mínima para a escada ter espelhos (`STAIR_MIN_HEIGHT`, decisão 0011). */
const MIN_HEIGHT = 1e-3;

/**
 * Menor N >= 1 tal que H ÷ N <= maxRiser (tolerância 1e-9). `maxRiser <= 0` devolve 1, como uma escada de um espelho.
 */
export function desiredRiserCount(H: number, maxRiser: number): number {
  if (!(H > 0) || !(maxRiser > 0)) return 1;
  return Math.max(1, Math.ceil(H / maxRiser - FIT_TOL));
}

/** Ponto médio da corda do espelho: serve só para ordenar pela caminhada. */
const midOf = (c: StairCurve): Vec2 => lerp(c.a, c.b, 0.5);

/** Posição (comprimento de arco) da projeção de `q` sobre a cadeia `path`; para ordenar os espelhos na subida. */
function pathPosition(path: StairCurve[], q: Vec2): number {
  let best = 0;
  let bestD = Infinity;
  let base = 0;
  for (const c of path) {
    const dx = c.b.x - c.a.x;
    const dy = c.b.y - c.a.y;
    const len2 = dx * dx + dy * dy;
    const len = Math.sqrt(len2);
    let t = 0;
    if (len2 > 0) {
      t = ((q.x - c.a.x) * dx + (q.y - c.a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
    }
    const px = c.a.x + dx * t;
    const py = c.a.y + dy * t;
    const d = Math.hypot(q.x - px, q.y - py);
    if (d < bestD) {
      bestD = d;
      best = base + t * len;
    }
    base += len;
  }
  return best;
}

/**
 * Espelhos do lance na ordem de subida. Com caminhada no croqui, ordena pela projeção do meio de cada espelho sobre ela;
 * sem caminhada, a ordem do vetor (a dos geradores) já é a de subida.
 */
function orderedRisers(run: StairRun): StairCurve[] {
  if (run.risers.length <= 1 || run.path.length === 0) return [...run.risers];
  return run.risers
    .map((r, i) => ({ r, i, s: pathPosition(run.path, midOf(r)) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.r);
}

/** Mesmo critério do `sharesRiser` do motor: as pontas do último espelho do lance anterior e do primeiro do seguinte. */
function sharesRiser(prev: StairRun, next: StairRun): boolean {
  const a = orderedRisers(prev).at(-1);
  const b = orderedRisers(next)[0];
  if (!a || !b) return false;
  const same = (p: Vec2, q: Vec2): boolean => dist(p, q) <= SHARE_TOL;
  return (same(a.a, b.a) && same(a.b, b.b)) || (same(a.a, b.b) && same(a.b, b.a));
}

/** Nº de linhas de espelho distintas da escada (a linha de emenda entre lances sem patamar conta uma vez). */
function riserCount(s: Stair): number {
  let n = 0;
  s.components.forEach((c, ci) => {
    if (c.kind !== 'run') return;
    n += c.risers.length;
    const prev = s.components[ci - 1];
    if (prev?.kind === 'run' && sharesRiser(prev, c)) n -= 1;
  });
  return n;
}

/** Quantos espelhos novos cada lacuna interior recebe, espalhados uniformemente. `k` pode passar de `gaps`. */
function spreadCounts(k: number, gaps: number): number[] {
  const out = new Array<number>(gaps).fill(0);
  if (k <= 0 || gaps <= 0) return out;
  if (k <= gaps) {
    for (let j = 0; j < k; j++) {
      const g = Math.min(gaps - 1, Math.floor(((j + 0.5) * gaps) / k));
      out[g] = (out[g] ?? 0) + 1;
    }
    return out;
  }
  // Mais espelhos que lacunas: todos recebem a parte inteira e o resto se espalha uniformemente.
  const base = Math.floor(k / gaps);
  out.fill(base);
  const rem = k % gaps;
  for (let j = 0; j < rem; j++) {
    const g = Math.min(gaps - 1, Math.floor(((j + 0.5) * gaps) / rem));
    out[g] = (out[g] ?? 0) + 1;
  }
  return out;
}

/** Espelho interpolado entre `a` e `b` (a, b e sag lineares). */
function interpRiser(a: StairCurve, b: StairCurve, t: number): StairCurve {
  return { a: lerp(a.a, b.a, t), b: lerp(a.b, b.b, t), sag: a.sag + (b.sag - a.sag) * t };
}

/** Insere `k` espelhos nas lacunas interiores do lance, sem mexer no primeiro nem no último. */
function insertRisers(run: StairRun, k: number): StairCurve[] {
  const ordered = orderedRisers(run);
  const gaps = ordered.length - 1;
  if (gaps <= 0 || k <= 0) return [...run.risers];
  const counts = spreadCounts(Math.min(k, gaps), gaps);
  const out: StairCurve[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const cur = ordered[i]!;
    out.push(cur);
    const next = ordered[i + 1];
    if (!next) continue;
    const m = counts[i] ?? 0;
    for (let j = 0; j < m; j++) out.push(interpRiser(cur, next, (j + 1) / (m + 1)));
  }
  return out;
}

/**
 * Reajuste do croqui quando o espelho real passa do máximo do tipo (decisão 0041): acrescenta espelhos interiores nos
 * lances para que H ÷ N <= maxRiser, sem tocar no primeiro/último de cada lance. Devolve `null` quando nada muda ou o
 * modo é `fixed`. Só devolve `components`; o restante da escada fica intacto.
 */
export function stairFitPatch(p: Project, s: Stair): Pick<Stair, 'components'> | null {
  if (s.riserMode === 'fixed') return null;

  const H = stairTopZ(p, s) - stairBaseZ(p, s);
  if (!(H > MIN_HEIGHT)) return null;

  const t = p.stairTypes[s.typeId];
  if (!t || !(t.maxRiser > 0)) return null;

  const runs: Array<{ ci: number; run: StairRun }> = [];
  s.components.forEach((c, ci) => {
    if (c.kind === 'run' && c.risers.length > 0) runs.push({ ci, run: c });
  });
  if (runs.length === 0) return null;

  const N = riserCount(s);
  if (!(N > 0)) return null;
  if (H / N <= t.maxRiser + FIT_TOL) return null;

  const target = Math.max(N, desiredRiserCount(H, t.maxRiser));
  const delta = target - N;
  if (delta <= 0) return null;

  // Distribuição proporcional ao nº de espelhos do lance, com resto por maior fração e limite `risers.length - 1`.
  const totalWeight = runs.reduce((n, e) => n + e.run.risers.length, 0);
  const caps = runs.map((e) => Math.max(0, e.run.risers.length - 1));
  const exact = runs.map((e) => (delta * e.run.risers.length) / totalWeight);
  const alloc = exact.map((v, i) => Math.min(Math.floor(v + FIT_TOL), caps[i]!));
  let remaining = delta - alloc.reduce((n, v) => n + v, 0);

  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || runs[b.i]!.run.risers.length - runs[a.i]!.run.risers.length || a.i - b.i);
  while (remaining > 0) {
    let progressed = false;
    for (const { i } of order) {
      if (remaining <= 0) break;
      if (alloc[i]! < caps[i]!) {
        alloc[i]!++;
        remaining--;
        progressed = true;
      }
    }
    if (!progressed) break;
  }

  if (alloc.every((v) => v === 0)) return null;

  const byComponent = new Map<number, number>();
  runs.forEach((e, i) => byComponent.set(e.ci, alloc[i]!));

  const components = s.components.map((c, ci) => {
    if (c.kind !== 'run') return c;
    const k = byComponent.get(ci) ?? 0;
    return k > 0 ? { ...c, risers: insertRisers(c, k) } : c;
  });
  return { components };
}
