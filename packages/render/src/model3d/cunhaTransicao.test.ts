import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Layer } from '@hestia/model';
import { buildLevelSolids } from './solids.ts';
import { junctionLevel, resolveLevel } from '@hestia/engine';

/** Etapa R: a cunha é um prisma fechado de volume 0,0864189 m3 (t=0,2; H=3; -20/-15); sem diferença de inclinação, malha idêntica. */
const camada: Layer = { function: 'structure', materialId: 'mat_concreto', thickness: 0.2, wraps: false };
const nivel = (a: number, b: number, cunha: boolean) => {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada] };
  const s = new ProjectStore(base);
  const j = cunha ? { transicao: 'cunha' as const, kind: 'butt' as const, flip: false } : undefined;
  s.exec({ type: 'addWall', wall: makeWall({ id: 'A', typeId: 'wt_t', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, tilt: a, ...(j ? { joinEnd: j } : {}) }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'B', typeId: 'wt_t', levelId: 'lv_0', height: 3, a: { x: 4, y: 0 }, b: { x: 8, y: 0 }, tilt: b }) });
  return buildLevelSolids(resolveLevel(s.project, 'lv_0'), junctionLevel(s.project, 'lv_0'));
};
const volume = (b: { positions: number[]; indices: number[] }): number => {
  let v = 0;
  for (let i = 0; i < b.indices.length; i += 3) {
    const [p, q, r] = [0, 1, 2].map((k) => b.indices[i + k]! * 3);
    const P = b.positions;
    v += (P[p!]! * (P[q! + 1]! * P[r! + 2]! - P[q! + 2]! * P[r! + 1]!) - P[p! + 1]! * (P[q!]! * P[r! + 2]! - P[q! + 2]! * P[r!]!) + P[p! + 2]! * (P[q!]! * P[r! + 1]! - P[q! + 1]! * P[r!]!)) / 6;
  }
  return v;
};
describe('cunha de transição no 3D', () => {
  it('a cunha acrescenta 12 triângulos fechados e 0,0864189 m3 ao lote', () => {
    const sem = nivel(-20, -15, false).batches[0]!, com = nivel(-20, -15, true).batches[0]!;
    expect(com.indices.length - sem.indices.length).toBe(24); // 2 tampas + 3 faces de 2 triângulos = 8 triângulos
    expect(volume(com) - volume(sem)).toBeCloseTo(0.0864189, 4);
  });
  it('inclinações iguais com cunha: malha idêntica à de hoje', () => {
    const x = nivel(-15, -15, true).batches[0]!, y = nivel(-15, -15, false).batches[0]!;
    expect(x.positions).toEqual(y.positions);
    expect(x.indices).toEqual(y.indices);
  });
});
