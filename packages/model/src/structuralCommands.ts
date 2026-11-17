import { applyTransform, dist, type Transform, type Vec2 } from '@hestia/geom';
import type { Command } from './commands.ts';
import { t, type Lang } from './i18n.ts';
import { levelElevation } from './queries.ts';
import {
  isBeam,
  isColumn,
  isFooting,
  type Id,
  type Project,
} from './types.ts';
import { columnTypeMap, type Column, type ColumnType } from './column.ts';
import { beamTypeMap, type Beam, type BeamType } from './beam.ts';
import { footingTypeMap, type Footing, type FootingType } from './footing.ts';
import type { ValidationIssue } from './validate.ts';

export type StructuralCommand =
  | { type: 'addColumn'; column: Omit<Column, 'order'> }
  | { type: 'upsertColumnType'; columnType: ColumnType }
  | { type: 'deleteColumnType'; id: Id }
  | { type: 'addBeam'; beam: Omit<Beam, 'order'> }
  | { type: 'upsertBeamType'; beamType: BeamType }
  | { type: 'deleteBeamType'; id: Id }
  | { type: 'addFooting'; footing: Omit<Footing, 'order'> }
  | { type: 'upsertFootingType'; footingType: FootingType }
  | { type: 'deleteFootingType'; id: Id };

export function applyStructuralCommand(p: Project, c: Command, lang: Lang = 'pt'): boolean {
  switch (c.type) {
    case 'addColumn': {
      if (!p.columnTypes) p.columnTypes = { ...columnTypeMap(p) };
      if (!p.levels.some((l) => l.id === c.column.levelId)) throw new Error(t(lang, 'md_level_missing'));
      if (c.column.topLevelId && !p.levels.some((l) => l.id === c.column.topLevelId)) {
        throw new Error(t(lang, 'md_level_missing'));
      }
      if (!p.columnTypes[c.column.typeId]) {
        throw new Error(lang === 'pt' ? 'Tipo de pilar inexistente' : 'Column type not found');
      }
      p.elements[c.column.id] = { ...c.column, order: p.nextOrder++ };
      return true;
    }
    case 'upsertColumnType': {
      if (!p.columnTypes) p.columnTypes = { ...columnTypeMap(p) };
      p.columnTypes[c.columnType.id] = c.columnType;
      return true;
    }
    case 'deleteColumnType': {
      if (!p.columnTypes) p.columnTypes = { ...columnTypeMap(p) };
      if (Object.values(p.elements).some((e) => isColumn(e) && e.typeId === c.id)) {
        throw new Error(t(lang, 'md_cmd_type_in_use'));
      }
      if (Object.keys(p.columnTypes).length <= 1) {
        throw new Error(lang === 'pt' ? 'O projeto precisa de ao menos um tipo de pilar' : 'The project needs at least one column type');
      }
      delete p.columnTypes[c.id];
      return true;
    }
    case 'addBeam': {
      if (!p.beamTypes) p.beamTypes = { ...beamTypeMap(p) };
      if (!p.levels.some((l) => l.id === c.beam.levelId)) throw new Error(t(lang, 'md_level_missing'));
      if (!p.beamTypes[c.beam.typeId]) {
        throw new Error(lang === 'pt' ? 'Tipo de viga inexistente' : 'Beam type not found');
      }
      p.elements[c.beam.id] = { ...c.beam, order: p.nextOrder++ };
      return true;
    }
    case 'upsertBeamType': {
      if (!p.beamTypes) p.beamTypes = { ...beamTypeMap(p) };
      p.beamTypes[c.beamType.id] = c.beamType;
      return true;
    }
    case 'deleteBeamType': {
      if (!p.beamTypes) p.beamTypes = { ...beamTypeMap(p) };
      if (Object.values(p.elements).some((e) => isBeam(e) && e.typeId === c.id)) {
        throw new Error(t(lang, 'md_cmd_type_in_use'));
      }
      if (Object.keys(p.beamTypes).length <= 1) {
        throw new Error(lang === 'pt' ? 'O projeto precisa de ao menos um tipo de viga' : 'The project needs at least one beam type');
      }
      delete p.beamTypes[c.id];
      return true;
    }
    case 'addFooting': {
      if (!p.footingTypes) p.footingTypes = { ...footingTypeMap(p) };
      if (!p.levels.some((l) => l.id === c.footing.levelId)) throw new Error(t(lang, 'md_level_missing'));
      if (!p.footingTypes[c.footing.typeId]) {
        throw new Error(lang === 'pt' ? 'Tipo de sapata inexistente' : 'Footing type not found');
      }
      p.elements[c.footing.id] = { ...c.footing, order: p.nextOrder++ };
      return true;
    }
    case 'upsertFootingType': {
      if (!p.footingTypes) p.footingTypes = { ...footingTypeMap(p) };
      p.footingTypes[c.footingType.id] = c.footingType;
      return true;
    }
    case 'deleteFootingType': {
      if (!p.footingTypes) p.footingTypes = { ...footingTypeMap(p) };
      if (Object.values(p.elements).some((e) => isFooting(e) && e.typeId === c.id)) {
        throw new Error(t(lang, 'md_cmd_type_in_use'));
      }
      if (Object.keys(p.footingTypes).length <= 1) {
        throw new Error(lang === 'pt' ? 'O projeto precisa de ao menos um tipo de sapata' : 'The project needs at least one footing type');
      }
      delete p.footingTypes[c.id];
      return true;
    }
    default:
      return false;
  }
}

