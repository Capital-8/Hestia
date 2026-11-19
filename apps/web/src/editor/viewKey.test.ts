import { describe, expect, it } from 'vitest';
import { viewKeyOf } from './viewKey.ts';

const base = { view: 'plan' as const, levelId: 'lv_2', sectionId: null, planKind: 'floor' as const, areaPlanId: null };

describe('viewKeyOf', () => {
  it('planta de piso: id do nível', () => expect(viewKeyOf(base)).toBe('lv_2'));
  it('cobertura: roof:nível', () => expect(viewKeyOf({ ...base, planKind: 'roof' })).toBe('roof:lv_2'));
  it('planta de área: area:id, ou o nível sem id', () => {
    expect(viewKeyOf({ ...base, planKind: 'area', areaPlanId: 'ap_1' })).toBe('area:ap_1');
    expect(viewKeyOf({ ...base, planKind: 'area' })).toBe('area:lv_2');
  });
  it('corte: sec:id (ignora o nível)', () => expect(viewKeyOf({ ...base, view: 'section', sectionId: 'v9' })).toBe('sec:v9'));
});
