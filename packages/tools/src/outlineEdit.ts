import type { Vec2 } from '@hestia/geom';
import { ceilingOutline } from '@hestia/engine';
import { followsRoom, isCeiling, isFloor, isSlab, type Id } from '@hestia/model';
import type { ToolEnv } from './types.ts';
import { t as translate, type Lang } from './i18n.ts';

/** Mensagem da barra de status quando a edição de um contorno travado nas paredes é recusada (decisão 0031, Revit: linha travada). */
export const outlineLockedMsg = (lang: Lang = 'pt'): string => translate(lang, 'tl_msg_outline_locked');
export const OUTLINE_LOCKED_MSG = outlineLockedMsg();

/** Mensagem da barra de status quando a edição de um forro que acompanha o ambiente o solta (decisão 0023 §13, P-5). */
export const ceilingDetachedMsg = (lang: Lang = 'pt'): string => translate(lang, 'tl_msg_ceiling_detached');
export const CEILING_DETACHED_MSG = ceilingDetachedMsg();

/**
 * Grava um contorno editado de piso ou laje. Contorno vinculado às paredes fica TRAVADO (decisão 0031, Revit: a aresta
 * presa à parede não se move sozinha): a edição é recusada e a barra de status pede "Desvincular". Só depois de
 * desvincular (`detachOutline`) a edição grava. Elemento sem vínculo apenas troca o contorno. Devolve se gravou.
 */
export function commitOutlineBoundary(env: ToolEnv, id: Id, ring: Vec2[]): boolean {
  const e = env.project().elements[id];
  const linked = (isFloor(e) || isSlab(e)) && e.outlineSource?.linked;
  if (linked) {
    env.say(OUTLINE_LOCKED_MSG);
    return false;
  }
  env.exec({ type: 'updateElements', ids: [id], patch: { boundary: ring } });
  return true;
}

/**
 * Grava um contorno editado de forro (alças e Delete do vértice). Forro que acompanha o ambiente se SOLTA no mesmo passo de
 * desfazer, levando os furos do ambiente como estáticos; forro solto ou desenhado à mão só troca o contorno.
 */
export function commitCeilingBoundary(env: ToolEnv, id: Id, ring: Vec2[]): void {
  const p = env.project();
  const c = p.elements[id];
  if (!isCeiling(c)) return;
  if (!followsRoom(c)) {
    env.exec({ type: 'updateElements', ids: [id], patch: { boundary: ring } });
    return;
  }
  const { holes } = ceilingOutline(p, c);
  env.transaction('Editar contorno', () => {
    env.exec({ type: 'detachCeilingRoom', id });
    env.exec({ type: 'updateElements', ids: [id], patch: { boundary: ring, holes } });
  });
  env.say(CEILING_DETACHED_MSG);
}
