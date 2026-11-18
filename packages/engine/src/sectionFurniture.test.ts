import { describe, expect, it } from 'vitest';
import { boxOf, multiArea } from '@hestia/geom';
import { applyCommand, buildFurnitureAsset, createEmptyProject, type Project } from '@hestia/model';
import { computeSection } from './section.ts';
import { sectionOfFurniture } from './sectionFurniture.ts';

/** Bloco 2 x 1 x 0,5 m (X x Y x Z), recentrado pelo importador: x -1..1, y -0,5..0,5, z 0..0,5. */
function projetoComMovel(): Project {
  const p = createEmptyProject('t');
  const positions = new Float32Array([0, 0, 0, 2, 0, 0, 2, 1, 0, 0, 1, 0, 0, 0, 0.5, 2, 0, 0.5, 2, 1, 0.5, 0, 1, 0.5]);
  const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]);
  const asset = buildFurnitureAsset({
    name: 'Bloco',
    sourceFileName: 'bloco.glb',
    sourceFormat: 'glb',
    defs: [{ id: 'd', name: 'd', positions, normals: new Float32Array(24), uvs: new Float32Array(0), indices, groups: [{ start: 0, count: 36, materialIndex: 0 }] }],
    materials: [{ name: 'm', color: [1, 0, 0], opacity: 1 }],
    textures: [],
  });
  applyCommand(p, { type: 'addFurnitureAsset', asset });
  applyCommand(p, { type: 'addFurniture', furniture: { id: 'mv1', kind: 'furniture', assetId: asset.id, levelId: p.levels[0]!.id, x: 3, y: 4, z: 0, rotation: 0, scale: 1, mirrored: false, name: 'Bloco' } });
  return p;
}

describe('corte e elevação do móvel importado', () => {
  it('elevação (linha fora do bloco): silhueta 2 m x 0,5 m em t 2..4, z 0..0,5, com furnitureId e profundidade 0,5', () => {
    const p = projetoComMovel();
    const s = sectionOfFurniture(p, p.levels[0]!.id, { a: { x: 0, y: 3 }, b: { x: 6, y: 3 }, depth: 5 });
    expect(s.cut).toHaveLength(0);
    expect(s.beyond).toHaveLength(1);
    const b = s.beyond[0]!;
    expect(b.furnitureId).toBe('mv1');
    expect(b.depth).toBeCloseTo(0.5, 6);
    const box = boxOf(b.polygons.flat(2));
    expect([box.minX, box.maxX, box.minY, box.maxY].map((v) => Math.round(v * 1000) / 1000)).toEqual([2, 4, 0, 0.5]);
    expect(multiArea(b.polygons)).toBeCloseTo(1.0, 6);
  });

  it('corte atravessando o bloco: região cortada de 2 m x 0,5 m (área 1,0) e dono no resultado do motor', () => {
    const p = projetoComMovel();
    const r = computeSection(p, { a: { x: 0, y: 4 }, b: { x: 6, y: 4 }, depth: 5 });
    const regs = r.cut.filter((c) => c.sources.some((s) => s.furnitureId === 'mv1'));
    expect(regs).toHaveLength(1);
    expect(multiArea(regs[0]!.polygons)).toBeCloseTo(1.0, 6);
  });

  it('linha que não alcança o bloco (atrás da vista) não gera nada', () => {
    const p = projetoComMovel();
    const s = sectionOfFurniture(p, p.levels[0]!.id, { a: { x: 0, y: 6 }, b: { x: 6, y: 6 }, depth: 5 });
    expect(s.beyond).toHaveLength(0);
    expect(s.cut).toHaveLength(0);
  });

  it('o resultado é reaproveitado para a mesma linha (cache por móvel)', () => {
    const p = projetoComMovel();
    const line = { a: { x: 0, y: 3 }, b: { x: 6, y: 3 }, depth: 5 };
    const a = sectionOfFurniture(p, p.levels[0]!.id, line);
    const b = sectionOfFurniture(p, p.levels[0]!.id, { ...line });
    expect(b.beyond[0]!.polygons).toBe(a.beyond[0]!.polygons);
  });
});
