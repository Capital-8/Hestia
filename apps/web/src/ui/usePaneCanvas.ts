import { useCallback, useContext, useEffect, useRef, type RefObject } from 'react';
import { editor } from '../editor/controller.ts';
import { guardarCamera, restaurarCamera } from '../editor/pastePreview.ts';
import { PaneContext, paneViewFieldsNow, usePaneView, withViewFields, type PaneViewFields } from '../editor/paneView.ts';
import { usePanes } from '../editor/paneStore.ts';
import { findPane, type PaneId } from '../editor/panes.ts';
import { useUi, type UiState } from '../editor/state.ts';
import type { ModelScene } from '@hestia/render';

/** Identidade do painel que o canvas instancia e leitura do estado "como o painel o vê". */
export interface PaneCanvas {
  paneId: PaneId | undefined;
  /** Painel ativo (ou sem painel definido): só ele executa ferramentas, teclado e escritas. */
  isActive: boolean;
  /** Referência sempre atual de `isActive`, para handlers de longa vida. */
  isActiveRef: RefObject<boolean>;
  /** Campos de vista do painel (reativo). */
  fields: PaneViewFields;
  /**
   * Estado da interface com a vista do painel. No painel ativo é o próprio `useUi.getState()` (comportamento de hoje);
   * num inativo, o mesmo estado com os campos de vista do painel.
   */
  state: () => UiState;
}

export function usePaneCanvas(paneIdProp?: PaneId): PaneCanvas {
  const ctx = useContext(PaneContext);
  const paneId = paneIdProp ?? ctx?.paneId;
  const activeId = usePanes((s) => s.layout.activeId);
  const isActive = paneId === undefined || paneId === activeId;
  const fields = usePaneView(paneId);
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const idRef = useRef(paneId);
  idRef.current = paneId;
  const state = useCallback((): UiState => {
    const ui = useUi.getState();
    return isActiveRef.current ? ui : withViewFields(ui, paneViewFieldsNow(idRef.current));
  }, []);
  return { paneId, isActive, isActiveRef, fields, state };
}

/**
 * Câmeras do painel: a órbita 3D é da instância do canvas (`ModelScene`) e a 2D vive no controlador por vista. Ao
 * desmontar, as duas são guardadas no painel (`camera3d`/`camera2d`); ao montar, são restauradas se existirem
 * (a 2D só quando o controlador ainda não tem câmera para a vista). Trocar de vista descarta as guardadas (ver `withPaneView`).
 */
export function usePaneCameras(paneId: PaneId | undefined, model: RefObject<ModelScene>): void {
  useEffect(() => {
    if (paneId === undefined) return;
    const pane = findPane(usePanes.getState().layout, paneId);
    if (pane?.camera3d) restaurarCamera(model.current.orbit, pane.camera3d);
    const c2 = pane?.camera2d;
    if (c2 && pane.view.kind !== '3d' && !editor.viewport()) editor.setViewport({ cx: c2.center.x, cy: c2.center.y, zoom: c2.zoom, width: 1, height: 1 });
    const orbit = model.current.orbit;
    return () => {
      const v = editor.viewport();
      usePanes.getState().saveCameras(paneId, { camera3d: guardarCamera(orbit), ...(v ? { camera2d: { zoom: v.zoom, center: { x: v.cx, y: v.cy } } } : {}) });
    };
  }, [paneId, model]);
}
