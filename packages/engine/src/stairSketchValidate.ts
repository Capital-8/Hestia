import {
  chainBroken,
  makePoly,
  polyDist,
  prepareRun,
  PATH_TOL,
  sampleChain,
  sketchIssue,
  TOUCH_TOL,
  walkOf,
  type Prepared,
  type RiserGeom,
  type StairRunSketch,
  type StairSketchIssue,
} from './stairSketchGeom.ts';
import { dist, type Vec2 } from '@hestia/geom';
import { numLang, t, type Lang } from './i18nMessages.ts';
import { spiralSweepOf } from './stairSpiral.ts';

/**
 * Opções do croqui. `sweep`: varredura (rad, com sinal) de um caracol, que separa os espelhos por volta (`turnsOf`). Sem
 * ela, vale a do metadado `spiral` do lance, se houver (decisão 0014 §1 item 2); croqui livre não tem varredura.
 * `lang`: idioma das mensagens de erro (padrão `'pt'`).
 */
export interface RunSketchOptions {
  sweep?: number;
  lang?: Lang;
}

/**
 * Valida o croqui de um lance (decisão 0011 §3). Só erros de geometria: espelho que passa do limite é aparado
 * e não gera erro. Códigos e textos: `STAIR_SKETCH_MESSAGES`. Com `sweep` (caracol), espelhos de voltas diferentes não
 * se comparam em planta (decisão 0014 §1 item 3).
 */
export function validateRunSketch(run: StairRunSketch, opts: RunSketchOptions = {}): StairSketchIssue[] {
  return validatePrepared(run, prepareRun(run), opts.sweep ?? spiralSweepOf(run), false, opts.lang ?? 'pt');
}

export function validatePrepared(run: StairRunSketch, P: Prepared, sweep?: number, skipPairs = false, lang: Lang = 'pt'): StairSketchIssue[] {
  const out: StairSketchIssue[] = [];
  if (chainBroken(run.boundaryLeft)) out.push(sketchIssue('stair-boundary-gap', undefined, undefined, lang));
  if (chainBroken(run.boundaryRight)) out.push(sketchIssue('stair-boundary-gap', undefined, undefined, lang));
  if (P.L.pts.length > 0 && P.R.pts.length > 0 && polyDist(P.L.pts, P.R.pts) <= TOUCH_TOL) {
    out.push(sketchIssue('stair-boundaries-touch', undefined, undefined, lang));
  }
  checkRisers(P, out, lang);
  // `skipPairs`: pula a checagem O(n²) de pares (fatias de rampa: geradas por construção, uniformes e ordenadas).
  if (!skipPairs) checkRiserPairs(P, out, sweep !== undefined ? turnsOf(run, P, sweep) : undefined, lang);
  if (run.path.length > 0) checkPath(run, P, out, lang);
  return out;
}

/**
 * Volta de cada espelho (por índice do vetor) num caracol de varredura `sweep` (decisão 0014 §1 item 3). Com k a posição
 * do espelho na ordem de subida, o ângulo acumulado é k·|sweep|/(N−1) e a volta é floor(ângulo ÷ 2π). Espelhos de voltas
 * diferentes têm cotas diferentes (um degrau de altura h por espelho, pelo menos), por isso não se comparam em planta.
 * A volta vizinha na emenda (espelhos consecutivos) fica nesse caso: a diferença de cota é h, nunca menor que h.
 */
export function turnsOf(run: StairRunSketch, P: Prepared, sweep: number): Map<number, number> {
  const turn = new Map<number, number>();
  const n = P.risers.length;
  if (n < 2 || !(sweep !== 0) || !Number.isFinite(sweep)) return turn;
  const step = Math.abs(sweep) / (n - 1);
  walkOf(P, run, true).order.forEach((i, k) => turn.set(i, Math.floor((k * step) / (2 * Math.PI) + 1e-9)));
  return turn;
}

