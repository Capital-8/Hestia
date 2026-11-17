import { editor } from './controller.ts';
import { activatePane } from './paneActivation.ts';
import type { PaneId } from './panes.ts';
import { useUi } from './state.ts';

/** Estado que decide se pousar o mouse num painel o ativa. */
export interface MouseActivationState {
  /** `PointerEvent.buttons`: qualquer botão pressionado (arrasto em andamento) impede. */
  buttons: number;
  dialogOpen: boolean;
  /** Campo numérico/texto pendente (`prompt`) ou digitação em andamento (`typed`). */
  prompt: string | null;
  typed: string;
  pastePreview: boolean;
  ifcImporting: boolean;
  /** Ferramenta de desenho (diferente de selecionar) com prévia em andamento: operação iniciada, falta concluir. */
  drawing: boolean;
}

/**
 * Regra: pousar o mouse ativa o painel SÓ quando nada está em andamento: sem botão pressionado, sem diálogo, sem
 * digitação numérica (`prompt`/`typed`), sem colagem em prévia, sem importação IFC e sem operação de desenho
 * (ferramenta que não é Selecionar com `preview()` não vazio).
 */
export function devoAtivarPorMouse(s: MouseActivationState): boolean {
  return s.buttons === 0 && !s.dialogOpen && (s.prompt === null || s.prompt === '') && s.typed === '' && !s.pastePreview && !s.ifcImporting && !s.drawing;
}

/** Estado atual do app para `devoAtivarPorMouse`. */
export function mouseActivationNow(buttons: number): MouseActivationState {
  const ui = useUi.getState();
  const tool = editor.activeTool;
  return {
    buttons,
    dialogOpen: ui.dialog !== null,
    prompt: ui.prompt,
    typed: ui.typed,
    pastePreview: ui.pastePreview !== null,
    ifcImporting: ui.ifcImport !== null,
    drawing: tool.id !== 'select' && tool.preview().length > 0,
  };
}

/** Handler de `pointerenter` da área do painel: ativa o painel quando a regra permite. */
export function activatePaneOnEnter(id: PaneId, buttons: number): void {
  if (devoAtivarPorMouse(mouseActivationNow(buttons))) activatePane(id);
}
