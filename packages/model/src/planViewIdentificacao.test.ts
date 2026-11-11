import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  DEFAULT_AREA_GRAPHICS,
  emptyTitleBlock,
  floorViewId,
  hiddenTargetOfView,
  migrateProject,
  normalizeSheetViewSource,
  normalizeViewHiddenTarget,
  planViewHiddenOf,
  ProjectStore,
  roofViewId,
  sheetPlanViewId,
  viewSourceIssue,
  type AreaPlan,
  type Project,
  type Sheet,
  type SheetViewport,
  type SheetViewSource,
} from './index.ts';

/**
 * Fase 2b: a vista de planta é identificada por `viewId` em `ViewHiddenTarget` e `SheetViewSource`. As formas
 * antigas (`{plan, levelId}`, `{roof, levelId}`, `{area, planId}`, `{areaPlan, planId}`) continuam aceitas na entrada
 * (comando e arquivo) e são normalizadas para a nova.
 */
const LV0 = 'lv_0';
const area = (id: string): AreaPlan => ({ id, name: `Área ${id}`, levelId: LV0, scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault } }, tags: [] });
const folha = (): Sheet => ({ id: 'sh1', number: 'A-01', name: 'Plantas', size: 'A3', orientation: 'landscape', margin: 10, titleBlock: emptyTitleBlock(), viewports: [] });
const vp = (id: string, view: SheetViewSource): SheetViewport => ({ id, view, at: { x: 20, y: 20 }, size: { w: 100, h: 80 }, scale: 100 });

function montar(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addAreaPlan', plan: area('ap1') });
  s.exec({ type: 'addSheet', sheet: folha() });
  return s;
}

describe('ViewHiddenTarget por viewId', () => {
  it('a forma antiga normaliza para { plan, viewId }', () => {
    expect(normalizeViewHiddenTarget({ kind: 'plan', levelId: LV0 })).toEqual({ kind: 'plan', viewId: floorViewId(LV0) });
    expect(normalizeViewHiddenTarget({ kind: 'roof', levelId: LV0 })).toEqual({ kind: 'plan', viewId: roofViewId(LV0) });
    expect(normalizeViewHiddenTarget({ kind: 'area', planId: 'ap1' })).toEqual({ kind: 'plan', viewId: 'ap1' });
    expect(normalizeViewHiddenTarget({ kind: 'plan', viewId: 'ap1' })).toEqual({ kind: 'plan', viewId: 'ap1' });
    expect(normalizeViewHiddenTarget({ kind: '3d' })).toEqual({ kind: '3d' });
    expect(normalizeViewHiddenTarget({ kind: 'section', viewId: 's1' })).toEqual({ kind: 'section', viewId: 's1' });
  });

  it('hiddenTargetOfView devolve a forma nova', () => {
    const p = montar().project;
    expect(hiddenTargetOfView(p, floorViewId(LV0))).toEqual({ kind: 'plan', viewId: floorViewId(LV0) });
    expect(hiddenTargetOfView(p, roofViewId(LV0))).toEqual({ kind: 'plan', viewId: roofViewId(LV0) });
    expect(hiddenTargetOfView(p, 'ap1')).toEqual({ kind: 'plan', viewId: 'ap1' });
    expect(() => hiddenTargetOfView(p, 'nao_existe')).toThrow();
  });

  it('setViewHidden: forma nova e forma antiga gravam o mesmo resultado, com undo', () => {
    const novo = montar();
    const antigo = montar();
    novo.exec({ type: 'batch', commands: [
      { type: 'setViewHidden', target: { kind: 'plan', viewId: floorViewId(LV0) }, hidden: { elements: ['a'] } },
      { type: 'setViewHidden', target: { kind: 'plan', viewId: roofViewId(LV0) }, hidden: { elements: ['b'] } },
      { type: 'setViewHidden', target: { kind: 'plan', viewId: 'ap1' }, hidden: { categories: ['door'] } },
    ] });
    antigo.exec({ type: 'batch', commands: [
      { type: 'setViewHidden', target: { kind: 'plan', levelId: LV0 }, hidden: { elements: ['a'] } },
      { type: 'setViewHidden', target: { kind: 'roof', levelId: LV0 }, hidden: { elements: ['b'] } },
      { type: 'setViewHidden', target: { kind: 'area', planId: 'ap1' }, hidden: { categories: ['door'] } },
    ] });
    expect(JSON.stringify(novo.project)).toBe(JSON.stringify(antigo.project));
    expect(planViewHiddenOf(novo.project, roofViewId(LV0))?.elements).toEqual(['b']);
    novo.undo();
    expect(novo.project.planViews.find((v) => v.id === floorViewId(LV0))!.hidden).toBeUndefined();
  });

  it('vista inexistente é recusada, na forma nova e na antiga', () => {
    const s = montar();
    expect(() => s.exec({ type: 'setViewHidden', target: { kind: 'plan', viewId: 'nada' }, hidden: { elements: ['a'] } })).toThrow();
    expect(() => s.exec({ type: 'setViewHidden', target: { kind: 'plan', levelId: 'nada' }, hidden: { elements: ['a'] } })).toThrow(/nível/i);
    expect(() => s.exec({ type: 'setViewHidden', target: { kind: 'area', planId: 'nada' }, hidden: { elements: ['a'] } })).toThrow(/área/i);
  });
});