function checkRisers(P: Prepared, out: StairSketchIssue[], lang: Lang): void {
  for (const g of P.risers) {
    if (g.onBoundary) {
      out.push(sketchIssue('stair-riser-on-boundary', g.index, undefined, lang));
      continue;
    }
    const nL = g.hitsL.length;
    const nR = g.hitsR.length;
    if (nL > 1 || nR > 1) out.push(sketchIssue('stair-riser-boundary-multi', g.index, undefined, lang));
    else if (nL === 0 || nR === 0) out.push(notSpanning(P, g, nL === 0 ? 'esquerdo' : 'direito', lang));
  }
}

/**
 * Espelho que não liga os limites: diz qual espelho (nº no croqui), qual limite falta e por quanto (a menor distância das
 * pontas do espelho até o limite). Se os dois faltam, o do lado que falta mais.
 */
function notSpanning(P: Prepared, g: RiserGeom, side: 'esquerdo' | 'direito', lang: Lang): StairSketchIssue {
  const boundary = side === 'esquerdo' ? P.L : P.R;
  const ends = [g.full.pts[0]!, g.full.pts[g.full.pts.length - 1]!];
  const gap = Math.min(...ends.map((e) => polyDist([e], boundary.pts)));
  const text = t(lang, 'egb_stair_sketch_riser_gap', {
    n: g.index + 1,
    side: t(lang, side === 'esquerdo' ? 'egb_stair_sketch_side_left' : 'egb_stair_sketch_side_right'),
    gap: numLang(gap * 100, 1, lang),
  });
  return sketchIssue('stair-riser-not-spanning', g.index, text, lang);
}

/**
 * Pares de espelhos que ligam os dois limites: mesma posição, ou que se tocam/cruzam depois de aparados. Com `turn`
 * (caracol), só se comparam espelhos da mesma volta.
 */
function checkRiserPairs(P: Prepared, out: StairSketchIssue[], turn: Map<number, number> | undefined, lang: Lang): void {
  const spanning = P.risers.filter((g) => g.spans && g.trimmed);
  for (let i = 0; i < spanning.length; i++) {
    for (let j = i + 1; j < spanning.length; j++) {
      const ga = spanning[i]!;
      const gb = spanning[j]!;
      if (turn && turn.get(ga.index) !== turn.get(gb.index)) continue;
      const A = ga.trimmed!;
      const B = gb.trimmed!;
      const sameA = dist(A[0]!, B[0]!) <= TOUCH_TOL;
      const sameB = dist(A[A.length - 1]!, B[B.length - 1]!) <= TOUCH_TOL;
      // Os dois espelhos pelo nº no croqui e a distância entre eles (em cm), para o usuário achar os dois.
      const pair = t(lang, 'egb_stair_sketch_pair', { a: ga.index + 1, b: gb.index + 1 });
      const d = numLang(polyDist(A, B) * 100, 1, lang);
      if (sameA && sameB) {
        out.push(sketchIssue('stair-riser-same-location', ga.index, t(lang, 'egb_stair_sketch_same_pos', { pair, d }), lang));
      } else if (polyDist(A, B) <= TOUCH_TOL) {
        out.push(sketchIssue('stair-riser-crossing', ga.index, t(lang, 'egb_stair_sketch_cross', { pair, d }), lang));
      }
    }
  }
}

function checkPath(run: StairRunSketch, P: Prepared, out: StairSketchIssue[], lang: Lang): void {
  const path = makePoly(sampleChain(run.path));
  if (path.pts.length < 2) {
    out.push(sketchIssue('stair-path-ends', undefined, undefined, lang));
    return;
  }
  // Primeiro e último espelho pela ordem dos limites (a caminhada ainda não define a ordem aqui).
  const order = walkOf(P, run, false).order;
  if (order.length === 0) return;
  const first = P.risers[order[0]!]!;
  const last = P.risers[order[order.length - 1]!]!;
  const start: Vec2 = path.pts[0]!;
  const end: Vec2 = path.pts[path.pts.length - 1]!;
  if (polyDist([start], first.geom.pts) > PATH_TOL || polyDist([end], last.geom.pts) > PATH_TOL) {
    out.push(sketchIssue('stair-path-ends', undefined, undefined, lang));
  }
  for (const g of P.risers) {
    if (polyDist(path.pts, g.geom.pts) > PATH_TOL) out.push(sketchIssue('stair-path-misses-riser', g.index, undefined, lang));
  }
}
