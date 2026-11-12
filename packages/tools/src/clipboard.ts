import { guardaCorposDaCopia, hospedeiroDoGuardaCorpo, isCad, isCeiling, isFloor, isGeneric, isGuardaCorpo, isOpening, isRamp, isRoof, isRoom, isSlab, isStair, isWall, newId, type CadDrawing, type Ceiling, type Command, type Element, type Floor, type Generic, type GuardaCorpo, type Id, type Opening, type Project, type Ramp, type Room, type Roof, type Slab, type Stair, type Wall } from '@hestia/model';
import { pasteAlignedToLevelsCommand } from './pasteLevels/command.ts';
import type { PasteIds } from './pasteLevels/types.ts';

/**
 * Buffer de copiar/colar: paredes e as aberturas hospedadas nelas, mais pisos, lajes, forros, telhados, escadas,
 * rampas, ambientes, objetos genéricos e desenhos CAD, como estavam ao copiar.
 */
export interface ClipBuffer {
  walls: Wall[];
  openings: Opening[];
  floors: Floor[];
  slabs: Slab[];
  roofs: Roof[];
  /** Escadas (ausente em buffers antigos = nenhuma). */
  stairs?: Stair[];
  /** Rampas (ausente em buffers antigos = nenhuma). */
  ramps?: Ramp[];
  /** Ambientes (ausente em buffers antigos = nenhum). Colados nas mesmas coordenadas do ponto interior. */
  rooms?: Room[];
  /** Forros (ausente em buffers antigos = nenhum). */
  ceilings?: Ceiling[];
  /** Objetos importados/IFC (ausente em buffers antigos = nenhum). */
  generics?: Generic[];
  /** Desenhos CAD importados (ausente em buffers antigos = nenhum). */
  cad?: CadDrawing[];
  /**
   * Guarda-corpos (ausente em buffers antigos = nenhum): os manuais selecionados e os hospedados nas escadas e rampas
   * copiadas. Hospedado sem o hospedeiro no buffer não entra (o caminho dele vem da escada ou rampa).
   */
  railings?: GuardaCorpo[];
}

/** Gerador de identificadores; injetável para teste. */
export type MintId = (prefix: string) => Id;

/**
 * Copia as paredes e os pisos selecionados e as aberturas que estão nas paredes. Aberturas selecionadas sem a
 * parede não entram: sem anfitriã não há como colá-las. Forros, objetos genéricos e CAD também entram.
 * Devolve null se não há nada colável.
 */
export function clipboardFrom(p: Project, ids: Id[]): ClipBuffer | null {
  const hostIds = new Set(ids.filter((id) => isWall(p.elements[id])));
  const floors = ids.map((id) => p.elements[id]).filter(isFloor).map((f) => structuredClone(f));
  const slabs = ids.map((id) => p.elements[id]).filter(isSlab).map((s) => structuredClone(s));
  const ceilings = ids.map((id) => p.elements[id]).filter(isCeiling).map((c) => structuredClone(c));
  const roofs = ids.map((id) => p.elements[id]).filter(isRoof).map((r) => structuredClone(r));
  const stairs = ids.map((id) => p.elements[id]).filter(isStair).map((s) => structuredClone(s));
  const ramps = ids.map((id) => p.elements[id]).filter(isRamp).map((r) => structuredClone(r));
  const rooms = ids.map((id) => p.elements[id]).filter(isRoom).map((r) => structuredClone(r));
  const generics = ids.map((id) => p.elements[id]).filter(isGeneric).map((g) => structuredClone(g));
  const cad = ids.map((id) => p.elements[id]).filter(isCad).map((c) => structuredClone(c));
  const railings = guardaCorposDaCopia(p, ids).map((id) => structuredClone(p.elements[id] as GuardaCorpo));
  if (
    hostIds.size === 0 &&
    floors.length === 0 &&
    slabs.length === 0 &&
    ceilings.length === 0 &&
    roofs.length === 0 &&
    stairs.length === 0 &&
    ramps.length === 0 &&
    rooms.length === 0 &&
    generics.length === 0 &&
    cad.length === 0 &&
    railings.length === 0
  ) return null;
  const walls = [...hostIds].map((id) => structuredClone(p.elements[id] as Wall));
  const openings = Object.values(p.elements)
    .filter(isOpening)
    .filter((o) => hostIds.has(o.hostId))
    .map((o) => structuredClone(o));
  return { walls, openings, floors, slabs, ceilings, roofs, stairs, ramps, rooms, generics, cad, railings };
}

