import { closestOnSegment, dist, type Vec2 } from '@hestia/geom';
import { rampsOnLevel, stairsOnLevel, type Id, type Project } from '@hestia/model';
import { rampPolylines } from './rampPick.ts';
import { stairPolylines } from './stairPick.ts';
import type { ToolEnv } from './types.ts';
import { t as translate, type Lang } from './i18n.ts';

/** Escada ou rampa atingida pela LINHA do croqui (limite, espelho, caminhada ou contorno de patamar). */
export type ComponentHit = { id: Id; kind: 'stair' | 'ramp' };

/** Aviso das ferramentas de aresta ao clicar numa linha de escada/rampa. */
export const componentEdgeMsg = (lang: Lang = 'pt'): string => translate(lang, 'tl_msg_component_edge');
export const COMPONENT_EDGE_MSG = componentEdgeMsg();

/** Aviso do Mover sem seleção: a aresta do croqui não se move sozinha; a escada/rampa inteira se move. */
export const componentMoveMsg = (lang: Lang = 'pt'): string => translate(lang, 'tl_msg_component_move');
export const COMPONENT_MOVE_MSG = componentMoveMsg();

/** Distância de `at` à polilinha `pl` (menor entre os segmentos). */
function distToPolyline(at: Vec2, pl: Vec2[]): number {
  if (pl.length === 0) return Infinity;
  if (pl.length === 1) return dist(at, pl[0]!);
  let best = Infinity;
  for (let i = 1; i < pl.length; i++) best = Math.min(best, dist(at, closestOnSegment(at, pl[i - 1]!, pl[i]!)));
  return best;
}

/**
 * Linha de escada/rampa sob o cursor, a até 4 px. Só a LINHA conta: o interior do lance/patamar é do Selecionar e das
 * ferramentas de piso, não das ferramentas de aresta. O elemento mais recente vence (o desenho de cima).
 */
export function componentLineAt(p: Project, levelId: Id, at: Vec2, mpp: number): ComponentHit | null {
  const tol = 4 * mpp;
  const list = [
    ...stairsOnLevel(p, levelId).map((s) => ({ id: s.id, kind: 'stair' as const, order: s.order, polylines: () => stairPolylines(s) })),
    ...rampsOnLevel(p, levelId).map((r) => ({ id: r.id, kind: 'ramp' as const, order: r.order, polylines: () => rampPolylines(r) })),
  ].sort((a, b) => b.order - a.order);
  for (const item of list) {
    if (item.polylines().some((pl) => distToPolyline(at, pl) <= tol)) return { id: item.id, kind: item.kind };
  }
  return null;
}

/** Atalho para as ferramentas: a mesma linha de escada/rampa, a partir do ambiente. */
export function componentUnderCursor(env: Pick<ToolEnv, 'project' | 'levelId' | 'metersPerPixel'>, at: Vec2): ComponentHit | null {
  return componentLineAt(env.project(), env.levelId(), at, env.metersPerPixel());
}
