import { add, dist, dot, len, mid, mul, norm, sub, type Vec2 } from '@hestia/geom';
import { newId, type StairCurve, type StairLanding, type StairRun } from '@hestia/model';
import { generateStraightRun } from './stairGenerators.ts';
import { orderRisers, trimRisers } from './stairSketchGeom.ts';
import { isSpiralRun } from './stairSpiral.ts';

/**
 * Geometria de lances do reajuste de escada (esticar, acrescentar, fatiar, dividir com patamar). Funções puras sobre o
 * croqui; a regra de cálculo e o fluxo ficam em `stairRefit.ts`.
 */

/** Tolerância (m) para considerar que o lance já está no piso calculado. */
export const FIT_EPS = 1e-6;

export const midpoint = (c: StairCurve): Vec2 => mid(c.a, c.b);
export const mid2 = (a: Vec2, b: Vec2): Vec2 => mid(a, b);
export const samePoint = (p: Vec2, q: Vec2): boolean => len(sub(p, q)) <= 1e-3;

/** Primeiro e último espelho na ordem de subida (pela caminhada, quando existe). */
export function orderedFirstLast(run: StairRun): { first?: StairCurve; last?: StairCurve } {
  const order = orderRisers(run);
  if (order.length === 0) return {};
  return { first: run.risers[order[0]!], last: run.risers[order[order.length - 1]!] };
}

/** Pontas aparadas do primeiro/último espelho de subida: é com elas que o resolvedor decide a emenda. */
export function trimmedEnd(run: StairRun, end: 'first' | 'last'): { a: Vec2; b: Vec2 } | null {
  const order = orderRisers(run);
  if (order.length === 0) return null;
  const g = trimRisers(run)[end === 'first' ? order[0]! : order[order.length - 1]!];
  return g ? { a: g.a, b: g.b } : null;
}

/**
 * Mesma emenda do resolvedor (`stairs.ts`): último espelho do lance anterior = primeiro do seguinte, comparados com as
 * pontas APARADAS. Com as pontas cruas, o leque do winder (espelhos radiais 1 cm além dos limites) não emendava com as
 * retas vizinhas e o N contado saía 2 acima do N do resolvedor.
 */
export function sharesRiser(prev: StairRun, next: StairRun): boolean {
  const a = trimmedEnd(prev, 'last');
  const b = trimmedEnd(next, 'first');
  if (!a || !b) return false;
  return (samePoint(a.a, b.a) && samePoint(a.b, b.b)) || (samePoint(a.a, b.b) && samePoint(a.b, b.a));
}

/** Aplica `fn` a todas as curvas de um componente (limites, espelhos, caminhada ou contorno do patamar). */
export function mapComponent(c: StairRun | StairLanding, fn: (q: Vec2) => Vec2): StairRun | StairLanding {
  const curve = (k: StairCurve): StairCurve => ({ a: fn(k.a), b: fn(k.b), sag: k.sag });
  if (c.kind === 'landing') return { ...c, boundary: c.boundary.map(curve) };
  return { ...c, boundaryLeft: c.boundaryLeft.map(curve), boundaryRight: c.boundaryRight.map(curve), risers: c.risers.map(curve), path: c.path.map(curve) };
}

/** Lance que não é reto (caracol/leque): não dá para emendar degraus no fim dele; continua-se com um lance novo. */
export const fanRun = (c: StairRun): boolean => isSpiralRun(c) || c.generatedBy === 'winder' || c.generatedBy === 'spiral';

/**
 * Acrescenta `delta` espelhos no fim de um lance reto, empurrando limites, caminhada e o próximo componente.
 * A direção é a da caminhada; o primeiro espelho existente não se move.
 */
