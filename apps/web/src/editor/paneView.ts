import { createContext, useContext, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { FaceLayerTarget, FaceSlot, Id } from '@hestia/model';
import { planKindOf, type PlanKind } from './openViews.ts';
import { findPane, type PaneId, type PaneView } from './panes.ts';
import { usePanes } from './paneStore.ts';
import { useUi } from './state.ts';

/** Campos de vista de um painel: o mesmo subconjunto de `UiState` que define a vista (ver `ActiveViewFields`). */
export interface PaneViewFields {
  view: 'plan' | '3d' | 'section' | 'sheet' | 'face';
  levelId: Id;
  sectionId: Id | null;
  sheetId: Id | null;
  planKind: PlanKind;
  areaPlanId: Id | null;
  faceView?: { elementId: Id; face: FaceSlot; layer: FaceLayerTarget } | null;
}

/** Contexto do painel que o canvas instancia: de qual painel é e se é o ativo. */
export interface PaneContextValue {
  paneId: PaneId;
  isActive: boolean;
}
export const PaneContext = createContext<PaneContextValue | null>(null);

/**
 * Campos de vista de uma `PaneView`. `fallbackLevelId` preenche o nível das vistas que não têm nível próprio (3D, corte, prancha):
 * a 3D e o corte ainda usam o nível ativo do app.
 */
export function fieldsOfView(v: PaneView, fallbackLevelId: Id): PaneViewFields {
  switch (v.kind) {
    case 'plan':
      return { view: 'plan', levelId: v.levelId, sectionId: null, sheetId: null, planKind: planKindOf(v), areaPlanId: planKindOf(v) === 'area' ? (v.areaPlanId ?? null) : null, faceView: null };
    case '3d':
      return { view: '3d', levelId: fallbackLevelId, sectionId: null, sheetId: null, planKind: 'floor', areaPlanId: null, faceView: null };
    case 'section':
      return { view: 'section', levelId: fallbackLevelId, sectionId: v.viewId, sheetId: null, planKind: 'floor', areaPlanId: null, faceView: null };
    case 'sheet':
      return { view: 'sheet', levelId: fallbackLevelId, sectionId: null, sheetId: v.sheetId, planKind: 'floor', areaPlanId: null, faceView: null };
    case 'face':
      return { view: 'face', levelId: fallbackLevelId, sectionId: null, sheetId: null, planKind: 'floor', areaPlanId: null, faceView: { elementId: v.elementId, face: v.face, layer: v.layer } };
  }
}

/** Os campos de vista de um estado da interface (descarta o resto). */
export function pickViewFields(s: PaneViewFields): PaneViewFields {
  return { view: s.view, levelId: s.levelId, sectionId: s.sectionId, sheetId: s.sheetId, planKind: s.planKind, areaPlanId: s.areaPlanId, faceView: s.faceView ?? null };
}

/** Estado da interface com a vista sobreposta pela do painel (leituras do canvas de um painel inativo). */
export function withViewFields<T extends PaneViewFields>(ui: T, f: PaneViewFields): T {
  return { ...ui, ...f };
}

/**
 * Campos de vista do painel agora (sem assinatura). Painel ativo, indefinido ou desconhecido: os do `useUi`, como hoje;
 * painel inativo: os da `PaneView` guardada nele.
 */
export function paneViewFieldsNow(paneId?: PaneId): PaneViewFields {
  const ui = useUi.getState();
  const layout = usePanes.getState().layout;
  if (paneId === undefined || paneId === layout.activeId) return pickViewFields(ui);
  const pane = findPane(layout, paneId);
  return pane ? fieldsOfView(pane.view, ui.levelId) : pickViewFields(ui);
}

/** Descritor de vista do painel, reativo. Sem `paneId` (ou painel ativo) lê de `useUi`; inativo, lê o `PaneView` guardado. */
export function usePaneView(paneId?: PaneId): PaneViewFields {
  const ctx = useContext(PaneContext);
  const id = paneId ?? ctx?.paneId;
  const activeId = usePanes((s) => s.layout.activeId);
  const fromUi = useUi(useShallow((s) => pickViewFields(s)));
  const pane = usePanes((s) => (id === undefined ? null : findPane(s.layout, id)));
  const fallbackLevel = fromUi.levelId;
  return useMemo(
    () => (id === undefined || id === activeId || !pane ? fromUi : fieldsOfView(pane.view, fallbackLevel)),
    [id, activeId, pane, fromUi, fallbackLevel],
  );
}
