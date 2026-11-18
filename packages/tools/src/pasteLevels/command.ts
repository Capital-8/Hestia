/* eslint-disable max-lines */
import {
  applyCommand, copiarTerreno, newId, type Beam, type Column, type Command, type Element, type Floor, type Footing,
  type Id, type Mass, type Opening, type Project, type Room, type Roof, type Slab, type Wall,
} from '@hestia/model';
import { rampTypeId } from '../rampCommands.ts';
import { stairTypeId } from '../stairCommands.ts';
import type { ClipBuffer, MintId } from '../clipboard.ts';
import { cloneCategories, emptyPasteIds } from './categories.ts';
import {
  addWarning, countOpenRooms, countOverlap, createDestResolver, emptySources, hasContent, linkCommandFor,
  sourceLevelsInClip,
} from './helpers.ts';
import { explicitTopHeight, remapTopLevel } from './remap.ts';
import type { PasteIds, PasteLevelsOptions, PasteLevelsResult, PasteWarning, PasteWarningKind } from './types.ts';

interface BuiltLevel {
  commands: Command[];
  ids: PasteIds;
  /** Ids de origem que foram realmente colados, por categoria (para montar o vínculo). */
  sources: Record<keyof PasteIds, Id[]>;
}

/**
 * Gera um nível de destino (ou pilha relativa de níveis quando a seleção de origem vem de múltiplos pavimentos em 3D).
 */
