import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject } from '@hestia/model';
import { editor } from './controller.ts';
import { activatePane, choosePaneView } from './paneActivation.ts';
import { initialLayout, startPaneSync, usePanes } from './paneStore.ts';
import { findPane, type PaneView } from './panes.ts';
import { DEFAULT_OPTIONS, useUi } from './state.ts';

const pane = (id: string, view: PaneView) => ({ kind: 'leaf' as const, pane: { id, view, style: {}, sync: { followLevel: true, followSelection: true, lockCameraTo: null }, camera3d: null, camera2d: null } });

describe('activatePane', () => {
  let off = (): void => {};
  let levelId = '';
  beforeEach(() => {
    useUi.setState({ options: DEFAULT_OPTIONS });
    editor.load(createEmptyProject(), 'teste.hestia.json');
    levelId = useUi.getState().levelId;
    usePanes.setState({
      layout: { root: { kind: 'split', direction: 'row', ratio: 0.5, first: pane('pa', { kind: 'plan', levelId }), second: pane('pb', { kind: '3d' }) }, activeId: 'pa', maximizedId: null },
    });
    off = startPaneSync();
  });
  afterEach(() => off());

  it('ativa o painel e leva o app para a vista dele', () => {
    activatePane('pb');
    expect(usePanes.getState().layout.activeId).toBe('pb');
    expect(useUi.getState().view).toBe('3d');
  });

  it('painel já ativo ou desconhecido: nada muda', () => {
    const antes = usePanes.getState().layout;
    activatePane('pa');
    activatePane('zz');
    expect(usePanes.getState().layout).toBe(antes);
    expect(useUi.getState().view).toBe('plan');
  });

  it('A -> B -> A não reescreve as vistas dos painéis nem duplica abas', () => {
    activatePane('pb');
    activatePane('pa');
    activatePane('pb');
    activatePane('pa');
    const l = usePanes.getState().layout;
    expect(findPane(l, 'pa')?.view).toEqual({ kind: 'plan', levelId });
    expect(findPane(l, 'pb')?.view).toEqual({ kind: '3d' });
    expect(l.activeId).toBe('pa');
    expect(useUi.getState().view).toBe('plan');
    expect(useUi.getState().openViews.filter((v) => v.kind === '3d')).toHaveLength(1);
    expect(useUi.getState().openViews.filter((v) => v.kind === 'plan' && v.levelId === levelId)).toHaveLength(1);
  });

  it('modo de perímetro aberto recusa: o painel não é ativado e as vistas ficam', () => {
    editor.setTool('floor');
    activatePane('pb');
    expect(usePanes.getState().layout.activeId).toBe('pa');
    expect(useUi.getState().view).toBe('plan');
    expect(findPane(usePanes.getState().layout, 'pa')?.view).toEqual({ kind: 'plan', levelId });
    expect(findPane(usePanes.getState().layout, 'pb')?.view).toEqual({ kind: '3d' });
  });

  it('um painel só: ativar o próprio painel não muda nada', () => {
    usePanes.setState({ layout: initialLayout(useUi.getState()) });
    const antes = usePanes.getState().layout;
    activatePane(antes.activeId);
    expect(usePanes.getState().layout).toBe(antes);
  });
});

describe('choosePaneView', () => {
  let off = (): void => {};
  let levelId = '';
  beforeEach(() => {
    useUi.setState({ options: DEFAULT_OPTIONS });
    editor.load(createEmptyProject(), 'teste.hestia.json');
    editor.store.exec({ type: 'addView', view: { id: 'sec1', name: 'Corte', kind: 'section', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, depth: 3 } });
    levelId = useUi.getState().levelId;
    usePanes.setState({
      layout: { root: { kind: 'split', direction: 'row', ratio: 0.5, first: pane('pa', { kind: 'plan', levelId }), second: pane('pb', { kind: 'plan', levelId }) }, activeId: 'pa', maximizedId: null },
    });
    off = startPaneSync();
  });
  afterEach(() => off());

  it('painel ativo: planta -> corte -> 3D -> planta muda a tela e o painel, sem aba duplicada', () => {
    choosePaneView('pa', { kind: 'section', viewId: 'sec1' });
    expect(useUi.getState().view).toBe('section');
    expect(findPane(usePanes.getState().layout, 'pa')?.view).toEqual({ kind: 'section', viewId: 'sec1' });
    choosePaneView('pa', { kind: '3d' });
    expect(useUi.getState().view).toBe('3d');
    expect(findPane(usePanes.getState().layout, 'pa')?.view).toEqual({ kind: '3d' });
    choosePaneView('pa', { kind: 'plan', levelId });
    expect(useUi.getState().view).toBe('plan');
    expect(findPane(usePanes.getState().layout, 'pa')?.view).toEqual({ kind: 'plan', levelId });
    expect(usePanes.getState().layout.activeId).toBe('pa');
    expect(useUi.getState().openViews).toEqual([{ kind: 'plan', levelId }, { kind: 'section', viewId: 'sec1' }, { kind: '3d' }]);
  });

  it('painel inativo: grava a vista, ativa o painel e navega o app', () => {
    choosePaneView('pb', { kind: '3d' });
    expect(usePanes.getState().layout.activeId).toBe('pb');
    expect(findPane(usePanes.getState().layout, 'pb')?.view).toEqual({ kind: '3d' });
    expect(findPane(usePanes.getState().layout, 'pa')?.view).toEqual({ kind: 'plan', levelId });
    expect(useUi.getState().view).toBe('3d');
    choosePaneView('pa', { kind: 'section', viewId: 'sec1' });
    choosePaneView('pb', { kind: 'plan', levelId });
    expect(useUi.getState().view).toBe('plan');
    expect(useUi.getState().openViews.filter((v) => v.kind === '3d')).toHaveLength(1);
  });

  it('perímetro aberto: nada muda (ativo ou inativo)', () => {
    editor.setTool('floor');
    choosePaneView('pa', { kind: '3d' });
    expect(useUi.getState().view).toBe('plan');
    expect(findPane(usePanes.getState().layout, 'pa')?.view).toEqual({ kind: 'plan', levelId });
    choosePaneView('pb', { kind: '3d' });
    expect(usePanes.getState().layout.activeId).toBe('pa');
    expect(findPane(usePanes.getState().layout, 'pb')?.view).toEqual({ kind: 'plan', levelId });
    expect(useUi.getState().openViews).toEqual([{ kind: 'plan', levelId }]);
  });

  it('painel desconhecido: nada', () => {
    const antes = usePanes.getState().layout;
    choosePaneView('zz', { kind: '3d' });
    expect(usePanes.getState().layout).toBe(antes);
  });
});