export function appendToRun(run: StairRun, delta: number, tread: number): { run: StairRun; shift: Vec2 } | null {
  const { first, last } = orderedFirstLast(run);
  if (!first || !last) return null;
  const u = norm(sub(midpoint(last), midpoint(first)));
  if (!(len(u) > 0) || delta <= 0 || !(tread > 0)) return null;
  const leftEnd = run.boundaryLeft.at(-1)?.b ?? last.a;
  const rightEnd = run.boundaryRight.at(-1)?.b ?? last.b;
  // Mantém o lado: o limite esquerdo continua no ponto do espelho mais próximo dele.
  const aLeft = dist(leftEnd, last.a) + dist(rightEnd, last.b) <= dist(leftEnd, last.b) + dist(rightEnd, last.a);
  const baseLeft = aLeft ? last.a : last.b;
  const baseRight = aLeft ? last.b : last.a;
  let prevLeft = leftEnd;
  let prevRight = rightEnd;
  const risers = [...run.risers];
  const boundaryLeft = [...run.boundaryLeft];
  const boundaryRight = [...run.boundaryRight];
  for (let k = 1; k <= delta; k++) {
    const pL = add(baseLeft, mul(u, k * tread));
    const pR = add(baseRight, mul(u, k * tread));
    boundaryLeft.push({ a: prevLeft, b: pL, sag: 0 });
    boundaryRight.push({ a: prevRight, b: pR, sag: 0 });
    risers.push({ a: pL, b: pR, sag: 0 });
    prevLeft = pL;
    prevRight = pR;
  }
  const path = run.path.length > 0 ? [...run.path, { a: run.path[run.path.length - 1]!.b, b: add(run.path[run.path.length - 1]!.b, mul(u, delta * tread)), sag: 0 }] : run.path;
  return {
    run: { ...run, risers, boundaryLeft, boundaryRight, path },
    shift: mul(u, delta * tread),
  };
}

/** Lance reto novo emendado no último espelho (para caracol/leque): o primeiro espelho é compartilhado. */
export function newRunAfter(last: StairRun, delta: number, tread: number): { run: StairRun; shift: Vec2 } | null {
  const order = orderRisers(last);
  if (order.length < 2) return null;
  const prev = last.risers[order[order.length - 2]!];
  const endCrude = last.risers[order[order.length - 1]!];
  const endTrim = trimmedEnd(last, 'last');
  if (!prev || !endCrude || !endTrim) return null;
  // O espelho de emenda é o APARADO (o que o resolvedor compara): o crú do leque/caracol passa 1 cm dos limites e a
  // emenda não seria reconhecida (espelho contado duas vezes).
  const c = mid2(endTrim.a, endTrim.b);
  const along = sub(midpoint(endCrude), midpoint(prev));
  // Direção local da caminhada no fim: perpendicular ao espelho aparado, voltada para onde a escada sobe.
  const w = sub(endTrim.b, endTrim.a);
  let u = norm({ x: -w.y, y: w.x });
  if (dot(u, along) < 0) u = mul(u, -1);
  const width = len(w);
  if (!(len(u) > 0) || !(width > 0) || delta <= 0 || !(tread > 0)) return null;
  const sketch = generateStraightRun({ start: c, dir: u, width, risers: delta + 1, tread });
  return { run: { id: newId('r'), kind: 'run', ...sketch, generatedBy: 'straight' }, shift: mul(u, delta * tread) };
}

/** Lance reto de verdade: sem arcos, espelhos paralelos e centros alinhados (só estes podem ser aparados/divididos). */
export function isStraightRun(run: StairRun): boolean {
  if (fanRun(run) || run.risers.length < 2) return false;
  const all = [...run.risers, ...run.boundaryLeft, ...run.boundaryRight, ...run.path];
  if (all.some((c) => Math.abs(c.sag) > 1e-9)) return false;
  const order = orderRisers(run);
  const { first, last } = orderedFirstLast(run);
  if (!first || !last) return false;
  const a = midpoint(first);
  const d = sub(midpoint(last), a);
  if (!(len(d) > FIT_EPS)) return false;
  const u = norm(d);
  const w = sub(first.b, first.a);
  return order.every((i) => {
    const r = run.risers[i]!;
    const off = sub(midpoint(r), a);
    return Math.abs(dot(off, { x: -u.y, y: u.x })) <= 1e-3 && Math.abs(dot(sub(r.b, r.a), u)) <= 1e-3 * Math.max(1, len(w));
  });
}

/** Recorta uma cadeia de segmentos retos ao intervalo [lo, hi] de projeção em `u`, a partir de `a0`. */
function clipChain(chain: StairCurve[], a0: Vec2, u: Vec2, lo: number, hi: number): StairCurve[] {
  const out: StairCurve[] = [];
  for (const c of chain) {
    const pa = dot(sub(c.a, a0), u);
    const pb = dot(sub(c.b, a0), u);
    if (Math.max(pa, pb) < lo - 1e-9 || Math.min(pa, pb) > hi + 1e-9) continue;
    const span = pb - pa;
    if (Math.abs(span) < 1e-12) {
      out.push(c);
      continue;
    }
    const at = (p: number): Vec2 => add(c.a, mul(sub(c.b, c.a), (Math.min(hi, Math.max(lo, p)) - pa) / span));
    const na = at(pa);
    const nb = at(pb);
    if (len(sub(nb, na)) > 1e-9) out.push({ a: na, b: nb, sag: 0 });
  }
  return out;
}

