import { create } from 'zustand';
import type { Project } from '@hestia/model';
import { activeViewOf, sameView, type ActiveViewFields } from './openViews.ts';
import { layoutTreeOps, loadPanes, nextPaneId, savePanes } from './layoutTree.ts';
import {
  DEFAULT_SYNC,
  findPane,
  leaves,
  type LayoutNode,
  type LayoutPresetId,
  type Pane,
  type PaneId,
  type PaneLayout,
  type PaneStyle,
  type PaneView,
  type SplitDirection,
  type SplitPath,
} from './panes.ts';
import { useUi } from './state.ts';
import { viewsForPreset } from './paneViews.ts';
import { tabOf } from './viewTabActions.ts';
import { editor } from './controller.ts';

/** Id do painel único inicial. */
export const FIRST_PANE_ID: PaneId = 'p1';

/** Ids dos painéis criados por layout pronto (estáveis: a mesma posição sempre tem o mesmo id). */
const PRESET_IDS: readonly PaneId[] = ['p1', 'p2', 'p3', 'p4'];

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
  if (n.kind === 'leaf') {
    if (n.pane.id !== id) return n;
    const pane = fn(n.pane);
    return pane === n.pane ? n : { kind: 'leaf', pane };
  }
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

/**
 * Painéis cuja vista não existe mais no projeto (nível, corte, prancha ou planta de área excluídos) passam a mostrar
 * `fallbackView`. Função pura: sem vista quebrada, devolve o MESMO layout.
 */
export function sanitizeLayoutViews(l: PaneLayout, p: Project, fallbackView: PaneView): PaneLayout {
  return leaves(l.root).reduce((acc, pane) => (tabOf(p, pane.view) === null ? withPaneView(acc, pane.id, fallbackView) : acc), l);
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
  /** Divide o painel; o novo recebe `view` e vira o ativo. Recusa acima de `MAX_PANES`. */
  splitPane: (paneId: PaneId, direction: SplitDirection, view: PaneView) => void;
  /** Fecha o painel (nunca o último). */
  closePane: (paneId: PaneId) => void;
  /** Ajusta a divisória que tem `paneId` como primeiro filho direto (fração, clampada). */
  resizePane: (paneId: PaneId, ratio: number) => void;
  /** Ajusta a fração da divisão no caminho (qualquer divisão da árvore). */
  resizeSplit: (path: SplitPath, ratio: number) => void;
  toggleMaximize: (paneId: PaneId) => void;
  setPaneView: (paneId: PaneId, view: PaneView) => void;
  setPaneStyle: (paneId: PaneId, patch: PaneStyle) => void;
  /** Aplica um layout pronto com vistas diversas (ver `viewsForPreset`); painéis de mesmo id e vista são preservados. */
  applyPreset: (preset: LayoutPresetId) => void;
}

export const usePanes = create<PanesState>((set, get) => {
  /** Aplica uma operação pura ao layout; quando ela não muda nada, o estado nem é trocado (sem aviso aos ouvintes). */
  const aplica = (fn: (l: PaneLayout) => PaneLayout): void =>
    set((s) => {
      const layout = fn(s.layout);
      return layout === s.layout ? s : { layout };
    });

  return {
    // Ao carregar, o layout guardado é lido; sem nada válido guardado, vale um painel só com a vista ativa do app.
    layout: loadPanes({ view: viewOfFields(useUi.getState()), id: FIRST_PANE_ID }),
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
    splitPane: (paneId, direction, view) => aplica((l) => layoutTreeOps.split(l, paneId, direction, view, nextPaneId(l))),
    closePane: (paneId) => aplica((l) => layoutTreeOps.close(l, paneId)),
    resizePane: (paneId, ratio) => aplica((l) => layoutTreeOps.resize(l, paneId, ratio)),
    resizeSplit: (path, ratio) => aplica((l) => layoutTreeOps.resizeAt(l, path, ratio)),
    toggleMaximize: (paneId) => aplica((l) => layoutTreeOps.toggleMaximize(l, paneId)),
    setPaneView: (paneId, view) => aplica((l) => layoutTreeOps.setView(l, paneId, view)),
    setPaneStyle: (paneId, patch) => aplica((l) => layoutTreeOps.setStyle(l, paneId, patch)),
    applyPreset: (preset) => {
      const abertas = useUi.getState().openViews;
      aplica((l) => {
        const ativa = findPane(l, l.activeId)?.view;
        if (!ativa) return l;
        return layoutTreeOps.applyPreset(l, preset, viewsForPreset(editor.project, ativa, abertas), PRESET_IDS);
      });
    },
  };
});

// Toda mudança de layout é guardada (sem câmeras).
usePanes.subscribe((s, prev) => {
  if (s.layout !== prev.layout) savePanes(s.layout);
});

/** Ao abrir ou trocar de projeto: painéis com vista inexistente passam a vista ativa do app. */
export function reconcilePanes(p: Project): void {
  const { layout } = usePanes.getState();
  const next = sanitizeLayoutViews(layout, p, viewOfFields(useUi.getState()));
  if (next !== layout) usePanes.setState({ layout: next });
}

const mudouVista = (a: ActiveViewFields, b: ActiveViewFields): boolean =>
  a.view !== b.view || a.levelId !== b.levelId || a.planKind !== b.planKind || a.areaPlanId !== b.areaPlanId || a.sectionId !== b.sectionId || a.sheetId !== b.sheetId;

/** Liga a sincronização `useUi` → painel ativo (sincroniza já na partida). Devolve a função que desliga. */
export function startPaneSync(): () => void {
  usePanes.getState().syncActiveView(useUi.getState());
  return useUi.subscribe((s, prev) => {
    if (mudouVista(s, prev)) usePanes.getState().syncActiveView(s);
  });
}
