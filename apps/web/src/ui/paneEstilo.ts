import { findPane, type PaneId, type PaneStyle } from '../editor/panes.ts';
import { usePanes } from '../editor/paneStore.ts';

const VAZIO: PaneStyle = Object.freeze({});

/** Estilo visual do painel agora (leitura síncrona do store; sem painel ou sem `paneId`: vazio = herda do projeto). */
export function estiloDoPainelAgora(paneId: PaneId | undefined): PaneStyle {
  return (paneId === undefined ? null : findPane(usePanes.getState().layout, paneId)?.style) ?? VAZIO;
}
