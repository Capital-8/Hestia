import { isCad, isCeiling, isComponent, isFloor, isGeneric, isOpening, isRamp, isRoof, isRoom, isSlab, isStair, isWall, newId, type CadDrawing, type Ceiling, type Command, type Component, type ComponentGroup, type Element, type Familia, type Floor, type Generic, type Id, type Opening, type Project, type Ramp, type Room, type Roof, type Slab, type Stair, type Wall } from '@hestia/model';
import { pasteAlignedToLevelsCommand } from './pasteLevels/command.ts';
import type { PasteIds } from './pasteLevels/types.ts';

/**
 * Buffer de copiar/colar: paredes e as aberturas hospedadas nelas, mais pisos, lajes, forros, telhados, escadas,
 * rampas, ambientes, objetos genéricos, desenhos CAD e componentes, como estavam ao copiar.
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
  /** Instâncias de componente (ausente em buffers antigos = nenhuma). */
  components?: Component[];
  /**
   * Famílias usadas pelas instâncias copiadas (ausente = nenhuma). Ao colar num projeto que não as tem, elas entram
   * junto por `upsertFamily`, antes das instâncias.
   */
  componentFamilies?: Familia[];
  /**
   * Conjuntos cujos membros foram copiados por inteiro (ausente em buffers antigos = nenhum). Conjunto copiado em
   * parte não entra: os componentes colam soltos.
   */
  groups?: ComponentGroup[];
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
  const components = ids.map((id) => p.elements[id]).filter(isComponent).map((c) => structuredClone(c));
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
    components.length === 0
  ) return null;
  const walls = [...hostIds].map((id) => structuredClone(p.elements[id] as Wall));
  const openings = Object.values(p.elements)
    .filter(isOpening)
    .filter((o) => hostIds.has(o.hostId))
    .map((o) => structuredClone(o));
  // A família viaja na cópia: o projeto de destino pode não conhecê-la.
  const familyIds = [...new Set(components.map((c) => c.familyId))];
  const componentFamilies = familyIds
    .map((id) => p.componentFamilies?.[id])
    .filter((f): f is Familia => f !== undefined)
    .map((f) => structuredClone(f));
  // Só o conjunto copiado INTEIRO viaja; um conjunto pela metade cola os componentes soltos.
  const copiados = new Set(components.map((c) => c.id));
  const groups = Object.values(p.componentGroups ?? {})
    .filter((g) => g.membros.length > 0 && g.membros.every((id) => copiados.has(id)))
    .map((g) => structuredClone(g));
  return { walls, openings, floors, slabs, ceilings, roofs, stairs, ramps, rooms, generics, cad, components, componentFamilies, groups };
}

/** Elemento que `clipboardFrom` leva por si só: parede, piso, laje, forro, telhado, escada, rampa, ambiente, genérico, CAD ou componente. */
const isCopyableElement = (e: Element | undefined): boolean =>
  isWall(e) || isFloor(e) || isSlab(e) || isCeiling(e) || isRoof(e) || isStair(e) || isRamp(e) || isRoom(e) || isGeneric(e) || isCad(e) || isComponent(e);

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
    if (!isCopyableElement(p.elements[id]) || seen.has(id)) continue;
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

/** Resultado do colar de um nível; os ids extras (forro, genérico, CAD, componente) alimentam a seleção e a translação do Colar. */
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
  componentIds: Id[];
}

/** Comando de colar componentes: o lote e os ids novos das instâncias. */
export interface PasteComponentsResult {
  command: Command;
  componentIds: Id[];
}

/**
 * Comando de lote que cola as instâncias do buffer no nível `levelId`, nas MESMAS coordenadas, com ids novos e
 * `mark` vazio. A família entra junto (antes das instâncias, por `upsertFamily`) só quando o projeto de destino ainda
 * não a tem. Componente cuja família não está nem no buffer nem no destino é descartado. Devolve null sem instâncias
 * coláveis.
 */
