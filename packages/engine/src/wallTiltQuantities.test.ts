import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Opening, type Wall } from '@hestia/model';
import { quantifyLevel, resolveLevel } from './index.ts';

/** t=0,2; H=3 (METODOLOGIA 4.2). Valores literais; nada vem da função testada. */
const camada: Layer = { function: 'structure', materialId: 'mat_concreto', thickness: 0.2, wraps: false };
const CHORD = 5 * Math.SQRT2; // arco R=5, φ=90°
const SAG = 5 * (1 - Math.SQRT1_2);

function quant(w: Partial<Wall>, op?: Partial<Opening>) {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada] };
  base.openingTypes.ot_jan = { ...base.openingTypes.ot_j120!, id: 'ot_jan', width: 1.2, height: 1.0, sill: 1.0, leaves: 0 };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_t', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, ...w }) });
  if (op) s.exec({ type: 'addOpening', opening: { id: 'o1', kind: 'window', typeId: 'ot_jan', hostId: 'w1', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '', ...op } as Opening });
  return quantifyLevel(s.project, resolveLevel(s.project, 'lv_0')).walls[0]!;
}
const reta = (tilt?: number) => quant({ ...(tilt ? { tilt } : {}) });
const arco = (tilt: number) => quant({ b: { x: CHORD, y: 0 }, sag: SAG, tilt });

describe('quantitativos pela face real (F2.7)', () => {
  it('reta L=4: θ=15° e 30°', () => {
    const a = reta(15);
    expect(a.grossVolume).toBeCloseTo(2.4847, 4);
    expect(a.grossFaceArea).toBeCloseTo(12.4233, 4);
    expect(a.length).toBeCloseTo(4, 9);
    const b = reta(30);
    expect(b.grossVolume).toBeCloseTo(2.7713, 4);
    expect(b.grossFaceArea).toBeCloseTo(13.8564, 4);
  });
  it('reta inclinada para o outro lado: mesmos números (usa |θ|)', () => {
    expect(reta(-15).grossVolume).toBeCloseTo(2.4847, 4);
  });
  it('arco R=5 φ=90°, θ=15°: afastando e aproximando', () => {
    const f = arco(15);
    expect(f.grossVolume).toBeCloseTo(5.2708, 4);
    expect(f.grossFaceArea).toBeCloseTo(26.354, 3);
    expect(f.length).toBeCloseTo(2.5 * Math.PI, 9);
    const n = arco(-15);
    expect(n.grossVolume).toBeCloseTo(4.4865, 4);
    expect(n.grossFaceArea).toBeCloseTo(22.4323, 3);
  });
  it('parede vertical: números idênticos aos de hoje (tilt ausente = 0)', () => {
    const v = reta();
    expect(v.grossVolume).toBeCloseTo(4 * 3 * 0.2, 9);
    expect(v.grossFaceArea).toBe(12);
    expect(quant({ tilt: 0 })).toEqual(v);
    expect(quant({ b: { x: CHORD, y: 0 }, sag: SAG })).toEqual(quant({ b: { x: CHORD, y: 0 }, sag: SAG, tilt: 0 }));
  });
  it('vão: vertical desconta pela face real; inclinado desconta w·h·t (corte perpendicular)', () => {
    const c = Math.cos((15 * Math.PI) / 180);
    const vert = quant({ tilt: 15 }, { plano: 'vertical' });
    expect(vert.openingsArea).toBeCloseTo(1.2 / c, 6);
    expect(vert.volume).toBeCloseTo(2.4847 - (1.2 * 0.2) / c, 3);
    const inc = quant({ tilt: 15 }, { plano: 'inclinado' });
    expect(inc.openingsArea).toBeCloseTo(1.2, 6);
    expect(inc.volume).toBeCloseTo(2.4847 - 1.2 * 0.2, 3);
    expect(inc.netFaceArea).toBeCloseTo(12.4233 - 1.2, 3);
  });
});
