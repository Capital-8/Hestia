import { describe, expect, it } from 'vitest';
import { createEmptyProject, type Level, type PlanView } from '@hestia/model';
import { applyHestiaLevels } from './hestia.ts';

describe('applyHestiaLevels: PlanViewsJSON antigo (esquema 24, kind roof)', () => {
  const nivel: Level = { id: 'lv_0', name: 'Térreo', elevation: 0 };
  const antigo = [
    { id: 'pv_lv_0', name: 'Térreo', levelId: 'lv_0', kind: 'floor', viewRange: { top: 2, cut: 1.2, bottom: 0, depth: 0, direction: 'down' }, annotations: { dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] } },
    { id: 'pvr_lv_0', name: 'Térreo', levelId: 'lv_0', kind: 'roof', viewRange: { top: 2, cut: 1.2, bottom: 0, depth: 0, direction: 'down' }, annotations: { dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] } },
  ] as unknown as PlanView[];

  it('a cobertura vira planta de piso com showRoofOnTop (mesmo id) e o nível não ganha outra principal', () => {
    const p = createEmptyProject();
    applyHestiaLevels(p, [nivel], [{ id: 'lv_0', elevation: 0, storey: 'x' } as never], antigo);
    expect(p.planViews.map((v) => [v.id, v.kind, v.showRoofOnTop ?? false, v.name])).toEqual([
      ['pv_lv_0', 'floor', false, 'Térreo'],
      ['pvr_lv_0', 'floor', true, 'Cobertura: Térreo'],
    ]);
  });

  it('IFC sem PlanViewsJSON (níveis do esquema antigo) também sai sem kind roof', () => {
    const p = createEmptyProject();
    applyHestiaLevels(p, [{ ...nivel, viewRange: { top: 2, cut: 1.2, bottom: 0, depth: 0, direction: 'down' } } as unknown as Level], [{ id: 'lv_0', elevation: 0, storey: 'x' } as never]);
    expect(p.planViews.some((v) => (v.kind as string) === 'roof')).toBe(false);
    expect(p.planViews.filter((v) => v.showRoofOnTop)).toHaveLength(1);
  });
});
