import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FIRST_PANE_ID, initialLayout, startPaneSync, usePanes, viewOfFields, withPaneCameras, withPaneView } from './paneStore.ts';
import { findPane } from './panes.ts';
import { useUi } from './state.ts';

const f = (over: Partial<Parameters<typeof viewOfFields>[0]> = {}): Parameters<typeof viewOfFields>[0] => ({ view: 'plan', levelId: 'lv_1', sectionId: null, sheetId: null, planKind: 'floor', areaPlanId: null, ...over });

describe('initialLayout', () => {
  it('um painel único p1, ativo, com a vista dos campos', () => {
    expect(initialLayout(f())).toEqual({
      root: { kind: 'leaf', pane: { id: 'p1', view: { kind: 'plan', levelId: 'lv_1' }, style: {}, sync: { followLevel: true, followSelection: true, lockCameraTo: null }, camera3d: null, camera2d: null } },
      activeId: 'p1',
      maximizedId: null,
    });
  });
  it('corte sem id cai na planta do nível', () => {
    expect(viewOfFields(f({ view: 'section' }))).toEqual({ kind: 'plan', levelId: 'lv_1' });
  });
});

describe('withPaneView / withPaneCameras', () => {
  it('trocar de vista zera as câmeras guardadas', () => {
    let l = initialLayout(f());
    l = withPaneCameras(l, 'p1', { camera2d: { zoom: 80, center: { x: 2, y: 3 } } });
    expect(findPane(l, 'p1')?.camera2d).toEqual({ zoom: 80, center: { x: 2, y: 3 } });
    const l2 = withPaneView(l, 'p1', { kind: '3d' });
    expect(findPane(l2, 'p1')?.view).toEqual({ kind: '3d' });
    expect(findPane(l2, 'p1')?.camera2d).toBeNull();
  });
  it('mesma vista mantém as câmeras', () => {
    const l = withPaneCameras(initialLayout(f()), 'p1', { camera2d: { zoom: 80, center: { x: 2, y: 3 } } });
    expect(withPaneView(l, 'p1', { kind: 'plan', levelId: 'lv_1' })).toBe(l);
  });
  it('painel inexistente não muda nada', () => {
    const l = initialLayout(f());
    expect(withPaneView(l, 'zz', { kind: '3d' })).toBe(l);
  });
});

describe('sincronização com useUi', () => {
  let off = (): void => {};
  beforeEach(() => {
    useUi.setState({ view: 'plan', levelId: 'lv_1', sectionId: null, sheetId: null, planKind: 'floor', areaPlanId: null });
    usePanes.setState({ layout: initialLayout(useUi.getState()) });
    off = startPaneSync();
  });
  afterEach(() => off());

  it('o painel ativo segue a vista ativa', () => {
    useUi.setState({ view: '3d' });
    expect(findPane(usePanes.getState().layout, FIRST_PANE_ID)?.view).toEqual({ kind: '3d' });
    useUi.setState({ view: 'section', sectionId: 'sec_4' });
    expect(findPane(usePanes.getState().layout, FIRST_PANE_ID)?.view).toEqual({ kind: 'section', viewId: 'sec_4' });
    useUi.setState({ view: 'plan', levelId: 'lv_2', planKind: 'roof' });
    expect(findPane(usePanes.getState().layout, FIRST_PANE_ID)?.view).toEqual({ kind: 'plan', levelId: 'lv_2', planKind: 'roof' });
  });
  it('mudar outro campo não mexe no layout (mesma referência)', () => {
    const antes = usePanes.getState().layout;
    useUi.setState({ hover: 'w_1' });
    expect(usePanes.getState().layout).toBe(antes);
  });
  it('só o painel ativo é sincronizado', () => {
    const l = usePanes.getState().layout;
    const p1 = findPane(l, 'p1')!;
    usePanes.setState({ layout: { root: { kind: 'split', direction: 'row', ratio: 0.5, first: l.root, second: { kind: 'leaf', pane: { ...p1, id: 'p2' } } }, activeId: 'p2', maximizedId: null } });
    useUi.setState({ view: '3d' });
    const nl = usePanes.getState().layout;
    expect(findPane(nl, 'p1')?.view).toEqual({ kind: 'plan', levelId: 'lv_1' });
    expect(findPane(nl, 'p2')?.view).toEqual({ kind: '3d' });
  });
  it('activate ignora id desconhecido', () => {
    usePanes.getState().activate('zz');
    expect(usePanes.getState().layout.activeId).toBe('p1');
  });
  it('desligar para a sincronização', () => {
    off();
    useUi.setState({ view: '3d' });
    expect(findPane(usePanes.getState().layout, 'p1')?.view).toEqual({ kind: 'plan', levelId: 'lv_1' });
  });
});
