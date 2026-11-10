import { isFloor, isOpening, isWall, viewProfileOf, type Id, type Project } from '@hestia/model';
import { vistaDeArea } from './vistaDeArea.ts';
import { t, useI18n } from './i18n.ts';

/**
 * Política R1: ao criar um elemento de modelo que o perfil da planta de área oculta, a ferramenta segue funcionando
 * (não bloqueia), mas a barra de status avisa que a vista não o mostra. Devolve a mensagem, ou null.
 */
export function hiddenCreationWarning(before: Project, after: Project, planId: Id): string | null {
  const lang = useI18n.getState().lang;
  if (!vistaDeArea(after, planId)) return null;
  const ly = viewProfileOf(after, planId).layers;
  if (ly.walls !== 'hidden' && ly.openings && ly.floors) return null;
  const hidden = new Set<string>();
  for (const [id, e] of Object.entries(after.elements)) {
    if (before.elements[id]) continue;
    if (isWall(e) && ly.walls === 'hidden') hidden.add(t(lang, 'edc_cat_walls'));
    else if (isOpening(e) && !ly.openings) hidden.add(t(lang, 'edc_cat_openings'));
    else if (isFloor(e) && !ly.floors) hidden.add(t(lang, 'edc_cat_floors'));
  }
  if (!hidden.size) return null;
  const camadas = [...hidden];
  const lista = camadas.length > 1
    ? t(lang, 'edc_list_and', { list: camadas.slice(0, -1).join(', '), last: camadas[camadas.length - 1]! })
    : camadas[0]!;
  return t(lang, 'edc_hidden_by_profile', { layers: lista });
}
