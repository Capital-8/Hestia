import { isBeam, isCeiling, isColumn, isFloor, isFooting, isGuardaCorpo, isOpening, isRamp, isRoof, isRoom, isSlab, isStair, isWall, type Id, type Project } from '@hestia/model';
import { t as translate, type Lang } from './i18n.ts';

/** Categorias de filtro: arquitetura e estrutura do projeto. */
export type ElementCategory =
  | 'walls'
  | 'doors'
  | 'windows'
  | 'floors'
  | 'slabs'
  | 'ceilings'
  | 'roofs'
  | 'stairs'
  | 'ramps'
  | 'rooms'
  | 'columns'
  | 'beams'
  | 'footings';

/** O elemento pertence ao nível (ou passa em qualquer nível quando `levelId === null`, caso da vista 3D)? */
function onLevel(p: Project, id: Id, levelId: Id | null): boolean {
  const e = p.elements[id];
  if (
    isWall(e) ||
    isFloor(e) ||
    isSlab(e) ||
    isCeiling(e) ||
    isRoof(e) ||
    isStair(e) ||
    isRamp(e) ||
    isRoom(e) ||
    isGuardaCorpo(e) ||
    isColumn(e) ||
    isBeam(e) ||
    isFooting(e)
  ) {
    return levelId === null || e.levelId === levelId;
  }
  if (isOpening(e)) {
    const host = p.elements[e.hostId];
    return isWall(host) && (levelId === null || host.levelId === levelId);
  }
  return false;
}

/** Todos os elementos do nível (ou de todo o projeto quando `levelId === null`) que usam o tipo `typeId`. */
export function idsOfType(p: Project, levelId: Id | null, typeId: Id, bloqueados?: ReadonlySet<Id>): Id[] {
  return Object.values(p.elements)
    .filter(
      (e) =>
        !bloqueados?.has(e.id) &&
        (isWall(e) ||
          isOpening(e) ||
          isFloor(e) ||
          isSlab(e) ||
          isCeiling(e) ||
          isRoof(e) ||
          isStair(e) ||
          isRamp(e) ||
          isGuardaCorpo(e) ||
          isColumn(e) ||
          isBeam(e) ||
          isFooting(e)) &&
        e.typeId === typeId &&
        onLevel(p, e.id, levelId),
    )
    .map((e) => e.id);
}

/** Todos os elementos de uma categoria no nível. */
export function idsOfCategory(p: Project, levelId: Id, category: ElementCategory, bloqueados?: ReadonlySet<Id>): Id[] {
  return Object.values(p.elements)
    .filter((e) => {
      if (bloqueados?.has(e.id)) return false;
      if (category === 'walls') return isWall(e) && onLevel(p, e.id, levelId);
      if (category === 'floors') return isFloor(e) && onLevel(p, e.id, levelId);
      if (category === 'slabs') return isSlab(e) && onLevel(p, e.id, levelId);
      if (category === 'ceilings') return isCeiling(e) && onLevel(p, e.id, levelId);
      if (category === 'roofs') return isRoof(e) && onLevel(p, e.id, levelId);
      if (category === 'stairs') return isStair(e) && onLevel(p, e.id, levelId);
      if (category === 'ramps') return isRamp(e) && onLevel(p, e.id, levelId);
      if (category === 'rooms') return isRoom(e) && onLevel(p, e.id, levelId);
      if (category === 'columns') return isColumn(e) && onLevel(p, e.id, levelId);
      if (category === 'beams') return isBeam(e) && onLevel(p, e.id, levelId);
      if (category === 'footings') return isFooting(e) && onLevel(p, e.id, levelId);
      if (category === 'doors') return isOpening(e) && e.kind === 'door' && onLevel(p, e.id, levelId);
      return isOpening(e) && e.kind === 'window' && onLevel(p, e.id, levelId);
    })
    .map((e) => e.id);
}

/**
 * Tipo dos elementos selecionados. Devolve erro em texto se a seleção está vazia ou mistura tipos.
 */
export function selectedTypeId(p: Project, ids: Id[], lang: Lang = 'pt'): { typeId: Id } | { error: string } {
  const types = new Set<Id>();
  for (const id of ids) {
    const e = p.elements[id];
    if (
      isWall(e) ||
      isOpening(e) ||
      isFloor(e) ||
      isSlab(e) ||
      isCeiling(e) ||
      isRoof(e) ||
      isStair(e) ||
      isRamp(e) ||
      isGuardaCorpo(e) ||
      isColumn(e) ||
      isBeam(e) ||
      isFooting(e)
    ) {
      types.add(e.typeId);
    }
  }
  if (types.size === 0) return { error: translate(lang, 'tl_msg_filter_select_first') };
  if (types.size > 1) return { error: translate(lang, 'tl_msg_filter_mixed') };
  return { typeId: [...types][0]! };
}
