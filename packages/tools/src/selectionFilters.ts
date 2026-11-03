import { isFloor, isOpening, isRamp, isRoof, isRoom, isSlab, isStair, isWall, type Id, type Project } from '@hestia/model';
import { t as translate, type Lang } from './i18n.ts';

/** Categorias de filtro: paredes, portas, janelas, pisos, lajes, telhados, escadas, rampas e ambientes ('rooms', categoria 'room'). */
export type ElementCategory = 'walls' | 'doors' | 'windows' | 'floors' | 'slabs' | 'roofs' | 'stairs' | 'ramps' | 'rooms';

/** Parede ou abertura pertence ao nível? Abertura pertence ao nível da parede que a hospeda. */
function onLevel(p: Project, id: Id, levelId: Id): boolean {
  const e = p.elements[id];
  if (isWall(e) || isFloor(e) || isSlab(e) || isRoof(e) || isStair(e) || isRamp(e) || isRoom(e)) return e.levelId === levelId;
  if (isOpening(e)) {
    const host = p.elements[e.hostId];
    return isWall(host) && host.levelId === levelId;
  }
  return false;
}

/** Todas as paredes, aberturas e pisos do nível que usam o tipo `typeId`. */
export function idsOfType(p: Project, levelId: Id, typeId: Id): Id[] {
  return Object.values(p.elements)
    .filter((e) => (isWall(e) || isOpening(e) || isFloor(e) || isSlab(e) || isRoof(e) || isStair(e) || isRamp(e)) && e.typeId === typeId && onLevel(p, e.id, levelId))
    .map((e) => e.id);
}

/** Todos os elementos de uma categoria no nível. */
export function idsOfCategory(p: Project, levelId: Id, category: ElementCategory): Id[] {
  return Object.values(p.elements)
    .filter((e) => {
      if (category === 'walls') return isWall(e) && onLevel(p, e.id, levelId);
      if (category === 'floors') return isFloor(e) && onLevel(p, e.id, levelId);
      if (category === 'slabs') return isSlab(e) && onLevel(p, e.id, levelId);
      if (category === 'roofs') return isRoof(e) && onLevel(p, e.id, levelId);
      if (category === 'stairs') return isStair(e) && onLevel(p, e.id, levelId);
      if (category === 'ramps') return isRamp(e) && onLevel(p, e.id, levelId);
      if (category === 'rooms') return isRoom(e) && onLevel(p, e.id, levelId);
      if (category === 'doors') return isOpening(e) && e.kind === 'door' && onLevel(p, e.id, levelId);
      return isOpening(e) && e.kind === 'window' && onLevel(p, e.id, levelId);
    })
    .map((e) => e.id);
}

/**
 * Tipo dos elementos selecionados. Devolve erro em texto se a seleção está vazia ou mistura tipos.
 * Ids que não são paredes, aberturas nem pisos são ignorados.
 */
export function selectedTypeId(p: Project, ids: Id[], lang: Lang = 'pt'): { typeId: Id } | { error: string } {
  const types = new Set<Id>();
  for (const id of ids) {
    const e = p.elements[id];
    if (isWall(e) || isOpening(e) || isFloor(e) || isSlab(e) || isRoof(e) || isStair(e) || isRamp(e)) types.add(e.typeId);
  }
  if (types.size === 0) return { error: translate(lang, 'tl_msg_filter_select_first') };
  if (types.size > 1) return { error: translate(lang, 'tl_msg_filter_mixed') };
  return { typeId: [...types][0]! };
}
