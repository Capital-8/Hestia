import { describe, expect, it } from 'vitest';
import { dist, type Vec2 } from '@hestia/geom';
import { computeSection } from '@hestia/engine';
import { applyCommand as aplicar, createEmptyProject, FAMILIA_ARMARIO, type Project } from '@hestia/model';
import { infer } from './infer.ts';
import { sectionInferContext } from './sectionContext.ts';
import { buildSectionSnapIndex } from './sectionSnapIndex.ts';
import { DEFAULT_SNAP } from './types.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });

/** Armário A80 em (1, 1); corte em x = 1,2 olhando para +y (t = y, z = cota). */
function cena(): { p: Project; line: { a: Vec2; b: Vec2 } } {
  const p = createEmptyProject('t');
  aplicar(p, { type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
  p.elements.c1 = { id: 'c1', kind: 'component', familyId: FAMILIA_ARMARIO.id, typeId: 'A80', levelId: p.levels[0]!.id, order: 1, x: 1, y: 1, z: 0, rotation: 0, mirrored: false, mark: 'c1' };
  return { p, line: { a: v(1.2, 0), b: v(1.2, 3) } };
}

describe('captura dos móveis no corte e na elevação', () => {
  it('o retângulo cortado da porta (t 0,982..1 x z 0,102..0,693) dá 4 cantos e 4 meios com o dono do móvel', () => {
    const { p, line } = cena();
    const index = buildSectionSnapIndex(computeSection(p, { ...line, depth: 2 }));
    const tem = (kind: string, x: number, y: number): boolean => index.points.some((q) => q.kind === kind && q.hostId === 'c1' && Math.abs(q.x - x) < 1e-6 && Math.abs(q.y - y) < 1e-6);
    for (const [x, y] of [[0.982, 0.102], [1, 0.102], [1, 0.693], [0.982, 0.693]] as const) expect(tem('endpoint', x, y)).toBe(true);
    for (const [x, y] of [[0.991, 0.102], [1, 0.3975], [0.991, 0.693], [0.982, 0.3975]] as const) expect(tem('midpoint', x, y)).toBe(true);
  });

  it('a projeção além do corte (lateral esquerda: t 1..1,56 x z 0,118..0,695) também entra, com o dono', () => {
    const { p, line } = cena();
    const index = buildSectionSnapIndex(computeSection(p, { ...line, depth: 2 }));
    const tem = (x: number, y: number): boolean => index.points.some((q) => q.kind === 'endpoint' && q.hostId === 'c1' && Math.abs(q.x - x) < 1e-6 && Math.abs(q.y - y) < 1e-6);
    expect(tem(1.56, 0.118)).toBe(true);
    expect(tem(1.56, 0.695)).toBe(true);
    // Aresta da lateral (t 1..1,56) na cota 0,118: o pé da perpendicular vem de um segmento do índice com o dono.
    expect(index.segments.some((s) => s.hostId === 'c1' && Math.abs(s.a.y - 0.118) < 1e-6 && Math.abs(s.b.y - 0.118) < 1e-6 && Math.abs(Math.abs(s.b.x - s.a.x) - 0.56) < 1e-6)).toBe(true);
  });

  it('o motor captura o canto cortado da porta e o ignore/oculto do móvel remove', () => {
    const { p, line } = cena();
    const section = computeSection(p, { ...line, depth: 2 });
    const lv = p.levels[0]!.id;
    const snap = { ...DEFAULT_SNAP, alignment: false };
    const ctx = (extra: Parameters<typeof sectionInferContext>[5] = {}, hidden?: Set<string>) =>
      sectionInferContext(section, p, lv, 0.005, 0.1, { line, snap, ...(hidden ? { hidden } : {}) }, extra);
    const r = infer(v(0.984, 0.1), ctx());
    expect(r.kind).toBe('endpoint');
    expect(r.hostId).toBe('c1');
    expect(dist(r.point, v(0.982, 0.102))).toBeLessThan(1e-6);
    expect(infer(v(0.984, 0.1), ctx({ ignore: new Set(['c1']) })).hostId).toBeUndefined();
    expect(infer(v(0.984, 0.1), ctx({}, new Set(['c1']))).hostId).toBeUndefined();
  });
});
