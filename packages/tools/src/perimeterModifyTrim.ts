import type { SketchDraft, Vec2 } from '@hestia/geom';
import {
  MOD_TOL,
  curveHits,
  curveOf,
  gap,
  pieceOf,
  traceParam,
  withGeom,
  type Curve,
  type Geom,
} from './perimeterModifyCurve.ts';
import { findSeg, replaceById, spliceSeg, weldMicroSegs } from './perimeterModifyDraft.ts';

/**
 * Parte de `c` que fica do lado do clique `tp` (já limitado ao traço), presa ao canto `tc`: se o canto vem antes do
 * clique, a ponta a vai para o canto; senão, a ponta b. Cobre aparar (canto dentro) e estender (canto fora).
 */
function keepSide(c: Curve, tc: number, tp: number): Geom | null {
  return tc <= tp ? pieceOf(c, tc, c.len) : pieceOf(c, 0, tc);
}

/**
 * Aparar/Estender ao canto (Revit: Trim/Extend to Corner). Canto = interseção das duas curvas (a mais próxima dos
 * dois cliques). Cada linha mantém o lado clicado; se o canto cair fora do traço, a linha é estendida até ele.
 * Null se não há interseção, se as linhas são a mesma, ou se o arco não alcança o canto.
 */
export function trimExtendToCorner(
  d0: SketchDraft,
  segA: string,
  pickA: Vec2,
  segB: string,
  pickB: Vec2,
): SketchDraft | null {
  if (segA === segB) return null;
  // Degraus micro (união de paredes quase alinhadas) saem antes: a ponta aparada não pode ficar a milímetros do vértice.
  const d = weldMicroSegs(d0);
  const A = findSeg(d, segA);
  const B = findSeg(d, segB);
  if (!A || !B) return null;
  const cA = curveOf(A);
  const cB = curveOf(B);
  const tpA = traceParam(cA, pickA);
  const tpB = traceParam(cB, pickB);
  const hits = curveHits(cA, cB).sort((x, y) => gap(x.p, pickA) + gap(x.p, pickB) - (gap(y.p, pickA) + gap(y.p, pickB)));
  for (const h of hits) {
    const ga = keepSide(cA, h.t1, tpA);
    const gb = keepSide(cB, h.t2, tpB);
    if (ga && gb) {
      return weldMicroSegs(
        replaceById(
          d,
          new Map([
            [A.id, withGeom(A, ga)],
            [B.id, withGeom(B, gb)],
          ]),
        ),
      );
    }
  }
  return null;
}

/**
 * Aparar até um limite (Revit: Trim to boundary, uma linha de cada vez). Corta a linha nos cruzamentos com o limite e
 * mantém o trecho que contém o clique. Null se o limite não cruza a linha por dentro.
 */
export function trimToBoundary(d: SketchDraft, segId: string, pick: Vec2, boundaryId: string): SketchDraft | null {
  if (segId === boundaryId) return null;
  const S = findSeg(d, segId);
  const L = findSeg(d, boundaryId);
  if (!S || !L) return null;
  const c = curveOf(S);
  const tp = traceParam(c, pick);
  const cuts = curveHits(c, curveOf(L))
    .map((h) => h.t1)
    .filter((t) => t > MOD_TOL && t < c.len - MOD_TOL);
  let lo = 0;
  let hi = c.len;
  for (const t of cuts) {
    if (t <= tp && t > lo) lo = t;
    if (t >= tp && t < hi) hi = t;
  }
  if (lo === 0 && hi === c.len) return null;
  const g = pieceOf(c, lo, hi);
  return g ? replaceById(d, new Map([[S.id, withGeom(S, g)]])) : null;
}

/**
 * Estender até um limite (Revit: Extend to boundary). A ponta mais próxima do clique vai até o primeiro cruzamento
 * com o limite à frente dela. Null se não há cruzamento nessa direção.
 */
export function extendToBoundary(d: SketchDraft, segId: string, pick: Vec2, boundaryId: string): SketchDraft | null {
  if (segId === boundaryId) return null;
  const S = findSeg(d, segId);
  const L = findSeg(d, boundaryId);
  if (!S || !L) return null;
  const c = curveOf(S);
  const nearA = gap(pick, S.a) <= gap(pick, S.b);
  const ts = curveHits(c, curveOf(L)).map((h) => h.t1);
  const cands = nearA
    ? ts.filter((t) => t < -MOD_TOL).sort((x, y) => y - x)
    : ts.filter((t) => t > c.len + MOD_TOL).sort((x, y) => x - y);
  for (const t of cands) {
    const g = nearA ? pieceOf(c, t, c.len) : pieceOf(c, 0, t);
    if (g) return replaceById(d, new Map([[S.id, withGeom(S, g)]]));
  }
  return null;
}

/**
 * Dividir elemento (Revit: Split Element): parte a linha no ponto (projetado sobre ela). Arco vira dois arcos.
 * A primeira metade mantém o id; a outra ganha id novo. Null se o ponto cai nas pontas.
 */
export function splitAt(d: SketchDraft, segId: string, pt: Vec2): SketchDraft | null {
  const S = findSeg(d, segId);
  if (!S) return null;
  const c = curveOf(S);
  const t = traceParam(c, pt);
  if (t <= MOD_TOL || t >= c.len - MOD_TOL) return null;
  const g1 = pieceOf(c, 0, t);
  const g2 = pieceOf(c, t, c.len);
  return g1 && g2 ? spliceSeg(d, segId, [g1, g2]) : null;
}

/**
 * Dividir com espaço (Revit: Split with Gap): remove o trecho entre p1 e p2 (ambos projetados sobre a linha).
 * Null se o trecho é menor que 1 mm ou se nada restaria da linha (use `deleteSegs`).
 */
export function splitBetween(d: SketchDraft, segId: string, p1: Vec2, p2: Vec2): SketchDraft | null {
  const S = findSeg(d, segId);
  if (!S) return null;
  const c = curveOf(S);
  const ta = traceParam(c, p1);
  const tb = traceParam(c, p2);
  const lo = Math.min(ta, tb);
  const hi = Math.max(ta, tb);
  if (hi - lo <= MOD_TOL) return null;
  const parts: Geom[] = [];
  if (lo > MOD_TOL) {
    const g = pieceOf(c, 0, lo);
    if (g) parts.push(g);
  }
  if (hi < c.len - MOD_TOL) {
    const g = pieceOf(c, hi, c.len);
    if (g) parts.push(g);
  }
  return parts.length ? spliceSeg(d, segId, parts) : null;
}
