import { describe, expect, it } from 'vitest';
import { viewKeyOf } from './viewKey.ts';

const base = { view: 'plan' as const, levelId: 'lv_2', sectionId: null, planKind: 'floor' as const, areaPlanId: null };

// A chave da câmera passou a ser a canônica de `viewIdentity.ts` (decisão 0060, §3.2): antes era o id do nível cru no piso
// e `sec:<id>` no corte. A câmera vive só em memória (Map do controlador), então não há dado gravado para migrar.
describe('viewKeyOf (chave da câmera 2D)', () => {
  it('planta de piso: plan:nível', () => expect(viewKeyOf(base)).toBe('plan:lv_2'));
  it('cobertura: roof:nível', () => expect(viewKeyOf({ ...base, planKind: 'roof' })).toBe('roof:lv_2'));
  it('planta de área: area:id, ou o nível sem id', () => {
    expect(viewKeyOf({ ...base, planKind: 'area', areaPlanId: 'ap_1' })).toBe('area:ap_1');
    expect(viewKeyOf({ ...base, planKind: 'area' })).toBe('area:lv_2');
  });
  it('corte: section:id (ignora o nível)', () => expect(viewKeyOf({ ...base, view: 'section', sectionId: 'v9' })).toBe('section:v9'));
  it('planta de disciplina: pv:id; duas plantas do mesmo nível não compartilham câmera', () => {
    expect(viewKeyOf({ ...base, planViewId: 'pv_a' })).toBe('pv:pv_a');
    expect(viewKeyOf({ ...base, planViewId: 'pv_b' })).toBe('pv:pv_b');
    expect(viewKeyOf({ ...base, planViewId: null })).toBe('plan:lv_2');
  });
  it('planta de disciplina só vale no piso: cobertura e área ignoram o id', () => {
    expect(viewKeyOf({ ...base, planKind: 'roof', planViewId: 'pv_a' })).toBe('roof:lv_2');
    expect(viewKeyOf({ ...base, planKind: 'area', areaPlanId: 'ap_1', planViewId: 'pv_a' })).toBe('area:ap_1');
  });
});
