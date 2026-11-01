import { create } from 'zustand';
import type { Id } from '@hestia/model';
import { selectedTypeId, type ToolId } from '@hestia/tools';
import { editor } from '../editor/controller.ts';
import { perimeterActions } from '../editor/perimeter.ts';
import { buildContextMenu, type ContextMenuCtx, type MenuEntry, type MenuView } from '../editor/contextMenu.ts';
import { useI18n, toolLabel } from '../editor/i18n.ts';
import { repeatLast, selectPrevious, useRecent } from '../editor/recentCommands.ts';
import { clickSelect3d, useUi } from '../editor/state.ts';
import { transfer } from '../editor/transfer.ts';
import { hideSelectedCategoryInView, hideSelectionInView, revealActive, selectedCategories, temporaryIsolateSelection, temporarySelectedCategory, toggleRevealHidden, unhideAllInView, unhideSelectedCategoryInView, unhideSelectionInView, visibilityOf } from '../editor/viewVisibility.ts';
import { startCreateSimilar } from '../editor/createSimilar.ts';
import { selecionarVisiveis3D } from '../editor/vista3dAoVivo.ts';
import { comEditarPerimetro, EDITAR_PERIMETRO_ID, idPerimetroEditavel } from './perimeter/perimeterEditavel.ts';

/** Menu aberto: posição na tela, o contexto em que foi montado e as entradas. */
export interface CanvasMenu {
  x: number;
  y: number;
  ctx: ContextMenuCtx;
  items: MenuEntry[];
}

export const useCanvasMenu = create<{ menu: CanvasMenu | null }>()(() => ({ menu: null }));

/** Tela da planta, do corte ou do 3D a partir do que a tela mostra (outras vistas não têm este menu). */
export function viewDoMenu(view: string): MenuView {
  return view === '3d' ? '3d' : view === 'section' ? 'section' : 'plan';
}

/** Estado da tela no momento do clique: seleção, ferramenta, recentes e painéis. Função pura de leitura do estado global. */
function contextoAtual(view: MenuView): ContextMenuCtx {
  const ui = useUi.getState();
  const rec = useRecent.getState();
  const lang = useI18n.getState().lang;
  const p = editor.project;
  const kinds = ui.selection.map((id) => p.elements[id]?.kind ?? '').filter((k) => k !== '');
  const mesmoTipoDeCoisa = kinds.length > 0 && kinds.every((k) => k === kinds[0]);
  const tipo = ui.selection.length ? selectedTypeId(p, ui.selection) : null;
  const cats = selectedCategories(p, ui.selection);
  const vis = visibilityOf(p, ui);
  return {
    view,
    tool: ui.tool,
    selectionKinds: kinds,
    hasSelection: ui.selection.length > 0,
    singleType: mesmoTipoDeCoisa && !!tipo && !('error' in tipo),
    recent: rec.recent.map((id) => ({ id, label: toolLabel(id, lang) })),
    last: rec.last ? { id: rec.last, label: toolLabel(rec.last, lang) } : null,
    canSelectPrevious: rec.prevSelection.some((id) => p.elements[id] !== undefined),
    propsOpen: ui.propsOpen,
    browserOpen: ui.browserOpen,
    lang,
    reveal: revealActive(),
    singleCategory: cats.length === 1 ? cats[0]! : null,
    hasHidden: vis.hidden.size + vis.revealed.size > 0,
    hasClip: transfer.hasClip(),
    canCopy: ui.selection.length > 0 && transfer.copyableIds(p, ui.selection).length > 0,
  };
}

/**
 * Abre o menu em (x, y). `alvo`: elemento sob o cursor; null no vazio; undefined pelo teclado (usa a seleção atual).
 * Clique em elemento fora da seleção seleciona só ele (como em apps do Windows); sobre um selecionado, a seleção fica.
 * No vazio o menu é o de "sem seleção", e a seleção é mantida.
 */
