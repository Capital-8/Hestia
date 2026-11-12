import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AREA_GRAPHICS,
  emptyTitleBlock,
  floorViewId,
  hiddenTargetOfView,
  planViewHiddenOf,
  ProjectStore,
  projetoComCoberturaDeTeste,
  legacyRoofViewId as roofViewId,
  sheetPlanViewId,
  viewSourceIssue,
  type AreaPlan,
  type Sheet,
  type SheetViewport,
  type SheetViewSource,
} from './index.ts';

/**
 * A vista de planta é identificada por `viewId` em `ViewHiddenTarget` e `SheetViewSource` (forma única). A leitura das
 * formas antigas de ARQUIVO está em `migrateSheetSources.test.ts`.
 */
const LV0 = 'lv_0';
const area = (id: string): AreaPlan => ({ id, name: `Área ${id}`, levelId: LV0, scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault } }, tags: [] });
const folha = (): Sheet => ({ id: 'sh1', number: 'A-01', name: 'Plantas', size: 'A3', orientation: 'landscape', margin: 10, titleBlock: emptyTitleBlock(), viewports: [] });
const vp = (id: string, view: SheetViewSource): SheetViewport => ({ id, view, at: { x: 20, y: 20 }, size: { w: 100, h: 80 }, scale: 100 });

function montar(): ProjectStore {
  const s = new ProjectStore(projetoComCoberturaDeTeste());
  s.exec({ type: 'addAreaPlan', plan: area('ap1') });
  s.exec({ type: 'addSheet', sheet: folha() });
  return s;
}

describe('ViewHiddenTarget por viewId', () => {
  it('hiddenTargetOfView devolve a forma única', () => {
    const p = montar().project;
    expect(hiddenTargetOfView(p, floorViewId(LV0))).toEqual({ kind: 'plan', viewId: floorViewId(LV0) });
    expect(hiddenTargetOfView(p, roofViewId(LV0))).toEqual({ kind: 'plan', viewId: roofViewId(LV0) });
    expect(hiddenTargetOfView(p, 'ap1')).toEqual({ kind: 'plan', viewId: 'ap1' });
    expect(() => hiddenTargetOfView(p, 'nao_existe')).toThrow();
  });

  it('setViewHidden grava na vista de piso, de cobertura e de área, com undo', () => {
    const s = montar();
    s.exec({ type: 'batch', commands: [
      { type: 'setViewHidden', target: { kind: 'plan', viewId: floorViewId(LV0) }, hidden: { elements: ['a'] } },
      { type: 'setViewHidden', target: { kind: 'plan', viewId: roofViewId(LV0) }, hidden: { elements: ['b'] } },
      { type: 'setViewHidden', target: { kind: 'plan', viewId: 'ap1' }, hidden: { categories: ['door'] } },
    ] });
    expect(planViewHiddenOf(s.project, floorViewId(LV0))?.elements).toEqual(['a']);
    expect(planViewHiddenOf(s.project, roofViewId(LV0))?.elements).toEqual(['b']);
    expect(planViewHiddenOf(s.project, 'ap1')?.categories).toEqual(['door']);
    s.undo();
    expect(s.project.planViews.find((v) => v.id === floorViewId(LV0))!.hidden).toBeUndefined();
  });

  it('vista inexistente é recusada', () => {
    const s = montar();
    expect(() => s.exec({ type: 'setViewHidden', target: { kind: 'plan', viewId: 'nada' }, hidden: { elements: ['a'] } })).toThrow();
  });
});

describe('SheetViewSource por viewId', () => {
  it('sheetPlanViewId lê a vista de planta; quadro de áreas, corte e 3D não têm', () => {
    expect(sheetPlanViewId({ kind: 'plan', viewId: floorViewId(LV0) })).toBe(floorViewId(LV0));
    expect(sheetPlanViewId({ kind: 'plan', viewId: 'ap1' })).toBe('ap1');
    expect(sheetPlanViewId({ kind: 'areaTable' })).toBeNull();
    expect(sheetPlanViewId({ kind: '3d' })).toBeNull();
  });

  it('addViewport e updateViewport guardam a fonte por viewId', () => {
    const s = montar();
    s.exec({ type: 'addViewport', sheetId: 'sh1', viewport: vp('v1', { kind: 'plan', viewId: floorViewId(LV0) }) });
    s.exec({ type: 'addViewport', sheetId: 'sh1', viewport: vp('v2', { kind: 'plan', viewId: 'ap1' }) });
    const vs = s.project.sheets![0]!.viewports;
    expect(vs.map((v) => v.view)).toEqual([{ kind: 'plan', viewId: floorViewId(LV0) }, { kind: 'plan', viewId: 'ap1' }]);
    s.exec({ type: 'updateViewport', sheetId: 'sh1', id: 'v1', patch: { view: { kind: 'plan', viewId: 'ap1' } } });
    expect(s.project.sheets![0]!.viewports[0]!.view).toEqual({ kind: 'plan', viewId: 'ap1' });
  });

  it('recusa fonte inexistente', () => {
    const p = montar().project;
    expect(viewSourceIssue(p, { kind: 'plan', viewId: 'nada' })).not.toBeNull();
    expect(viewSourceIssue(p, { kind: 'plan', viewId: 'ap1' })).toBeNull();
    // A cobertura migrada é planta de piso comum: passa a ser fonte válida.
    expect(viewSourceIssue(p, { kind: 'plan', viewId: roofViewId(LV0) })).toBeNull();
  });

  it('cobertura migrada (planta de piso) é fonte de prancha como o piso; forro segue recusado', () => {
    const s = montar();
    s.exec({ type: 'addViewport', sheetId: 'sh1', viewport: vp('vr', { kind: 'plan', viewId: roofViewId(LV0) }) });
    s.exec({ type: 'removeViewport', sheetId: 'sh1', id: 'vr' });
    s.exec({ type: 'addViewport', sheetId: 'sh1', viewport: vp('vf', { kind: 'plan', viewId: floorViewId(LV0) }) });
    s.exec({ type: 'addViewport', sheetId: 'sh1', viewport: vp('va', { kind: 'plan', viewId: 'ap1' }) });
    s.exec({ type: 'addPlanView', view: { id: 'pvc_forro', kind: 'ceiling', levelId: LV0, name: 'Forro' } });
    expect(() => s.exec({ type: 'updateViewport', sheetId: 'sh1', id: 'vf', patch: { view: { kind: 'plan', viewId: 'pvc_forro' } } })).toThrow();
    expect(s.project.sheets![0]!.viewports).toHaveLength(2);
  });

  it('remover a planta de área remove a viewport que a usa', () => {
    const s = montar();
    s.exec({ type: 'addViewport', sheetId: 'sh1', viewport: vp('v2', { kind: 'plan', viewId: 'ap1' }) });
    s.exec({ type: 'removeAreaPlan', id: 'ap1' });
    expect(s.project.sheets![0]!.viewports).toEqual([]);
  });
});
