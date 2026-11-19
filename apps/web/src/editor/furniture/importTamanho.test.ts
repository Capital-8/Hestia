import { describe, expect, it } from 'vitest';
import { buildAssetFromModel, initialMaterialEdits, orientDims, scaleForTarget, summarizeModel, UNIT_FACTOR, upCorrection } from './importModel.ts';
import { boxModel } from './testFixtures.ts';

// boxModel: 0,8 x 0,4 x 0,5 m (X x Y x Z), glb.
const opts = (m = boxModel(), extra = {}) => ({ name: 'M', factor: 1, materials: initialMaterialEdits(m), ...extra });

describe('tamanho real e eixo no importador', () => {
  it('unidades: pé = 0,3048 m; cm = 0,01 m; mm = 0,001 m', () => {
    expect(UNIT_FACTOR.ft).toBe(0.3048);
    expect(summarizeModel(boxModel(), UNIT_FACTOR.ft).dims[0]).toBeCloseTo(0.24384, 6);
    expect(summarizeModel(boxModel(), UNIT_FACTOR.cm).dims[2]).toBeCloseTo(0.005, 6);
    expect(summarizeModel(boxModel(), UNIT_FACTOR.mm).dims[1]).toBeCloseTo(0.0004, 7);
  });

  it('altura final 0,25 m com proporção: multiplicador 0,5 nos três eixos; sem proporção só em Z', () => {
    expect(scaleForTarget([0.8, 0.4, 0.5], 2, 0.25, true)).toEqual([0.5, 0.5, 0.5]);
    expect(scaleForTarget([0.8, 0.4, 0.5], 2, 0.25, false)).toEqual([1, 1, 0.5]);
    // valor inválido não muda nada
    expect(scaleForTarget([0.8, 0.4, 0.5], 2, 0, true, [2, 2, 2])).toEqual([2, 2, 2]);
  });

  it('asset com a altura digitada: caixa 0,4 x 0,2 x 0,25 (proporção) e 0,8 x 0,4 x 0,25 (só Z)', () => {
    const m = boxModel();
    const a = buildAssetFromModel(m, opts(m, { axisScale: [0.5, 0.5, 0.5] }));
    expect([0, 1, 2].map((k) => a.bbox.max[k]! - a.bbox.min[k]!)).toEqual([expect.closeTo(0.4, 6), expect.closeTo(0.2, 6), expect.closeTo(0.25, 6)]);
    const b = buildAssetFromModel(m, opts(m, { axisScale: [1, 1, 0.5] }));
    expect([0, 1, 2].map((k) => b.bbox.max[k]! - b.bbox.min[k]!)).toEqual([expect.closeTo(0.8, 6), expect.closeTo(0.4, 6), expect.closeTo(0.25, 6)]);
    // o modelo lido não muda
    expect(m.defs[0]!.positions[3]).toBeCloseTo(0.8, 6);
  });

  it('eixo "para cima": glb já vem como Y (padrão); escolher Z troca Y por Z nas dimensões e no asset', () => {
    expect(upCorrection('glb', 'auto')).toBeNull();
    expect(upCorrection('glb', 'y')).toBeNull();
    expect(upCorrection('glb', 'z')).not.toBeNull();
    expect(upCorrection('skp', 'z')).toBeNull();
    expect(orientDims([0.8, 0.4, 0.5], 'glb', 'z')).toEqual([0.8, 0.5, 0.4]);
    expect(summarizeModel(boxModel(), 1, 'z').dims).toEqual([expect.closeTo(0.8, 6), expect.closeTo(0.5, 6), expect.closeTo(0.4, 6)]);
    const m = boxModel();
    const a = buildAssetFromModel(m, opts(m, { up: 'z' }));
    expect([0, 1, 2].map((k) => a.bbox.max[k]! - a.bbox.min[k]!)).toEqual([expect.closeTo(0.8, 6), expect.closeTo(0.5, 6), expect.closeTo(0.4, 6)]);
    expect(a.bbox.min[2]).toBeCloseTo(0, 6);
  });
});