export function abrirMenuDeContexto(x: number, y: number, alvo: Id | null | undefined, view: MenuView): void {
  if (alvo && !useUi.getState().selection.includes(alvo)) clickSelect3d(alvo, false);
  const ctx = contextoAtual(view);
  const noVazio = alvo === null ? { ...ctx, hasSelection: false, selectionKinds: [], singleType: false, canCopy: false } : ctx;
  const editavel = noVazio.hasSelection && idPerimetroEditavel(editor.project, useUi.getState().selection) !== null;
  useCanvasMenu.setState({ menu: { x, y, ctx: noVazio, items: comEditarPerimetro(buildContextMenu(noVazio), noVazio.lang, editavel) } });
}

export function fecharMenuDeContexto(): void {
  if (useCanvasMenu.getState().menu) useCanvasMenu.setState({ menu: null });
}

/** Câmera 3D: só o que os comandos de zoom usam (mesma lógica da barra de navegação). */
export interface Camera3dMenu {
  fit: () => void;
  orbit: { zoom: (delta: number) => void };
}

/** "Editar perímetro" do elemento selecionado (o menu só oferece com um elemento editável). */
function editarPerimetroSelecionado(): void {
  const id = idPerimetroEditavel(editor.project, useUi.getState().selection);
  if (id) perimeterActions.edit(id);
}

/** Executa o comando de uma entrada. Entradas desabilitadas ("ainda não disponível") não chegam aqui. */
export function executaComandoDoMenu(id: string, view: MenuView, camera: Camera3dMenu, centro: { x: number; y: number }): void {
  if (id.startsWith('recent:')) { editor.setTool(id.slice('recent:'.length) as ToolId); return; }
  switch (id) {
    case 'repeat': repeatLast(); return;
    case 'cancel':
      // Mesmo efeito do Esc da planta (cancela a operação e volta a Selecionar).
      editor.key(new KeyboardEvent('keydown', { key: 'Escape' }));
      return;
    case 'selectPrevious': selectPrevious(); return;
    case 'zoomOut2x':
      // Mesmo passo da barra de navegação (NavBar): afastar um passo.
      if (view === '3d') camera.orbit.zoom(240);
      else editor.zoomWheel(centro, 240);
      return;
    case 'zoomFit':
      if (view === '3d') { camera.fit(); useUi.setState((x) => ({ previewTick: x.previewTick + 1 })); }
      else editor.zoomExtents();
      return;
    case 'browser': useUi.setState((s) => ({ browserOpen: !s.browserOpen })); return;
    case 'properties': useUi.setState((s) => ({ propsOpen: !s.propsOpen })); return;
    case 'delete': editor.deleteSelection(); return;
    case 'copySelection': editor.copySelection(); return;
    case 'pasteAligned': editor.pasteAligned(); return;
    case 'pasteAlignedLevels': editor.openPasteLevelsDialog(); return;
    // Na 3D, "visíveis na vista" são os elementos do quadro (mesma regra do Ctrl+A); na planta, o mesmo tipo do nível.
    case 'selectAllView': if (view === '3d') selecionarVisiveis3D(); else editor.selectAllOfSelectedType(); return;
    case 'createSimilar': startCreateSimilar(editor.project, (id) => editor.setTool(id)); return;
    case 'hideElements': hideSelectionInView(); return;
    case 'hideCategory': hideSelectedCategoryInView(); return;
    case 'unhideElements': unhideSelectionInView(); return;
    case 'unhideCategory': unhideSelectedCategoryInView(); return;
    case 'unhideAll': unhideAllInView(); return;
    case 'isolateElements': temporaryIsolateSelection(); return;
    case 'isolateCategory': temporarySelectedCategory(true); return;
    case 'revealHidden': toggleRevealHidden(); return;
    case EDITAR_PERIMETRO_ID: editarPerimetroSelecionado(); return;
    default:
  }
}
