import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@hestia/model';
import { initialLayout, newPane, sanitizeLayoutViews, usePanes } from './paneStore.ts';
import { loadPanes } from './layoutTree.ts';
import { PANES_KEY, findPane, leaves, type LayoutNode, type PaneLayout, type PaneView } from './panes.ts';
import { useUi } from './state.ts';

const PLAN_LV1: PaneView = { kind: 'plan', levelId: 'lv_1' };
const VISTA_3D: PaneView = { kind: '3d' };
const CORTE: PaneView = { kind: 'section', viewId: 'sec_1' };

/** Só o que `tabOf` lê: níveis, vistas de corte e pranchas. */
const projeto = {
  levels: [{ id: 'lv_1', name: 'Térreo' }],
  views: [{ id: 'sec_1', name: 'Corte A', kind: 'section' }],
  sheets: [{ id: 'sh_1', number: 'A-01', name: 'Planta' }],
} as unknown as Project;

const ids = (l: PaneLayout): string[] => leaves(l.root).map((p) => p.id);
const folha = (id: string, view: PaneView): LayoutNode => ({ kind: 'leaf', pane: newPane(id, view) });
const dividido = (direction: 'row' | 'column', first: LayoutNode, second: LayoutNode): LayoutNode => ({ kind: 'split', direction, ratio: 0.5, first, second });

/** Layout de um painel só (p1, ativo) com a planta do nível 1. */
const umPainel = (): PaneLayout => initialLayout({ view: 'plan', levelId: 'lv_1', sectionId: null, sheetId: null, planKind: 'floor', areaPlanId: null });

describe('ações de divisão, fechamento, ajuste e maximizar', () => {
  beforeEach(() => {
    useUi.setState({ openViews: [{ ...PLAN_LV1 }] });
    usePanes.setState({ layout: umPainel() });
  });

  it('splitPane à direita cria p2, ativo, em divisão row com ratio 0,5', () => {
    usePanes.getState().splitPane('p1', 'row', VISTA_3D);
    const l = usePanes.getState().layout;
    expect(ids(l)).toEqual(['p1', 'p2']);
    expect(l.activeId).toBe('p2');
    expect(l.root).toMatchObject({ kind: 'split', direction: 'row', ratio: 0.5 });
    expect(findPane(l, 'p2')?.view).toEqual({ kind: '3d' });
  });

  it('splitPane abaixo do p2 cria p3 (menor id livre) e ele vira o ativo', () => {
    usePanes.getState().splitPane('p1', 'row', VISTA_3D);
    usePanes.getState().splitPane('p2', 'column', CORTE);
    const l = usePanes.getState().layout;
    expect(ids(l)).toEqual(['p1', 'p2', 'p3']);
    expect(l.activeId).toBe('p3');
    expect(findPane(l, 'p3')?.view).toEqual({ kind: 'section', viewId: 'sec_1' });
  });

  it('closePane do ativo promove o irmão a ativo; o último painel nunca fecha', () => {
    usePanes.getState().splitPane('p1', 'row', VISTA_3D);
    usePanes.getState().closePane('p2');
    expect(ids(usePanes.getState().layout)).toEqual(['p1']);
    expect(usePanes.getState().layout.activeId).toBe('p1');
    const antes = usePanes.getState().layout;
    usePanes.getState().closePane('p1');
    expect(usePanes.getState().layout).toBe(antes);
  });

  it('resizePane clampa a fração em 0,85 e em 0,15', () => {
    usePanes.getState().splitPane('p1', 'row', VISTA_3D);
    usePanes.getState().resizePane('p1', 0.9);
    expect(usePanes.getState().layout.root).toMatchObject({ ratio: 0.85 });
    usePanes.getState().resizePane('p1', 0.05);
    expect(usePanes.getState().layout.root).toMatchObject({ ratio: 0.15 });
  });

  it('toggleMaximize liga e desliga o maximizado, que vira o ativo', () => {
    usePanes.getState().splitPane('p1', 'row', VISTA_3D);
    usePanes.getState().toggleMaximize('p1');
    expect(usePanes.getState().layout).toMatchObject({ maximizedId: 'p1', activeId: 'p1' });
    usePanes.getState().toggleMaximize('p1');
    expect(usePanes.getState().layout.maximizedId).toBeNull();
  });

  it('setPaneView troca a vista e zera as câmeras do painel', () => {
    usePanes.getState().setPaneView('p1', VISTA_3D);
    const p = findPane(usePanes.getState().layout, 'p1');
    expect(p?.view).toEqual({ kind: '3d' });
    expect(p?.camera2d).toBeNull();
    expect(p?.camera3d).toBeNull();
  });

  it('setPaneStyle mescla o patch; undefined remove a chave (volta a herdar)', () => {
    usePanes.getState().setPaneStyle('p1', { edges: true, thinLines: false });
    expect(findPane(usePanes.getState().layout, 'p1')?.style).toEqual({ edges: true, thinLines: false });
    usePanes.getState().setPaneStyle('p1', { edges: undefined });
    expect(findPane(usePanes.getState().layout, 'p1')?.style).toEqual({ thinLines: false });
  });
});

