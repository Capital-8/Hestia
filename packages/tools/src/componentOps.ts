import { add, arcFromSagitta, arcLocal, arcPointAt, closestOnSegment, dist, intersectLines, len, sagFromThreePoints, sub, type Arc, type Vec2 } from '@hestia/geom';
import type { StairCurve } from '@hestia/model';
import { JOIN_TOL, offsetCurve } from './stairPickLines.ts';
import {
  componentEdgeCurve,
  componentOf,
  componentCurvesOf,
  replaceComponentCurves,
  replaceComponentEdge,
  type ComponentEdgeRef,
} from './componentEdge.ts';
import type { ComponentSketchHolder } from './stairPick.ts';

/** Reta auxiliar infinita (ponto e direção), usada no aparo e no alinhamento. */
export interface EdgeLine {
  p: Vec2;
  d: Vec2;
}

const isStraight = (c: StairCurve): boolean => Math.abs(c.sag) < 1e-9;

/** Arrasta as pontas das curvas vizinhas que estavam em `from` para `to` (mesmo campo e componente). */
function retargetNeighbors(holder: ComponentSketchHolder, ref: ComponentEdgeRef, from: Vec2, to: Vec2): ComponentSketchHolder {
  const comp = componentOf(holder, ref);
  if (!comp) return holder;
  const curves = componentCurvesOf(comp, ref.key);
  if (!curves) return holder;
  let changed = false;
  const next = curves.map((c, i) => {
    if (i === ref.index) return c;
    let out = c;
    if (dist(out.a, from) <= JOIN_TOL) {
      out = { ...out, a: { ...to } };
      changed = true;
    }
    if (dist(out.b, from) <= JOIN_TOL) {
      out = { ...out, b: { ...to } };
      changed = true;
    }
    return out;
  });
  return changed ? replaceComponentCurves(holder, ref, next) : holder;
}

/** Substitui a curva e reconecta as vizinhas nas duas pontas antigas. */
function replaceAndReconnect(holder: ComponentSketchHolder, ref: ComponentEdgeRef, oldCurve: StairCurve, nextCurve: StairCurve): ComponentSketchHolder {
  let out = replaceComponentEdge(holder, ref, nextCurve);
  out = retargetNeighbors(out, ref, oldCurve.a, nextCurve.a);
  out = retargetNeighbors(out, ref, oldCurve.b, nextCurve.b);
  return out;
}

/** Move a aresta (translação `d`) e mantém a cadeia contínua ajustando as pontas compartilhadas das vizinhas. */
export function moveComponentEdge(holder: ComponentSketchHolder, ref: ComponentEdgeRef, d: Vec2): ComponentSketchHolder {
  const old = componentEdgeCurve(holder, ref);
  if (!old) return holder;
  const next: StairCurve = { a: add(old.a, d), b: add(old.b, d), sag: old.sag };
  return replaceAndReconnect(holder, ref, old, next);
}

/** Desloca a aresta `dist` metros à esquerda do sentido a→b (negativo, à direita). Null se o arco deixaria de existir. */
export function offsetComponentEdge(holder: ComponentSketchHolder, ref: ComponentEdgeRef, dist: number): ComponentSketchHolder | null {
  const old = componentEdgeCurve(holder, ref);
  if (!old) return null;
  const next = offsetCurve(old, dist);
  if (!next) return null;
  return replaceAndReconnect(holder, ref, old, next);
}

/** Ponto de corte no arco: projeta no círculo pelo parâmetro local e devolve também o t ao longo do arco. */
function arcSplitPoint(c: StairCurve, at: Vec2): { arc: Arc; t: number; point: Vec2 } | null {
  const arc = arcFromSagitta(c.a, c.b, c.sag);
  if (!arc) return null;
  const { t } = arcLocal(arc, at);
  const tt = Math.max(0, Math.min(arc.length, t));
  return { arc, t: tt, point: arcPointAt(arc, tt) };
}