/** Elemento que `clipboardFrom` leva por si só: parede, piso, laje, forro, telhado, escada, rampa, ambiente, genérico ou CAD. */
const isCopyableElement = (e: Element | undefined): boolean =>
  isWall(e) || isFloor(e) || isSlab(e) || isCeiling(e) || isRoof(e) || isStair(e) || isRamp(e) || isRoom(e) || isGeneric(e) || isCad(e);

/** Guarda-corpo que `clipboardFrom` leva: o manual ou o hospedado cujo hospedeiro também está na seleção. */
const copyableRailing = (ids: readonly Id[], e: Element | undefined): boolean => {
  if (!isGuardaCorpo(e)) return false;
  const host = hospedeiroDoGuardaCorpo(e);
  return host === null || ids.includes(host);
};

/**
 * Ids que `clipboardFrom` levaria para a seleção dada, sem copiar nada: os elementos copiáveis da seleção, na ordem
 * em que aparecem nela, mais as aberturas hospedadas nas paredes selecionadas, na ordem de `p.elements`. Sem
 * duplicatas. Anotações, grades e separadores de ambiente ficam de fora (aberturas sozinhas também: sem a parede
 * anfitriã não há como colá-las).
 */
export function copyableIds(p: Project, ids: readonly Id[]): Id[] {
  const hostIds = new Set(ids.filter((id) => isWall(p.elements[id])));
  const out: Id[] = [];
  const seen = new Set<Id>();
  for (const id of ids) {
    if (!(isCopyableElement(p.elements[id]) || copyableRailing(ids, p.elements[id])) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  for (const e of Object.values(p.elements)) {
    if (!isOpening(e) || !hostIds.has(e.hostId) || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e.id);
  }
  return out;
}

/** Resultado do colar de um nível; os ids extras (forro, genérico, CAD) alimentam a seleção e a translação do Colar. */
export interface PasteAlignedResult {
  command: Command;
  wallIds: Id[];
  openingIds: Id[];
  floorIds: Id[];
  slabIds: Id[];
  roofIds: Id[];
  stairIds: Id[];
  rampIds: Id[];
  roomIds: Id[];
  ceilingIds: Id[];
  genericIds: Id[];
  cadIds: Id[];
  railingIds: Id[];
}

/**
 * Comando de lote que cola o buffer no nível `levelId` nas MESMAS coordenadas, com ids novos e ordem nova.
 * Aberturas com tipo inexistente neste projeto são descartadas (evita tipo ausente na renderização).
 * Tipo de parede inexistente cai no padrão do projeto. O topo em nível é remapeado pelo delta de índice
 * (parede/escada/rampa) e o topo anexado a telhado segue o telhado copiado. Devolve null se nada seria colado.
 */
export function pasteAlignedCommand(
  p: Project,
  clip: ClipBuffer,
  levelId: Id,
  mint: MintId = (prefix) => newId(prefix),
): PasteAlignedResult | null {
  const r = pasteAlignedToLevelsCommand(p, clip, [levelId], { mint });
  const ids = r?.byLevel[levelId];
  if (!r || !ids) return null;
  if (idsInPaste(ids) === 0) return null;
  return {
    command: r.command,
    wallIds: ids.walls,
    openingIds: ids.openings,
    floorIds: ids.floors,
    slabIds: ids.slabs,
    roofIds: ids.roofs,
    stairIds: ids.stairs,
    rampIds: ids.ramps,
    roomIds: ids.rooms,
    ceilingIds: ids.ceilings,
    genericIds: ids.generics,
    cadIds: ids.cad,
    railingIds: ids.railings,
  };
}

/** Total de ids colados (para o Colar de um nível saber se algo entrou). */
function idsInPaste(ids: PasteIds): number {
  return (
    ids.walls.length + ids.openings.length + ids.floors.length + ids.slabs.length + ids.ceilings.length + ids.roofs.length +
    ids.stairs.length + ids.ramps.length + ids.rooms.length + ids.generics.length + ids.cad.length + ids.railings.length
  );
}
