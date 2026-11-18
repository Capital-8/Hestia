import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { v2 } from '@hestia/geom';
import { resolveFloors, resolveLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeFloor, makeWall, type Project } from '@hestia/model';
import { buildLevelSolidsComCaixas } from './paredesInstanciadas3d.ts';
import { buildFloorSolids, buildLevelSolids, type SolidBatch } from './solids.ts';
import { faceHighlightMesh, pickFace } from './facePick3d.ts';

function seedProject(): Project {
  const store = new ProjectStore(createEmptyProject('pt'));
  const p0 = store.project;
  const nextMats = {
    ...p0.materials,
    mat_paint_blue: {
      id: 'mat_paint_blue',
      name: 'Blue Paint',
      color: '#2563eb',
      hatch: 'solid' as const,
      gloss: 0.2,
      opacity: 1,
      cost: 0,
      unit: 'm2' as const,
    },
    mat_wood_slat: {
      id: 'mat_wood_slat',
      name: 'Wood Slat',
      color: '#8b5a2b',
      hatch: 'solid' as const,
      gloss: 0.3,
      opacity: 1,
      cost: 0,
      unit: 'm' as const,
    },
    mat_stone_trim: {
      id: 'mat_stone_trim',
      name: 'Stone Trim',
      color: '#9ca3af',
      hatch: 'solid' as const,
      gloss: 0.2,
      opacity: 1,
      cost: 0,
      unit: 'm3' as const,
    },
  };
  return { ...p0, materials: nextMats };
}

function batchToMesh(b: SolidBatch): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.normals, 3));
  geo.setIndex(b.indices);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  mesh.userData = { ranges: b.ids, kind: b.category };
  return mesh;
}

function cameraAt(from: [number, number, number], to: [number, number, number]): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(40, 1, 0.05, 500);
  cam.position.set(...from);
  const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const vertical = Math.abs(dir.z) > 0.9 * dir.length();
  cam.up.set(0, vertical ? 1 : 0, vertical ? 0 : 1);
  cam.lookAt(...to);
  cam.updateMatrixWorld();
  return cam;
}

