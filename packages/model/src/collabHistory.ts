import { applyPatches, type Patch } from 'immer';
import type { CollabUndoResult } from './collabTypes.ts';
import { isColumn, isOpening, isRoom, isWall, isFooting, type Project } from './types.ts';

/** Registro de uma alteração no histórico colaborativo, com autoria e IDs tocados. */
export interface CollabEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
  authorId: string;
  authorName: string;
  seq?: number;
  touchedIds: string[];
  undone?: boolean;
}

const TYPE_KEYS = new Set([
  'materials',
  'wallTypes',
  'floorTypes',
  'slabTypes',
  'ceilingTypes',
  'roofTypes',
  'stairTypes',
  'rampTypes',
  'tiposGuardaCorpo',
  'openingTypes',
  'openingProfiles',
  'perfisNorma',
  'mullionTypes',
  'curtainPanelTypes',
  'columnTypes',
  'beamTypes',
  'footingTypes',
  'gridTypes',
]);

const SETTINGS_KEYS = new Set([
  'name',
  'defaults',
  'settings',
  'graphics',
  'view3d',
  'sectionGraphics',
  'localizacao',
  'dxfLayers',
  'plugins',
  'roomCategories',
  'colorSchemes',
  'view3dPoints',
]);

const COLLECTION_KEYS = new Set([
  'levels',
  'views',
  'sheets',
  'grids',
  'areaPlans',
  'copyLinks',
]);

/**
 * Extrai os IDs de elementos e chaves sintéticas de tipos/configurações/coleções
 * tocados por um conjunto de patches Immer. Ignora `nextOrder`, `thumbnail` e `schemaVersion`
 * para não gerar falsos conflitos entre criações independentes.
 */
export function extractTouchedIds(patches: Patch[]): string[] {
  const ids = new Set<string>();
  for (const patch of patches) {
    const [root, second] = patch.path;
    if (root === 'elements') {
      if (typeof second === 'string') ids.add(second);
      continue;
    }
    if (typeof root !== 'string') continue;
    if (TYPE_KEYS.has(root)) {
      ids.add(typeof second === 'string' ? `type:${second}` : `type:${root}`);
      continue;
    }
    if (COLLECTION_KEYS.has(root)) {
      ids.add(second !== undefined && second !== 'length' ? `${root}:${String(second)}` : `__${root}__`);
      continue;
    }
    if (SETTINGS_KEYS.has(root)) {
      ids.add('__settings__');
    }
  }
  return Array.from(ids);
}

/**
 * Verifica integridade referencial básica após aplicar patches fora de ordem no modo colaborativo
 * (ex.: abertura sem parede anfitriã, etiqueta sem elemento/ambiente ou sapata ligada a pilar ausente).
 */
export function checkModelIntegrityForCollab(
  project: Project,
): { ok: true } | { ok: false; orphanIds: string[] } {
  const orphanIds: string[] = [];

  for (const el of Object.values(project.elements)) {
    if (isOpening(el) && !isWall(project.elements[el.hostId])) {
      orphanIds.push(el.id);
    } else if (isFooting(el) && el.columnId && !isColumn(project.elements[el.columnId])) {
      orphanIds.push(el.id);
    }
  }

  for (const level of project.levels) {
    for (const tag of level.tags ?? []) {
      if (!project.elements[tag.hostId]) orphanIds.push(tag.id);
    }
  }

  for (const view of project.views) {
    for (const tag of view.annotations?.tags ?? []) {
      if (!project.elements[tag.hostId]) orphanIds.push(tag.id);
    }
  }

  for (const plan of project.areaPlans ?? []) {
    for (const tag of plan.tags) {
      if (!isRoom(project.elements[tag.roomId])) orphanIds.push(tag.id);
    }
    for (const tag of plan.annotations?.tags ?? []) {
      if (!project.elements[tag.hostId]) orphanIds.push(tag.id);
    }
  }

  return orphanIds.length === 0 ? { ok: true } : { ok: false, orphanIds };
}

function intersectIds(a: string[], bSet: Set<string>): string[] {
  return a.filter((id) => bSet.has(id));
}

function findConflictAuthorForIds(
  past: CollabEntry[],
  fromIdx: number,
  authorId: string,
  ids: string[],
): string {
  const targetSet = new Set(ids);
  for (let i = past.length - 1; i > fromIdx; i--) {
    const entry = past[i]!;
    if (entry.undone || entry.authorId === authorId) continue;
    if (entry.touchedIds.some((id) => targetSet.has(id))) {
      return entry.authorName || entry.authorId;
    }
  }
  return 'another user';
}

