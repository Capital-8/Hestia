import { useCallback, useContext, useEffect, useRef, type RefObject } from 'react';
import { camera2dOf, type OwnCameraRef } from '../editor/paneCamera2d.ts';
import { viewKeyOf } from '../editor/viewKey.ts';
import { editor } from '../editor/controller.ts';
import { guardarCamera, restaurarCamera } from '../editor/pastePreview.ts';
import { PaneContext, paneViewFieldsNow, usePaneView, withViewFields, type PaneViewFields } from '../editor/paneView.ts';
import { usePanes } from '../editor/paneStore.ts';
import { findPane, type PaneCamera2D, type PaneId } from '../editor/panes.ts';
import { useUi, type UiState } from '../editor/state.ts';
import type { ModelScene } from '@hestia/render';

/** Identidade do painel que o canvas instancia e leitura do estado "como o painel o vê". */
export interface PaneCanvas {
  paneId: PaneId | undefined;
  /** Painel ativo (ou sem painel definido): só ele executa ferramentas, teclado e escritas. */
  isActive: boolean;
  /** Referência sempre atual de `isActive`, para handlers de longa vida. */
  isActiveRef: RefObject<boolean>;
  /** Câmera 2D própria deste canvas enquanto o painel está inativo (o ativo usa a do controlador). */
  ownCamera: OwnCameraRef;
  /** Câmera 2D guardada no painel (para restaurar ao montar). */
  saved2d: () => PaneCamera2D | null;
  /** Campos de vista do painel (reativo). */
  fields: PaneViewFields;
  /**
   * Estado da interface com a vista do painel. No painel ativo é o próprio `useUi.getState()` (comportamento de hoje);
   * num inativo, o mesmo estado com os campos de vista do painel e sem hover (hover só no painel ativo; a seleção é global).
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
    return isActiveRef.current ? ui : { ...withViewFields(ui, paneViewFieldsNow(idRef.current)), hover: null };
  }, []);
  const ownCamera = useRef<OwnCameraRef['current']>(null) as OwnCameraRef;
  const saved2d = useCallback((): PaneCamera2D | null => (idRef.current === undefined ? null : (findPane(usePanes.getState().layout, idRef.current)?.camera2d ?? null)), []);
  return { paneId, isActive, isActiveRef, ownCamera, saved2d, fields, state };
}

/**
 * Câmeras do painel: a órbita 3D é da instância do canvas (`ModelScene`); a 2D do painel ATIVO vive no controlador por vista
 * e a do INATIVO é própria do canvas (`ownCamera`). Ao desmontar, as duas são guardadas no painel (`camera3d`/`camera2d`); ao
 * montar, são restauradas se existirem (a 2D ativa só quando o controlador ainda não tem câmera para a vista; a do inativo
 * entra por `ownViewport`). Ao sair de cena (ativo→inativo) a câmera do controlador passa para o canvas; ao voltar
 * (inativo→ativo) a do canvas volta ao controlador. Trocar de vista descarta as guardadas (ver `withPaneView`).
 */
export function usePaneCameras(pane: PaneCanvas, model: RefObject<ModelScene>): void {
  const { paneId, isActive, isActiveRef, ownCamera } = pane;
  useEffect(() => {
    if (paneId === undefined) return;
    const saved = findPane(usePanes.getState().layout, paneId);
    if (saved?.camera3d) restaurarCamera(model.current.orbit, saved.camera3d);
    const c2 = saved?.camera2d;
    if (c2 && isActiveRef.current && saved.view.kind !== '3d' && !editor.viewport()) editor.setViewport({ cx: c2.center.x, cy: c2.center.y, zoom: c2.zoom, width: 1, height: 1 });
    const orbit = model.current.orbit;
    return () => {
      const v = isActiveRef.current ? editor.viewport() : (ownCamera.current?.v ?? null);
      usePanes.getState().saveCameras(paneId, { camera3d: guardarCamera(orbit), ...(v ? { camera2d: camera2dOf(v) } : {}) });
    };
  }, [paneId, model, isActiveRef, ownCamera]);

  const was = useRef(isActive);
  useEffect(() => {
    const before = was.current;
    was.current = isActive;
    if (paneId === undefined || before === isActive) return;
    const f = paneViewFieldsNow(paneId);
    if (f.view !== 'plan' && f.view !== 'section') return;
    if (!isActive) {
      const v = editor.viewport(f);
      ownCamera.current = v ? { key: viewKeyOf(f), v, framed: true } : null;
    } else {
      const own = ownCamera.current;
      if (own && own.key === viewKeyOf(f)) editor.setViewport({ ...own.v }, f);
      ownCamera.current = null;
    }
  }, [paneId, isActive, ownCamera]);
}
