import { v2 } from '@hestia/geom';
import { describe, expect, it } from 'vitest';
import {
  ProjectStore,
  applyCommand,
  availableFacesForElement,
  createEmptyProject,
  effectiveFaceMaterial,
  faceKeyOf,
  findExactFacePaint,
  findFacePaint,
  isFacePaintableElement,
  parseFaceKey,
  type FacePaintEntry,
  type Floor,
  type Room,
  type Slab,
  type Wall,
} from './index.ts';

function seedProject() {
  const p = createEmptyProject('pt');
  applyCommand(p, {
    type: 'addWall',
    wall: {
      id: 'w1',
      kind: 'wall',
      typeId: 'wt_alv14',
      levelId: 'lv_0',
      a: v2(0, 0),
      b: v2(4, 0),
      baseOffset: 0,
      topLevelId: null,
      height: 2.8,
      topOffset: 0,
      locationLine: 'wallCenter',
      flipped: false,
      noJoinStart: false,
      noJoinEnd: false,
      joinStart: { kind: 'butt', flip: false },
      joinEnd: { kind: 'butt', flip: false },
      sag: 0,
      topProfile: null,
      mark: '',
      comments: '',
    },
  });
  applyCommand(p, {
    type: 'addFloor',
    floor: {
      id: 'f1',
      kind: 'floor',
      typeId: Object.keys(p.floorTypes)[0]!,
      levelId: 'lv_0',
      boundary: [v2(0, 0), v2(4, 0), v2(4, 4), v2(0, 4)],
      holes: [[v2(1, 1), v2(2, 1), v2(2, 2)]],
      heightOffset: 0,
      mark: '',
      comments: '',
    },
  });
  applyCommand(p, {
    type: 'addSlab',
    slab: {
      id: 's1',
      kind: 'slab',
      typeId: Object.keys(p.slabTypes)[0]!,
      levelId: 'lv_0',
      boundary: [v2(0, 0), v2(5, 0), v2(5, 5), v2(0, 5)],
      holes: [],
      heightOffset: 0,
      slope: null,
      mark: '',
      comments: '',
    },
  });
  applyCommand(p, {
    type: 'addRoom',
    room: {
      id: 'rm1',
      kind: 'room',
      levelId: 'lv_0',
      name: 'Sala',
      number: '101',
      point: v2(2, 2),
    },
  });
  return p;
}

describe('facePaint: keys and lookup helpers', () => {
  it('roundtrips faceKeyOf and parseFaceKey', () => {
    expect(faceKeyOf('sideExt', 0)).toBe('sideExt@0');
    expect(parseFaceKey('sideExt@0')).toEqual({ face: 'sideExt', layer: 0 });

    const openingKey = faceKeyOf('opening:op_1:sill', 'all');
    expect(openingKey).toBe('opening:op_1:sill@all');
    expect(parseFaceKey(openingKey)).toEqual({ face: 'opening:op_1:sill', layer: 'all' });

    const edgeKey = faceKeyOf('edge:1:2', 3);
    expect(parseFaceKey(edgeKey)).toEqual({ face: 'edge:1:2', layer: 3 });

    expect(parseFaceKey('top')).toEqual({ face: 'top', layer: 'all' });
  });

  it('prefers exact layer over all fallback and resolves effectiveFaceMaterial', () => {
    const entries: FacePaintEntry[] = [
      { face: 'sideExt', layer: 'all', materialId: 'mat_ceramica' },
      { face: 'sideExt', layer: 1, materialId: 'mat_madeira' },
      {
        face: 'sideInt',
        layer: 0,
        regions: [{ id: 'r1', shape: { kind: 'rect', u0: 0, v0: 0, u1: 1, v1: 1 }, materialId: 'mat_aco', order: 1 }],
      },
    ];

    expect(findFacePaint(entries, 'sideExt', 1)?.materialId).toBe('mat_madeira');
    expect(findFacePaint(entries, 'sideExt', 0)?.materialId).toBe('mat_ceramica');
    expect(findExactFacePaint(entries, 'sideExt', 0)).toBeUndefined();
    expect(findExactFacePaint(entries, 'sideExt', 'all')?.materialId).toBe('mat_ceramica');

    expect(effectiveFaceMaterial(entries, 'sideExt', 1, 'mat_tinta')).toBe('mat_madeira');
    expect(effectiveFaceMaterial(entries, 'sideExt', 2, 'mat_tinta')).toBe('mat_ceramica');
    expect(effectiveFaceMaterial(entries, 'sideInt', 0, 'mat_tinta')).toBe('mat_tinta');
    expect(effectiveFaceMaterial(undefined, 'top', 0, 'mat_tinta')).toBe('mat_tinta');
  });

  it('lists available faces and identifies paintable elements', () => {
    const p = seedProject();
    const w = p.elements['w1'] as Wall;
    const f = p.elements['f1'] as Floor;
    const s = p.elements['s1'] as Slab;
    const rm = p.elements['rm1'] as Room;

    expect(isFacePaintableElement(w)).toBe(true);
    expect(isFacePaintableElement(f)).toBe(true);
    expect(isFacePaintableElement(s)).toBe(true);
    expect(isFacePaintableElement(rm)).toBe(false);
    expect(isFacePaintableElement(undefined)).toBe(false);

    expect(availableFacesForElement(p, w).map((x) => x.face)).toEqual([
      'sideExt',
      'sideInt',
      'endA',
      'endB',
      'top',
      'bottom',
    ]);
    expect(availableFacesForElement(p, f).map((x) => x.face)).toEqual([
      'top',
      'bottom',
      'edge:0:0',
      'edge:0:1',
      'edge:0:2',
      'edge:0:3',
      'edge:1:0',
      'edge:1:1',
      'edge:1:2',
    ]);
    expect(availableFacesForElement(p, s).map((x) => x.face)).toEqual([
      'top',
      'bottom',
      'edge:0:0',
      'edge:0:1',
      'edge:0:2',
      'edge:0:3',
    ]);
    expect(availableFacesForElement(p, rm)).toEqual([]);
  });
});