function findLaterConflict(
  past: CollabEntry[],
  targetIdx: number,
  authorId: string,
  touchedIds: string[],
): { conflictAuthor: string; conflictIds: string[] } | null {
  if (touchedIds.length === 0) return null;
  const targetSet = new Set(touchedIds);
  for (let i = past.length - 1; i > targetIdx; i--) {
    const later = past[i]!;
    if (later.undone || later.authorId === authorId) continue;
    const conflictIds = intersectIds(later.touchedIds, targetSet);
    if (conflictIds.length > 0) {
      return { conflictAuthor: later.authorName || later.authorId, conflictIds };
    }
  }
  return null;
}

export interface AuthorUndoState {
  present: Project;
  past: CollabEntry[];
  authorRedo: Map<string, CollabEntry[]>;
}

/**
 * Desfaz o último passo ativo de `authorId` sem reverter alterações independentes de outros autores.
 * Retorna conflito se outro autor modificou os mesmos elementos depois, ou se o desfazimento deixar órfãos.
 */
export function performAuthorUndo(
  state: AuthorUndoState,
  authorId: string,
): { result: CollabUndoResult; nextPresent?: Project } {
  let targetIdx = -1;
  for (let i = state.past.length - 1; i >= 0; i--) {
    const e = state.past[i]!;
    if (e.authorId === authorId && !e.undone) {
      targetIdx = i;
      break;
    }
  }
  if (targetIdx === -1) {
    return { result: { ok: false, reason: 'empty' } };
  }

  const target = state.past[targetIdx]!;
  const conflict = findLaterConflict(state.past, targetIdx, authorId, target.touchedIds);
  if (conflict) {
    return {
      result: {
        ok: false,
        reason: 'conflict',
        conflictAuthor: conflict.conflictAuthor,
        conflictIds: conflict.conflictIds,
      },
    };
  }

  let candidate: Project;
  try {
    candidate = applyPatches(state.present, target.inverse);
  } catch {
    return { result: { ok: false, reason: 'invalid' } };
  }

  const integrity = checkModelIntegrityForCollab(candidate);
  if (!integrity.ok) {
    const conflictAuthor = findConflictAuthorForIds(
      state.past,
      targetIdx,
      authorId,
      integrity.orphanIds,
    );
    return {
      result: {
        ok: false,
        reason: 'conflict',
        conflictAuthor,
        conflictIds: integrity.orphanIds,
      },
    };
  }

  target.undone = true;
  const redoStack = state.authorRedo.get(authorId) ?? [];
  redoStack.push(target);
  state.authorRedo.set(authorId, redoStack);

  return {
    result: {
      ok: true,
      label: target.label,
      patches: target.inverse,
      inverse: target.patches,
      touchedIds: target.touchedIds,
    },
    nextPresent: candidate,
  };
}

/**
 * Refaz o último passo desfeito de `authorId`, validando conflitos posteriores e integridade referencial.
 */
export function performAuthorRedo(
  state: AuthorUndoState,
  authorId: string,
): { result: CollabUndoResult; nextPresent?: Project } {
  const stack = state.authorRedo.get(authorId);
  if (!stack || stack.length === 0) {
    return { result: { ok: false, reason: 'empty' } };
  }

  const target = stack[stack.length - 1]!;
  const targetIdx = state.past.indexOf(target);
  if (targetIdx !== -1) {
    const conflict = findLaterConflict(state.past, targetIdx, authorId, target.touchedIds);
    if (conflict) {
      return {
        result: {
          ok: false,
          reason: 'conflict',
          conflictAuthor: conflict.conflictAuthor,
          conflictIds: conflict.conflictIds,
        },
      };
    }
  }

  let candidate: Project;
  try {
    candidate = applyPatches(state.present, target.patches);
  } catch {
    return { result: { ok: false, reason: 'invalid' } };
  }

  const integrity = checkModelIntegrityForCollab(candidate);
  if (!integrity.ok) {
    const conflictAuthor = findConflictAuthorForIds(
      state.past,
      targetIdx,
      authorId,
      [...integrity.orphanIds, ...target.touchedIds],
    );
    return {
      result: {
        ok: false,
        reason: 'conflict',
        conflictAuthor,
        conflictIds: integrity.orphanIds,
      },
    };
  }

  stack.pop();
  target.undone = false;

  return {
    result: {
      ok: true,
      label: target.label,
      patches: target.patches,
      inverse: target.inverse,
      touchedIds: target.touchedIds,
    },
    nextPresent: candidate,
  };
}
