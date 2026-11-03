import type { Vec2 } from '@hestia/geom';
import { ceilingOutline } from '@hestia/engine';
import { isCeiling, isFloor, isRoof, isSlab, type Id, type Project } from '@hestia/model';
import { roofRingPatch } from './roofEdges.ts';
import { commitRoofPatch } from './roofCheck.ts';
import { commitCeilingBoundary, commitOutlineBoundary, OUTLINE_LOCKED_MSG } from './outlineEdit.ts';
import { pickAt } from './pick.ts';
import { pickRingEdgeAt } from './ringEdgePick.ts';
import type { EdgePick, RingRef } from './ringEdge.ts';
import type { ToolEnv } from './types.ts';

/** Alvo de uma ferramenta de modificar: parede (pelo id) ou aresta de um anel (piso, laje, telhado, forro). */
export type LineTarget = { kind: 'wall'; id: Id } | { kind: 'edge'; pick: EdgePick };

/**
 * Pick unificado das ferramentas de modificar. Parede (e abertura, que conta como a parede) vence; sem parede, a aresta
 * de anel mais próxima. Devolve null se não há nada sob o cursor.
 */
export function pickLineTarget(p: Project, levelId: Id, at: Vec2, mpp: number): LineTarget | null {
  const hit = pickAt(p, levelId, at, mpp);
  if (hit?.kind === 'wall') return { kind: 'wall', id: hit.id };
  const edge = pickRingEdgeAt(p, levelId, at, mpp);
  return edge ? { kind: 'edge', pick: edge } : null;
}

/** Anel atual referenciado: contorno externo (`hole === null`) ou furo. Null se o elemento não tem anel. */
export function ringOfRef(p: Project, ref: RingRef): Vec2[] | null {
  const e = p.elements[ref.elementId];
  if (!e || !(isFloor(e) || isSlab(e) || isRoof(e) || isCeiling(e))) return null;
  // Forro que acompanha o ambiente é desenhado pelo contorno do ambiente (ceilingOutline).
  const shape = isCeiling(e) ? ceilingOutline(p, e) : e;
  if (ref.hole === null) return shape.boundary;
  return shape.holes[ref.hole] ?? null;
}

/**
 * Grava um anel editado no elemento certo. Piso e laje vinculados às paredes ficam travados (decisão 0031): a edição é
 * recusada com a mensagem de Desvincular. Telhado e forro passam pelos commits que já validam o próprio contorno.
 * Devolve true se gravou.
 */
export function commitRingEdit(env: ToolEnv, ref: RingRef, ring: Vec2[]): boolean {
  const e = env.project().elements[ref.elementId];
  if (!e) return false;
  if (ref.hole !== null) {
    if ((isFloor(e) || isSlab(e)) && e.outlineSource?.linked) {
      env.say(OUTLINE_LOCKED_MSG);
      return false;
    }
    if (!(isFloor(e) || isSlab(e) || isCeiling(e) || isRoof(e))) return false;
    const holes = e.holes.map((h, i) => (i === ref.hole ? ring : h));
    env.exec({ type: 'updateElements', ids: [ref.elementId], patch: { holes } });
    return true;
  }
  if (isFloor(e) || isSlab(e)) return commitOutlineBoundary(env, ref.elementId, ring);
  if (isCeiling(e)) {
    commitCeilingBoundary(env, ref.elementId, ring);
    return true;
  }
  if (isRoof(e)) return commitRoofPatch(env, [ref.elementId], roofRingPatch(e, ring, null), env.lang?.() ?? 'pt');
  return false;
}

/** Aresta de anel sob o cursor (parede não conta: null se o alvo é parede ou não há nada). */
export function edgeAtCursor(env: Pick<ToolEnv, 'project' | 'levelId' | 'metersPerPixel'>, at: Vec2): EdgePick | null {
  const t = pickLineTarget(env.project(), env.levelId(), at, env.metersPerPixel());
  return t?.kind === 'edge' ? t.pick : null;
}
