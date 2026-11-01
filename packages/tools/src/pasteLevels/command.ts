import { applyCommand, makeCopyLink, newId, type Command, type Element, type Floor, type Id, type Opening, type Project, type Room, type Roof, type Slab, type Wall } from '@hestia/model';
import { roomRegionAt } from '@hestia/engine';
import { rampTypeId } from '../rampCommands.ts';
import { stairTypeId } from '../stairCommands.ts';
import type { ClipBuffer, MintId } from '../clipboard.ts';
import { cloneCategories } from './categories.ts';
import { explicitTopHeight, remapTopLevel } from './remap.ts';
import type { PasteIds, PasteLevelsOptions, PasteLevelsResult, PasteWarning, PasteWarningKind } from './types.ts';

/** Ordem canônica das categorias no resultado e no vínculo (docs/colar-niveis/CONTRATO.md). */
const CATEGORY_ORDER: readonly (keyof PasteIds)[] = ['walls', 'openings', 'floors', 'slabs', 'ceilings', 'roofs', 'stairs', 'ramps', 'rooms', 'generics', 'cad'];

function emptyIds(): PasteIds {
  return { walls: [], openings: [], floors: [], slabs: [], ceilings: [], roofs: [], stairs: [], ramps: [], rooms: [], generics: [], cad: [] };
}

function emptySources(): Record<keyof PasteIds, Id[]> {
  return { walls: [], openings: [], floors: [], slabs: [], ceilings: [], roofs: [], stairs: [], ramps: [], rooms: [], generics: [], cad: [] };
}

/** Ids de um nível na ordem canônica (é a ordem de `sourceIds`/`members` do vínculo). */
function idsInOrder(ids: PasteIds): Id[] {
  return CATEGORY_ORDER.flatMap((key) => ids[key]);
}

/** Há algo colável? Aberturas sozinhas não entram: sem a parede anfitriã não há como colá-las. */
function hasContent(c: ClipBuffer): boolean {
  return (
    c.walls.length > 0 ||
    c.floors.length > 0 ||
    c.slabs.length > 0 ||
    c.roofs.length > 0 ||
    (c.ceilings?.length ?? 0) > 0 ||
    (c.stairs?.length ?? 0) > 0 ||
    (c.ramps?.length ?? 0) > 0 ||
    (c.rooms?.length ?? 0) > 0 ||
    (c.generics?.length ?? 0) > 0 ||
    (c.cad?.length ?? 0) > 0
  );
}

/** Nível de origem do buffer: o primeiro elemento com nível ainda existente (para o delta de Z dos genéricos). */
function sourceLevelOf(p: Project, c: ClipBuffer): Id {
  const candidates: Id[] = [
    ...c.walls.map((e) => e.levelId),
    ...c.floors.map((e) => e.levelId),
    ...c.slabs.map((e) => e.levelId),
    ...(c.ceilings ?? []).map((e) => e.levelId),
    ...c.roofs.map((e) => e.levelId),
    ...(c.stairs ?? []).map((e) => e.levelId),
    ...(c.ramps ?? []).map((e) => e.levelId),
    ...(c.rooms ?? []).map((e) => e.levelId),
    ...(c.generics ?? []).map((e) => e.levelId),
    ...(c.cad ?? []).map((e) => e.levelId),
  ];
  return candidates.find((id) => p.levels.some((l) => l.id === id)) ?? p.levels[0]?.id ?? '';
}

/** Soma um aviso do nível, agregando por tipo (o resultado lista "N avisos" de cada tipo). */
function addWarning(out: PasteWarning[], levelId: Id, kind: PasteWarningKind, count = 1): void {
  if (count <= 0) return;
  const found = out.find((w) => w.levelId === levelId && w.kind === kind);
  if (found) found.count += count;
  else out.push({ levelId, kind, count });
}

/** Chave de geometria para a contagem simples de sobreposição (mesmo tipo e mesma geometria no destino). */
function geometryKey(e: Element): string | null {
  switch (e.kind) {
    case 'wall':
      return `wall|${e.a.x},${e.a.y}|${e.b.x},${e.b.y}|${e.sag}`;
    case 'floor':
    case 'slab':
    case 'ceiling':
    case 'roof':
      return `${e.kind}|${JSON.stringify(e.boundary)}|${JSON.stringify(e.holes)}`;
    case 'room':
      return `room|${e.point.x},${e.point.y}`;
    default:
      return null;
  }
}

/**
 * Sobreposições simples: conta os elementos colados que repetem a mesma geometria de um elemento já existente no
 * nível de destino. Categorias com geometria complexa (escada, rampa, genérico, CAD) ficam de fora.
 */
