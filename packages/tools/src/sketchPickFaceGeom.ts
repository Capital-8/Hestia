import { arcFromSagitta, arcLocal, closestOnSegment, dist, dot, len, norm, sub, type SketchSeg, type Vec2 } from '@hestia/geom';
import type { Id } from '@hestia/model';
import type { ToolEnv } from './types.ts';

/** Contexto mínimo das ferramentas de esboço: o mesmo subconjunto de `ToolEnv` que a captura usa. */
export type SketchCtx = Pick<ToolEnv, 'project' | 'levelId' | 'hiddenInView' | 'lang'>;

/** Tolerância (m) para dizer que um ponto está sobre um círculo de face. */
export const CIRCLE_TOL = 0.005;

/** Círculo de uma face de arco: centro e raio. */
export interface Circle {
  c: Vec2;
  r: number;
}

/** Predicado de visibilidade: elemento oculto na planta não entra na captura. */
export function visibleIn(ctx: SketchCtx): (id: Id) => boolean {
  const hidden = ctx.hiddenInView?.();
  return (id) => !hidden?.has(id);
}

/** Linha ou arco do esboço. Flecha ausente ou zero = reta, como em `SketchSeg`. */
export function makeSeg(id: string, a: Vec2, b: Vec2, sag = 0): SketchSeg {
  return Math.abs(sag) > 1e-9 ? { id, a, b, sag } : { id, a, b };
}

/** Distância do ponto à linha ou ao arco do esboço (pontas, quando o ponto cai fora da extensão do arco). */
export function segDistance(seg: SketchSeg, p: Vec2): number {
  const arc = seg.sag ? arcFromSagitta(seg.a, seg.b, seg.sag) : null;
  if (!arc) return dist(p, closestOnSegment(p, seg.a, seg.b));
  const { t, s } = arcLocal(arc, p);
  if (t >= 0 && t <= arc.length) return Math.abs(s);
  return Math.min(dist(p, seg.a), dist(p, seg.b));
}

/** O ponto está sobre o círculo, dentro da tolerância. */
export const onCircle = (p: Vec2, k: Circle, tol = CIRCLE_TOL): boolean => Math.abs(dist(p, k.c) - k.r) <= tol;

/** Índice do primeiro círculo que contém o ponto, ou -1. */
export function circleIndexOf(p: Vec2, circles: Circle[], tol = CIRCLE_TOL): number {
  return circles.findIndex((k) => onCircle(p, k, tol));
}

/** Duas retas do esboço são colineares no mesmo sentido (para fundir arestas seguidas). */
export function sameDirection(a: SketchSeg, b: SketchSeg): boolean {
  const u = sub(a.b, a.a);
  const v = sub(b.b, b.a);
  if (len(u) < 1e-9 || len(v) < 1e-9) return false;
  const nu = norm(u);
  const nv = norm(v);
  return Math.abs(nu.x * nv.y - nu.y * nv.x) < 1e-4 && dot(nu, nv) > 0;
}
