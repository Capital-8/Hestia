import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './defaults.ts';
import { migrateProject } from './migrate.ts';
import { meshJsonReplacer, meshShiftedZ, serializeProject, typedMesh } from './meshArrays.ts';
import type { Generic } from './types.ts';

const generic = (mesh: Generic['mesh']): Generic => ({ id: 'g1', kind: 'generic', levelId: 'l1', name: 'g', sourceClass: 'IFCBEAM', mesh, order: 0 });

describe('malha genérica em arrays tipados', () => {
  it('arquivo antigo (arrays JSON) abre com malha tipada e regrava o mesmo formato', () => {
    const p = createEmptyProject();
    const antigo = { ...p, elements: { g1: generic({ positions: [0, 0, 0, 1.5, 0, 0.1, 0, 2.25, 0], indices: [0, 1, 2] }) } };
    const texto = JSON.stringify(antigo);
    const aberto = migrateProject(JSON.parse(texto));
    const g = aberto.elements.g1 as Generic;
    expect(g.mesh.positions).toBeInstanceOf(Float32Array);
    expect(g.mesh.indices).toBeInstanceOf(Uint32Array);
    const salvo = serializeProject(aberto);
    expect(salvo).toBe(texto);
    expect(JSON.parse(salvo).elements.g1.mesh).toEqual({ positions: [0, 0, 0, 1.5, 0, 0.1, 0, 2.25, 0], indices: [0, 1, 2] });
  });

  it('salvar → abrir → salvar é estável e sem ruído de float32 no texto', () => {
    const p = createEmptyProject();
    const pos = new Float32Array([0.1, 12.345678, -3.3, 7, 8, 9, 0.7, 0.2, 0.3]);
    const doc = { ...p, elements: { g1: generic({ positions: pos, indices: new Uint32Array([0, 1, 2]) }) } };
    const t1 = serializeProject(doc);
    expect(t1).toContain('0.1,12.345678,-3.3');
    const t2 = serializeProject(migrateProject(JSON.parse(t1)));
    expect(t2).toBe(t1);
    const g = migrateProject(JSON.parse(t1)).elements.g1 as Generic;
    expect(Array.from(g.mesh.positions)).toEqual(Array.from(pos));
  });

  it('structuredClone preserva os tipos e meshShiftedZ não altera o original', () => {
    const m = typedMesh({ positions: [1, 2, 3], indices: [0, 0, 0] });
    const c = structuredClone(m);
    expect(c.positions).toBeInstanceOf(Float32Array);
    const s = meshShiftedZ(m.positions, 5);
    expect(Array.from(s)).toEqual([1, 2, 8]);
    expect(Array.from(m.positions)).toEqual([1, 2, 3]);
  });
});

describe('serializeProject: saída idêntica ao replacer de referência', () => {
  const ref = (p: unknown, space?: number) => JSON.stringify(p, meshJsonReplacer, space);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const build = (n: number, tris: number) => {
    const p = createEmptyProject();
    const els: Record<string, unknown> = {};
    for (let i = 0; i < n; i++) {
      const pos = new Float32Array(tris * 9);
      for (let k = 0; k < pos.length; k++) pos[k] = (rnd() - 0.5) * 100;
      const idx = new Uint32Array(tris * 3).map((_, k) => k);
      els['g' + i] = { ...generic({ positions: pos, indices: idx }), id: 'g' + i };
    }
    return { ...p, elements: els } as unknown as Parameters<typeof serializeProject>[0];
  };

  it('malhas variadas, vazias, number[] e sem malha, com space 0/1/2', () => {
    const p = createEmptyProject();
    const els: Record<string, unknown> = {
      a: { ...generic({ positions: new Float32Array([0.1, 1e-7, -0, 3e10, 16777217, 0.7, -123.456, NaN, Infinity]), indices: new Uint32Array([0, 1, 2, 4294967295]) }), id: 'a' },
      b: { ...generic({ positions: new Float32Array(0), indices: new Uint32Array(0) }), id: 'b' },
      c: { ...generic({ positions: [0, 0.1, 2.5], indices: [0, 1, 2] }), id: 'c' },
      d: { ...generic(undefined as unknown as Generic['mesh']), id: 'd', mesh: undefined },
    };
    const doc = { ...p, elements: els } as unknown as Parameters<typeof serializeProject>[0];
    for (const sp of [undefined, 0, 1, 2]) expect(serializeProject(doc, sp)).toBe(ref(doc, sp));
    expect(serializeProject(createEmptyProject(), 1)).toBe(ref(createEmptyProject(), 1));
  });

  it('floats de várias magnitudes e sinais', () => {
    const pos = new Float32Array(30000);
    for (let k = 0; k < pos.length; k++) pos[k] = (rnd() - 0.5) * 10 ** (Math.floor(rnd() * 14) - 7);
    const doc = { ...createEmptyProject(), elements: { a: { ...generic({ positions: pos, indices: new Uint32Array(3) }), id: 'a' } } } as unknown as Parameters<typeof serializeProject>[0];
    expect(serializeProject(doc)).toBe(ref(doc));
  });

  it('projeto grande aleatório', () => {
    const doc = build(30, 500);
    for (const sp of [0, 1]) expect(serializeProject(doc, sp)).toBe(ref(doc, sp));
  });
});