function countOverlap(p: Project, levelId: Id, fresh: readonly Element[]): number {
  if (fresh.length === 0) return 0;
  const keys = new Set<string>();
  for (const e of Object.values(p.elements)) {
    if (!('levelId' in e) || e.levelId !== levelId) continue;
    const key = geometryKey(e);
    if (key) keys.add(key);
  }
  let n = 0;
  for (const e of fresh) {
    const key = geometryKey(e);
    if (key && keys.has(key)) n += 1;
  }
  return n;
}

/**
 * Ambientes colados num ponto sem circuito fechado no destino. Usa uma cópia rasa do projeto com as paredes recém
 * criadas (o contorno é derivado das paredes) e não toca no modelo real.
 */
function countOpenRooms(p: Project, levelId: Id, walls: readonly Omit<Wall, 'order'>[], rooms: readonly Omit<Room, 'order'>[]): number {
  if (rooms.length === 0) return 0;
  const elements: Record<Id, Element> = { ...p.elements };
  for (const w of walls) elements[w.id] = { ...w, order: 0 };
  const scratch: Project = { ...p, elements };
  let n = 0;
  for (const r of rooms) if (roomRegionAt(scratch, levelId, r.point).problem !== null) n += 1;
  return n;
}

interface BuiltLevel {
  commands: Command[];
  ids: PasteIds;
  /** Ids de origem que foram realmente colados, por categoria (para montar o vínculo). */
  sources: Record<keyof PasteIds, Id[]>;
}

/**
 * Gera um nível de destino. Paredes/aberturas/pisos/lajes/telhados/escadas/rampas/ambientes são copiados aqui;
 * forros, genéricos e CAD vêm de `cloneCategories` (W2), que recebe o mapa de paredes e o mapa geral de ids.
 */
