import { activeViewOf, sameView } from './openViews.ts';
import { editor } from './controller.ts';
import { layoutTreeOps } from './layoutTree.ts';
import { findPane, type LayoutPresetId, type PaneId, type PaneView } from './panes.ts';
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

/** O app mostra a vista do painel ativo? Se não, navega até ela pela navegação existente (que o modo de perímetro pode recusar). */
function alinharAppAoPainelAtivo(): void {
  const { layout } = usePanes.getState();
  const ativo = findPane(layout, layout.activeId);
  if (!ativo) return;
  const agora = activeViewOf(useUi.getState());
  if (!agora || !sameView(agora, ativo.view)) activateView(ativo.view);
}

/**
 * Fecha o painel. Se era o ativo, o irmão vira o ativo e o app navega para a vista dele: sem isso o painel ativo seguia
 * mostrando a vista do app (a do painel fechado) até algo ressincronizar. Com o modo de perímetro aberto e a navegação
 * necessária recusada, o painel NÃO é fechado.
 */
export function closePaneAligned(id: PaneId): void {
  const { layout, closePane } = usePanes.getState();
  const depois = layoutTreeOps.close(layout, id);
  if (depois === layout) return;
  const novo = findPane(depois, depois.activeId);
  const agora = activeViewOf(useUi.getState());
  if (depois.activeId !== layout.activeId && novo && (!agora || !sameView(agora, novo.view)) && editor.perimetro.bloqueiaNavegacao()) return;
  closePane(id);
  alinharAppAoPainelAtivo();
}

/** Aplica o layout pronto; se o painel ativo mudou de vista (ou de painel), o app navega para a dele. */
export function applyPresetAligned(preset: LayoutPresetId): void {
  usePanes.getState().applyPreset(preset);
  alinharAppAoPainelAtivo();
}
