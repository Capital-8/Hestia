import { closestOnSegment, dist, type Vec2 } from '@hestia/geom';
import { rampsOnLevel, stairsOnLevel, type Id, type Project, type StairCurve, type StairLanding, type StairRun } from '@hestia/model';
import { sampleCurve } from '@hestia/engine';
import type { ToolEnv } from './types.ts';
import { distToCurve } from './stairPickLines.ts';
import type { ComponentSketchHolder } from './stairPick.ts';

/** Campo do componente que guarda uma cadeia de curvas. 'boundary' é o contorno do patamar; os demais são do lance. */
export type ComponentPartKey = 'boundary' | 'boundaryLeft' | 'boundaryRight' | 'risers' | 'path';

/** Identifica uma aresta do croqui: elemento, posição do componente, campo e índice da curva dentro do campo. */
export interface ComponentEdgeRef {
  elementId: Id;
  /** Índice do componente em `components`. */
  part: number;
  key: ComponentPartKey;
  /** Índice da curva dentro da cadeia do campo. */
  index: number;
}

/** Aresta sob o cursor: o que foi pego e o ponto projetado nela (para prévia e operações). */
export interface ComponentEdgePick {
  ref: ComponentEdgeRef;
  a: Vec2;
  b: Vec2;
  sag: number;
  at: Vec2;
}

/** Cadeia de curvas de um componente para a chave pedida; null se a chave não existe no tipo de componente. */
export function componentCurvesOf(c: StairRun | StairLanding, key: ComponentPartKey): StairCurve[] | null {
  if (c.kind === 'landing') return key === 'boundary' ? c.boundary : null;
  switch (key) {
    case 'boundaryLeft':
      return c.boundaryLeft;
    case 'boundaryRight':
      return c.boundaryRight;
    case 'risers':
      return c.risers;
    case 'path':
      return c.path;
    default:
      return null;
  }
}

/** Componente do croqui apontado pela referência (sem validar o índice da curva). */
export function componentOf(holder: ComponentSketchHolder, ref: ComponentEdgeRef): StairRun | StairLanding | null {
  return holder.components[ref.part] ?? null;
}

/** Curva apontada pela referência, ou null se a referência não existe no croqui. */
export function componentEdgeCurve(holder: ComponentSketchHolder, ref: ComponentEdgeRef): StairCurve | null {
  const c = componentOf(holder, ref);
  if (!c) return null;
  const curves = componentCurvesOf(c, ref.key);
  return curves?.[ref.index] ?? null;
}

/** Cadeia completa do mesmo campo do mesmo componente (a ordem é a guardada no modelo). */
export function componentEdgeChain(holder: ComponentSketchHolder, ref: ComponentEdgeRef): StairCurve[] {
  const c = componentOf(holder, ref);
  if (!c) return [];
  return componentCurvesOf(c, ref.key) ?? [];
}

const cloneCurve = (c: StairCurve): StairCurve => ({ a: { ...c.a }, b: { ...c.b }, sag: c.sag });

/**
 * Troca a curva apontada por `ref`, preservando o tipo do componente e todos os demais campos. Referência inválida
 * devolve o próprio holder (edição vazia).
 */
export function replaceComponentEdge(holder: ComponentSketchHolder, ref: ComponentEdgeRef, curve: StairCurve): ComponentSketchHolder {
  const c = componentOf(holder, ref);
  if (!c) return holder;
  const curves = componentCurvesOf(c, ref.key);
  if (!curves || ref.index < 0 || ref.index >= curves.length) return holder;
  const next = curves.slice();
  next[ref.index] = cloneCurve(curve);
  return replaceComponentCurves(holder, ref, next);
}

/** Troca a cadeia inteira do campo apontado, preservando o componente e os demais campos. */
export function replaceComponentCurves(holder: ComponentSketchHolder, ref: ComponentEdgeRef, curves: StairCurve[]): ComponentSketchHolder {
  const c = componentOf(holder, ref);
  if (!c) return holder;
  if (!componentCurvesOf(c, ref.key)) return holder;
  const nextComponent = { ...c, [ref.key]: curves } as StairRun | StairLanding;
  const components = holder.components.slice();
  components[ref.part] = nextComponent;
  return { ...holder, components };
}

/** Chaves de curva de um componente, na ordem em que entram no pick. */
const keysOf = (c: StairRun | StairLanding): ComponentPartKey[] =>
  c.kind === 'landing' ? ['boundary'] : ['boundaryLeft', 'boundaryRight', 'risers', 'path'];

/** Ponto da curva mais próximo de `at`: na reta, a projeção no segmento; no arco, o ponto amostrado mais próximo. */
export function projectOnCurve(c: StairCurve, at: Vec2): Vec2 {
  if (Math.abs(c.sag) < 1e-9) return closestOnSegment(at, c.a, c.b);
  const pts = sampleCurve(c);
  let best = pts[0] ?? c.a;
  let bestD = dist(at, best);
  for (const p of pts) {
    const d = dist(at, p);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/** Aresta do elemento mais próxima do cursor dentro da tolerância, ou null. */
function nearestEdgeOf(holder: ComponentSketchHolder, elementId: Id, at: Vec2, tol: number): ComponentEdgePick | null {
  let best: ComponentEdgePick | null = null;
  let bestD = tol;
  holder.components.forEach((c, part) => {
    for (const key of keysOf(c)) {
      const curves = componentCurvesOf(c, key);
      if (!curves) continue;
      curves.forEach((curve, index) => {
        const d = distToCurve(curve, at);
        if (d > bestD || (best && d >= bestD)) return;
        best = { ref: { elementId, part, key, index }, a: { ...curve.a }, b: { ...curve.b }, sag: curve.sag, at: projectOnCurve(curve, at) };
        bestD = d;
      });
    }
  });
  return best;
}

/**
 * Aresta de escada ou rampa do nível sob o cursor (tolerância de 4 px em metros). O elemento mais recente vence; dentro
 * dele, vale a aresta mais próxima. O ponto devolvido é a projeção do cursor na curva.
 */
export function pickComponentEdgeAt(p: Project, levelId: Id, at: Vec2, mpp: number): ComponentEdgePick | null {
  const tol = 4 * mpp;
  const holders = [
    ...stairsOnLevel(p, levelId).map((s) => ({ id: s.id, order: s.order, holder: s as ComponentSketchHolder })),
    ...rampsOnLevel(p, levelId).map((r) => ({ id: r.id, order: r.order, holder: r as ComponentSketchHolder })),
  ].sort((x, y) => x.order - y.order);
  for (let i = holders.length - 1; i >= 0; i--) {
    const h = holders[i]!;
    const pick = nearestEdgeOf(h.holder, h.id, at, tol);
    if (pick) return pick;
  }
  return null;
}

/** Versão com o ambiente da ferramenta: nível ativo e metros por pixel da vista. */
export function componentEdgeAt(env: ToolEnv, at: Vec2): ComponentEdgePick | null {
  return pickComponentEdgeAt(env.project(), env.levelId(), at, env.metersPerPixel());
}
