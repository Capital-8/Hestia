import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  makeBeam,
  makeColumn,
  makeFooting,
} from '@hestia/model';
import { buildStructuralSolids } from './structuralSolids.ts';

describe('buildStructuralSolids', () => {
  it('constrói sólidos para pilares, vigas e sapatas com a categoria própria de cada um', () => {
    const p = createEmptyProject();
    const c = makeColumn({ id: 'c1', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 1, y: 1 } });
    const b = makeBeam({ id: 'b1', typeId: 'bt_conc_15x40', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } });
    const f = makeFooting({ id: 'f1', typeId: 'ft_iso_100x100', levelId: 'lv_0', at: { x: 1, y: 1 } });
    p.elements[c.id] = { ...c, order: 1 };
    p.elements[b.id] = { ...b, order: 2 };
    p.elements[f.id] = { ...f, order: 3 };

    const batches = buildStructuralSolids(p, 'lv_0');
    expect(batches.length).toBeGreaterThanOrEqual(1);

    const columnBatch = batches.find((x) => x.category === 'column');
    expect(columnBatch).toBeDefined();
    expect(columnBatch?.ids.some((idRange) => idRange.id === 'c1')).toBe(true);
    expect(columnBatch?.positions.length).toBeGreaterThan(0);

    const beamBatch = batches.find((x) => x.category === 'beam');
    expect(beamBatch).toBeDefined();
    expect(beamBatch?.ids.some((idRange) => idRange.id === 'b1')).toBe(true);
    expect(beamBatch?.positions.length).toBeGreaterThan(0);

    const footingBatch = batches.find((x) => x.category === 'footing');
    expect(footingBatch).toBeDefined();
    expect(footingBatch?.ids.some((idRange) => idRange.id === 'f1')).toBe(true);
    expect(footingBatch?.positions.length).toBeGreaterThan(0);
    // As categorias antigas (parede/laje) não recebem mais pilar, viga nem sapata.
    expect(batches.some((x) => x.category === 'wall' || x.category === 'slab')).toBe(false);
  });

  it('respeita filtro oculto', () => {
    const p = createEmptyProject();
    const c = makeColumn({ id: 'c1', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 1, y: 1 } });
    p.elements[c.id] = { ...c, order: 1 };

    const batches = buildStructuralSolids(p, 'lv_0', (id) => id === 'c1');
    expect(batches).toHaveLength(0);
  });

  it('viga metálica W (i-section) gera malha 3D com mais vértices que viga retangular do mesmo vão', () => {
    const p = createEmptyProject();
    const bRect = makeBeam({ id: 'b_rect', typeId: 'bt_conc_15x40', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
    p.elements[bRect.id] = { ...bRect, order: 1 };
    const rectBatch = buildStructuralSolids(p, 'lv_0').find((x) => x.category === 'beam');

    delete p.elements[bRect.id];
    const bW = makeBeam({ id: 'b_w', typeId: 'bt_steel_w310', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
    p.elements[bW.id] = { ...bW, order: 2 };
    const wBatch = buildStructuralSolids(p, 'lv_0').find((x) => x.category === 'beam');

    expect(rectBatch).toBeDefined();
    expect(wBatch).toBeDefined();
    expect(wBatch!.positions.length).toBeGreaterThan(rectBatch!.positions.length);
  });
});
