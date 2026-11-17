import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  makeBeam,
  makeColumn,
  makeFooting,
} from '@hestia/model';
import { exportIfc } from './ifcExport.ts';

describe('ifcStructural', () => {
  it('exporta IFCCOLUMN, IFCBEAM e IFCFOOTING com propriedades e materiais', () => {
    const p = createEmptyProject();
    const c = makeColumn({ id: 'c1', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 2, y: 3 }, mark: 'P1' });
    const b = makeBeam({ id: 'b1', typeId: 'bt_conc_15x40', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, mark: 'V1' });
    const f = makeFooting({ id: 'f1', typeId: 'ft_iso_100x100', levelId: 'lv_0', at: { x: 2, y: 3 }, mark: 'S1' });
    p.elements[c.id] = { ...c, order: 1 };
    p.elements[b.id] = { ...b, order: 2 };
    p.elements[f.id] = { ...f, order: 3 };

    const text = exportIfc(p, {
      walls: [],
      openings: [],
      floors: [],
      slabs: [],
      roofs: [],
      stairs: [],
      ramps: [],
    });

    expect(text).toContain('IFCCOLUMN(');
    expect(text).toContain('IFCBEAM(');
    expect(text).toContain('IFCFOOTING(');
    expect(text).toContain('.PAD_FOOTING.');
    expect(text).toContain('Pset_ColumnCommon');
    expect(text).toContain('Pset_BeamCommon');
    expect(text).toContain('Pset_FootingCommon');
    expect(text).toContain('IFCRELASSOCIATESMATERIAL');
    expect(text).toContain('IFCRELCONTAINEDINSPATIALSTRUCTURE');
  });
});