export function transformColumn(c: Column, t: Transform): Column {
  let rotation = c.rotation;
  if (t.kind === 'rotate') {
    rotation += t.angle;
  } else if (t.kind === 'mirror') {
    const phi = Math.atan2(t.b.y - t.a.y, t.b.x - t.a.x);
    rotation = 2 * phi - c.rotation;
  }
  return {
    ...c,
    at: applyTransform(t, c.at),
    rotation,
  };
}

export function transformBeam(b: Beam, t: Transform): Beam {
  let justify = b.justify;
  if (t.kind === 'mirror') {
    justify = b.justify === 'left' ? 'right' : b.justify === 'right' ? 'left' : 'center';
  }
  const sag = b.sag ? (t.kind === 'mirror' ? -b.sag : b.sag) : b.sag;
  return {
    ...b,
    a: applyTransform(t, b.a),
    b: applyTransform(t, b.b),
    justify,
    ...(sag !== undefined ? { sag } : {}),
  };
}

export function transformFooting(f: Footing, t: Transform): Footing {
  let rotation = f.rotation;
  let eccentricityY = f.eccentricityY;
  if (t.kind === 'rotate') {
    rotation += t.angle;
  } else if (t.kind === 'mirror') {
    const phi = Math.atan2(t.b.y - t.a.y, t.b.x - t.a.x);
    rotation = 2 * phi - f.rotation;
    if (eccentricityY) eccentricityY = -eccentricityY;
  }
  return {
    ...f,
    at: applyTransform(t, f.at),
    rotation,
    ...(eccentricityY !== undefined ? { eccentricityY } : {}),
  };
}

/** Move/gira/espelha sapatas vinculadas a pilares transformados sem cópia e ausentes de `c.ids`. */
export function syncLinkedFootingsOnTransform(p: Project, c: Extract<Command, { type: 'transform' }>): void {
  if (c.copy?.idMap) return;
  const movedIds = new Set(c.ids);
  const movedCols = new Set(c.ids.filter((id) => isColumn(p.elements[id])));
  if (movedCols.size === 0) return;
  for (const e of Object.values(p.elements)) {
    if (isFooting(e) && !movedIds.has(e.id) && e.columnId && movedCols.has(e.columnId)) {
      p.elements[e.id] = transformFooting(e, c.transform);
    }
  }
}