function buildLevel(
  p: Project,
  clip: ClipBuffer,
  levelId: Id,
  srcLevelId: Id,
  multiLevel: boolean,
  mint: MintId,
  warnings: PasteWarning[],
  calcularAvisos: boolean,
  comTerreno: boolean,
): BuiltLevel {
  const ids = emptyPasteIds();
  const sources = emptySources();
  const commands: Command[] = [];
  const freshByDest = new Map<Id, Element[]>();
  const wallsByDest = new Map<Id, Omit<Wall, 'order'>[]>();
  const roomsByDest = new Map<Id, Omit<Room, 'order'>[]>();
  const recordFresh = (destId: Id, e: Element): void => {
    const list = freshByDest.get(destId) ?? [];
    list.push(e);
    freshByDest.set(destId, list);
  };
  const hostMap = new Map<Id, Id>();
  const wallMap = new Map<Id, Id>();
  const roomMap = new Map<Id, Id>();
  const roofMap = new Map<Id, Id>();
  const warn = (kind: PasteWarningKind, count = 1): void => addWarning(warnings, levelId, kind, count);
  const destOf = createDestResolver(p, levelId, srcLevelId, multiLevel, warn);

  // Telhados primeiro: a parede com topo anexado precisa do id do telhado copiado.
  for (const r of clip.roofs) {
    const dest = destOf(r.levelId);
    const id = mint('t');
    roofMap.set(r.id, id);
    ids.roofs.push(id);
    sources.roofs.push(r.id);
    hostMap.set(r.id, id);
    const { order: _order, ...rest } = r;
    const typeId = p.roofTypes[r.typeId] ? r.typeId : (Object.keys(p.roofTypes)[0] ?? r.typeId);
    const roof: Omit<Roof, 'order'> = {
      ...rest,
      id,
      levelId: dest.levelId,
      typeId,
      ...(dest.extraZ ? { heightOffset: (r.heightOffset ?? 0) + dest.extraZ } : {}),
    };
    commands.push({ type: 'addRoof', roof });
    recordFresh(dest.levelId, { ...roof, order: 0 });
  }

  // Ambientes antes dos forros (W2 remapeia `roomId` pelo mapa de ids).
  for (const r of clip.rooms ?? []) {
    const dest = destOf(r.levelId);
    const id = mint('rm');
    ids.rooms.push(id);
    sources.rooms.push(r.id);
    hostMap.set(r.id, id);
    roomMap.set(r.id, id);
    const { order: _order, ...rest } = r;
    const room = { ...rest, id, levelId: dest.levelId };
    const rList = roomsByDest.get(dest.levelId) ?? [];
    rList.push(room);
    roomsByDest.set(dest.levelId, rList);
    recordFresh(dest.levelId, { ...room, order: 0 });
    commands.push({ type: 'addRoom', room });
  }

  for (const s of clip.stairs ?? []) {
    const dest = destOf(s.levelId);
    const id = mint('st');
    ids.stairs.push(id);
    sources.stairs.push(s.id);
    hostMap.set(s.id, id);
    const { order: _order, ...rest } = s;
    const remap = remapTopLevel(p, s.levelId, s.topLevelId, dest.levelId);
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
    commands.push({
      type: 'addStair',
      stair: {
        ...rest,
        id,
        levelId: dest.levelId,
        typeId: typeId ?? s.typeId,
        components,
        topLevelId: remap.topLevelId,
        height,
        ...(dest.extraZ ? { baseOffset: s.baseOffset + dest.extraZ, topOffset: s.topOffset + dest.extraZ } : {}),
      },
    });
  }

  for (const r of clip.ramps ?? []) {
    const dest = destOf(r.levelId);
    const id = mint('rp');
    ids.ramps.push(id);
    sources.ramps.push(r.id);
    hostMap.set(r.id, id);
    const { order: _order, ...rest } = r;
    const remap = remapTopLevel(p, r.levelId, r.topLevelId, dest.levelId);
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
    commands.push({
      type: 'addRamp',
      ramp: {
        ...rest,
        id,
        levelId: dest.levelId,
        typeId: typeId ?? r.typeId,
        components,
        topLevelId: remap.topLevelId,
        height,
        ...(dest.extraZ ? { baseOffset: r.baseOffset + dest.extraZ, topOffset: r.topOffset + dest.extraZ } : {}),
      },
    });
  }

  for (const s of clip.slabs) {
    const dest = destOf(s.levelId);
    const id = mint('l');
    ids.slabs.push(id);
    sources.slabs.push(s.id);
    hostMap.set(s.id, id);
    const { order: _order, ...rest } = s;
    const typeId = p.slabTypes[s.typeId] ? s.typeId : (Object.keys(p.slabTypes)[0] ?? s.typeId);
    const slab: Omit<Slab, 'order'> = {
      ...rest,
      id,
      levelId: dest.levelId,
      typeId,
      ...(dest.extraZ ? { heightOffset: s.heightOffset + dest.extraZ } : {}),
    };
    commands.push({ type: 'addSlab', slab });
    recordFresh(dest.levelId, { ...slab, order: 0 });
  }

  for (const f of clip.floors) {
    const dest = destOf(f.levelId);
    const id = mint('f');
    ids.floors.push(id);
    sources.floors.push(f.id);
    hostMap.set(f.id, id);
    const { order: _order, ...rest } = f;
    const typeId = p.floorTypes[f.typeId] ? f.typeId : (Object.keys(p.floorTypes)[0] ?? f.typeId);
    const floor: Omit<Floor, 'order'> = {
      ...rest,
      id,
      levelId: dest.levelId,
      typeId,
      ...(dest.extraZ ? { heightOffset: f.heightOffset + dest.extraZ } : {}),
    };
    commands.push({ type: 'addFloor', floor });
    recordFresh(dest.levelId, { ...floor, order: 0 });
  }

  for (const w of clip.walls) {
    const dest = destOf(w.levelId);
    const id = mint('w');
    ids.walls.push(id);
    sources.walls.push(w.id);
    hostMap.set(w.id, id);
    wallMap.set(w.id, id);
    const remap = remapTopLevel(p, w.levelId, w.topLevelId, dest.levelId);
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
      levelId: dest.levelId,
      typeId,
      topLevelId: remap.topLevelId,
      height,
      ...(dest.extraZ ? { baseOffset: (w.baseOffset ?? 0) + dest.extraZ, topOffset: (w.topOffset ?? 0) + dest.extraZ } : {}),
      ...(roofId ? { attachTopRoofId: roofId } : {}),
    };
    const wList = wallsByDest.get(dest.levelId) ?? [];
    wList.push(wall);
    wallsByDest.set(dest.levelId, wList);
    commands.push({ type: 'addWall', wall });
    recordFresh(dest.levelId, { ...wall, order: 0 });
  }

  // Guarda-corpos: o manual vai com o caminho como estava; o hospedado vai para a escada ou rampa copiada (mesmo buffer).
  for (const g of clip.railings ?? []) {
    const dest = destOf(g.levelId);
    const { order: _order, ...rest } = g;
    const h = rest.hospedeiro;
    const origem = h.tipo === 'escada' ? h.escadaId : h.tipo === 'rampa' ? h.rampaId : null;
    const novoHost = origem === null ? null : hostMap.get(origem);
    if (origem !== null && !novoHost) continue;
    const hospedeiro = h.tipo === 'escada' ? { ...h, escadaId: novoHost! } : h.tipo === 'rampa' ? { ...h, rampaId: novoHost! } : h;
    const typeId = p.tiposGuardaCorpo?.[g.typeId] ? g.typeId : Object.keys(p.tiposGuardaCorpo ?? {})[0];
    if (!typeId) continue;
    const id = mint('gc');
    ids.railings.push(id);
    commands.push({ type: 'addGuardaCorpo', guardaCorpo: { ...rest, id, levelId: dest.levelId, typeId, hospedeiro } });
  }

  // Massas: id novo e nível de destino; seções, `arranjo` e `baseOffset` seguem como estavam (a base acompanha a cota do nível).
  for (const m of clip.masses ?? []) {
    const { order: _order, ...rest } = m;
    const id = mint('ms');
    ids.masses.push(id);
    sources.masses.push(m.id);
    const massa: Omit<Mass, 'order'> = { ...structuredClone(rest), id, levelId: destOf(m.levelId).levelId };
    commands.push({ type: 'addMass', mass: massa });
  }

  // Terreno e regiões (só no colar de um nível): cada região vai para o terreno NOVO; região sem o terreno no buffer fica no original.
  if (comTerreno) {
    const terrenoMap = new Map<Id, Id>();
    for (const tn of clip.terrains ?? []) {
      const { order: _order, ...rest } = tn;
      const id = mint('tn');
      terrenoMap.set(tn.id, id);
      ids.terrains.push(id);
      commands.push({ type: 'addTerrain', terrain: { ...copiarTerreno(rest), id, levelId } });
    }
    for (const r of clip.terrainRegions ?? []) {
      // Região do terreno colado: vai para o terreno NOVO. Região colada SEM o terreno no buffer: fica no terreno original (se ainda existir),
      // no nível dele (o terreno é um só para todos os níveis).
      const novoTerreno = terrenoMap.get(r.terrenoId);
      const dono = p.elements[r.terrenoId];
      const donoTerreno = dono?.kind === 'terrain' ? dono : null;
      const terrenoId = novoTerreno ?? donoTerreno?.id;
      const nivel = novoTerreno ? levelId : donoTerreno?.levelId;
      if (!terrenoId || !nivel) continue;
      const { order: _order, ...rest } = r;
      const id = mint('rg');
      ids.terrainRegions.push(id);
      commands.push({ type: 'addTerrainRegion', regiao: { ...rest, id, levelId: nivel, terrenoId, contorno: rest.contorno.map((q) => ({ ...q })) } });
    }
  }

  // Lotes: 2D, vão a todo nível de destino com os mesmos lados (papel e recuo), cada um com id novo.
  for (const l of clip.lots ?? []) {
    const { order: _order, ...rest } = l;
    const id = mint('lt');
    ids.lots.push(id);
    commands.push({ type: 'addLot', lot: { ...rest, id, levelId, contorno: rest.contorno.map((q) => ({ ...q })), lados: rest.lados.map((x) => ({ ...x })), limites: { ...rest.limites } } });
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

  const columnMap = new Map<Id, Id>();
  for (const col of clip.columns ?? []) {
    const dest = destOf(col.levelId);
    const id = mint('col');
    ids.columns.push(id);
    sources.columns.push(col.id);
    hostMap.set(col.id, id);
    columnMap.set(col.id, id);
    const remap = remapTopLevel(p, col.levelId, col.topLevelId, dest.levelId);
    let height = col.height;
    if (remap.overflow) {
      if (col.topLevelId !== null) {
        const h = explicitTopHeight(p, col.levelId, col.topLevelId, col.topOffset, col.baseOffset);
        if (h !== null) height = h;
      }
      warn('top-overflow');
    }
    const { order: _order, ...rest } = col;
    const colTypes = p.columnTypes ?? {};
    const typeId = colTypes[col.typeId] ? col.typeId : (Object.keys(colTypes)[0] ?? col.typeId);
    const column: Omit<Column, 'order'> = {
      ...rest,
      id,
      levelId: dest.levelId,
      typeId,
      topLevelId: remap.topLevelId,
      height,
      ...(dest.extraZ ? { baseOffset: col.baseOffset + dest.extraZ, topOffset: col.topOffset + dest.extraZ } : {}),
    };
    commands.push({ type: 'addColumn', column });
    recordFresh(dest.levelId, { ...column, order: 0 });
  }

  for (const bm of clip.beams ?? []) {
    const dest = destOf(bm.levelId);
    const id = mint('bm');
    ids.beams.push(id);
    sources.beams.push(bm.id);
    hostMap.set(bm.id, id);
    const { order: _order, ...rest } = bm;
    const bmTypes = p.beamTypes ?? {};
    const typeId = bmTypes[bm.typeId] ? bm.typeId : (Object.keys(bmTypes)[0] ?? bm.typeId);
    const beam: Omit<Beam, 'order'> = {
      ...rest,
      id,
      levelId: dest.levelId,
      typeId,
      ...(dest.extraZ ? { zOffset: bm.zOffset + dest.extraZ } : {}),
    };
    commands.push({ type: 'addBeam', beam });
    recordFresh(dest.levelId, { ...beam, order: 0 });
  }

  for (const ft of clip.footings ?? []) {
    const dest = destOf(ft.levelId);
    const id = mint('ft');
    ids.footings.push(id);
    sources.footings.push(ft.id);
    hostMap.set(ft.id, id);
    const { order: _order, ...rest } = ft;
    const columnId = ft.columnId ? (columnMap.get(ft.columnId) ?? null) : null;
    const ftTypes = p.footingTypes ?? {};
    const typeId = ftTypes[ft.typeId] ? ft.typeId : (Object.keys(ftTypes)[0] ?? ft.typeId);
    const footing: Omit<Footing, 'order'> = {
      ...rest,
      id,
      levelId: dest.levelId,
      typeId,
      columnId,
      ...(dest.extraZ ? { heightOffset: ft.heightOffset + dest.extraZ } : {}),
    };
    commands.push({ type: 'addFooting', footing });
    recordFresh(dest.levelId, { ...footing, order: 0 });
  }

  // Forros, genéricos e CAD: W2. Em seleção multinível, particiona por nível de origem para aplicar o destino relativo.
  if (!multiLevel) {
    const ctx = { p, levelId, srcLevelId, mint, hostMap, wallMap, roomMap };
    const extra = cloneCategories(p, clip, levelId, ctx);
    commands.push(...extra.commands);
    ids.ceilings.push(...extra.ids.ceilings);
    ids.generics.push(...extra.ids.generics);
    ids.cad.push(...extra.ids.cad);
    sources.ceilings.push(...(clip.ceilings ?? []).slice(0, extra.ids.ceilings.length).map((c) => c.id));
    sources.generics.push(...(clip.generics ?? []).slice(0, extra.ids.generics.length).map((g) => g.id));
    sources.cad.push(...(clip.cad ?? []).slice(0, extra.ids.cad.length).map((c) => c.id));
    for (const c of (clip.ceilings ?? []).slice(0, extra.ids.ceilings.length)) recordFresh(levelId, { ...c, levelId });
    warnings.push(...extra.warnings);
  } else {
    const extraSrcLevels = new Set<Id>([
      ...(clip.ceilings ?? []).map((c) => c.levelId),
      ...(clip.generics ?? []).map((g) => g.levelId),
      ...(clip.cad ?? []).map((c) => c.levelId),
    ]);
    for (const itemSrcLevel of extraSrcLevels) {
      const dest = destOf(itemSrcLevel);
      const subCeilings = (clip.ceilings ?? []).filter((c) => c.levelId === itemSrcLevel);
      const subGenerics = (clip.generics ?? []).filter((g) => g.levelId === itemSrcLevel);
      const subCad = (clip.cad ?? []).filter((c) => c.levelId === itemSrcLevel);
      const subClip: ClipBuffer = { ...clip, ceilings: subCeilings, generics: subGenerics, cad: subCad };
      const ctx = { p, levelId: dest.levelId, srcLevelId: itemSrcLevel, mint, hostMap, wallMap, roomMap };
      const extra = cloneCategories(p, subClip, dest.levelId, ctx);
      commands.push(...extra.commands);
      ids.ceilings.push(...extra.ids.ceilings);
      ids.generics.push(...extra.ids.generics);
      ids.cad.push(...extra.ids.cad);
      sources.ceilings.push(...subCeilings.slice(0, extra.ids.ceilings.length).map((c) => c.id));
      sources.generics.push(...subGenerics.slice(0, extra.ids.generics.length).map((g) => g.id));
      sources.cad.push(...subCad.slice(0, extra.ids.cad.length).map((c) => c.id));
      for (const c of subCeilings.slice(0, extra.ids.ceilings.length)) recordFresh(dest.levelId, { ...c, levelId: dest.levelId });
      warnings.push(...extra.warnings);
    }
  }

  if (calcularAvisos) {
    for (const [destId, freshList] of freshByDest) {
      warn('overlap', countOverlap(p, destId, freshList));
      warn('room-open', countOpenRooms(p, destId, wallsByDest.get(destId) ?? [], roomsByDest.get(destId) ?? []));
    }
  }

  return { commands, ids, sources };
}

