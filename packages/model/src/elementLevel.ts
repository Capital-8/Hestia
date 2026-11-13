import { levelElevation } from './queries.ts';
import { stairFitPatch } from './stairFit.ts';
import { isCad, type CadDrawing } from './cad.ts';
import { isTerrain, isTerrainRegion } from './terrain.ts';
import { isLot } from './lot.ts';
import type { Terrain, TerrainRegion } from './terrainTypes.ts';
import type { Lot } from './lotTypes.ts';
import { isCeiling, isFloor, isGuardaCorpo, isRamp, isRoof, isRoom, isSlab, isStair, isWall, type Ceiling, type Element, type Floor, type GuardaCorpo, type Id, type Project, type Ramp, type Roof, type Room, type Slab, type Stair, type Wall } from './types.ts';
import { t, type Lang } from './i18n.ts';

/**
 * Como manter o elemento ao trocar de nível: `elevation` preserva a cota absoluta (compensa o deslocamento);
 * `offset` preserva o deslocamento relativo ao nível e leva a cota junto.
 */
export type LevelKeep = 'elevation' | 'offset';

export interface SetElementLevel {
  ids: Id[];
  levelId: Id;
  keep: LevelKeep;
}

/** Elementos com nível próprio. Aberturas não têm: acompanham a parede anfitriã. */
export const hasLevel = (e: Element | undefined): e is Wall | Floor | Slab | Ceiling | Roof | Stair | Ramp | GuardaCorpo | Terrain | TerrainRegion | Lot | Room | CadDrawing =>
  isWall(e) || isFloor(e) || isSlab(e) || isCeiling(e) || isRoof(e) || isStair(e) || isRamp(e) || isGuardaCorpo(e) || isTerrain(e) || isTerrainRegion(e) || isLot(e) || isRoom(e) || isCad(e);

/** Nível de um elemento com nível próprio; null para abertura ou id inexistente. */
export function elementLevelId(e: Element | undefined): Id | null {
  return hasLevel(e) ? e.levelId : null;
}

/**
 * Troca o nível de paredes, pisos, lajes e telhados (lógica do comando `setElementLevel`).
 * Valida tudo antes de mexer: nível inexistente, elemento inexistente ou abertura lançam erro e nada muda.
 * Com `keep: 'elevation'`, a cota absoluta fica igual: a parede (e a escada) ganha `baseOffset += cotaAntiga − cotaNova`
 * (o topo vinculado a um nível continua no mesmo nível, com o mesmo deslocamento) e os demais ganham
 * `heightOffset += cotaAntiga − cotaNova`. Com `keep: 'offset'`, só o nível muda.
 */
export function applyElementLevel(p: Project, c: SetElementLevel, lang: Lang = 'pt'): void {
  const target = p.levels.find((l) => l.id === c.levelId);
  if (!target) throw new Error(t(lang, 'md_cmd_level_missing_id', { id: c.levelId }));
  const ids = [...new Set(c.ids)];
  for (const id of ids) {
    const e = p.elements[id];
    if (!e) throw new Error(t(lang, 'md_cmd_element_missing_id', { id }));
    if (!hasLevel(e)) throw new Error(t(lang, 'md_cmd_opening_no_level', { id }));
  }
  for (const id of ids) {
    const e = p.elements[id];
    if (!hasLevel(e)) continue;
    const delta = c.keep === 'elevation' ? levelElevation(p, e.levelId) - target.elevation : 0;
    e.levelId = target.id;
    if (isWall(e) || isStair(e) || isRamp(e)) e.baseOffset += delta;
    // Guarda-corpo hospedado segue a cota do hospedeiro (o nível vem dele); só o manual tem cota própria.
    else if (isGuardaCorpo(e)) {
      if (e.hospedeiro.tipo === 'manual') e.cotaBase += delta;
    } else if (isRoom(e)) e.heightOffset = (e.heightOffset ?? 0) + delta;
    else if (isCad(e)) e.offsetZ = (e.offsetZ ?? 0) + delta;
    // Terreno e região têm cotas absolutas no projeto e o lote não tem cota: trocar o nível não muda nenhum valor.
    else if (isTerrain(e) || isTerrainRegion(e) || isLot(e)) continue;
    else e.heightOffset += delta;
  }
  // Escada com topo explícito cujo desnível mudou: reajusta os espelhos (decisão 0041), sem tocar no croqui fora dos espelhos.
  for (const id of ids) {
    const e = p.elements[id];
    if (!isStair(e)) continue;
    const fit = stairFitPatch(p, e);
    if (fit) e.components = fit.components;
  }
}
