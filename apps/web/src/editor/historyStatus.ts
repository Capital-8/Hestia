import type { ProjectStore } from '@hestia/model';
import { useUi } from './state.ts';
import { resolveText, useI18n } from './i18n.ts';

/**
 * Desfaz ou refaz um passo do histórico e diz na barra de status qual passo mudou ("Desfeito: Parede paralela.").
 * Assim a barra não continua mostrando a mensagem de criação ou o aviso de antes do Ctrl+Z. O rótulo vem do próprio
 * histórico (o mesmo que a dica do botão Desfazer mostra). Sem passo a desfazer ou refazer, nada muda na barra.
 */
export function desfazerOuRefazer(store: ProjectStore, acao: 'undo' | 'redo'): void {
  const rotulo = acao === 'undo' ? store.undoLabel : store.redoLabel;
  if (acao === 'undo') store.undo();
  else store.redo();
  if (!rotulo) return;
  // O rótulo do histórico é a chave do dicionário; resolveText também aceita rótulos literais antigos.
  const label = resolveText(rotulo, useI18n.getState().lang);
  useUi.setState({ status: { key: acao === 'undo' ? 'eds_hist_undo' : 'eds_hist_redo', args: { label } } });
}