/**
 * Cola o buffer em um ou mais níveis, com ids novos e `levelId` do destino, num ÚNICO lote de comandos.
 * Quando o buffer traz elementos de múltiplos níveis (cópia em 3D/corte), preserva o espaçamento relativo de
 * pavimentos a partir do nível mais baixo copiado.
 */
export function pasteAlignedToLevelsCommand(
  p: Project,
  clip: ClipBuffer,
  levelIds: Id[],
  o: PasteLevelsOptions = {},
): PasteLevelsResult | null {
  // Terreno: cotas absolutas, um só para todos os níveis. Só o colar de um nível o leva (colar entre pavimentos o deixa de fora).
  const comTerreno = levelIds.length === 1;
  if (!hasContent(clip, comTerreno)) return null;
  if (levelIds.length === 0) return null;
  if (new Set(levelIds).size !== levelIds.length) return null;
  if (!levelIds.every((id) => p.levels.some((l) => l.id === id))) return null;

  const mint: MintId = o.mint ?? ((prefix) => newId(prefix));
  const srcLevels = sourceLevelsInClip(p, clip);
  const srcLevelId = srcLevels[0] ?? '';
  const multiLevel = srcLevels.length > 1;
  const commands: Command[] = [];
  const warnings: PasteWarning[] = [];
  const byLevel: Record<Id, PasteIds> = {};
  const sourcesByLevel: Record<Id, Record<keyof PasteIds, Id[]>> = {};

  for (const levelId of levelIds) {
    const built = buildLevel(p, clip, levelId, srcLevelId, multiLevel, mint, warnings, o.semAvisos !== true, comTerreno);
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
