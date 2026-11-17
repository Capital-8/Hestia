import {
  beamsOnLevel,
  beamPolygon,
  columnsOnLevel,
  columnPolygon,
  findBeamType,
  findColumnType,
  findFootingType,
  footingsOnLevel,
  footingPolygon,
  type Id,
  type Project,
} from '@hestia/model';

export const DXF_LAYER_COLUMN = 'PILARES';
export const DXF_LAYER_BEAM = 'VIGAS';
export const DXF_LAYER_FOOTING = 'FUNDACOES';

export interface DxfStructuralShape {
  layer: string;
  pts: Array<{ x: number; y: number }>;
  closed?: boolean;
  dashed?: boolean;
}

/**
 * Coleta polilinhas DXF de elementos estruturais (pilares, vigas e sapatas) do nível.
 * Devolve lista vazia se não houver elementos estruturais no nível.
 */
export function structuralDxfShapes(project: Project, levelId: Id): DxfStructuralShape[] {
  const columns = columnsOnLevel(project, levelId);
  const beams = beamsOnLevel(project, levelId);
  const footings = footingsOnLevel(project, levelId);

  if (columns.length === 0 && beams.length === 0 && footings.length === 0) {
    return [];
  }

  const out: DxfStructuralShape[] = [];

  for (const c of columns) {
    const type = findColumnType(project, c.typeId);
    out.push({
      layer: DXF_LAYER_COLUMN,
      pts: columnPolygon(c, type),
      closed: true,
    });
  }

  for (const b of beams) {
    const type = findBeamType(project, b.typeId);
    out.push({
      layer: DXF_LAYER_BEAM,
      pts: beamPolygon(b, type),
      closed: true,
      dashed: true,
    });
  }

  for (const f of footings) {
    const type = findFootingType(project, f.typeId);
    out.push({
      layer: DXF_LAYER_FOOTING,
      pts: footingPolygon(f, type),
      closed: true,
    });
  }

  return out;
}
