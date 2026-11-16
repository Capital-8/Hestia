import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject } from '@hestia/model';
import { editor } from './controller.ts';
import { activatePane } from './paneActivation.ts';
import { initialLayout, startPaneSync, usePanes } from './paneStore.ts';
import { findPane, type PaneLayout, type PaneView } from './panes.ts';
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
