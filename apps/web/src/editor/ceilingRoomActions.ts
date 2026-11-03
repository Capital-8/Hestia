import { ceilingsForAllRooms } from '@hestia/tools';
import { editor } from './controller.ts';
import { useUi } from './state.ts';

/**
 * Cria um forro em cada ambiente de circuito fechado do nível ativo que ainda não tem forro, num só passo de desfazer, e
 * deixa os novos selecionados (E6, decisão 0021). Usa o tipo e a cota das opções da ferramenta. Devolve a quantidade criada
 * (0 = nada a fazer) e a mensagem para a barra de status.
 */
export function addCeilingsAllRooms(): { count: number; message: string } {
  const ui = useUi.getState();
  const cmd = ceilingsForAllRooms(editor.project, ui.levelId, ui.options.ceilingTypeId);
  if (!cmd) {
    const message = 'Nenhum ambiente de circuito fechado sem forro neste nível (ou o projeto não tem tipo de forro).';
    useUi.setState({ status: message });
    return { count: 0, message };
  }
  editor.store.exec(cmd);
  const count = cmd.ceilings.length;
  const message = `${count} ${count === 1 ? 'forro criado' : 'forros criados'} nos ambientes. Ctrl+Z desfaz.`;
  useUi.setState({ selection: cmd.ceilings.map((c) => c.id), status: message });
  return { count, message };
}