/**
 * Divide a aresta no ponto projetado do cursor e insere a segunda curva logo após a primeira. Reta vira duas retas; arco
 * vira dois arcos com a flecha calculada pelos três pontos de cada sub-arco. Null se o corte cair numa ponta.
 */
export function splitComponentEdge(holder: ComponentSketchHolder, ref: ComponentEdgeRef, at: Vec2): ComponentSketchHolder | null {
  const old = componentEdgeCurve(holder, ref);
  const comp = componentOf(holder, ref);
  if (!old || !comp) return null;
  const curves = componentCurvesOf(comp, ref.key);
  if (!curves || ref.index < 0 || ref.index >= curves.length) return null;
  let first: StairCurve;
  let second: StairCurve;
  if (isStraight(old)) {
    const m = closestOnSegment(at, old.a, old.b);
    if (dist(m, old.a) < 1e-9 || dist(m, old.b) < 1e-9) return null;
    first = { a: { ...old.a }, b: { ...m }, sag: 0 };
    second = { a: { ...m }, b: { ...old.b }, sag: 0 };
  } else {
    const sp = arcSplitPoint(old, at);
    if (!sp) return null;
    const { arc, t, point: m } = sp;
    if (t < 1e-9 || arc.length - t < 1e-9) return null;
    const m1 = arcPointAt(arc, t / 2);
    const m2 = arcPointAt(arc, (t + arc.length) / 2);
    first = { a: { ...old.a }, b: { ...m }, sag: sagFromThreePoints(old.a, m1, m) };
    second = { a: { ...m }, b: { ...old.b }, sag: sagFromThreePoints(m, m2, old.b) };
  }
  const next = curves.slice();
  next.splice(ref.index, 1, first, second);
  return replaceComponentCurves(holder, ref, next);
}

/**
 * Apara a aresta reta: move a ponta indicada até a interseção da reta infinita da aresta com `line`. Null para arcos,
 * retas paralelas ou aresta que sumiria.
 */
export function trimComponentEdge(holder: ComponentSketchHolder, ref: ComponentEdgeRef, line: EdgeLine, endToMove: 'a' | 'b'): ComponentSketchHolder | null {
  const old = componentEdgeCurve(holder, ref);
  if (!old || !isStraight(old)) return null;
  const hit = intersectLines(old.a, sub(old.b, old.a), line.p, line.d);
  if (!hit) return null;
  const next: StairCurve = endToMove === 'a' ? { a: { ...hit.point }, b: { ...old.b }, sag: 0 } : { a: { ...old.a }, b: { ...hit.point }, sag: 0 };
  if (dist(next.a, next.b) < 1e-9) return null;
  return replaceAndReconnect(holder, ref, old, next);
}

/** Projeta `p` na reta infinita `line`. */
function projectOnLine(p: Vec2, line: EdgeLine): Vec2 {
  const dd = line.d.x * line.d.x + line.d.y * line.d.y;
  if (dd < 1e-18) return { ...p };
  const k = ((p.x - line.p.x) * line.d.x + (p.y - line.p.y) * line.d.y) / dd;
  return { x: line.p.x + line.d.x * k, y: line.p.y + line.d.y * k };
}

/** Alinha a aresta reta: projeta as duas pontas na reta `line`. Null para arcos ou aresta que sumiria. */
export function alignComponentEdge(holder: ComponentSketchHolder, ref: ComponentEdgeRef, line: EdgeLine): ComponentSketchHolder | null {
  const old = componentEdgeCurve(holder, ref);
  if (!old || !isStraight(old) || len(line.d) < 1e-9) return null;
  const next: StairCurve = { a: projectOnLine(old.a, line), b: projectOnLine(old.b, line), sag: 0 };
  if (dist(next.a, next.b) < 1e-9) return null;
  return replaceAndReconnect(holder, ref, old, next);
}
