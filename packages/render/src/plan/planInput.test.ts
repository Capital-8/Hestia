import { describe, expect, it } from 'vitest';
import { createEmptyProject, roofViewId } from '@hestia/model';
import { resolvePlanTarget } from './planInput.ts';

describe('resolvePlanTarget', () => {
  const p = createEmptyProject();
  it('viewId inexistente com levelId cai na planta de piso do nível', () => {
    expect(resolvePlanTarget(p, { viewId: 'nada', levelId: 'lv_0' })).toEqual({ viewId: 'pv_lv_0', levelId: 'lv_0', roofPlanMode: false });
  });
  it('viewId inexistente sem levelId é erro', () => {
    expect(() => resolvePlanTarget(p, { viewId: 'nada' })).toThrow();
  });
  it('cobertura por viewId liga o modo cobertura', () => {
    const novo = resolvePlanTarget(p, { viewId: roofViewId('lv_0') });
    expect(novo).toEqual({ viewId: 'pvr_lv_0', levelId: 'lv_0', roofPlanMode: true });
  });
});
