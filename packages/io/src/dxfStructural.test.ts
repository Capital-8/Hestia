import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  makeBeam,
  makeColumn,
  makeFooting,
} from '@hestia/model';
import {
  dxfDocOf,
  dxfLayersOf,
  DXF_LAYER_BEAM,
  DXF_LAYER_COLUMN,
  DXF_LAYER_FOOTING,
} from './dxf.ts';
import { structuralDxfShapes } from './dxfStructural.ts';

describe('dxfStructural', () => {
  it('structuralDxfShapes retorna lista vazia quando não há elementos estruturais', () => {
    const p = createEmptyProject();
    expect(structuralDxfShapes(p, 'lv_0')).toEqual([]);
  });

  it('structuralDxfShapes gera polilinhas para pilares, vigas e sapatas', () => {
    const p = createEmptyProject();
    const c = makeColumn({ id: 'c1', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 2, y: 3 } });
    const b = makeBeam({ id: 'b1', typeId: 'bt_conc_15x40', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
    const f = makeFooting({ id: 'f1', typeId: 'ft_iso_100x100', levelId: 'lv_0', at: { x: 5, y: 5 } });
    p.elements[c.id] = { ...c, order: 1 };
    p.elements[b.id] = { ...b, order: 2 };
    p.elements[f.id] = { ...f, order: 3 };

    const shapes = structuralDxfShapes(p, 'lv_0');
    expect(shapes).toHaveLength(3);

    const colShape = shapes.find((s) => s.layer === DXF_LAYER_COLUMN);
    expect(colShape).toBeDefined();
    expect(colShape?.closed).toBe(true);
    expect(colShape?.pts.length).toBeGreaterThanOrEqual(4);

    const beamShape = shapes.find((s) => s.layer === DXF_LAYER_BEAM);
    expect(beamShape).toBeDefined();
    expect(beamShape?.closed).toBe(true);
    expect(beamShape?.dashed).toBe(true);

    const footShape = shapes.find((s) => s.layer === DXF_LAYER_FOOTING);
    expect(footShape).toBeDefined();
    expect(footShape?.closed).toBe(true);
  });

  it('dxfDocOf inclui camadas e entidades estruturais quando presentes', () => {
    const p = createEmptyProject();
    const c = makeColumn({ id: 'c1', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 2, y: 3 } });
    p.elements[c.id] = { ...c, order: 1 };

    const doc = dxfDocOf(p, 'lv_0', { clusters: [], openings: [] });
    expect(doc.layers.some((l) => l.name === DXF_LAYER_COLUMN)).toBe(true);
    expect(doc.entities.some((e) => e.layer === DXF_LAYER_COLUMN)).toBe(true);

    const layers = dxfLayersOf(p, { clusters: [], openings: [] }, 'pt', 'lv_0');
    expect(layers).toContain(DXF_LAYER_COLUMN);
  });
});
