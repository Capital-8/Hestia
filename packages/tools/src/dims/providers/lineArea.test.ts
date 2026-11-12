import { describe, expect, it } from 'vitest';
import { createEmptyProject, DEFAULT_AREA_GRAPHICS, dimensionSettingsOf, floorViewId, ProjectStore, roofViewId, viewAnnotationsOf, type AreaPlan } from '@hestia/model';
import { detailLineDimProvider } from './line.ts';
import type { DimContext } from '../types.ts';

const AREA: AreaPlan = { id: 'ap1', name: 'A', levelId: 'lv_0', scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS }, tags: [], annotations: { dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] } };

function comArea(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addAreaPlan', plan: AREA });
  return s;
}

const ctxOf = (s: ProjectStore): DimContext => ({ project: s.project, levelId: 'lv_0', settings: dimensionSettingsOf(s.project), overrides: {} });
const linha = (s: ProjectStore, viewId: string, id: string, ay: number, by = ay): void =>
  s.exec({ type: 'addDetailLine', levelId: 'lv_0', viewId, item: { id, a: { x: 0, y: ay }, b: { x: 3, y: by } } });

describe('linha de detalhe da planta de área', () => {
  it('é achada na vista de área, a edição leva o viewId da área e as outras vistas não são tocadas', () => {
    const s = comArea();
    linha(s, floorViewId('lv_0'), 'dlp', 5);
    linha(s, 'ap1', 'dla', 0);
    expect(detailLineDimProvider.selectionSubject!(s.project, 'dla', 'lv_0')).toEqual({ lineId: 'dla' });
    const [dim] = detailLineDimProvider.compute(ctxOf(s), { lineId: 'dla' });
    expect(dim?.value).toBeCloseTo(3, 9);
    const r = dim!.edit!(5);
    if (!('commands' in r)) throw new Error('sem comandos');
    expect(r.commands[0]).toMatchObject({ type: 'updateDetailLine', levelId: 'lv_0', viewId: 'ap1', id: 'dla' });
    s.exec(r.commands[0]!);
    expect(viewAnnotationsOf(s.project, 'ap1').detailLines[0]!.b).toEqual({ x: 5, y: 0 });
    expect(viewAnnotationsOf(s.project, floorViewId('lv_0')).detailLines[0]!.b).toEqual({ x: 3, y: 5 });
  });

  it('a cota lateral só considera as paralelas da própria planta de área', () => {
    const s = comArea();
    linha(s, 'ap1', 'a1', 0);
    linha(s, 'ap1', 'a2', 2);
    linha(s, floorViewId('lv_0'), 'p1', 1);
    linha(s, roofViewId('lv_0'), 'c1', 1.5);
    const dims = detailLineDimProvider.compute(ctxOf(s), { lineId: 'a1' });
    expect(dims.map((d) => [d.key.split(':')[2], d.value])).toEqual([['right', 2]]);
    // Editar a distância translada a linha na própria vista de área.
    const r = dims[0]!.edit!(4);
    if (!('commands' in r)) throw new Error('sem comandos');
    expect(r.commands[0]).toMatchObject({ type: 'updateDetailLine', viewId: 'ap1', id: 'a1' });
  });

  it('linha só de outro nível não é sujeito', () => {
    const s = comArea();
    linha(s, 'ap1', 'a1', 0);
    expect(detailLineDimProvider.selectionSubject!(s.project, 'a1', 'lv_1')).toBeNull();
  });
});