function buildLevel(p: Project, clip: ClipBuffer, levelId: Id, srcLevelId: Id, mint: MintId, warnings: PasteWarning[], calcularAvisos: boolean): BuiltLevel {
  const ids = emptyIds();
  const sources = emptySources();
  const commands: Command[] = [];
  const fresh: Element[] = [];
  const wallsOut: Omit<Wall, 'order'>[] = [];
  const roomsOut: Omit<Room, 'order'>[] = [];
  const hostMap = new Map<Id, Id>();
  const wallMap = new Map<Id, Id>();
  const roomMap = new Map<Id, Id>();
  const roofMap = new Map<Id, Id>();
  const warn = (kind: PasteWarningKind, count = 1): void => addWarning(warnings, levelId, kind, count);

  // Telhados primeiro: a parede com topo anexado precisa do id do telhado copiado.
  for (const r of clip.roofs) {
    const id = mint('t');
    roofMap.set(r.id, id);
    ids.roofs.push(id);
    sources.roofs.push(r.id);
    hostMap.set(r.id, id);
    const { order: _order, ...rest } = r;
    const typeId = p.roofTypes[r.typeId] ? r.typeId : (Object.keys(p.roofTypes)[0] ?? r.typeId);
    const roof: Omit<Roof, 'order'> = { ...rest, id, levelId, typeId };
    commands.push({ type: 'addRoof', roof });
    fresh.push({ ...roof, order: 0 });
  }

  // Ambientes antes dos forros (W2 remapeia `roomId` pelo mapa de ids).
  for (const r of clip.rooms ?? []) {
    const id = mint('rm');
    ids.rooms.push(id);
    sources.rooms.push(r.id);
    hostMap.set(r.id, id);
    roomMap.set(r.id, id);
    const { order: _order, ...rest } = r;
    const room = { ...rest, id, levelId };
    roomsOut.push(room);
    fresh.push({ ...room, order: 0 });
    commands.push({ type: 'addRoom', room });
  }

  for (const s of clip.stairs ?? []) {
    const id = mint('st');
    ids.stairs.push(id);
    sources.stairs.push(s.id);
    hostMap.set(s.id, id);
    const { order: _order, ...rest } = s;
    const remap = remapTopLevel(p, s.levelId, s.topLevelId, levelId);
    let height = s.height;
    if (remap.overflow) {
      if (s.topLevelId !== null) {
        const h = explicitTopHeight(p, s.levelId, s.topLevelId, s.topOffset, s.baseOffset);
        if (h !== null) height = h;
      }
      warn('top-overflow');
    }
    const typeId = p.stairTypes[s.typeId] ? s.typeId : stairTypeId(p);
    const components = rest.components.map((c) => ({ ...c, id: mint(c.kind === 'run' ? 'r' : 'p') }));
    commands.push({ type: 'addStair', stair: { ...rest, id, levelId, typeId: typeId ?? s.typeId, components, topLevelId: remap.topLevelId, height } });
  }

  for (const r of clip.ramps ?? []) {
    const id = mint('rp');
    ids.ramps.push(id);
    sources.ramps.push(r.id);
    hostMap.set(r.id, id);
    const { order: _order, ...rest } = r;
    const remap = remapTopLevel(p, r.levelId, r.topLevelId, levelId);
    let height = r.height;
    if (remap.overflow) {
      if (r.topLevelId !== null) {
        const h = explicitTopHeight(p, r.levelId, r.topLevelId, r.topOffset, r.baseOffset);
        if (h !== null) height = h;
      }
      warn('top-overflow');
    }
    const typeId = p.rampTypes[r.typeId] ? r.typeId : rampTypeId(p);
    const components = rest.components.map((c) => ({ ...c, id: mint('rc') }));
    commands.push({ type: 'addRamp', ramp: { ...rest, id, levelId, typeId: typeId ?? r.typeId, components, topLevelId: remap.topLevelId, height } });
  }

  for (const s of clip.slabs) {
    const id = mint('l');
    ids.slabs.push(id);
    sources.slabs.push(s.id);
    hostMap.set(s.id, id);
    const { order: _order, ...rest } = s;
    const typeId = p.slabTypes[s.typeId] ? s.typeId : (Object.keys(p.slabTypes)[0] ?? s.typeId);
    const slab: Omit<Slab, 'order'> = { ...rest, id, levelId, typeId };
    commands.push({ type: 'addSlab', slab });
    fresh.push({ ...slab, order: 0 });
  }

  for (const f of clip.floors) {
    const id = mint('f');
    ids.floors.push(id);
    sources.floors.push(f.id);
    hostMap.set(f.id, id);
    const { order: _order, ...rest } = f;
    const typeId = p.floorTypes[f.typeId] ? f.typeId : (Object.keys(p.floorTypes)[0] ?? f.typeId);
    const floor: Omit<Floor, 'order'> = { ...rest, id, levelId, typeId };
    commands.push({ type: 'addFloor', floor });
    fresh.push({ ...floor, order: 0 });
  }

  for (const w of clip.walls) {
    const id = mint('w');
    ids.walls.push(id);
    sources.walls.push(w.id);
    hostMap.set(w.id, id);
    wallMap.set(w.id, id);
    const remap = remapTopLevel(p, w.levelId, w.topLevelId, levelId);
    let height = w.height;
    if (remap.overflow) {
      if (w.topLevelId !== null) {
        const h = explicitTopHeight(p, w.levelId, w.topLevelId, w.topOffset, w.baseOffset);
        if (h !== null) height = h;
      }
      warn('top-overflow');
    }
    const { order: _order, attachTopRoofId, ...rest } = w;
    const roofId = attachTopRoofId ? roofMap.get(attachTopRoofId) : undefined;
    if (attachTopRoofId && !roofId) warn('roof-unlinked');
    const typeId = p.wallTypes[w.typeId] ? w.typeId : p.defaults.wallTypeId;
    const wall: Omit<Wall, 'order'> = {
      ...rest,
      id,
      levelId,
      typeId,
      topLevelId: remap.topLevelId,
      height,
      ...(roofId ? { attachTopRoofId: roofId } : {}),
    };
    wallsOut.push(wall);
    commands.push({ type: 'addWall', wall });
    fresh.push({ ...wall, order: 0 });
  }

  // Aberturas sempre na parede copiada do MESMO nível de destino.
  for (const o of clip.openings) {
    const hostId = hostMap.get(o.hostId);
    if (!hostId || !p.openingTypes[o.typeId]) {
      warn('opening-dropped');
      continue;
    }
    const id = mint(o.kind === 'door' ? 'd' : 'j');
    ids.openings.push(id);
    sources.openings.push(o.id);
    hostMap.set(o.id, id);
    const opening: Opening = { ...o, id, hostId };
    commands.push({ type: 'addOpening', opening });
  }

  // Forros, genéricos e CAD: W2. O contexto leva o mapa de paredes, o mapa de ambientes e o mapa geral de ids.
  const ctx = { p, levelId, srcLevelId, mint, hostMap, wallMap, roomMap };
  const extra = cloneCategories(p, clip, levelId, ctx);
  commands.push(...extra.commands);
  ids.ceilings.push(...extra.ids.ceilings);
  ids.generics.push(...extra.ids.generics);
  ids.cad.push(...extra.ids.cad);
  sources.ceilings.push(...(clip.ceilings ?? []).slice(0, extra.ids.ceilings.length).map((c) => c.id));
  sources.generics.push(...(clip.generics ?? []).slice(0, extra.ids.generics.length).map((g) => g.id));
  sources.cad.push(...(clip.cad ?? []).slice(0, extra.ids.cad.length).map((c) => c.id));
  for (const c of (clip.ceilings ?? []).slice(0, extra.ids.ceilings.length)) fresh.push({ ...c, levelId });
  warnings.push(...extra.warnings);

  if (calcularAvisos) {
    warn('overlap', countOverlap(p, levelId, fresh));
    warn('room-open', countOpenRooms(p, levelId, wallsOut, roomsOut));
  }

  return { commands, ids, sources };
}

