/** Comandos de Modificar que agem sobre as linhas do rascunho do perímetro. O botão do painel Modificar liga um
 * deles (`PerimeterTool.setModify`); sem comando ativo a ferramenta volta a selecionar linhas.
 */
import { t, type DictKey, type Lang } from './i18n.ts';

export type PerimeterModifyKind =
  | 'trim' /** Aparar/Estender: dois cliques em linhas, forma o canto. Tab alterna: canto / aparar até limite / estender até limite. */
  | 'split' /** Dividir elemento: clique no ponto. Tab alterna: dividir / dividir com espaço (dois cliques). */
  | 'offset' /** Deslocar: distância digitada ou clique do lado; laço conectado mantém os cantos. */
  | 'move'
  | 'copy'
  | 'rotate'
  | 'mirror' /** Espelhar: dois pontos do eixo; copia por padrão com Tab. */
  | 'array'
  | 'align' /** Alinhar linha a uma referência. */
  | 'delete';

export const PERIMETER_MODIFY_LABEL: Record<PerimeterModifyKind, string> = {
  trim: 'Aparar/Estender',
  split: 'Dividir elemento',
  offset: 'Deslocar',
  move: 'Mover',
  copy: 'Copiar',
  rotate: 'Rotacionar',
  mirror: 'Espelhar',
  array: 'Matriz',
  align: 'Alinhar',
  delete: 'Excluir',
};

/** Rótulo do comando de Modificar no idioma pedido (PT de `PERIMETER_MODIFY_LABEL` é o fallback). */
export function perimeterModifyLabel(kind: PerimeterModifyKind, lang: Lang = 'pt'): string {
  return t(lang, PERIMETER_MODIFY_KEYS[kind]);
}

const PERIMETER_MODIFY_KEYS: Record<PerimeterModifyKind, DictKey> = {
  trim: 'tl_pm_trim',
  split: 'tl_pm_split',
  offset: 'tl_pm_offset',
  move: 'tl_pm_move',
  copy: 'tl_pm_copy',
  rotate: 'tl_pm_rotate',
  mirror: 'tl_pm_mirror',
  array: 'tl_pm_array',
  align: 'tl_pm_align',
  delete: 'tl_pm_delete',
};
