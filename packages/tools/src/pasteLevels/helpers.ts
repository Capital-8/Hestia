import {
  makeCopyLink, type Command, type Element, type Id, type Project, type Room, type Wall,
} from '@hestia/model';
import { roomRegionAt } from '@hestia/engine';
import type { ClipBuffer, MintId } from '../clipboard.ts';
import { emptyPasteIds } from './categories.ts';
import type { PasteIds, PasteWarning, PasteWarningKind } from './types.ts';

/** Ordem canônica das categorias no resultado e no vínculo (docs/colar-niveis/CONTRATO.md). */
export const CATEGORY_ORDER: readonly (keyof PasteIds)[] = [
  'walls', 'openings', 'floors', 'slabs', 'ceilings', 'roofs',
  'stairs', 'ramps', 'rooms', 'generics', 'cad', 'columns', 'beams', 'footings',
];

export function emptySources(): Record<keyof PasteIds, Id[]> {
  return { walls: [], openings: [], floors: [], slabs: [], ceilings: [], roofs: [], stairs: [], ramps: [], rooms: [], generics: [], cad: [], columns: [], beams: [], footings: [], railings: [] };
}

/** Ids de um nível na ordem canônica (é a ordem de `sourceIds`/`members` do vínculo). */
export function idsInOrder(ids: PasteIds): Id[] {
  return CATEGORY_ORDER.flatMap((key) => ids[key]);
}

/** Há algo colável? Aberturas sozinhas não entram: sem a parede anfitriã não há como colá-las. */
export function hasContent(c: ClipBuffer): boolean {
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
    (c.cad?.length ?? 0) > 0 ||
    (c.columns?.length ?? 0) > 0 ||
    (c.beams?.length ?? 0) > 0 ||
    (c.footings?.length ?? 0) > 0 ||
    (c.railings?.length ?? 0) > 0
  );
}

/** Todos os levelIds de origem ainda existentes no projeto, ordenados pela elevação (menor primeiro). */
export function sourceLevelsInClip(p: Project, c: ClipBuffer): Id[] {
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
    ...(c.columns ?? []).map((e) => e.levelId),
    ...(c.beams ?? []).map((e) => e.levelId),
    ...(c.footings ?? []).map((e) => e.levelId),
    ...(c.railings ?? []).map((e) => e.levelId),
  ];
  const present = new Set(candidates.filter((id) => p.levels.some((l) => l.id === id)));
  if (present.size === 0) return p.levels[0]?.id ? [p.levels[0].id] : [];
  const sorted = [...p.levels].sort((a, b) => a.elevation - b.elevation);
  return sorted.filter((l) => present.has(l.id)).map((l) => l.id);
}

/** Soma um aviso do nível, agregando por tipo (o resultado lista "N avisos" de cada tipo). */
export function addWarning(out: PasteWarning[], levelId: Id, kind: PasteWarningKind, count = 1): void {
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
    case 'column':
      return `column|${e.at.x},${e.at.y}|${e.rotation}`;
    case 'beam':
      return `beam|${e.a.x},${e.a.y}|${e.b.x},${e.b.y}`;
    case 'footing':
      return `footing|${e.at.x},${e.at.y}|${e.rotation}`;
    default:
      return null;
  }
}

/**
 * Sobreposições simples: conta os elementos colados que repetem a mesma geometria de um elemento já existente no
 * nível de destino. Categorias com geometria complexa (escada, rampa, genérico, CAD) ficam de fora.
 */
export function countOverlap(p: Project, levelId: Id, fresh: readonly Element[]): number {
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
export function countOpenRooms(p: Project, levelId: Id, walls: readonly Omit<Wall, 'order'>[], rooms: readonly Omit<Room, 'order'>[]): number {
  if (rooms.length === 0) return 0;
  const elements: Record<Id, Element> = { ...p.elements };
  for (const w of walls) elements[w.id] = { ...w, order: 0 };
  const scratch: Project = { ...p, elements };
  let n = 0;
  for (const r of rooms) if (roomRegionAt(scratch, levelId, r.point).problem !== null) n += 1;
  return n;
}

export function createDestResolver(
  p: Project,
  targetBaseLevelId: Id,
  baseSrcLevelId: Id,
  multiLevel: boolean,
  warn: (kind: PasteWarningKind, count?: number) => void,
): (elemSrcLevelId: Id) => { levelId: Id; extraZ: number } {
  if (!multiLevel) return () => ({ levelId: targetBaseLevelId, extraZ: 0 });
  const sorted = [...p.levels].sort((a, b) => a.elevation - b.elevation);
  const idxOf = new Map(sorted.map((l, i) => [l.id, i] as const));
  const baseSrcIdx = idxOf.get(baseSrcLevelId) ?? 0;
  const targetIdx = idxOf.get(targetBaseLevelId) ?? 0;
  const baseSrcElev = sorted[baseSrcIdx]?.elevation ?? 0;
  const top = sorted[sorted.length - 1]!;
  const targetElev = sorted[targetIdx]?.elevation ?? 0;
  return (elemSrcLevelId: Id) => {
    const srcIdx = idxOf.get(elemSrcLevelId);
    if (srcIdx === undefined) return { levelId: targetBaseLevelId, extraZ: 0 };
    const destIdx = targetIdx + (srcIdx - baseSrcIdx);
    if (destIdx >= 0 && destIdx < sorted.length) return { levelId: sorted[destIdx]!.id, extraZ: 0 };
    warn('top-overflow');
    const srcElev = sorted[srcIdx]!.elevation;
    const extraZ = Math.max(0, (srcElev - baseSrcElev) - (top.elevation - targetElev));
    return { levelId: top.id, extraZ };
  };
}

/** Linha do vínculo: fonte da categoria e ids colados por nível, na ordem canônica. */
export function linkCommandFor(
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
  const members = levelIds.map((levelId) => ({ levelId, ids: idsInOrder(byLevel[levelId] ?? emptyPasteIds()) }));
  return { type: 'addCopyLink', link: makeCopyLink(sourceIds, members, mint) };
}
