import { beforeEach, describe, expect, it } from 'vitest';
import { fieldsOfView, paneViewFieldsNow, pickViewFields, withViewFields } from './paneView.ts';
import { initialLayout, usePanes, withPaneView } from './paneStore.ts';
import { leaves } from './panes.ts';
import { useUi } from './state.ts';

const base = { view: 'plan', levelId: 'lv_9', sectionId: null, sheetId: null, planKind: 'floor', areaPlanId: null, faceView: null } as const;

beforeEach(() => {
  useUi.setState({ view: 'plan', levelId: 'lv_9', sectionId: null, sheetId: null, planKind: 'floor', areaPlanId: null, faceView: null });
  usePanes.setState({ layout: initialLayout(useUi.getState()) });
});

describe('fieldsOfView', () => {
  it('planta de piso', () => {
    expect(fieldsOfView({ kind: 'plan', levelId: 'lv_2' }, 'lv_9')).toEqual({ view: 'plan', levelId: 'lv_2', sectionId: null, sheetId: null, planKind: 'floor', areaPlanId: null, faceView: null });
  });
  it('planta de cobertura e de área', () => {
    expect(fieldsOfView({ kind: 'plan', levelId: 'lv_2', planKind: 'roof' }, 'lv_9').planKind).toBe('roof');
    expect(fieldsOfView({ kind: 'plan', levelId: 'lv_2', planKind: 'area', areaPlanId: 'ap_1' }, 'lv_9')).toEqual({ view: 'plan', levelId: 'lv_2', sectionId: null, sheetId: null, planKind: 'area', areaPlanId: 'ap_1', faceView: null });
  });
  it('3d, corte, prancha e face usam o nível de reserva', () => {
    expect(fieldsOfView({ kind: '3d' }, 'lv_9')).toEqual({ view: '3d', levelId: 'lv_9', sectionId: null, sheetId: null, planKind: 'floor', areaPlanId: null, faceView: null });
    expect(fieldsOfView({ kind: 'section', viewId: 'sec_1' }, 'lv_9')).toEqual({ view: 'section', levelId: 'lv_9', sectionId: 'sec_1', sheetId: null, planKind: 'floor', areaPlanId: null, faceView: null });
    expect(fieldsOfView({ kind: 'sheet', sheetId: 'sh_1' }, 'lv_9')).toEqual({ view: 'sheet', levelId: 'lv_9', sectionId: null, sheetId: 'sh_1', planKind: 'floor', areaPlanId: null, faceView: null });
    expect(fieldsOfView({ kind: 'face', elementId: 'w_1', face: 'sideExt', layer: 'all' }, 'lv_9')).toEqual({ view: 'face', levelId: 'lv_9', sectionId: null, sheetId: null, planKind: 'floor', areaPlanId: null, faceView: { elementId: 'w_1', face: 'sideExt', layer: 'all' } });
  });
});

describe('pickViewFields / withViewFields', () => {
  it('pick descarta o resto; with sobrepõe só a vista', () => {
    expect(pickViewFields({ ...base, extra: 1 } as typeof base)).toEqual(base);
    const r = withViewFields({ ...base, tool: 'wall' }, { view: '3d', levelId: 'lv_9', sectionId: null, sheetId: null, planKind: 'floor', areaPlanId: null, faceView: null });
    expect(r).toEqual({ view: '3d', levelId: 'lv_9', sectionId: null, sheetId: null, planKind: 'floor', areaPlanId: null, faceView: null, tool: 'wall' });
  });
});

describe('paneViewFieldsNow', () => {
  it('indefinido e painel ativo leem do useUi', () => {
    useUi.setState({ view: 'section', sectionId: 'sec_7' });
    expect(paneViewFieldsNow()).toEqual({ view: 'section', levelId: 'lv_9', sectionId: 'sec_7', sheetId: null, planKind: 'floor', areaPlanId: null, faceView: null });
    expect(paneViewFieldsNow('p1')).toEqual(paneViewFieldsNow());
  });
  it('painel inativo lê o PaneView guardado', () => {
    const l = usePanes.getState().layout;
    const p1 = leaves(l.root)[0]!;
    usePanes.setState({ layout: { root: { kind: 'split', direction: 'row', ratio: 0.5, first: l.root, second: { kind: 'leaf', pane: { ...p1, id: 'p2', view: { kind: '3d' } } } }, activeId: 'p1', maximizedId: null } });
    expect(paneViewFieldsNow('p2')).toEqual({ view: '3d', levelId: 'lv_9', sectionId: null, sheetId: null, planKind: 'floor', areaPlanId: null, faceView: null });
    expect(paneViewFieldsNow('p1').view).toBe('plan');
  });
  it('id desconhecido cai no useUi', () => {
    expect(paneViewFieldsNow('zz').levelId).toBe('lv_9');
  });
});

describe('withPaneView', () => {
  it('mesma vista preserva a referência e as câmeras', () => {
    const l = initialLayout(base);
    expect(withPaneView(l, 'p1', { kind: 'plan', levelId: 'lv_9' })).toBe(l);
  });
});
