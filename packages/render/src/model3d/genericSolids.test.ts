import { describe, expect, it } from 'vitest';
import { createEmptyProject, type Generic } from '@hestia/model';
import { buildGenericSolids } from './genericSolids.ts';

const generic = (id: string, levelId = 'lv_0'): Generic => ({
  id,
  kind: 'generic',
  levelId,
  name: 'Viga',
  sourceClass: 'IFCBEAM',
  mesh: {
    positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    indices: [0, 1, 2],
  },
  outline: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
  order: 1,
});

describe('malha do objeto importado no 3D', () => {
  it('gera um triângulo com normal e a faixa do elemento', () => {
    const p = createEmptyProject();
    p.elements = { g_a: generic('g_a') };
    const [batch] = buildGenericSolids(p, 'lv_0');
    expect(batch).toBeDefined();
    expect(batch!.category).toBe('generic');
    expect(batch!.positions).toHaveLength(9);
    expect(batch!.normals).toBeUndefined();
    expect(Array.from(batch!.indices)).toEqual([0, 1, 2]);
    expect(batch!.ids).toEqual([{ id: 'g_a', start: 0, count: 3 }]);
    expect(batch!.positions).toBeInstanceOf(Float32Array);
    expect(batch!.indices).toBeInstanceOf(Uint32Array);
  });

  it('mantém a malha soldada e desloca índices e faixas por elemento; a normal chapada vem das posições', () => {
    const quad = (z: number): Generic['mesh'] => ({ positions: [0, 0, z, 1, 0, z, 1, 1, z, 0, 1, z], indices: [0, 1, 2, 0, 2, 3] });
    const p = createEmptyProject();
    p.elements = { g_a: { ...generic('g_a'), mesh: quad(0) }, g_b: { ...generic('g_b'), mesh: quad(2) } };
    const [b] = buildGenericSolids(p, 'lv_0');
    expect(b!.positions).toHaveLength(24);
    expect(Array.from(b!.indices)).toEqual([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    expect(b!.ids).toEqual([{ id: 'g_a', start: 0, count: 6 }, { id: 'g_b', start: 6, count: 6 }]);
    // Cada triângulo, lido pela faixa do elemento, cai nos vértices do próprio elemento (z = 0 ou 2) e tem normal +z.
    for (const r of b!.ids) {
      const z = r.id === 'g_a' ? 0 : 2;
      for (let i = r.start; i < r.start + r.count; i += 3) {
        const [a, c, d] = [0, 1, 2].map((k) => b!.indices[i + k]! * 3);
        for (const o of [a!, c!, d!]) expect(b!.positions[o! + 2]).toBe(z);
        const ux = b!.positions[c!]! - b!.positions[a!]!;
        const uy = b!.positions[c! + 1]! - b!.positions[a! + 1]!;
        const vx = b!.positions[d!]! - b!.positions[a!]!;
        const vy = b!.positions[d! + 1]! - b!.positions[a! + 1]!;
        expect(ux * vy - uy * vx).toBeGreaterThan(0);
      }
    }
  });

  it('ignora objeto de outro nível e projeto sem genérico', () => {
    const p = createEmptyProject();
    p.elements = { g_a: generic('g_a', 'lv_1') };
    expect(buildGenericSolids(p, 'lv_0')).toEqual([]);
  });

  it('usa um lote por cor do IFC (material im_<hex>)', () => {
    const p = createEmptyProject();
    p.elements = { g_a: { ...generic('g_a'), color: '#f6c073' }, g_b: { ...generic('g_b'), color: '#f6c073' }, g_c: generic('g_c') };
    const batches = buildGenericSolids(p, 'lv_0');
    expect(batches.map((b) => b.materialId).sort()).toEqual(['im_f6c073', 'mat_concreto']);
    const colorido = batches.find((b) => b.materialId === 'im_f6c073')!;
    expect(colorido.ids.map((r) => r.id).sort()).toEqual(['g_a', 'g_b']);
    expect(colorido.indices).toHaveLength(6);
  });
});

describe('genéricos na GPU sem normais por vértice', () => {
  it('o lote de GPU da categoria generic não tem atributo normal e o material é chapado por derivadas', async () => {
    const THREE = await import('three');
    const { LoteGeometriaGpu, mesclarLotes } = await import('../gpu/loteGeometria.ts');
    const { OrcamentoVram } = await import('../gpu/orcamento.ts');
    const p = createEmptyProject();
    p.elements = { g_a: generic('g_a') };
    const [b] = buildGenericSolids(p, 'lv_0');
    const lote = new LoteGeometriaGpu('generic|mat_concreto', 'generic', 'mat_concreto', new THREE.MeshLambertMaterial({ flatShading: true }), new OrcamentoVram());
    lote.definir('lv_0', mesclarLotes([b!]));
    lote.finalizar();
    const g = lote.malha.geometry;
    expect(g.getAttribute('normal')).toBeUndefined();
    expect(g.drawRange.count).toBe(3);
    expect((lote.malha.userData as { ranges: unknown }).ranges).toEqual([{ id: 'g_a', start: 0, count: 3 }]);
  });
});
