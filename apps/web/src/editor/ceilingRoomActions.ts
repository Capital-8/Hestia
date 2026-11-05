import { ceilingsForAllRooms } from '@hestia/tools';
import { editor } from './controller.ts';
import { t, useI18n } from './i18n.ts';
import { useUi } from './state.ts';

/**
 * Cria um forro em cada ambiente de circuito fechado do nível ativo que ainda não tem forro, num só passo de desfazer, e
 * deixa os novos selecionados (E6, decisão 0021). Usa o tipo e a cota das opções da ferramenta. Devolve a quantidade criada
 * (0 = nada a fazer) e a mensagem para a barra de status.
 */
export function addCeilingsAllRooms(): { count: number; message: string } {
  const lang = useI18n.getState().lang;
  const ui = useUi.getState();
  const cmd = ceilingsForAllRooms(editor.project, ui.levelId, ui.options.ceilingTypeId);
  if (!cmd) {
    const message = t(lang, 'edc_no_room_needs_ceiling');
    useUi.setState({ status: { key: 'edc_no_room_needs_ceiling' } });
    return { count: 0, message };
  }
  editor.store.exec(cmd);
  const count = cmd.ceilings.length;
  const key = count === 1 ? 'edc_ceilings_created_one' : 'edc_ceilings_created_many';
  const message = t(lang, key, { n: count });
  useUi.setState({ selection: cmd.ceilings.map((c) => c.id), status: { key, args: { n: count } } });
  return { count, message };
}