describe('applyPreset com as vistas abertas', () => {
  beforeEach(() => {
    useUi.setState({ openViews: [{ ...PLAN_LV1 }, { ...VISTA_3D }] });
    usePanes.setState({ layout: umPainel() });
  });

  it('duas colunas: a vista ativa (planta) vem primeiro, depois as abertas na ordem (3D)', () => {
    usePanes.getState().applyPreset('twoColumns');
    const l = usePanes.getState().layout;
    expect(l.root).toMatchObject({ kind: 'split', direction: 'row', ratio: 0.5 });
    expect(ids(l)).toEqual(['p1', 'p2']);
    expect(findPane(l, 'p1')?.view).toEqual({ kind: 'plan', levelId: 'lv_1' });
    expect(findPane(l, 'p2')?.view).toEqual({ kind: '3d' });
    expect(l.activeId).toBe('p1');
  });

  it('um painel com 3D ativo mantém o 3D (a vista do painel ativo vem primeiro)', () => {
    usePanes.setState({ layout: { root: folha('p1', VISTA_3D), activeId: 'p1', maximizedId: null } });
    usePanes.getState().applyPreset('single');
    const l = usePanes.getState().layout;
    expect(ids(l)).toEqual(['p1']);
    expect(findPane(l, 'p1')?.view).toEqual({ kind: '3d' });
  });

  it('grade 2×2 completa com a vista ativa quando faltam vistas abertas', () => {
    usePanes.getState().applyPreset('grid');
    const l = usePanes.getState().layout;
    expect(ids(l)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(l.root).toMatchObject({ kind: 'split', direction: 'column', ratio: 0.5 });
    expect(leaves(l.root).map((p) => p.view)).toEqual([
      { kind: 'plan', levelId: 'lv_1' },
      { kind: '3d' },
      { kind: 'plan', levelId: 'lv_0' },
      { kind: 'plan', levelId: 'lv_1' },
    ]);
  });

  it('um + dois cria três painéis', () => {
    usePanes.getState().applyPreset('oneAndTwo');
    expect(ids(usePanes.getState().layout)).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('persistência do layout', () => {
  let guardado: Map<string, string>;

  beforeEach(() => {
    guardado = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => guardado.get(k) ?? null,
      setItem: (k: string, v: string) => {
        guardado.set(k, v);
      },
      removeItem: (k: string) => {
        guardado.delete(k);
      },
    });
    useUi.setState({ openViews: [{ ...PLAN_LV1 }, { ...VISTA_3D }] });
    usePanes.setState({ layout: umPainel() });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cada mudança grava o layout sem as câmeras 2D e 3D', () => {
    usePanes.getState().saveCameras('p1', { camera2d: { zoom: 80, center: { x: 2, y: 3 } } });
    usePanes.getState().splitPane('p1', 'row', VISTA_3D);
    const gravado = JSON.parse(guardado.get(PANES_KEY) ?? 'null');
    expect(gravado.activeId).toBe('p2');
    expect(gravado.root.kind).toBe('split');
    expect(gravado.root.first.pane.camera2d).toBeNull();
    expect(gravado.root.first.pane.camera3d).toBeNull();
    expect(gravado.root.second.pane.view).toEqual({ kind: '3d' });
  });

  it('ao carregar, o layout gravado volta com os painéis, a direção e a ordem', () => {
    usePanes.getState().splitPane('p1', 'column', CORTE);
    const lido = loadPanes({ view: PLAN_LV1, id: 'p1' });
    expect(ids(lido)).toEqual(['p1', 'p2']);
    expect(lido.root).toMatchObject({ kind: 'split', direction: 'column', ratio: 0.5 });
    expect(findPane(lido, 'p2')?.view).toEqual({ kind: 'section', viewId: 'sec_1' });
    expect(findPane(lido, 'p2')?.camera2d).toBeNull();
  });

  it('sem nada gravado, o carregamento cai no painel único com a vista de fallback', () => {
    guardado.clear();
    const lido = loadPanes({ view: PLAN_LV1, id: 'p1' });
    expect(ids(lido)).toEqual(['p1']);
    expect(lido.activeId).toBe('p1');
  });
});

describe('sanitizeLayoutViews', () => {
  it('painel cuja planta sumiu passa a vista de fallback e perde a câmera guardada', () => {
    const planaSumiu = newPane('p2', { kind: 'plan', levelId: 'lv_sumiu' });
    const l: PaneLayout = {
      root: dividido('row', folha('p1', PLAN_LV1), { kind: 'leaf', pane: { ...planaSumiu, camera2d: { zoom: 50, center: { x: 1, y: 1 } } } }),
      activeId: 'p2',
      maximizedId: null,
    };
    const r = sanitizeLayoutViews(l, projeto, PLAN_LV1);
    expect(findPane(r, 'p2')?.view).toEqual({ kind: 'plan', levelId: 'lv_1' });
    expect(findPane(r, 'p2')?.camera2d).toBeNull();
    expect(r.activeId).toBe('p2');
  });

  it('corte e prancha inexistentes viram o fallback; prancha válida fica intacta', () => {
    const l: PaneLayout = {
      root: dividido('column', folha('p1', { kind: 'section', viewId: 'sec_x' }), dividido('row', folha('p2', { kind: 'sheet', sheetId: 'sh_9' }), folha('p3', { kind: 'sheet', sheetId: 'sh_1' }))),
      activeId: 'p1',
      maximizedId: null,
    };
    const r = sanitizeLayoutViews(l, projeto, PLAN_LV1);
    expect(ids(r)).toEqual(['p1', 'p2', 'p3']);
    expect(findPane(r, 'p1')?.view).toEqual({ kind: 'plan', levelId: 'lv_1' });
    expect(findPane(r, 'p2')?.view).toEqual({ kind: 'plan', levelId: 'lv_1' });
    expect(findPane(r, 'p3')?.view).toEqual({ kind: 'sheet', sheetId: 'sh_1' });
  });

  it('sem vista quebrada devolve o mesmo layout (referência preservada)', () => {
    const ok: PaneLayout = { root: folha('p1', PLAN_LV1), activeId: 'p1', maximizedId: null };
    expect(sanitizeLayoutViews(ok, projeto, PLAN_LV1)).toBe(ok);
  });
});
