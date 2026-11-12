import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEW_GRAPHICS, DEFAULT_VIEW_RANGE, ProjectStore, createEmptyProject, floorViewId, planViewRangeOf, roofViewId, viewGraphicsOf } from '@hestia/model';
import { editThinLines, editViewGraphics, restoreViewGraphicsDefault, thinLinesOn } from './graphicsActions.ts';
import { editPlanViewRange, restorePlanViewRangeDefault } from './viewRangeActions.ts';
import { resolveText } from './i18n.ts';

const piso = floorViewId('lv_0');
const cobertura = roofViewId('lv_0');

function store(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  expect(s.project.planViews.some((v) => v.id === cobertura)).toBe(true);
  return s;
}

describe('gráficos por vista: piso e cobertura do mesmo nível são independentes', () => {
  it('ocultar a categoria Parede na cobertura não altera o piso', () => {
    const s = store();
    expect(editViewGraphics(s, cobertura, { overrides: { wall: { visible: false } } })).toEqual({ ok: true, error: null });
    expect(viewGraphicsOf(s.project, cobertura).overrides.wall.visible).toBe(false);
    expect(viewGraphicsOf(s.project, piso)).toEqual(DEFAULT_VIEW_GRAPHICS);
    expect(s.project.planViews.find((v) => v.id === piso)!.graphics).toBeUndefined();
  });

  it('e o inverso: ocultar no piso não altera a cobertura', () => {
    const s = store();
    editViewGraphics(s, piso, { overrides: { wall: { visible: false } } });
    expect(viewGraphicsOf(s.project, piso).overrides.wall.visible).toBe(false);
    expect(viewGraphicsOf(s.project, cobertura)).toEqual(DEFAULT_VIEW_GRAPHICS);
  });

  it('restaurar o padrão de uma vista não mexe na outra', () => {
    const s = store();
    editViewGraphics(s, piso, { overrides: { wall: { visible: false } } });
    editViewGraphics(s, cobertura, { overrides: { wall: { visible: false } }, scale: 50 });
    expect(restoreViewGraphicsDefault(s, cobertura)).toEqual({ ok: true, error: null });
    expect(viewGraphicsOf(s.project, cobertura)).toEqual(DEFAULT_VIEW_GRAPHICS);
    expect(viewGraphicsOf(s.project, piso).overrides.wall.visible).toBe(false);
    // Sem nada guardado, restaurar não cria passo de desfazer.
    const label = s.undoLabel;
    expect(restoreViewGraphicsDefault(s, cobertura).ok).toBe(true);
    expect(s.undoLabel).toBe(label);
  });

  it('desfazer e refazer valem só para a vista editada e usam os rótulos atuais', () => {
    const s = store();
    editViewGraphics(s, cobertura, { overrides: { wall: { visible: false } } });
    expect(resolveText(s.undoLabel!, 'pt')).toBe('Alterar gráficos da vista');
    s.undo();
    expect(viewGraphicsOf(s.project, cobertura)).toEqual(DEFAULT_VIEW_GRAPHICS);
    s.redo();
    expect(viewGraphicsOf(s.project, cobertura).overrides.wall.visible).toBe(false);
    expect(viewGraphicsOf(s.project, piso)).toEqual(DEFAULT_VIEW_GRAPHICS);
    restoreViewGraphicsDefault(s, cobertura);
    expect(resolveText(s.undoLabel!, 'pt')).toBe('Restaurar gráficos da vista');
    s.undo();
    expect(viewGraphicsOf(s.project, cobertura).overrides.wall.visible).toBe(false);
    s.redo();
    expect(viewGraphicsOf(s.project, cobertura)).toEqual(DEFAULT_VIEW_GRAPHICS);
  });

  it('vista inexistente é recusada e nada é gravado', () => {
    const s = store();
    expect(editViewGraphics(s, 'pvr_nao_existe', { scale: 50 }).ok).toBe(false);
    expect(restoreViewGraphicsDefault(s, 'pvr_nao_existe').ok).toBe(false);
  });

  it('linhas finas também são por vista', () => {
    const s = store();
    editThinLines(s, { viewId: cobertura }, false);
    expect(thinLinesOn(s.project, { viewId: cobertura })).toBe(false);
    expect(thinLinesOn(s.project, { viewId: piso })).toBe(true);
  });
});

describe('intervalo de vista por vista (piso não propaga à planta de área nem à cobertura)', () => {
  it('editar o piso não altera a planta de área do nível; restaurar idem; desfazer/refazer', () => {
    const s = store();
    s.exec({ type: 'addAreaPlan', plan: { id: 'ap_1', name: 'Área', levelId: 'lv_0', scale: 100, graphics: { ...DEFAULT_VIEW_GRAPHICS } as never, tags: [] } as never });
    const area = 'ap_1';
    expect(editPlanViewRange(s, piso, { cut: 1.1 })).toEqual({ ok: true, error: null });
    expect(planViewRangeOf(s.project, piso).cut).toBe(1.1);
    expect(planViewRangeOf(s.project, area)).toEqual(DEFAULT_VIEW_RANGE);
    expect(resolveText(s.undoLabel!, 'pt')).toBe('Alterar intervalo de vista');
    editPlanViewRange(s, area, { cut: 1.0 });
    expect(restorePlanViewRangeDefault(s, piso).ok).toBe(true);
    expect(planViewRangeOf(s.project, piso)).toEqual(DEFAULT_VIEW_RANGE);
    expect(planViewRangeOf(s.project, area).cut).toBe(1.0);
    s.undo();
    expect(planViewRangeOf(s.project, piso).cut).toBe(1.1);
    s.redo();
    expect(planViewRangeOf(s.project, piso)).toEqual(DEFAULT_VIEW_RANGE);
  });

  it('a cobertura não tem intervalo: a edição é recusada com a mensagem do comando', () => {
    const s = store();
    const r = editPlanViewRange(s, cobertura, { cut: 1.1 });
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});
