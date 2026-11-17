import { activeViewOf, sameView } from './openViews.ts';
import { findPane, type PaneId, type PaneView } from './panes.ts';
import { usePanes } from './paneStore.ts';
import { useUi } from './state.ts';
import { activateView } from './viewTabActions.ts';

/**
 * Ativa um painel por ação do usuário (clique no painel, atalho). É o ÚNICO ponto de entrada da UI para trocar o painel
 * ativo. Painel já ativo ou desconhecido: nada. Senão marca o painel como ativo e leva o app para a vista dele pela
 * navegação existente (`activateView`: seleciona o nível, abre o corte, cria a aba se faltar). Marcar ANTES de navegar faz a
 * sincronização `useUi` → painel ativo (`startPaneSync`) cair no próprio painel, que já mostra a vista: o painel anterior
 * não é reescrito e não há laço. Se a navegação for recusada (modo de perímetro aberto), o painel anterior volta a ser o ativo.
 */
export function activatePane(id: PaneId): void {
  const { layout, activate } = usePanes.getState();
  if (layout.activeId === id) return;
  const pane = findPane(layout, id);
  if (!pane) return;
  const previous = layout.activeId;
  activate(id);
  activateView(pane.view);
  const now = activeViewOf(useUi.getState());
  if (!now || !sameView(now, pane.view)) activate(previous);
}

/**
 * Troca a vista de um painel pelo seletor do cabeçalho. Painel ATIVO: navega o app (`activateView`) e a sincronização
 * `useUi` → painel ativo grava a vista nele (zerando câmeras); se a navegação for recusada (modo de perímetro), nada muda.
 * Painel INATIVO: grava a vista nele e o ativa (que navega o app). Vista ainda não aberta ganha a aba, sem duplicar.
 */
export function choosePaneView(id: PaneId, view: PaneView): void {
  const { layout, setPaneView } = usePanes.getState();
  const pane = findPane(layout, id);
  if (!pane) return;
  if (layout.activeId === id) {
    activateView(view);
    return;
  }
  const antiga = pane.view;
  setPaneView(id, view);
  activatePane(id);
  // Navegação recusada: o painel volta à vista anterior (activatePane já devolveu o ativo ao painel de antes).
  if (usePanes.getState().layout.activeId !== id) setPaneView(id, antiga);
}
