import { multiArea, v2 } from '@hestia/geom';
import {
  ProjectStore,
  createEmptyProject,
  makeFloor,
  makeSlab,
  makeWall,
  totalThickness,
  type FacePaintEntry,
  type Opening,
  type Project,
} from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { faceEntryToArtItems, unwrapElementFace } from './faceUnwrap.ts';
import { quantifyFacePaints } from './facePaintQuantities.ts';
import { quantifyFloors } from './floorQuantities.ts';
import { quantifyLevel } from './quantities.ts';
import { quantifySlabs } from './slabQuantities.ts';
import { resolveLevel } from './resolve.ts';

function baseProject(): Project {
  const p = createEmptyProject('pt');
  p.materials['mat_paint_red'] = {
    id: 'mat_paint_red',
    name: 'Red Paint',
    color: '#cc3333',
    hatch: 'solid',
    gloss: 0.2,
    opacity: 1,
    cost: 0,
    unit: 'm2',
  };
  p.materials['mat_wood_slat'] = {
    id: 'mat_wood_slat',
    name: 'Wood Slat',
    color: '#8b5a2b',
    hatch: 'solid',
    gloss: 0.3,
    opacity: 1,
    cost: 0,
    unit: 'm',
  };
  return p;
}

describe('faceUnwrap: unwrapElementFace', () => {
  it('unwraps a straight wall with door, window, and perpendicular cross wall', () => {
    const store = new ProjectStore(baseProject());
    store.exec({
      type: 'addWall',
      wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: v2(0, 0), b: v2(6, 0), height: 3 }),
    });
    store.exec({
      type: 'addWall',
      wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: v2(3, 0), b: v2(3, 3), height: 3 }),
    });
    const door: Opening = {
      id: 'd1',
      kind: 'door',
      typeId: 'ot_p80',
      hostId: 'w1',
      offset: 1.5,
      flipHand: false,
      flipFacing: false,
      sillOverride: null,
      mark: 'P1',
    };
    const win: Opening = {
      id: 'j1',
      kind: 'window',
      typeId: 'ot_j120',
      hostId: 'w1',
      offset: 4.5,
      flipHand: false,
      flipFacing: false,
      sillOverride: null,
      mark: 'J1',
    };
    store.exec({ type: 'addOpening', opening: door });
    store.exec({ type: 'addOpening', opening: win });
    const p = store.project;

    const side = unwrapElementFace(p, 'w1', 'sideExt');
    expect(side).not.toBeNull();
    expect(side!.width).toBeCloseTo(6, 6);
    expect(side!.height).toBeCloseTo(3, 6);
    expect(side!.isCurved).toBe(false);
    expect(side!.concave).toBe(false);
    expect(side!.openings).toHaveLength(2);
    expect(side!.crossWalls).toHaveLength(1);
    expect(side!.crossWalls[0]!.wallId).toBe('w2');

    const openArea = side!.openings.reduce(
      (s, o) => s + (o.rect.u1 - o.rect.u0) * (o.rect.v1 - o.rect.v0),
      0,
    );
    expect(multiArea(side!.boundary)).toBeCloseTo(18 - openArea, 4);

    const endA = unwrapElementFace(p, 'w1', 'endA', 0);
    expect(endA).not.toBeNull();
    const wt = p.wallTypes['wt_alv14']!;
    expect(endA!.width).toBeCloseTo(totalThickness(wt), 6);
    expect(endA!.layerDividers.length).toBeGreaterThanOrEqual(1);
    const layer0Thick = wt.layers[0]!.thickness;
    expect(multiArea(endA!.boundary)).toBeCloseTo(layer0Thick * 3, 5);
  });

  it('computes developed arc lengths and concave flag on curved walls', () => {
    const store = new ProjectStore(baseProject());
    // sag > 0 bulges left (+n); arc center is to the right (-n).
    // With flipped=false, sExt is +extOffset (left, convex) and sInt is negative (right, concave).
    store.exec({
      type: 'addWall',
      wall: makeWall({ id: 'wc', typeId: 'wt_alv14', levelId: 'lv_0', a: v2(0, 0), b: v2(4, 0), sag: 1, height: 2.8 }),
    });
    const p = store.project;
    const ext = unwrapElementFace(p, 'wc', 'sideExt')!;
    const intFace = unwrapElementFace(p, 'wc', 'sideInt')!;
    expect(ext.isCurved).toBe(true);
    expect(intFace.isCurved).toBe(true);
    expect(ext.concave).toBe(false);
    expect(intFace.concave).toBe(true);
    expect(ext.curveRadius!).toBeGreaterThan(intFace.curveRadius!);
    expect(ext.width).toBeGreaterThan(intFace.width);
  });

  it('unwraps floor/slab top (normalized origin2d) and edge with layer dividers', () => {
    const store = new ProjectStore(baseProject());
    const ftId = Object.keys(store.project.floorTypes)[0]!;
    const stId = Object.keys(store.project.slabTypes)[0]!;
    store.exec({
      type: 'addFloor',
      floor: makeFloor({
        id: 'f1',
        typeId: ftId,
        levelId: 'lv_0',
        boundary: [v2(2, 3), v2(6, 3), v2(6, 5), v2(2, 5)],
      }),
    });
    store.exec({
      type: 'addSlab',
      slab: makeSlab({
        id: 's1',
        typeId: stId,
        levelId: 'lv_0',
        boundary: [v2(10, 10), v2(14, 10), v2(14, 13), v2(10, 13)],
      }),
    });
    const p = store.project;

    const fTop = unwrapElementFace(p, 'f1', 'top')!;
    expect(fTop.origin2d).toEqual(v2(2, 3));
    expect(fTop.width).toBeCloseTo(4, 6);
    expect(fTop.height).toBeCloseTo(2, 6);
    expect(multiArea(fTop.boundary)).toBeCloseTo(8, 5);

    const fEdge = unwrapElementFace(p, 'f1', 'edge:0:0')!;
    const ft = p.floorTypes[ftId]!;
    expect(fEdge.width).toBeCloseTo(4, 6);
    expect(fEdge.height).toBeCloseTo(totalThickness(ft), 6);
    expect(fEdge.layerDividers.length).toBe(ft.layers.filter((l) => l.thickness >= 1e-6).length);

    const fEdgeLayer0 = unwrapElementFace(p, 'f1', 'edge:0:0', 0)!;
    expect(multiArea(fEdgeLayer0.boundary)).toBeCloseTo(4 * ft.layers[0]!.thickness, 6);

    const sTop = unwrapElementFace(p, 's1', 'top')!;
    expect(sTop.origin2d).toEqual(v2(10, 10));
    expect(multiArea(sTop.boundary)).toBeCloseTo(12, 5);
  });

  it('converts DXF overlays into lineBand FaceArtItemInputs', () => {
    const entry: FacePaintEntry = {
      face: 'sideInt',
      layer: 'all',
      dxfOverlays: [
        {
          id: 'dx1',
          name: 'Lines',
          paths: [{ pts: [v2(0, 0), v2(1, 0)], closed: false }],
          offset: v2(1, 0.5),
          rotationDeg: 90,
          scale: 2,
          separatorWidth: 0.002,
          materialId: 'mat_paint_red',
          thickness: 0.01,
        },
      ],
    };
    const items = faceEntryToArtItems(entry, 'mat_default');
    expect(items).toHaveLength(1);
    expect(items[0]!.order).toBe(1000);
    expect(items[0]!.materialId).toBe('mat_paint_red');
    expect(items[0]!.shape.kind).toBe('lineBand');
    if (items[0]!.shape.kind === 'lineBand') {
      expect(items[0]!.shape.width).toBeCloseTo(0.004, 6);
      expect(items[0]!.shape.pts[0]!.x).toBeCloseTo(1, 6);
      expect(items[0]!.shape.pts[1]!.y).toBeCloseTo(2.5, 6);
    }
  });
});

