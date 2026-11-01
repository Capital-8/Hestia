import { describe, expect, it } from 'vitest';
import type { StairRunStyle } from '@hestia/model';
import { fieldLabelOverride, isStairFieldVisible, visibleStairFields, type StairFormField } from './stairFieldVisibility.ts';

const STYLES: readonly StairRunStyle[] = ['monolithic', 'assembled', 'post'];

/** Tabela §8: [monolítica, montada, poste]. */
const TABLE: Record<StairFormField, readonly [boolean, boolean, boolean]> = {
  maxRiser: [true, true, true],
  minRiser: [true, true, true],
  minTread: [true, true, true],
  minRunWidth: [true, true, true],
  minHeadroom: [true, true, true],
  nosing: [true, true, false],
  preset: [true, true, true],
  calcRiserFactor: [true, true, true],
  calcTreadFactor: [true, true, true],
  calcTarget: [true, true, true],
  calcMin: [true, true, true],
  calcMax: [true, true, true],
  maxTread: [true, true, true],
  materialId: [true, true, true],
  postMaterialId: [false, false, true],
  structuralDepth: [true, false, false],
  undersideStyle: [true, false, false],
  treadThickness: [false, true, true],
  riserThickness: [false, true, false],
  treadOverlap: [false, false, true],
  landingThickness: [false, true, false],
  cost: [true, true, true],
};

describe('visibilidade dos campos por estilo', () => {
  it('reproduz a matriz da especificação', () => {
    for (const style of STYLES) {
      for (const [field, row] of Object.entries(TABLE) as [StairFormField, readonly [boolean, boolean, boolean]][]) {
        const expected = row[STYLES.indexOf(style)]!;
        expect(isStairFieldVisible(style, field), `${style}/${field}`).toBe(expected);
      }
    }
  });

  it('poste não mostra nariz, espessura estrutural, face inferior, espessura do espelho nem patamar', () => {
    const fields = visibleStairFields('post');
    for (const hidden of ['nosing', 'structuralDepth', 'riserThickness', 'landingThickness', 'undersideStyle'] as const) {
      expect(fields).not.toContain(hidden);
    }
    expect(fields).toContain('treadOverlap');
    expect(fields).toContain('postMaterialId');
  });

  it('monolítica não mostra espessura do piso, sobreposição nem material do poste', () => {
    const fields = visibleStairFields('monolithic');
    for (const hidden of ['treadThickness', 'treadOverlap', 'postMaterialId'] as const) {
      expect(fields).not.toContain(hidden);
    }
  });
});

describe('rótulos por estilo', () => {
  it('material, piso mínimo e espessura do degrau mudam de nome', () => {
    expect(fieldLabelOverride('post', 'minTread')).toBe('stt_f_minTread_walk');
    expect(fieldLabelOverride('monolithic', 'materialId')).toBe('stt_f_material_lance');
    expect(fieldLabelOverride('assembled', 'materialId')).toBe('stt_f_material_pisos');
    expect(fieldLabelOverride('post', 'materialId')).toBe('stt_f_material_degraus');
    expect(fieldLabelOverride('post', 'treadThickness')).toBe('stt_f_treadThickness_post');
    expect(fieldLabelOverride('monolithic', 'maxRiser')).toBeNull();
  });
});
