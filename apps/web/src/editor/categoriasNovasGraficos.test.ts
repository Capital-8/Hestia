import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, planGraphicsOf, view3dOf, type GraphicsCategory } from '@hestia/model';
import { editor } from './controller.ts';
import { editPlanGraphics, editView3D } from './graphicsActions.ts';

/** Nove categorias novas (adendo 2 do ADR 0060), escritas à mão. */
const NOVAS: readonly GraphicsCategory[] = ['column', 'beam', 'footing', 'ceiling', 'ramp', 'component', 'plumbingFixture', 'electricalFixture', 'mechanicalEquipment'];

const patch = (c: GraphicsCategory, visible: boolean): { overrides: Partial<Record<GraphicsCategory, { visible: boolean }>> } => ({ overrides: { [c]: { visible } } });

beforeEach(() => {
  editor.load(createEmptyProject(), 'categorias.hestia.json');
  editor.store.exec({ type: 'addPlanView', plan: { id: 'pv_est', levelId: 'lv_0', discipline: 'estrutura', name: 'Térreo - Estrutura' } });
});

describe('marcar e desmarcar cada categoria nova (etapa 4.5d)', () => {
  it.each(NOVAS)('%s: planta padrão grava visible:false e volta a true', (c) => {
    expect(editPlanGraphics(editor.store, { levelId: 'lv_0' }, patch(c, false)).error).toBeNull();
    expect(planGraphicsOf(editor.project, 'lv_0').overrides[c].visible).toBe(false);
    expect(editPlanGraphics(editor.store, { levelId: 'lv_0' }, patch(c, true)).error).toBeNull();
    expect(planGraphicsOf(editor.project, 'lv_0').overrides[c].visible).toBe(true);
  });

  it.each(NOVAS)('%s: planta de disciplina grava na própria cópia, sem tocar na padrão', (c) => {
    expect(editPlanGraphics(editor.store, { levelId: 'lv_0', planId: 'pv_est' }, patch(c, false)).error).toBeNull();
    expect(planGraphicsOf(editor.project, 'lv_0', 'pv_est').overrides[c].visible).toBe(false);
    expect(planGraphicsOf(editor.project, 'lv_0').overrides[c].visible).toBe(true);
    expect(editPlanGraphics(editor.store, { levelId: 'lv_0', planId: 'pv_est' }, patch(c, true)).error).toBeNull();
    expect(planGraphicsOf(editor.project, 'lv_0', 'pv_est').overrides[c].visible).toBe(true);
  });

  it.each(NOVAS)('%s: 3D grava visible:false e volta a true', (c) => {
    expect(editView3D(editor.store, patch(c, false)).error).toBeNull();
    expect(view3dOf(editor.project).overrides[c].visible).toBe(false);
    expect(editView3D(editor.store, patch(c, true)).error).toBeNull();
    expect(view3dOf(editor.project).overrides[c].visible).toBe(true);
  });

  it('desmarcar um pilar não desmarca viga, sapata nem parede', () => {
    expect(editPlanGraphics(editor.store, { levelId: 'lv_0' }, patch('column', false)).error).toBeNull();
    const g = planGraphicsOf(editor.project, 'lv_0');
    expect(g.overrides.column.visible).toBe(false);
    expect(g.overrides.beam.visible).toBe(true);
    expect(g.overrides.footing.visible).toBe(true);
    expect(g.overrides.wall.visible).toBe(true);
  });
});
