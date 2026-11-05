import { roomsForEnclosedCircuits } from '@hestia/tools';
import { editor } from './controller.ts';
import { t, useI18n } from './i18n.ts';
import { useUi } from './state.ts';

/**
 * Cria um ambiente em cada circuito fechado do nível ativo que ainda não tem nenhum, num só passo de desfazer, e deixa
 * os novos selecionados. Devolve a quantidade criada (0 = nada a fazer) e a mensagem para a barra de status.
 */
export function addRoomsAllCircuits(): { count: number; message: string } {
  const lang = useI18n.getState().lang;
  const p = editor.project;
  const levelId = useUi.getState().levelId;
  const rooms = roomsForEnclosedCircuits(p, levelId);
  if (rooms.length === 0) {
    const message = t(lang, 'edc_all_circuits_have_rooms');
    useUi.setState({ status: { key: 'edc_all_circuits_have_rooms' } });
    return { count: 0, message };
  }
  editor.store.transaction('edc_undo_rooms_all_circuits', () => {
    for (const room of rooms) editor.store.exec({ type: 'addRoom', room });
  });
  useUi.setState({ selection: rooms.map((r) => r.id) });
  const key = rooms.length === 1 ? 'edc_rooms_created_one' : 'edc_rooms_created_many';
  const message = t(lang, key, { n: rooms.length });
  useUi.setState({ status: { key, args: { n: rooms.length } } });
  return { count: rooms.length, message };
}