describe('SheetViewSource por viewId', () => {
  it('a forma antiga normaliza para { plan, viewId }', () => {
    expect(normalizeSheetViewSource({ kind: 'plan', levelId: LV0 })).toEqual({ kind: 'plan', viewId: floorViewId(LV0) });
    expect(normalizeSheetViewSource({ kind: 'areaPlan', planId: 'ap1' })).toEqual({ kind: 'plan', viewId: 'ap1' });
    expect(normalizeSheetViewSource({ kind: 'plan', viewId: roofViewId(LV0) })).toEqual({ kind: 'plan', viewId: roofViewId(LV0) });
    expect(normalizeSheetViewSource({ kind: 'areaTable' })).toEqual({ kind: 'areaTable' });
    expect(normalizeSheetViewSource({ kind: 'section', sectionId: 's' })).toEqual({ kind: 'section', sectionId: 's' });
  });

  it('sheetPlanViewId lê as duas formas', () => {
    expect(sheetPlanViewId({ kind: 'plan', levelId: LV0 })).toBe(floorViewId(LV0));
    expect(sheetPlanViewId({ kind: 'areaPlan', planId: 'ap1' })).toBe('ap1');
    expect(sheetPlanViewId({ kind: 'plan', viewId: 'ap1' })).toBe('ap1');
    expect(sheetPlanViewId({ kind: '3d' })).toBeNull();
  });

  it('addViewport guarda sempre a forma nova, venha a entrada como vier', () => {
    const s = montar();
    s.exec({ type: 'addViewport', sheetId: 'sh1', viewport: vp('v1', { kind: 'plan', levelId: LV0 }) });
    s.exec({ type: 'addViewport', sheetId: 'sh1', viewport: vp('v2', { kind: 'areaPlan', planId: 'ap1' }) });
    s.exec({ type: 'addViewport', sheetId: 'sh1', viewport: vp('v3', { kind: 'plan', viewId: 'ap1' }) });
    const vs = s.project.sheets![0]!.viewports;
    expect(vs.map((v) => v.view)).toEqual([{ kind: 'plan', viewId: floorViewId(LV0) }, { kind: 'plan', viewId: 'ap1' }, { kind: 'plan', viewId: 'ap1' }]);
    s.exec({ type: 'updateViewport', sheetId: 'sh1', id: 'v1', patch: { view: { kind: 'areaPlan', planId: 'ap1' } } });
    expect(s.project.sheets![0]!.viewports[0]!.view).toEqual({ kind: 'plan', viewId: 'ap1' });
  });

  it('addSheet com vistas na forma antiga também normaliza', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addSheet', sheet: { ...folha(), viewports: [vp('v1', { kind: 'plan', levelId: LV0 })] } });
    expect(s.project.sheets![0]!.viewports[0]!.view).toEqual({ kind: 'plan', viewId: floorViewId(LV0) });
  });

  it('recusa fonte inexistente (mensagens antigas para a forma antiga)', () => {
    const p = montar().project;
    expect(viewSourceIssue(p, { kind: 'plan', levelId: 'nada' })).toMatch(/nível/i);
    expect(viewSourceIssue(p, { kind: 'areaPlan', planId: 'nada' })).toMatch(/área/i);
    expect(viewSourceIssue(p, { kind: 'plan', viewId: 'nada' })).not.toBeNull();
    expect(viewSourceIssue(p, { kind: 'plan', viewId: 'ap1' })).toBeNull();
    expect(viewSourceIssue(p, { kind: 'plan', viewId: roofViewId(LV0) })).toBeNull();
  });

  it('remover a planta de área remove a viewport que a usa (forma nova)', () => {
    const s = montar();
    s.exec({ type: 'addViewport', sheetId: 'sh1', viewport: vp('v2', { kind: 'areaPlan', planId: 'ap1' }) });
    s.exec({ type: 'removeAreaPlan', id: 'ap1' });
    expect(s.project.sheets![0]!.viewports).toEqual([]);
  });
});

describe('arquivo: viewports na forma antiga', () => {
  const comPrancha = (v: number): Record<string, unknown> => {
    const p = JSON.parse(JSON.stringify(createEmptyProject())) as Record<string, unknown>;
    p.schemaVersion = v;
    p.sheets = [{ ...folha(), viewports: [vp('v1', { kind: 'plan', levelId: LV0 }), vp('v2', { kind: 'areaPlan', planId: 'ap1' }), vp('v3', { kind: 'areaTable' })] }];
    return p;
  };

  it('migrateProject normaliza as viewports de um arquivo v24 com a forma antiga', () => {
    const p = migrateProject(comPrancha(24)) as Project;
    expect(p.sheets![0]!.viewports.map((v) => v.view)).toEqual([{ kind: 'plan', viewId: floorViewId(LV0) }, { kind: 'plan', viewId: 'ap1' }, { kind: 'areaTable' }]);
  });

  it('é idempotente: migrar o já migrado dá o mesmo texto', () => {
    const a = migrateProject(comPrancha(24));
    const b = migrateProject(JSON.parse(JSON.stringify(a)));
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});
