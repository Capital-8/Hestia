import type { Vec2 } from '@hestia/geom';
import { isRamp, isStair, type Id, type StairLanding, type StairRun } from '@hestia/model';
import type { ToolEnv } from './types.ts';
import type { ComponentSketchHolder } from './stairPick.ts';
import { componentEdgeCurve, type ComponentEdgeRef } from './componentEdge.ts';
import {
  alignComponentEdge,
  moveComponentEdge,
  offsetComponentEdge,
  splitComponentEdge,
  trimComponentEdge,
  type EdgeLine,
} from './componentOps.ts';
import { updateStairComponents } from './stairCommands.ts';
import { updateRampComponents } from './rampCommands.ts';
import { langOf, t as translate } from './i18n.ts';

/** Resultado de uma edição de aresta: só `ok`, ou o motivo da recusa em pt-BR. */
export type ComponentEditResult = { ok: true } | { ok: false; error: string };

/**
 * Grava o croqui editado da escada ou da rampa. Escada livre (`freePath`) e rampa livre (forma 'free' ou `freePath`) são
 * recusadas antes de qualquer comando — o croqui manual descartaria o trajeto. A gravação é UM passo de desfazer.
 */
export function commitComponentEdge(
  env: ToolEnv,
  elementId: Id,
  components: Array<StairRun | StairLanding>,
  label = translate(langOf(env), 'tl_undo_edit_component'),
): ComponentEditResult {
  const e = env.project().elements[elementId];
  if (isStair(e)) {
    if (e.freePath) return { ok: false, error: translate(langOf(env), 'tl_msg_free_stair_no_edges') };
    const r = updateStairComponents(env, elementId, components);
    return 'error' in r ? { ok: false, error: r.error } : { ok: true };
  }
  if (isRamp(e)) {
    if (e.shape === 'free' || e.freePath) return { ok: false, error: translate(langOf(env), 'tl_msg_free_ramp_no_edges') };
    const r = updateRampComponents(env, elementId, components, label);
    return 'error' in r ? { ok: false, error: r.error } : { ok: true };
  }
  return { ok: false, error: translate(langOf(env), 'tl_msg_not_stair_ramp') };
}

/** Aplica uma operação pura ao elemento, grava o croqui e devolve ok/erro. */
function applyEdgeOp(
  env: ToolEnv,
  ref: ComponentEdgeRef,
  label: string,
  op: (holder: ComponentSketchHolder) => ComponentSketchHolder | null,
  fail: string,
): ComponentEditResult {
  const e = env.project().elements[ref.elementId];
  if (!isStair(e) && !isRamp(e)) return { ok: false, error: translate(langOf(env), 'tl_msg_not_stair_ramp') };
  if (!componentEdgeCurve(e, ref)) return { ok: false, error: translate(langOf(env), 'tl_msg_edge_not_found') };
  const next = op(e);
  if (!next) return { ok: false, error: fail };
  return commitComponentEdge(env, ref.elementId, next.components, label);
}

/** Move a aresta pelo vetor `d` (m), mantendo a cadeia contínua. */
export function moveEdge(env: ToolEnv, ref: ComponentEdgeRef, d: Vec2): ComponentEditResult {
  return applyEdgeOp(env, ref, translate(langOf(env), 'tl_undo_move_component_edge'), (h) => moveComponentEdge(h, ref, d), translate(langOf(env), 'tl_msg_edge_not_found'));
}

/** Desloca a aresta `dist` metros à esquerda do sentido a→b (negativo, à direita). */
export function offsetEdge(env: ToolEnv, ref: ComponentEdgeRef, dist: number): ComponentEditResult {
  return applyEdgeOp(env, ref, translate(langOf(env), 'tl_undo_offset_component_edge'), (h) => offsetComponentEdge(h, ref, dist), translate(langOf(env), 'tl_msg_edge_cannot_offset'));
}

/** Divide a aresta no ponto projetado do cursor. */
export function splitEdge(env: ToolEnv, ref: ComponentEdgeRef, at: Vec2): ComponentEditResult {
  return applyEdgeOp(env, ref, translate(langOf(env), 'tl_undo_split_component_edge'), (h) => splitComponentEdge(h, ref, at), translate(langOf(env), 'tl_msg_edge_cannot_split'));
}

/** Apara a aresta reta até a linha de corte, movendo a ponta indicada. */
export function trimEdge(env: ToolEnv, ref: ComponentEdgeRef, line: EdgeLine, endToMove: 'a' | 'b'): ComponentEditResult {
  return applyEdgeOp(
    env,
    ref,
    translate(langOf(env), 'tl_undo_trim_component_edge'),
    (h) => trimComponentEdge(h, ref, line, endToMove),
    translate(langOf(env), 'tl_msg_edge_cannot_trim'),
  );
}

/** Alinha a aresta reta pela linha (projeta as duas pontas). */
export function alignEdge(env: ToolEnv, ref: ComponentEdgeRef, line: EdgeLine): ComponentEditResult {
  return applyEdgeOp(
    env,
    ref,
    translate(langOf(env), 'tl_undo_align_component_edge'),
    (h) => alignComponentEdge(h, ref, line),
    translate(langOf(env), 'tl_msg_edge_cannot_align'),
  );
}
