import {
  beamElevationSpan,
  beamPolygon,
  beamProfileRingSZ,
  columnElevationSpan,
  columnPolygon,
  findBeamType,
  findColumnType,
  findFootingType,
  footingElevationSpan,
  footingPolygon,
  isBeam,
  isColumn,
  isFooting,
} from '@hestia/model';
import { gid, materialOf, optStr, storeyOf, type IfcCtx } from './ifcCtx.ts';
import { addPropertySet } from './ifcProperties.ts';
import { bodyShape, extrudeHorizontalProfile, extrudeSolid, localPlacement } from './ifcSolids.ts';
import { en, list, OMIT, ref, stepString } from './ifcStep.ts';

/**
 * Adiciona elementos estruturais (IFCCOLUMN, IFCBEAM, IFCFOOTING) ao modelo IFC.
 */
export function addStructural(c: IfcCtx): void {
  // Pilares (IFCCOLUMN)
  for (const col of Object.values(c.p.elements).filter(isColumn)) {
    const st = storeyOf(c, col.levelId);
    if (!st) continue;
    const type = findColumnType(c.p, col.typeId);
    const span = columnElevationSpan(c.p, col);
    const poly = columnPolygon(col, type);
    const solid = extrudeSolid(c.w, [poly], span.z0 - st.elev, span.height);
    const shape = bodyShape(c.w, c.ctx, 'SweptSolid', [solid]);
    const place = localPlacement(c.w, st.place, [0, 0, 0]);
    const name = type.name || col.mark || 'Column';
    const id = c.w.add('IFCCOLUMN', [
      gid(`column:${col.id}`),
      OMIT,
      stepString(name),
      OMIT,
      OMIT,
      ref(place),
      ref(shape),
      optStr(col.mark),
      en('COLUMN'),
    ]);
    if (c.products) c.products.set(col.id, id);
    st.contained.push(id);
    addPropertySet(c, `pset:column:${col.id}`, 'Pset_ColumnCommon', [
      ['Reference', type.code || type.name || col.mark || 'Column'],
      ['LoadBearing', true],
      ['IsExternal', c.external.has(col.id)],
    ], id);
    if (type.materialId) {
      c.w.add('IFCRELASSOCIATESMATERIAL', [
        gid(`mat:column:${col.id}`),
        OMIT,
        OMIT,
        OMIT,
        list([ref(id)]),
        ref(materialOf(c, type.materialId)),
      ]);
    }
  }

  // Vigas (IFCBEAM)
  for (const b of Object.values(c.p.elements).filter(isBeam)) {
    const st = storeyOf(c, b.levelId);
    if (!st) continue;
    const type = findBeamType(c.p, b.typeId);
    const span = beamElevationSpan(c.p, b, type);
    const dx = b.b.x - b.a.x;
    const dy = b.b.y - b.a.y;
    const len = Math.hypot(dx, dy);
    const solid =
      (!b.sag || Math.abs(b.sag) < 1e-6) && (type.shape === 'i-section' || type.shape === 't-section') && len > 1e-6
        ? extrudeHorizontalProfile(
            c.w,
            beamProfileRingSZ(b, type, span.z0 - st.elev, span.z1 - st.elev),
            [b.a.x, b.a.y, 0],
            [dx / len, dy / len, 0],
            [-dy / len, dx / len, 0],
            len,
          )
        : extrudeSolid(c.w, [beamPolygon(b, type)], span.z0 - st.elev, span.depth);
    const shape = bodyShape(c.w, c.ctx, 'SweptSolid', [solid]);
    const place = localPlacement(c.w, st.place, [0, 0, 0]);
    const name = type.name || b.mark || 'Beam';
    const id = c.w.add('IFCBEAM', [
      gid(`beam:${b.id}`),
      OMIT,
      stepString(name),
      OMIT,
      OMIT,
      ref(place),
      ref(shape),
      optStr(b.mark),
      en('BEAM'),
    ]);
    if (c.products) c.products.set(b.id, id);
    st.contained.push(id);
    addPropertySet(c, `pset:beam:${b.id}`, 'Pset_BeamCommon', [
      ['Reference', type.code || type.name || b.mark || 'Beam'],
      ['LoadBearing', true],
      ['IsExternal', c.external.has(b.id)],
    ], id);
    if (type.materialId) {
      c.w.add('IFCRELASSOCIATESMATERIAL', [
        gid(`mat:beam:${b.id}`),
        OMIT,
        OMIT,
        OMIT,
        list([ref(id)]),
        ref(materialOf(c, type.materialId)),
      ]);
    }
  }

  // Sapatas (IFCFOOTING)
  for (const f of Object.values(c.p.elements).filter(isFooting)) {
    const st = storeyOf(c, f.levelId);
    if (!st) continue;
    const type = findFootingType(c.p, f.typeId);
    const span = footingElevationSpan(c.p, f, type);
    const poly = footingPolygon(f, type);
    const solid = extrudeSolid(c.w, [poly], span.z0 - st.elev, span.thickness);
    const shape = bodyShape(c.w, c.ctx, 'SweptSolid', [solid]);
    const place = localPlacement(c.w, st.place, [0, 0, 0]);
    const name = type.name || f.mark || 'Footing';
    const id = c.w.add('IFCFOOTING', [
      gid(`footing:${f.id}`),
      OMIT,
      stepString(name),
      OMIT,
      OMIT,
      ref(place),
      ref(shape),
      optStr(f.mark),
      en('PAD_FOOTING'),
    ]);
    if (c.products) c.products.set(f.id, id);
    st.contained.push(id);
    addPropertySet(c, `pset:footing:${f.id}`, 'Pset_FootingCommon', [
      ['Reference', type.code || type.name || f.mark || 'Footing'],
      ['LoadBearing', true],
    ], id);
    if (type.materialId) {
      c.w.add('IFCRELASSOCIATESMATERIAL', [
        gid(`mat:footing:${f.id}`),
        OMIT,
        OMIT,
        OMIT,
        list([ref(id)]),
        ref(materialOf(c, type.materialId)),
      ]);
    }
  }
}