export function pasteComponentsCommand(
  p: Project,
  clip: ClipBuffer,
  levelId: Id,
  mint: MintId = (prefix) => newId(prefix),
): PasteComponentsResult | null {
  const list = clip.components ?? [];
  if (list.length === 0 || !p.levels.some((l) => l.id === levelId)) return null;
  const families = new Map((clip.componentFamilies ?? []).map((f) => [f.id, f]));
  const present = new Set(Object.keys(p.componentFamilies ?? {}));
  const commands: Command[] = [];
  for (const family of families.values()) {
    if (present.has(family.id)) continue;
    commands.push({ type: 'upsertFamily', family: structuredClone(family) });
    present.add(family.id);
  }
  const componentIds: Id[] = [];
  /** De cada instância copiada para a instância nova: os conjuntos remapeiam os membros por ele. */
  const novosIds = new Map<Id, Id>();
  for (const c of list) {
    if (!present.has(c.familyId)) continue;
    const id = mint('cm');
    componentIds.push(id);
    novosIds.set(c.id, id);
    commands.push({
      type: 'addComponent',
      component: {
        id,
        kind: 'component',
        familyId: c.familyId,
        typeId: c.typeId,
        levelId,
        x: c.x,
        y: c.y,
        z: c.z,
        rotation: c.rotation,
        mirrored: c.mirrored,
        values: c.values ? structuredClone(c.values) : undefined,
        mark: '',
      },
    });
  }
  if (componentIds.length === 0) return null;
  // Conjunto copiado inteiro vira um conjunto novo no destino, com os ids novos; a linha acompanha o colar.
  for (const grupo of clip.groups ?? []) {
    const membros: Id[] = [];
    let completo = true;
    for (const id of grupo.membros) {
      const novo = novosIds.get(id);
      if (novo === undefined) {
        completo = false;
        break;
      }
      membros.push(novo);
    }
    if (!completo) continue;
    commands.push({
      type: 'upsertComponentGroup',
      group: {
        id: mint('g'),
        nome: `${grupo.nome} (cópia)`,
        levelId,
        membros,
        ...(grupo.linha ? { linha: structuredClone(grupo.linha) } : {}),
        ...(grupo.regras ? { regras: structuredClone(grupo.regras) } : {}),
      },
    });
  }
  return { command: { type: 'batch', commands }, componentIds };
}

/**
 * Comando de lote que cola o buffer no nível `levelId` nas MESMAS coordenadas, com ids novos e ordem nova.
 * Aberturas com tipo inexistente neste projeto são descartadas (evita tipo ausente na renderização).
 * Tipo de parede inexistente cai no padrão do projeto. O topo em nível é remapeado pelo delta de índice
 * (parede/escada/rampa) e o topo anexado a telhado segue o telhado copiado. Componentes entram pelo próprio lote,
 * levando a família quando o destino não a tem. Devolve null se nada seria colado.
 */
export function pasteAlignedCommand(
  p: Project,
  clip: ClipBuffer,
  levelId: Id,
  mint: MintId = (prefix) => newId(prefix),
): PasteAlignedResult | null {
  const r = pasteAlignedToLevelsCommand(p, clip, [levelId], { mint });
  const ids = r?.byLevel[levelId];
  if (r && ids && idsInPaste(ids) > 0) {
    const components = pasteComponentsCommand(p, clip, levelId, mint);
    const commands: Command[] = components ? [r.command, components.command] : [r.command];
    return {
      command: commands.length === 1 ? r.command : { type: 'batch', commands },
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
      componentIds: components?.componentIds ?? [],
    };
  }
  const components = pasteComponentsCommand(p, clip, levelId, mint);
  if (!components) return null;
  return {
    command: components.command,
    wallIds: [],
    openingIds: [],
    floorIds: [],
    slabIds: [],
    roofIds: [],
    stairIds: [],
    rampIds: [],
    roomIds: [],
    ceilingIds: [],
    genericIds: [],
    cadIds: [],
    componentIds: components.componentIds,
  };
}

/** Total de ids colados (para o Colar de um nível saber se algo entrou). */
function idsInPaste(ids: PasteIds): number {
  return (
    ids.walls.length + ids.openings.length + ids.floors.length + ids.slabs.length + ids.ceilings.length + ids.roofs.length +
    ids.stairs.length + ids.ramps.length + ids.rooms.length + ids.generics.length + ids.cad.length
  );
}
