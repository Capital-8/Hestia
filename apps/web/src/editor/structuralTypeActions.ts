import {
  beamTypeMap,
  columnTypeMap,
  footingTypeMap,
  isBeam,
  isColumn,
  isFooting,
  newId,
  type BeamType,
  type ColumnType,
  type FootingType,
  type Id,
  type Project,
  type ProjectStore,
} from '@hestia/model';
import { t, useI18n } from './i18n.ts';
import type { DeleteResult } from './typeActions.ts';

const lang = () => useI18n.getState().lang;

// -----------------------------------------------------------------------------
// Column
// -----------------------------------------------------------------------------

export function columnTypeUsage(p: Project, typeId: Id): number {
  return Object.values(p.elements).filter((e) => isColumn(e) && e.typeId === typeId).length;
}

export function columnTypeDeleteBlock(p: Project, typeId: Id): string | null {
  const map = columnTypeMap(p);
  if (Object.keys(map).length <= 1) return t(lang(), 'str_msg_last_type');
  const uso = columnTypeUsage(p, typeId);
  if (uso > 0) return t(lang(), 'str_msg_type_in_use');
  return null;
}

export function deleteColumnType(store: ProjectStore, typeId: Id): DeleteResult {
  const block = columnTypeDeleteBlock(store.project, typeId);
  if (block) return { ok: false, error: block };
  try {
    store.exec({ type: 'deleteColumnType', id: typeId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t(lang(), 'eds_msg_unknown_failure') };
  }
}

export const tryDeleteColumnType = deleteColumnType;

export function duplicateColumnType(store: ProjectStore, typeId: Id, newName?: string): Id | null {
  const map = columnTypeMap(store.project);
  const src = map[typeId];
  if (!src) return null;
  const copy: ColumnType = {
    ...structuredClone(src),
    id: newId('ct'),
    name: newName?.trim() || t(lang(), 'eds_def_copy_suffix', { name: src.name }),
  };
  store.exec({ type: 'upsertColumnType', columnType: copy });
  return copy.id;
}

export function renameColumnType(store: ProjectStore, typeId: Id, newName: string): DeleteResult {
  const clean = newName.trim();
  const map = columnTypeMap(store.project);
  const src = map[typeId];
  if (!src) return { ok: false, error: t(lang(), 'eds_msg_type_missing') };
  if (!clean) return { ok: false, error: t(lang(), 'eds_msg_type_needs_name') };
  store.exec({ type: 'upsertColumnType', columnType: { ...src, name: clean } });
  return { ok: true };
}

export function updateColumnType(store: ProjectStore, typeId: Id, patch: Partial<ColumnType>): void {
  const map = columnTypeMap(store.project);
  const src = map[typeId];
  if (!src) return;
  store.exec({ type: 'upsertColumnType', columnType: { ...src, ...patch } });
}

export function columnTypeError(ct: ColumnType): string | null {
  if (!ct.name.trim()) return t(lang(), 'eds_msg_type_needs_name');
  if (ct.width <= 0 || ct.depth <= 0) return t(lang(), 'str_msg_type_in_use');
  return null;
}

// -----------------------------------------------------------------------------
// Beam
// -----------------------------------------------------------------------------

export function beamTypeUsage(p: Project, typeId: Id): number {
  return Object.values(p.elements).filter((e) => isBeam(e) && e.typeId === typeId).length;
}

export function beamTypeDeleteBlock(p: Project, typeId: Id): string | null {
  const map = beamTypeMap(p);
  if (Object.keys(map).length <= 1) return t(lang(), 'str_msg_last_type');
  const uso = beamTypeUsage(p, typeId);
  if (uso > 0) return t(lang(), 'str_msg_type_in_use');
  return null;
}

export function deleteBeamType(store: ProjectStore, typeId: Id): DeleteResult {
  const block = beamTypeDeleteBlock(store.project, typeId);
  if (block) return { ok: false, error: block };
  try {
    store.exec({ type: 'deleteBeamType', id: typeId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t(lang(), 'eds_msg_unknown_failure') };
  }
}

export const tryDeleteBeamType = deleteBeamType;

export function duplicateBeamType(store: ProjectStore, typeId: Id, newName?: string): Id | null {
  const map = beamTypeMap(store.project);
  const src = map[typeId];
  if (!src) return null;
  const copy: BeamType = {
    ...structuredClone(src),
    id: newId('bt'),
    name: newName?.trim() || t(lang(), 'eds_def_copy_suffix', { name: src.name }),
  };
  store.exec({ type: 'upsertBeamType', beamType: copy });
  return copy.id;
}

export function renameBeamType(store: ProjectStore, typeId: Id, newName: string): DeleteResult {
  const clean = newName.trim();
  const map = beamTypeMap(store.project);
  const src = map[typeId];
  if (!src) return { ok: false, error: t(lang(), 'eds_msg_type_missing') };
  if (!clean) return { ok: false, error: t(lang(), 'eds_msg_type_needs_name') };
  store.exec({ type: 'upsertBeamType', beamType: { ...src, name: clean } });
  return { ok: true };
}

export function updateBeamType(store: ProjectStore, typeId: Id, patch: Partial<BeamType>): void {
  const map = beamTypeMap(store.project);
  const src = map[typeId];
  if (!src) return;
  store.exec({ type: 'upsertBeamType', beamType: { ...src, ...patch } });
}

export function beamTypeError(bt: BeamType): string | null {
  if (!bt.name.trim()) return t(lang(), 'eds_msg_type_needs_name');
  if (bt.width <= 0 || bt.depth <= 0) return t(lang(), 'str_msg_type_in_use');
  return null;
}

// -----------------------------------------------------------------------------
// Footing
// -----------------------------------------------------------------------------

export function footingTypeUsage(p: Project, typeId: Id): number {
  return Object.values(p.elements).filter((e) => isFooting(e) && e.typeId === typeId).length;
}

export function footingTypeDeleteBlock(p: Project, typeId: Id): string | null {
  const map = footingTypeMap(p);
  if (Object.keys(map).length <= 1) return t(lang(), 'str_msg_last_type');
  const uso = footingTypeUsage(p, typeId);
  if (uso > 0) return t(lang(), 'str_msg_type_in_use');
  return null;
}

export function deleteFootingType(store: ProjectStore, typeId: Id): DeleteResult {
  const block = footingTypeDeleteBlock(store.project, typeId);
  if (block) return { ok: false, error: block };
  try {
    store.exec({ type: 'deleteFootingType', id: typeId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : t(lang(), 'eds_msg_unknown_failure') };
  }
}

export const tryDeleteFootingType = deleteFootingType;

export function duplicateFootingType(store: ProjectStore, typeId: Id, newName?: string): Id | null {
  const map = footingTypeMap(store.project);
  const src = map[typeId];
  if (!src) return null;
  const copy: FootingType = {
    ...structuredClone(src),
    id: newId('ft'),
    name: newName?.trim() || t(lang(), 'eds_def_copy_suffix', { name: src.name }),
  };
  store.exec({ type: 'upsertFootingType', footingType: copy });
  return copy.id;
}

export function renameFootingType(store: ProjectStore, typeId: Id, newName: string): DeleteResult {
  const clean = newName.trim();
  const map = footingTypeMap(store.project);
  const src = map[typeId];
  if (!src) return { ok: false, error: t(lang(), 'eds_msg_type_missing') };
  if (!clean) return { ok: false, error: t(lang(), 'eds_msg_type_needs_name') };
  store.exec({ type: 'upsertFootingType', footingType: { ...src, name: clean } });
  return { ok: true };
}

export function updateFootingType(store: ProjectStore, typeId: Id, patch: Partial<FootingType>): void {
  const map = footingTypeMap(store.project);
  const src = map[typeId];
  if (!src) return;
  store.exec({ type: 'upsertFootingType', footingType: { ...src, ...patch } });
}

export function footingTypeError(ft: FootingType): string | null {
  if (!ft.name.trim()) return t(lang(), 'eds_msg_type_needs_name');
  if (ft.width <= 0 || ft.length <= 0 || ft.thickness <= 0) return t(lang(), 'str_msg_type_in_use');
  return null;
}
