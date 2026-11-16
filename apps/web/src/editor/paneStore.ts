import { create } from 'zustand';
import { activeViewOf, sameView, type ActiveViewFields } from './openViews.ts';
import { DEFAULT_SYNC, leaves, type LayoutNode, type Pane, type PaneId, type PaneLayout, type PaneView } from './panes.ts';
import { useUi } from './state.ts';

/** Id do painel único inicial. */
export const FIRST_PANE_ID: PaneId = 'p1';

/** Campos de um painel que o canvas guarda ao sair de cena (câmeras). */
export type PaneCameras = Pick<Pane, 'camera2d' | 'camera3d'>;

/** Painel novo com a vista dada: estilo e sincronia padrão, sem câmeras guardadas. */
export function newPane(id: PaneId, view: PaneView): Pane {
  return { id, view, style: {}, sync: { ...DEFAULT_SYNC }, camera3d: null, camera2d: null };
}

/** Vista de um painel a partir dos campos da interface; planta do nível quando os campos não definem vista (sem id de corte/prancha). */
export function viewOfFields(f: ActiveViewFields): PaneView {
  return activeViewOf(f) ?? { kind: 'plan', levelId: f.levelId };
}

/** Layout inicial: um painel `p1` ativo, com a vista dada. */
export function initialLayout(f: ActiveViewFields): PaneLayout {
  return { root: { kind: 'leaf', pane: newPane(FIRST_PANE_ID, viewOfFields(f)) }, activeId: FIRST_PANE_ID, maximizedId: null };
}

function mapLeaf(n: LayoutNode, id: PaneId, fn: (p: Pane) => Pane): LayoutNode {
  if (n.kind === 'leaf') return n.pane.id === id ? { kind: 'leaf', pane: fn(n.pane) } : n;
  const first = mapLeaf(n.first, id, fn);
  const second = mapLeaf(n.second, id, fn);
  return first === n.first && second === n.second ? n : { ...n, first, second };
}

/**
 * Troca a vista do painel. Ao mudar de vista de fato, as câmeras guardadas (que eram da vista anterior) são descartadas;
 * vista igual devolve o mesmo layout (referência preservada).
 */
export function withPaneView(l: PaneLayout, id: PaneId, view: PaneView): PaneLayout {
  const root = mapLeaf(l.root, id, (p) => (sameView(p.view, view) ? p : { ...p, view, camera2d: null, camera3d: null }));
  return root === l.root ? l : { ...l, root };
}

/** Atualiza as câmeras guardadas do painel; painel inexistente devolve o mesmo layout. */
export function withPaneCameras(l: PaneLayout, id: PaneId, patch: Partial<PaneCameras>): PaneLayout {
  const root = mapLeaf(l.root, id, (p) => ({ ...p, ...patch }));
  return root === l.root ? l : { ...l, root };
}

export interface PanesState {
  layout: PaneLayout;
  setLayout: (l: PaneLayout) => void;
  /** Torna o painel o ativo (id desconhecido: nada muda). */
  activate: (id: PaneId) => void;
  /** Guarda as câmeras do painel (ao trocar de vista ou desmontar). */
  saveCameras: (id: PaneId, patch: Partial<PaneCameras>) => void;
  /** O painel ativo passa a mostrar a vista ativa do `useUi`. */
  syncActiveView: (f: ActiveViewFields) => void;
}

export const usePanes = create<PanesState>((set, get) => ({
  layout: initialLayout(useUi.getState()),
  setLayout: (layout) => set({ layout }),
  activate: (id) => {
    const { layout } = get();
    if (layout.activeId !== id && leaves(layout.root).some((p) => p.id === id)) set({ layout: { ...layout, activeId: id } });
  },
  saveCameras: (id, patch) => set((s) => ({ layout: withPaneCameras(s.layout, id, patch) })),
  syncActiveView: (f) => {
    const { layout } = get();
    const view = activeViewOf(f);
    if (!view) return;
    const next = withPaneView(layout, layout.activeId, view);
    if (next !== layout) set({ layout: next });
  },
}));

const mudouVista = (a: ActiveViewFields, b: ActiveViewFields): boolean =>
  a.view !== b.view || a.levelId !== b.levelId || a.planKind !== b.planKind || a.areaPlanId !== b.areaPlanId || a.sectionId !== b.sectionId || a.sheetId !== b.sheetId;

/** Liga a sincronização `useUi` → painel ativo (sincroniza já na partida). Devolve a função que desliga. */
export function startPaneSync(): () => void {
  usePanes.getState().syncActiveView(useUi.getState());
  return useUi.subscribe((s, prev) => {
    if (mudouVista(s, prev)) usePanes.getState().syncActiveView(s);
  });
}

