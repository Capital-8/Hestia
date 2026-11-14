import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './defaults.ts';
import { migrateProject } from './migrate.ts';
import { meshShiftedZ, serializeProject, typedMesh } from './meshArrays.ts';
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