function batchVolume(b: SolidBatch): number {
  let vol6 = 0;
  for (let i = 0; i < b.indices.length; i += 3) {
    const ia = b.indices[i]! * 3;
    const ib = b.indices[i + 1]! * 3;
    const ic = b.indices[i + 2]! * 3;
    const ax = b.positions[ia]!, ay = b.positions[ia + 1]!, az = b.positions[ia + 2]!;
    const bx = b.positions[ib]!, by = b.positions[ib + 1]!, bz = b.positions[ib + 2]!;
    const cx = b.positions[ic]!, cy = b.positions[ic + 1]!, cz = b.positions[ic + 2]!;
    vol6 += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return Math.abs(vol6) / 6;
}

describe('facePaintSolids', () => {
  it('routes painted straight wall out of instanced boxes and generates painted batches', () => {
    const store = new ProjectStore(seedProject());
    store.exec({
      type: 'addWall',
      wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: v2(0, 0), b: v2(4, 0), height: 2.8 }),
    });
    store.exec({
      type: 'addWall',
      wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: v2(0, 3), b: v2(4, 3), height: 2.8 }),
    });
    store.exec({
      type: 'setFacePaint',
      elementId: 'w1',
      entry: { face: 'sideInt', layer: 'all', materialId: 'mat_paint_blue' },
    });

    const p = store.project;
    const lv = resolveLevel(p, 'lv_0');
    const res = buildLevelSolidsComCaixas(lv, undefined, false, p);

    expect(res.caixas.some((c) => c.wallId === 'w1')).toBe(false);
    expect(res.caixas.some((c) => c.wallId === 'w2')).toBe(true);
    const blueBatch = res.batches.find((b) => b.materialId === 'mat_paint_blue');
    expect(blueBatch).toBeDefined();
    expect(blueBatch!.indices.length).toBeGreaterThan(0);
    expect(blueBatch!.ids.some((r) => r.id === 'w1')).toBe(true);
  });

  it('clips overlapping horizontal and vertical clipBelow extrusions to non-overlapping volume', () => {
    const store = new ProjectStore(seedProject());
    store.exec({
      type: 'addWall',
      wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: v2(0, 0), b: v2(4, 0), height: 3 }),
    });
    store.exec({
      type: 'setFacePaint',
      elementId: 'w1',
      entry: {
        face: 'sideExt',
        layer: 'all',
        regions: [
          {
            id: 'horiz',
            shape: { kind: 'rect', u0: 0, v0: 1, u1: 4, v1: 1.5 },
            materialId: 'mat_stone_trim',
            order: 1,
            thickness: 0.05,
            cutMode: 'clipBelow',
          },
          {
            id: 'vert',
            shape: { kind: 'rect', u0: 1, v0: 0, u1: 2, v1: 3 },
            materialId: 'mat_wood_slat',
            order: 2,
            thickness: 0.05,
            cutMode: 'clipBelow',
          },
        ],
      },
    });

    const p = store.project;
    const solids = buildLevelSolids(resolveLevel(p, 'lv_0'), undefined, p);
    const stone = solids.batches.find((b) => b.materialId === 'mat_stone_trim')!;
    const wood = solids.batches.find((b) => b.materialId === 'mat_wood_slat')!;
    expect(stone).toBeDefined();
    expect(wood).toBeDefined();
    // vert (order 2): 1m * 3m * 0.05 = 0.15 m3
    // horiz (order 1): (4 - 1)m * 0.5m * 0.05 = 0.075 m3 (1x0.5 overlap clipped!)
    expect(batchVolume(wood)).toBeCloseTo(0.15, 3);
    expect(batchVolume(stone)).toBeCloseTo(0.075, 3);
  });

  it('builds valid curved concave wall slats without NaNs', () => {
    const store = new ProjectStore(seedProject());
    store.exec({
      type: 'addWall',
      wall: makeWall({ id: 'wc', typeId: 'wt_alv14', levelId: 'lv_0', a: v2(0, 0), b: v2(4, 0), sag: 1, height: 2.8 }),
    });
    store.exec({
      type: 'setFacePaint',
      elementId: 'wc',
      entry: {
        face: 'sideInt',
        layer: 'all',
        regions: [
          {
            id: 'slats',
            shape: { kind: 'rect', u0: 0.2, v0: 0.2, u1: 3.0, v1: 2.4 },
            materialId: 'mat_wood_slat',
            order: 1,
            slats: {
              width: 0.06,
              gap: 0.06,
              depth: 0.03,
              angleDeg: 90,
              slatMaterialId: 'mat_wood_slat',
            },
          },
        ],
      },
    });

    const p = store.project;
    const solids = buildLevelSolids(resolveLevel(p, 'lv_0'), undefined, p);
    const slatBatch = solids.batches.find((b) => b.materialId === 'mat_wood_slat')!;
    expect(slatBatch).toBeDefined();
    expect(slatBatch.indices.length).toBeGreaterThan(24);
    expect(slatBatch.positions.every((x) => Number.isFinite(x))).toBe(true);
    expect(slatBatch.normals.every((x) => Number.isFinite(x))).toBe(true);
  });

  it('pickFace resolves wall sideExt, sideInt, top and floor top and edge:0:i', () => {
    const store = new ProjectStore(seedProject());
    const ftId = Object.keys(store.project.floorTypes)[0]!;
    store.exec({
      type: 'addWall',
      wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: v2(0, 0), b: v2(4, 0), height: 3 }),
    });
    store.exec({
      type: 'addFloor',
      floor: makeFloor({
        id: 'f1',
        typeId: ftId,
        levelId: 'lv_0',
        boundary: [v2(0, 2), v2(4, 2), v2(4, 6), v2(0, 6)],
      }),
    });

    const p = store.project;
    const scene = new THREE.Scene();
    for (const b of buildLevelSolids(resolveLevel(p, 'lv_0'), undefined, p).batches) scene.add(batchToMesh(b));
    for (const b of buildFloorSolids(resolveFloors(p, 'lv_0'), undefined, p)) scene.add(batchToMesh(b));

    // sideExt is +y (left of a->b when flipped=false)
    const hitExt = pickFace(scene, cameraAt([2, 5, 1.5], [2, 0, 1.5]), { x: 0, y: 0 }, p);
    expect(hitExt?.elementId).toBe('w1');
    expect(hitExt?.face).toBe('sideExt');
    expect(faceHighlightMesh(p, hitExt!, 'all')).not.toBeNull();

    // sideInt is -y
    const hitInt = pickFace(scene, cameraAt([2, -5, 1.5], [2, 0, 1.5]), { x: 0, y: 0 }, p);
    expect(hitInt?.elementId).toBe('w1');
    expect(hitInt?.face).toBe('sideInt');

    // top of wall
    const hitWallTop = pickFace(scene, cameraAt([2, 0, 10], [2, 0, 0]), { x: 0, y: 0 }, p);
    expect(hitWallTop?.elementId).toBe('w1');
    expect(hitWallTop?.face).toBe('top');

    // top of floor
    const hitFloorTop = pickFace(scene, cameraAt([2, 4, 10], [2, 4, 0]), { x: 0, y: 0 }, p);
    expect(hitFloorTop?.elementId).toBe('f1');
    expect(hitFloorTop?.face).toBe('top');
    expect(faceHighlightMesh(p, hitFloorTop!, 'all')).not.toBeNull();

    // edge:0:0 of floor lies on y = 2 (from (0,2) to (4,2))
    const hitFloorEdge = pickFace(scene, cameraAt([2, 0.5, -0.02], [2, 2, -0.02]), { x: 0, y: 0 }, p);
    expect(hitFloorEdge?.elementId).toBe('f1');
    expect(hitFloorEdge?.face).toBe('edge:0:0');
  });
});
