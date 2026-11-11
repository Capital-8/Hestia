import { editor } from './controller.ts';
import { useI18n } from './i18n.ts';
import { comandoMostrarCategorias } from './profileWarning.ts';
import { useUi } from './state.ts';
import { liberarCategoriasTemporarias } from './viewVisibility.ts';

/**
 * Ações do aviso de criação em categoria oculta (`UiState.avisoOculto`, mostrado na barra de status).
 * "Mostrar categoria nesta vista" altera só a vista em que o elemento foi criado; "Desfazer" desfaz a criação.
 */

/** Mostra, na vista do aviso, as categorias que ela ocultava. Um passo de desfazer; o aviso some. */
export function mostrarCategoriaDoAviso(): void {
  const aviso = useUi.getState().avisoOculto;
  if (!aviso) return;
  const comando = comandoMostrarCategorias(editor.project, aviso.viewId, aviso.categories);
  if (comando) editor.store.exec(comando, 'eds_undo_show_category_view', useI18n.getState().lang);
  // Ocultar/isolar temporário vale só para a vista aberta, que é a do aviso (a barra só o mostra nela).
  liberarCategoriasTemporarias(aviso.categories);
  useUi.setState((s) => ({ avisoOculto: null, status: { key: 'eds_msg_category_shown' }, previewTick: s.previewTick + 1 }));
}

/** Desfaz a criação que gerou o aviso (o aviso só existe enquanto ela é a última mudança do projeto). */
export function desfazerCriacaoDoAviso(): void {
  if (!useUi.getState().avisoOculto) return;
  editor.undo();
  useUi.setState({ avisoOculto: null });
}
