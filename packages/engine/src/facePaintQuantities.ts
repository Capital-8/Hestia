import { multiArea, partitionFacePaint, type SlatsSpec } from '@hestia/geom';
import { isFloor, isSlab, isWall, type Id, type Project } from '@hestia/model';
import { faceEntryToArtItems, unwrapElementFace } from './faceUnwrap.ts';

export interface FacePaintQuantities {
  paintedAreaByMaterial: Record<Id, number>;
  replacedAreaByMaterial: Record<Id, number>;
  extrusionVolumeByMaterial: Record<Id, number>;
  slatLinearMetersByMaterial: Record<Id, number>;
}

const MIN_AREA = 1e-9;

/** Quantifies painted face areas, replaced base material areas, extrusion volumes, and slat linear meters. */
export function quantifyFacePaints(
  p: Project,
  levelId?: Id,
  elementKind?: 'wall' | 'floor' | 'slab',
): FacePaintQuantities {
  const paintedAreaByMaterial: Record<Id, number> = {};
  const replacedAreaByMaterial: Record<Id, number> = {};
  const extrusionVolumeByMaterial: Record<Id, number> = {};
  const slatLinearMetersByMaterial: Record<Id, number> = {};

  for (const el of Object.values(p.elements)) {
    if (!isWall(el) && !isFloor(el) && !isSlab(el)) continue;
    if (levelId !== undefined && el.levelId !== levelId) continue;
    if (elementKind !== undefined && el.kind !== elementKind) continue;
    if (!el.facePaints || el.facePaints.length === 0) continue;

    for (const entry of el.facePaints) {
      const unwrapped = unwrapElementFace(p, el.id, entry.face, entry.layer);
      if (!unwrapped || unwrapped.boundary.length === 0) continue;

      const baseMat = entry.materialId ?? unwrapped.defaultMaterialId;
      const items = faceEntryToArtItems(entry, unwrapped.defaultMaterialId);
      const part = partitionFacePaint(unwrapped.boundary, baseMat, items);

      for (const piece of part.coplanar) {
        const area = multiArea(piece.poly);
        if (area <= MIN_AREA) continue;
        if (piece.materialId !== unwrapped.defaultMaterialId) {
          paintedAreaByMaterial[piece.materialId] = (paintedAreaByMaterial[piece.materialId] ?? 0) + area;
          replacedAreaByMaterial[unwrapped.defaultMaterialId] =
            (replacedAreaByMaterial[unwrapped.defaultMaterialId] ?? 0) + area;
        }
      }

      const slatsByItem = new Map<string, SlatsSpec>();
      for (const it of items) {
        if (it.slats) slatsByItem.set(it.id, it.slats);
      }

      for (const ext of part.extrusions) {
        const area = multiArea(ext.poly);
        if (area <= MIN_AREA) continue;
        const vol = area * Math.abs(ext.thickness);
        if (vol > MIN_AREA * 1e-3) {
          extrusionVolumeByMaterial[ext.materialId] = (extrusionVolumeByMaterial[ext.materialId] ?? 0) + vol;
        }
        const slats = slatsByItem.get(ext.itemId);
        if (slats && slats.width > 1e-6) {
          slatLinearMetersByMaterial[slats.slatMaterialId] =
            (slatLinearMetersByMaterial[slats.slatMaterialId] ?? 0) + area / slats.width;
        }
      }
    }
  }

  return {
    paintedAreaByMaterial,
    replacedAreaByMaterial,
    extrusionVolumeByMaterial,
    slatLinearMetersByMaterial,
  };
}

/** Applies painted face area replacements and extrusion volumes for one element kind on a level. */
export function applyFacePaintAdjustments(
  p: Project,
  levelId: Id,
  elementKind: 'wall' | 'floor' | 'slab',
  faceAreaByMaterial: Record<Id, number>,
  volumeByMaterial: Record<Id, number>,
): void {
  const fp = quantifyFacePaints(p, levelId, elementKind);
  for (const [mat, area] of Object.entries(fp.paintedAreaByMaterial)) {
    faceAreaByMaterial[mat] = (faceAreaByMaterial[mat] ?? 0) + area;
  }
  for (const [mat, area] of Object.entries(fp.replacedAreaByMaterial)) {
    faceAreaByMaterial[mat] = Math.max(0, (faceAreaByMaterial[mat] ?? 0) - area);
  }
  for (const [mat, vol] of Object.entries(fp.extrusionVolumeByMaterial)) {
    volumeByMaterial[mat] = (volumeByMaterial[mat] ?? 0) + vol;
  }
}
