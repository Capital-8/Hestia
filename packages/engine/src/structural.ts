import type { Vec2 } from '@hestia/geom';
import {
  beamElevationSpan,
  beamLength,
  beamPolygon,
  beamSectionArea,
  beamsOnLevel,
  columnElevationSpan,
  columnPolygon,
  columnSectionArea,
  columnSectionPerimeter,
  columnsOnLevel,
  findBeamType,
  findColumnType,
  findFootingType,
  footingElevationSpan,
  footingPolygon,
  footingsOnLevel,
  type Beam,
  type BeamType,
  type Column,
  type ColumnType,
  type Footing,
  type FootingType,
  type Id,
  type Project,
} from '@hestia/model';

/** Pilar resolvido em planta e cota, com geometria e quantitativos calculados. */
export interface ResolvedColumn {
  id: Id;
  column: Column;
  type: ColumnType;
  polygon: Vec2[];
  z0: number;
  z1: number;
  height: number;
  sectionArea: number;
  volume: number;
  areaFormwork: number;
  cost: number;
}

/** Viga resolvida em planta e cota, com geometria e quantitativos calculados. */
export interface ResolvedBeam {
  id: Id;
  beam: Beam;
  type: BeamType;
  polygon: Vec2[];
  length: number;
  z0: number;
  z1: number;
  volume: number;
  areaFormwork: number;
  cost: number;
}

/** Sapata resolvida em planta e cota, com geometria e quantitativos calculados. */
export interface ResolvedFooting {
  id: Id;
  footing: Footing;
  type: FootingType;
  polygon: [Vec2, Vec2, Vec2, Vec2];
  area: number;
  z0: number;
  z1: number;
  volume: number;
  cost: number;
}

/** Resolve pilares de um nível com polígono, cota (z0..z1), volume, fôrma e custo. */
export function resolveColumnsOnLevel(p: Project, levelId: Id): ResolvedColumn[] {
  return columnsOnLevel(p, levelId).map((c) => {
    const type = findColumnType(p, c.typeId);
    const polygon = columnPolygon(c, type);
    const { z0, z1, height } = columnElevationSpan(p, c);
    const sectionArea = columnSectionArea(type);
    const volume = sectionArea * height;
    const areaFormwork = columnSectionPerimeter(type) * height;
    const cost = volume * type.cost;
    return {
      id: c.id,
      column: c,
      type,
      polygon,
      z0,
      z1,
      height,
      sectionArea,
      volume,
      areaFormwork,
      cost,
    };
  });
}

/** Resolve vigas de um nível com polígono, cota (z0..z1), volume, fôrma e custo. */
export function resolveBeamsOnLevel(p: Project, levelId: Id): ResolvedBeam[] {
  return beamsOnLevel(p, levelId).map((b) => {
    const type = findBeamType(p, b.typeId);
    const polygon = beamPolygon(b, type);
    const length = beamLength(b);
    const { z0, z1 } = beamElevationSpan(p, b, type);
    const volume = beamSectionArea(type) * length;
    const areaFormwork = (type.width + 2 * type.depth) * length;
    const cost = volume * type.cost;
    return {
      id: b.id,
      beam: b,
      type,
      polygon,
      length,
      z0,
      z1,
      volume,
      areaFormwork,
      cost,
    };
  });
}

/** Resolve sapatas de um nível com polígono, cota (z0..z1), área, volume e custo. */
export function resolveFootingsOnLevel(p: Project, levelId: Id): ResolvedFooting[] {
  return footingsOnLevel(p, levelId).map((f) => {
    const type = findFootingType(p, f.typeId);
    const polygon = footingPolygon(f, type);
    const { z0, z1 } = footingElevationSpan(p, f, type);
    const area = type.width * type.length;
    const volume = area * type.thickness;
    const cost = volume * type.cost;
    return {
      id: f.id,
      footing: f,
      type,
      polygon,
      area,
      z0,
      z1,
      volume,
      cost,
    };
  });
}

/** Todos os pilares resolvidos do projeto, nível a nível. */
export function resolveAllColumns(p: Project): ResolvedColumn[] {
  return p.levels.flatMap((l) => resolveColumnsOnLevel(p, l.id));
}

/** Todas as vigas resolvidas do projeto, nível a nível. */
export function resolveAllBeams(p: Project): ResolvedBeam[] {
  return p.levels.flatMap((l) => resolveBeamsOnLevel(p, l.id));
}

/** Todas as sapatas resolvidas do projeto, nível a nível. */
export function resolveAllFootings(p: Project): ResolvedFooting[] {
  return p.levels.flatMap((l) => resolveFootingsOnLevel(p, l.id));
}
