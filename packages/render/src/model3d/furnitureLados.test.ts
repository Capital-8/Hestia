import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildFurnitureAsset, createEmptyProject, type Furniture, type FurnitureImportInput } from '@hestia/model';
import { buildFurnitureLevel, type ContextoMoveis } from './furnitureSolids.ts';

/** Duas chapas: a primeira (material 0) de dois lados, a segunda (material 1) de um lado. */
function duasChapas(): FurnitureImportInput {
  const pos = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1];
  const nor = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
  return {
    name: 'Chapas', sourceFileName: 'c.skp', sourceFormat: 'skp', recenter: false,
    defs: [{
      id: 'd', name: 'd', positions: new Float32Array(pos), normals: new Float32Array(nor), uvs: new Float32Array(0),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]),
      groups: [{ start: 0, count: 6, materialIndex: 0, doubleSided: true }, { start: 6, count: 6, materialIndex: 1 }],
    }],
    materials: [{ name: 'A', color: [1, 0, 0], opacity: 1 }, { name: 'B', color: [0, 1, 0], opacity: 1 }],
    textures: [],
  };
}

describe('vista 3D: grupos de dois lados', () => {
  const asset = buildFurnitureAsset(duasChapas(), 'fa_chapas');
  const p = createEmptyProject();
  p.furniture = { assets: { [asset.id]: asset } };
  for (const [i, espelhada] of [false, true].entries()) {
    const id = `mv_${i}`;
    p.elements[id] = { id, kind: 'furniture', assetId: asset.id, levelId: p.levels[0]!.id, x: i * 3, y: 0, z: 0, rotation: 0, scale: 1, mirrored: espelhada, name: 'c', order: i + 1 } as Furniture;
  }

  it('o contexto recebe doubleSided só para o grupo marcado', () => {
    const chamadas: Array<[number, boolean | undefined]> = [];
    const ctx: ContextoMoveis = {
      material: (_a, mi, _q, ds) => { chamadas.push([mi, ds]); return new THREE.MeshBasicMaterial(); },
      pick: new THREE.MeshBasicMaterial(),
    };
    const r = buildFurnitureLevel(p, 'lv_0', ctx, { qualidadePadrao: 'completo' })!;
    expect(r.stats.triangulos).toBe(4 * 2);
    const por = new Map<number, Set<boolean>>();
    for (const [mi, ds] of chamadas) { if (!por.has(mi)) por.set(mi, new Set()); por.get(mi)!.add(ds === true); }
    expect([...por.get(0)!]).toEqual([true]);
    expect([...por.get(1)!]).toEqual([false]);
  });

  it('a versão leve (simplificada) também mantém doubleSided', () => {
    const chamadas: Array<[number, boolean | undefined]> = [];
    const ctx: ContextoMoveis = {
      material: (_a, mi, _q, ds) => { chamadas.push([mi, ds]); return new THREE.MeshBasicMaterial(); },
      pick: new THREE.MeshBasicMaterial(),
    };
    buildFurnitureLevel(p, 'lv_0', ctx, { qualidadePadrao: 'leve', sincrono: true, metaLeve: 4 });
    expect(chamadas.filter(([mi]) => mi === 0).every(([, ds]) => ds === true)).toBe(true);
    expect(chamadas.filter(([mi]) => mi === 1).every(([, ds]) => ds !== true)).toBe(true);
  });
});