describe('facePaint: commands and ProjectStore undo/redo', () => {
  it('sets, updates, removes, and supports undo/redo on Wall, Floor, and Slab', () => {
    const store = new ProjectStore(seedProject());

    // Paint wall sideExt@all and sideExt@0
    store.exec({
      type: 'setFacePaint',
      elementId: 'w1',
      entry: { face: 'sideExt', layer: 'all', materialId: 'mat_ceramica' },
    });
    store.exec({
      type: 'setFacePaint',
      elementId: 'w1',
      entry: {
        face: 'sideExt',
        layer: 0,
        materialId: 'mat_madeira',
        regions: [{ id: 'reg1', shape: { kind: 'rect', u0: 0, v0: 0, u1: 2, v1: 1 }, materialId: 'mat_aco', order: 1 }],
      },
    });
    let wall = store.project.elements['w1'] as Wall;
    expect(wall.facePaints).toHaveLength(2);
    expect(effectiveFaceMaterial(wall.facePaints, 'sideExt', 0, 'mat_tinta')).toBe('mat_madeira');
    expect(effectiveFaceMaterial(wall.facePaints, 'sideExt', 2, 'mat_tinta')).toBe('mat_ceramica');

    // Replace existing (face, layer) entry
    store.exec({
      type: 'setFacePaint',
      elementId: 'w1',
      entry: { face: 'sideExt', layer: 0, materialId: 'mat_gesso' },
    });
    wall = store.project.elements['w1'] as Wall;
    expect(wall.facePaints).toHaveLength(2);
    expect(findExactFacePaint(wall.facePaints, 'sideExt', 0)?.materialId).toBe('mat_gesso');

    // Empty entry removes matching (face, layer)
    store.exec({
      type: 'setFacePaint',
      elementId: 'w1',
      entry: { face: 'sideExt', layer: 0, regions: [], dxfOverlays: [] },
    });
    wall = store.project.elements['w1'] as Wall;
    expect(wall.facePaints).toHaveLength(1);
    expect(wall.facePaints?.[0]?.layer).toBe('all');

    // Undo restores previous materialId
    store.undo();
    wall = store.project.elements['w1'] as Wall;
    expect(findExactFacePaint(wall.facePaints, 'sideExt', 0)?.materialId).toBe('mat_gesso');

    // Redo re-applies removal
    store.redo();
    wall = store.project.elements['w1'] as Wall;
    expect(wall.facePaints).toHaveLength(1);

    // Paint floor and slab with DXF overlay, then removeFacePaint
    store.exec({
      type: 'setFacePaint',
      elementId: 'f1',
      entry: {
        face: 'top',
        layer: 0,
        dxfOverlays: [
          {
            id: 'dxf1',
            name: 'Grid',
            paths: [{ pts: [v2(0, 0), v2(1, 1)], closed: false }],
            offset: v2(0, 0),
            rotationDeg: 0,
            scale: 1,
            separatorWidth: 0.01,
          },
        ],
      },
    });
    store.exec({
      type: 'setFacePaint',
      elementId: 's1',
      entry: { face: 'edge:0:1', layer: 'all', materialId: 'mat_concreto' },
    });
    expect((store.project.elements['f1'] as Floor).facePaints).toHaveLength(1);
    expect((store.project.elements['s1'] as Slab).facePaints).toHaveLength(1);

    // Remove all layers of sideExt on wall -> facePaints becomes undefined
    store.exec({ type: 'removeFacePaint', elementId: 'w1', face: 'sideExt' });
    expect((store.project.elements['w1'] as Wall).facePaints).toBeUndefined();

    // Remove specific layer on floor
    store.exec({ type: 'removeFacePaint', elementId: 'f1', face: 'top', layer: 0 });
    expect((store.project.elements['f1'] as Floor).facePaints).toBeUndefined();

    // Non-paintable element is safely ignored
    store.exec({
      type: 'setFacePaint',
      elementId: 'rm1',
      entry: { face: 'top', layer: 'all', materialId: 'mat_tinta' },
    });
    expect((store.project.elements['rm1'] as Room & { facePaints?: FacePaintEntry[] }).facePaints).toBeUndefined();
  });
});
