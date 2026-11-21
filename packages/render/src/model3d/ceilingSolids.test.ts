import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeCeiling, makeFloor, type Project } from '@hestia/model';
import { resolveCeilings } from '@hestia/engine';
import { buildCeilingSolids } from './solids.ts';

const RECT = [
  { x: 0, y: 0 },
  { x: 6, y: 0 },
  { x: 6, y: 4 },
  { x: 0, y: 4 },
];

/** Volume por teorema da divergência (malha fechada e bem orientada), como em solids.test.ts. */
function volume(b: { positions: number[]; indices: number[] }): number {
  let v = 0;
  for (let i = 0; i < b.indices.length; i += 3) {
    const p = (k: number) => [b.positions[k * 3]!, b.positions[k * 3 + 1]!, b.positions[k * 3 + 2]!] as const;
    const [p0, p1, p2] = [p(b.indices[i]!), p(b.indices[i + 1]!), p(b.indices[i + 2]!)];
    v += (p0[0] * (p1[1] * p2[2] - p1[2] * p2[1]) - p0[1] * (p1[0] * p2[2] - p1[2] * p2[0]) + p0[2] * (p1[0] * p2[1] - p1[1] * p2[0])) / 6;
  }
  return v;
}

function project(): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addCeiling', ceiling: makeCeiling({ id: 'c', typeId: 'ct_gesso', levelId: 'lv_0', boundary: RECT, holes: [[{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }]] }) });
  s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f', typeId: 'ft_laje12', levelId: 'lv_0', boundary: RECT }) });
  return s.project;
}

describe('sólidos dos forros (3D)', () => {
  it('volume total das malhas bate com área líquida × espessura do tipo', () => {
    const p = project();
    const batches = buildCeilingSolids(resolveCeilings(p, 'lv_0'));
    const total = batches.reduce((sum, b) => sum + volume(b), 0);
    const t = p.ceilingTypes.ct_gesso!;
    const thickness = t.layers.reduce((s, l) => s + l.thickness, 0);
    expect(total).toBeCloseTo((24 - 1) * thickness, 6);
  });

  it('uma malha por material, com os ids do forro para o picking', () => {
    const batches = buildCeilingSolids(resolveCeilings(project(), 'lv_0'));
    expect(batches.map((b) => b.materialId)).toEqual(['mat_perfil', 'mat_gesso']);
    expect(batches.every((b) => b.category === 'ceiling')).toBe(true);
    expect(new Set(batches.flatMap((b) => b.ids.map((r) => r.id)))).toEqual(new Set(['c']));
  });

  it('o forro fica por baixo do topo e a face inferior é a cota do topo menos a espessura', () => {
    const batches = buildCeilingSolids(resolveCeilings(project(), 'lv_0'));
    const zs = batches.flatMap((b) => b.positions.filter((_, i) => i % 3 === 2));
    expect(Math.max(...zs)).toBeCloseTo(2.6, 6);
    const t = project().ceilingTypes.ct_gesso!;
    expect(Math.min(...zs)).toBeCloseTo(2.6 - t.layers.reduce((s, l) => s + l.thickness, 0), 6);
  });

  it('sem forros, nenhuma malha', () => {
    expect(buildCeilingSolids([])).toEqual([]);
  });
});
