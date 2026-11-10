import { describe, expect, it } from 'vitest';
import { AREA_VIEW_TOOLS, DEFAULT_VIEW_RANGE, FLOOR_PROFILE_LAYERS, PLAN_VIEW_KINDS, toolAllowedInView, type PlanViewKind } from './index.ts';

const TODAS = ['select', 'wall', 'door', 'room', 'roomsep', 'tag', 'dimension', 'roof', 'paste', 'qualquer'];

describe('tabela por tipo de vista', () => {
  it('piso e cobertura aceitam todas as ferramentas (a cobertura não tem restrição hoje)', () => {
    for (const k of ['floor', 'roof'] as PlanViewKind[]) for (const id of TODAS) expect(toolAllowedInView(k, id)).toBe(true);
  });

  it('área: exatamente a lista atual', () => {
    for (const id of TODAS) expect(toolAllowedInView('area', id)).toBe(AREA_VIEW_TOOLS.includes(id));
    expect(toolAllowedInView('area', 'wall')).toBe(false);
    expect(toolAllowedInView('area', 'room')).toBe(true);
  });

  it('forro: todas menos ambiente e separação', () => {
    expect(toolAllowedInView('ceiling', 'room')).toBe(false);
    expect(toolAllowedInView('ceiling', 'roomsep')).toBe(false);
    expect(toolAllowedInView('ceiling', 'wall')).toBe(true);
    expect(toolAllowedInView('ceiling', 'tag')).toBe(true);
  });

  it('direção e intervalo padrão coerentes', () => {
    for (const k of Object.keys(PLAN_VIEW_KINDS) as PlanViewKind[]) expect(PLAN_VIEW_KINDS[k].defaultRange.direction).toBe(PLAN_VIEW_KINDS[k].direction);
    expect(PLAN_VIEW_KINDS.floor.defaultRange).toBe(DEFAULT_VIEW_RANGE);
    expect(PLAN_VIEW_KINDS.floor.defaultLayers).toBe(FLOOR_PROFILE_LAYERS);
    expect(PLAN_VIEW_KINDS.ceiling.direction).toBe('up');
  });
});