/**
 * Cola o buffer em um ou mais níveis, com ids novos e `levelId` do destino, num ÚNICO lote de comandos.
 * X/Y, rotação, `sag` e os offsets relativos são preservados. Devolve null sem tocar no modelo quando a lista de
 * níveis é vazia, tem repetição ou nível inexistente, ou quando não há nada colável no buffer.
 */
export function pasteAlignedToLevelsCommand(
  p: Project,
  clip: ClipBuffer,
  levelIds: Id[],
  o: PasteLevelsOptions = {},
): PasteLevelsResult | null {
  if (!hasContent(clip)) return null;
  if (levelIds.length === 0) return null;
  if (new Set(levelIds).size !== levelIds.length) return null;
  if (!levelIds.every((id) => p.levels.some((l) => l.id === id))) return null;

  const mint: MintId = o.mint ?? ((prefix) => newId(prefix));
  const srcLevelId = sourceLevelOf(p, clip);
  const commands: Command[] = [];
  const warnings: PasteWarning[] = [];
  const byLevel: Record<Id, PasteIds> = {};
  const sourcesByLevel: Record<Id, Record<keyof PasteIds, Id[]>> = {};

  for (const levelId of levelIds) {
    const built = buildLevel(p, clip, levelId, srcLevelId, mint, warnings, o.semAvisos !== true);
    commands.push(...built.commands);
    byLevel[levelId] = built.ids;
    sourcesByLevel[levelId] = built.sources;
  }

  if (o.link) {
    const linkCommand = linkCommandFor(levelIds, byLevel, sourcesByLevel, mint);
    if (linkCommand) commands.push(linkCommand);
  }

  return { command: { type: 'batch', commands }, byLevel, warnings };
}

/** Lote já calculado e o rascunho da prévia: evita recalcular no clique de "Pré-visualizar" e no "Colar". */
export interface PreparedPasteLevels {
  result: PasteLevelsResult;
  draft: Project;
}

/**
 * Calcula o lote UMA vez e monta o rascunho da prévia a partir dele. O controlador guarda o resultado e usa o mesmo
 * comando ao confirmar, então os ids dos fantasmas são os ids que entram no projeto.
 */
export function preparePasteLevels(p: Project, clip: ClipBuffer, levelIds: Id[], o: PasteLevelsOptions = {}): PreparedPasteLevels | null {
  // Prévia não precisa da contagem de sobreposição/ambiente aberto: são varreduras caras e o usuário quer o 3D já pronto.
  const result = pasteAlignedToLevelsCommand(p, clip, levelIds, { ...o, semAvisos: true });
  if (!result) return null;
  // Rascunho raso: o lote só acrescenta elementos/ordem/vínculo; não precisa clonar o projeto inteiro.
  const draft: Project = { ...p, elements: { ...p.elements } };
  applyCommand(draft, result.command);
  return { result, draft };
}

/**
 * Rascunho com os elementos colados, sem tocar no projeto real: clona o projeto e aplica o mesmo lote.
 * Lista inválida (ou buffer vazio) devolve a cópia intacta.
 */
export function previewPasteLevels(p: Project, clip: ClipBuffer, levelIds: Id[], o: PasteLevelsOptions = {}): Project {
  return preparePasteLevels(p, clip, levelIds, o)?.draft ?? structuredClone(p);
}

/** Linha do vínculo: fonte da categoria e ids colados por nível, na ordem canônica. */
function linkCommandFor(
  levelIds: Id[],
  byLevel: Record<Id, PasteIds>,
  sourcesByLevel: Record<Id, Record<keyof PasteIds, Id[]>>,
  mint: MintId,
): Command | null {
  const first = levelIds[0];
  if (!first) return null;
  const sources = sourcesByLevel[first];
  if (!sources) return null;
  const sourceIds = CATEGORY_ORDER.flatMap((key) => sources[key]);
  if (sourceIds.length === 0) return null;
  // Todas as categorias do buffer são coladas em todos os níveis (as únicas quedas — abertura sem tipo/anfitriã —
  // são independentes do nível), então cada membro tem exatamente um id por papel de `sourceIds`.
  const members = levelIds.map((levelId) => ({ levelId, ids: idsInOrder(byLevel[levelId] ?? emptyIds()) }));
  return { type: 'addCopyLink', link: makeCopyLink(sourceIds, members, mint) };
}