/** Propaga alteração direta de `at`/`rotation` em pilares para suas sapatas vinculadas não incluídas em `ids`. */
export function syncLinkedFootingsOnColumnPatch(
  p: Project,
  ids: Id[],
  prevCols: ReadonlyMap<Id, { at: Vec2; rotation: number }>,
): void {
  if (prevCols.size === 0) return;
  const idSet = new Set(ids);
  for (const e of Object.values(p.elements)) {
    if (!isFooting(e) || idSet.has(e.id) || !e.columnId) continue;
    const prev = prevCols.get(e.columnId);
    const nextCol = p.elements[e.columnId];
    if (!prev || !isColumn(nextCol)) continue;
    const dx = nextCol.at.x - prev.at.x;
    const dy = nextCol.at.y - prev.at.y;
    const dRot = nextCol.rotation - prev.rotation;
    const cos = Math.cos(dRot);
    const sin = Math.sin(dRot);
    const rx = e.at.x - prev.at.x;
    const ry = e.at.y - prev.at.y;
    p.elements[e.id] = {
      ...e,
      at: { x: prev.at.x + rx * cos - ry * sin + dx, y: prev.at.y + rx * sin + ry * cos + dy },
      rotation: e.rotation + dRot,
    };
  }
}

/** Desvincula sapatas cujo pilar foi removido por `deleteElements`. */
export function unlinkFootingsOfDeletedColumns(p: Project, doomed: ReadonlySet<Id>): void {
  for (const e of Object.values(p.elements)) {
    if (!doomed.has(e.id) && isFooting(e) && e.columnId && doomed.has(e.columnId)) {
      p.elements[e.id] = { ...e, columnId: null };
    }
  }
}

export function structuralIssues(p: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const colTypes = columnTypeMap(p);
  const bmTypes = beamTypeMap(p);
  const ftTypes = footingTypeMap(p);
  const levelIds = new Set(p.levels.map((l) => l.id));

  for (const e of Object.values(p.elements)) {
    if (isColumn(e)) {
      if (!colTypes[e.typeId]) {
        issues.push({
          severity: 'error',
          code: 'column-missing-type',
          message: `Pilar com tipo inexistente (${e.typeId})`,
          elementId: e.id,
        });
      }
      if (!levelIds.has(e.levelId)) {
        issues.push({
          severity: 'error',
          code: 'column-missing-level',
          message: 'Pilar com nível inexistente',
          elementId: e.id,
        });
      }
      if (e.topLevelId && !levelIds.has(e.topLevelId)) {
        issues.push({
          severity: 'error',
          code: 'column-missing-top-level',
          message: 'Pilar com nível de topo inexistente',
          elementId: e.id,
        });
      }
      const z0 = levelElevation(p, e.levelId) + e.baseOffset;
      const z1 = e.topLevelId ? levelElevation(p, e.topLevelId) + e.topOffset : z0 + e.height;
      if (z1 - z0 <= 0.05) {
        issues.push({
          severity: 'error',
          code: 'column-too-short',
          message: 'Altura do pilar deve ser maior que 0,05 m',
          elementId: e.id,
        });
      }
    } else if (isBeam(e)) {
      if (!bmTypes[e.typeId]) {
        issues.push({
          severity: 'error',
          code: 'beam-missing-type',
          message: `Viga com tipo inexistente (${e.typeId})`,
          elementId: e.id,
        });
      }
      if (!levelIds.has(e.levelId)) {
        issues.push({
          severity: 'error',
          code: 'beam-missing-level',
          message: 'Viga com nível inexistente',
          elementId: e.id,
        });
      }
      if (dist(e.a, e.b) <= 0.05) {
        issues.push({
          severity: 'error',
          code: 'beam-too-short',
          message: 'Comprimento da viga deve ser maior que 0,05 m',
          elementId: e.id,
        });
      }
    } else if (isFooting(e)) {
      if (!ftTypes[e.typeId]) {
        issues.push({
          severity: 'error',
          code: 'footing-missing-type',
          message: `Sapata com tipo inexistente (${e.typeId})`,
          elementId: e.id,
        });
      }
      if (!levelIds.has(e.levelId)) {
        issues.push({
          severity: 'error',
          code: 'footing-missing-level',
          message: 'Sapata com nível inexistente',
          elementId: e.id,
        });
      }
      if (e.columnId && (!p.elements[e.columnId] || !isColumn(p.elements[e.columnId]))) {
        issues.push({
          severity: 'warning',
          code: 'footing-column-missing',
          message: 'Pilar associado à sapata não foi encontrado',
          elementId: e.id,
        });
      }
    }
  }

  return issues;
}