describe('facePaintQuantities', () => {
  it('computes painted area, replaced base area, extrusion volume, and slat linear meters', () => {
    const store = new ProjectStore(baseProject());
    store.exec({
      type: 'addWall',
      wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: v2(0, 0), b: v2(4, 0), height: 2.5 }),
    });
    const baseQ = quantifyLevel(store.project, resolveLevel(store.project, 'lv_0'));
    const sideIntDefaultMat = unwrapElementFace(store.project, 'w1', 'sideInt')!.defaultMaterialId;
    const baseDefaultArea = baseQ.faceAreaByMaterial[sideIntDefaultMat] ?? 0;

    store.exec({
      type: 'setFacePaint',
      elementId: 'w1',
      entry: {
        face: 'sideInt',
        layer: 'all',
        materialId: 'mat_paint_red',
        regions: [
          {
            id: 'slat_zone',
            shape: { kind: 'rect', u0: 0, v0: 0, u1: 1, v1: 2 },
            materialId: 'mat_wood_slat',
            order: 1,
            slats: {
              width: 0.05,
              gap: 0.05,
              depth: 0.02,
              angleDeg: 90,
              slatMaterialId: 'mat_wood_slat',
            },
          },
        ],
      },
    });

    const fp = quantifyFacePaints(store.project, 'lv_0');
    expect(fp.paintedAreaByMaterial['mat_paint_red']).toBeCloseTo(10, 4);
    expect(fp.replacedAreaByMaterial[sideIntDefaultMat]).toBeCloseTo(10, 4);
    expect(fp.extrusionVolumeByMaterial['mat_wood_slat']).toBeGreaterThan(0.015);
    expect(fp.slatLinearMetersByMaterial['mat_wood_slat']).toBeGreaterThan(15);

    const paintedQ = quantifyLevel(store.project, resolveLevel(store.project, 'lv_0'));
    expect(paintedQ.faceAreaByMaterial['mat_paint_red']).toBeCloseTo(10, 4);
    expect(paintedQ.faceAreaByMaterial[sideIntDefaultMat]).toBeCloseTo(Math.max(0, baseDefaultArea - 10), 4);
    expect(paintedQ.volumeByMaterial['mat_wood_slat']).toBeCloseTo(fp.extrusionVolumeByMaterial['mat_wood_slat']!, 6);

    // Verify floor & slab hooks run cleanly too
    const ftId = Object.keys(store.project.floorTypes)[0]!;
    const stId = Object.keys(store.project.slabTypes)[0]!;
    store.exec({
      type: 'addFloor',
      floor: makeFloor({ id: 'f1', typeId: ftId, levelId: 'lv_0', boundary: [v2(0, 0), v2(2, 0), v2(2, 2), v2(0, 2)] }),
    });
    store.exec({
      type: 'setFacePaint',
      elementId: 'f1',
      entry: { face: 'top', layer: 'all', materialId: 'mat_paint_red' },
    });
    const fq = quantifyFloors(store.project, 'lv_0');
    expect(fq.faceAreaByMaterial['mat_paint_red']).toBeCloseTo(4, 3);

    store.exec({
      type: 'addSlab',
      slab: makeSlab({ id: 's1', typeId: stId, levelId: 'lv_0', boundary: [v2(5, 0), v2(7, 0), v2(7, 2), v2(5, 2)] }),
    });
    store.exec({
      type: 'setFacePaint',
      elementId: 's1',
      entry: { face: 'top', layer: 'all', materialId: 'mat_paint_red' },
    });
    const sq = quantifySlabs(store.project, 'lv_0');
    expect(sq.faceAreaByMaterial['mat_paint_red']).toBeCloseTo(4, 3);
  });
});