/** Fatia de um lance reto: só os espelhos [from, to) na ordem de subida, com limites e caminhada recortados. */
export function sliceRun(run: StairRun, from: number, to: number): StairRun {
  const order = orderRisers(run);
  const keep = order.slice(from, to).map((i) => run.risers[i]!);
  const { first, last } = orderedFirstLast(run);
  const a0 = midpoint(first!);
  const u = norm(sub(midpoint(last!), a0));
  const lo = dot(sub(midpoint(keep[0]!), a0), u);
  const hi = dot(sub(midpoint(keep[keep.length - 1]!), a0), u);
  return {
    ...run,
    risers: keep,
    boundaryLeft: clipChain(run.boundaryLeft, a0, u, lo, hi),
    boundaryRight: clipChain(run.boundaryRight, a0, u, lo, hi),
    path: clipChain(run.path, a0, u, lo, hi),
  };
}

/**
 * Estica/encolhe um lance ao longo da caminhada, mantendo o primeiro espelho e a largura. A transformação é afim na
 * direção `u` (do primeiro ao último espelho); o eixo perpendicular fica intacto. Com `keep`, antes disso o lance é
 * aparado para os `keep` primeiros espelhos (remoção no fim); o deslocamento devolvido é o do último espelho original
 * até o novo, para empurrar/puxar os componentes seguintes.
 */
export function stretchRun(run: StairRun, tread: number, keep?: number): { run: StairRun; shift: Vec2; direction: Vec2 | null } | null {
  const { first, last } = orderedFirstLast(run);
  if (!first || !last) return null;
  const a = midpoint(first);
  const oldCurrent = len(sub(midpoint(last), a));
  const base = keep !== undefined ? sliceRun(run, 0, keep) : run;
  const nb = orderedFirstLast(base).last!;
  const d = sub(midpoint(nb), a);
  const current = len(d);
  const n = orderRisers(base).length;
  const target = (n - 1) * tread;
  if (!(current > FIT_EPS) || !(target > FIT_EPS)) return null;
  const u = norm(d);
  if (Math.abs(target - current) <= FIT_EPS) return { run: base, shift: mul(u, current - oldCurrent), direction: u };
  const factor = target / current;
  const scaled = mapComponent(base, (q) => add(q, mul(u, dot(sub(q, a), u) * (factor - 1))));
  return { run: scaled as StairRun, shift: mul(u, target - oldCurrent), direction: u };
}

/**
 * Divide o lance reto `run` depois do espelho `k` (k ≥ 2 e n − k ≥ 2) com um patamar de `depth` na direção da subida.
 * Devolve o lance de baixo, o patamar, o lance de cima (já deslocado) e o deslocamento a aplicar ao que vem depois.
 */
export function splitRunWithLanding(run: StairRun, k: number, depth: number): { lower: StairRun; landing: StairLanding; upper: StairRun; shift: Vec2 } {
  const order = orderRisers(run);
  const { first, last } = orderedFirstLast(run);
  const a0 = midpoint(first!);
  const u = norm(sub(midpoint(last!), a0));
  const before = run.risers[order[k - 1]!]!;
  const after = run.risers[order[k]!]!;
  const gap = dot(sub(midpoint(after), midpoint(before)), u);
  const shift = mul(u, depth - gap);
  const lower = sliceRun(run, 0, k);
  const upper = mapComponent({ ...sliceRun(run, k, run.risers.length), id: newId('r') }, (q) => add(q, shift)) as StairRun;
  const p0 = before.a;
  const p1 = before.b;
  const q1 = add(p1, mul(u, depth));
  const q0 = add(p0, mul(u, depth));
  const landing: StairLanding = {
    id: newId('p'),
    kind: 'landing',
    boundary: [
      { a: p0, b: p1, sag: 0 },
      { a: p1, b: q1, sag: 0 },
      { a: q1, b: q0, sag: 0 },
      { a: q0, b: p0, sag: 0 },
    ],
  };
  return { lower, landing, upper, shift };
}
