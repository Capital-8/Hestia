import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject } from '@hestia/model';
import { editor } from './controller.ts';
import { activatePane, applyPresetAligned, choosePaneView, closePaneAligned } from './paneActivation.ts';
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

describe('closePaneAligned (fechar o painel ativo leva o app para a vista do irmão)', () => {
  let off = (): void => {};
  let levelId = '';
  beforeEach(() => {
    useUi.setState({ options: DEFAULT_OPTIONS });
    editor.load(createEmptyProject(), 'teste.hestia.json');
    levelId = useUi.getState().levelId;
    editor.store.exec({ type: 'addView', view: { id: 'sv1', name: 'Corte A', kind: 'section', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, depth: 4 } });
    // um mais dois: planta | (3D em cima, corte embaixo); o corte é o ativo e o app mostra o corte
    const direita = { kind: 'split' as const, direction: 'column' as const, ratio: 0.5, first: pane('p2', { kind: '3d' }), second: pane('p3', { kind: 'section', viewId: 'sv1' }) };
    usePanes.setState({ layout: { root: { kind: 'split', direction: 'row', ratio: 0.5, first: pane('p1', { kind: 'plan', levelId }), second: direita }, activeId: 'p3', maximizedId: null } });
    off = startPaneSync();
    editor.openSection('sv1');
  });
  afterEach(() => off());

  it('fechar o corte ativo: o 3D vira ativo E o app passa para o 3D (antes ficava no corte)', () => {
    expect(useUi.getState().view).toBe('section');
    closePaneAligned('p3');
    const l = usePanes.getState().layout;
    expect(l.activeId).toBe('p2');
    expect(useUi.getState().view).toBe('3d');
    expect(findPane(l, 'p2')?.view).toEqual({ kind: '3d' });
    expect(findPane(l, 'p1')?.view).toEqual({ kind: 'plan', levelId });
    expect(findPane(l, 'p3')).toBeNull();
  });

  it('fechar um painel que não é o ativo não mexe no app', () => {
    closePaneAligned('p1');
    expect(usePanes.getState().layout.activeId).toBe('p3');
    expect(useUi.getState().view).toBe('section');
    expect(useUi.getState().sectionId).toBe('sv1');
  });

  it('modo de perímetro aberto recusa a navegação: o painel não é fechado', () => {
    // O app está na planta (painel p1 ativo) e o perímetro aberto: fechar o ativo exigiria navegar para o 3D.
    usePanes.getState().activate('p1');
    editor.selectLevel(levelId, 'floor', null);
    editor.setTool('floor');
    closePaneAligned('p1');
    expect(findPane(usePanes.getState().layout, 'p1')).not.toBeNull();
    expect(usePanes.getState().layout.activeId).toBe('p1');
    expect(useUi.getState().view).toBe('plan');
  });

  it('preset: o painel ativo mantém a vista dele e o app continua nela', () => {
    applyPresetAligned('single');
    const l = usePanes.getState().layout;
    expect(findPane(l, l.activeId)?.view).toEqual({ kind: 'section', viewId: 'sv1' });
    expect(useUi.getState().view).toBe('section');
    expect(useUi.getState().sectionId).toBe('sv1');
  });
});
