import { editor } from './controller.ts';
import { desfazerOuRefazer } from './historyStatus.ts';
import { useI18n } from './i18n.ts';
import { comandoMostrarCategorias } from './profileWarning.ts';
import { useUi } from './state.ts';
import { planViewIdAtivo } from './vistaAtiva.ts';
import { liberarCategoriasTemporarias } from './viewVisibility.ts';

/**
 * Ações do aviso de criação em categoria oculta (`UiState.avisoOculto`, mostrado na barra de status).
 * "Mostrar categoria nesta vista" altera só a vista em que o elemento foi criado; "Desfazer" desfaz a criação.
 * As duas só agem com a vista do aviso aberta (é onde a barra as mostra); em outra vista não fazem nada.
 */

/** O aviso em aberto, se a vista ativa é a dele. */
function avisoDaVistaAtiva() {
  const ui = useUi.getState();
  const aviso = ui.avisoOculto;
  return aviso && planViewIdAtivo(ui) === aviso.viewId ? aviso : null;
}

/**
 * Mostra, na vista do aviso, as categorias que ela ocultava. Um passo de desfazer; o aviso some. Sem nada a mostrar
 * (o ocultar temporário da sessão já foi resetado e o projeto não oculta mais a categoria), só limpa o aviso: não afirma
 * que a categoria foi exibida.
 */
export function mostrarCategoriaDoAviso(): void {
  const aviso = avisoDaVistaAtiva();
  if (!aviso) return;
  const comando = comandoMostrarCategorias(editor.project, aviso.viewId, aviso.categories);
  if (comando) editor.store.exec(comando, 'eds_undo_show_category_view', useI18n.getState().lang);
  // Ocultar/isolar temporário vale só para a vista aberta, que é a do aviso.
  const temporario = liberarCategoriasTemporarias(aviso.categories);
  if (!comando && !temporario) {
    useUi.setState({ avisoOculto: null });
    return;
  }
  useUi.setState((s) => ({ avisoOculto: null, status: { key: 'eds_msg_category_shown' }, previewTick: s.previewTick + 1 }));
}

/**
 * Desfaz a criação que gerou o aviso. Vai direto ao histórico do projeto (nunca ao rascunho do modo perímetro, que
 * `editor.undo()` desfaria primeiro). Se o projeto já mudou desde a criação, só limpa o aviso.
 */
export function desfazerCriacaoDoAviso(): void {
  const aviso = avisoDaVistaAtiva();
  if (!aviso) return;
  if (editor.store.project === aviso.projeto) desfazerOuRefazer(editor.store, 'undo');
  useUi.setState({ avisoOculto: null });
}
