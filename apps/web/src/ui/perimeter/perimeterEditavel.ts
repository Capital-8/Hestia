import { isCeiling, isFloor, isRoof, isSlab, type Id, type Project } from '@hestia/model';
import type { MenuEntry, MenuLang } from '../../editor/contextMenu.ts';
import { t } from '../../editor/i18n.ts';

/** Id do único elemento selecionado que tem perímetro (telhado, piso, laje ou forro); null nos demais casos. */
export function idPerimetroEditavel(p: Project, selection: readonly Id[]): Id | null {
  if (selection.length !== 1) return null;
  const el = p.elements[selection[0]!];
  return isRoof(el) || isFloor(el) || isSlab(el) || isCeiling(el) ? el.id : null;
}

/** Entrada "Editar perímetro" do menu de contexto, logo depois de "Criar semelhante" (só com um elemento editável). */
export const EDITAR_PERIMETRO_ID = 'editPerimeter';

export function comEditarPerimetro(items: MenuEntry[], lang: MenuLang, editavel: boolean): MenuEntry[] {
  const idx = items.findIndex((e) => e.id === 'createSimilar');
  if (!editavel || idx < 0) return items;
  const entrada: MenuEntry = { id: EDITAR_PERIMETRO_ID, label: t(lang, 'pro_pm_context_edit') };
  return [...items.slice(0, idx + 1), entrada, ...items.slice(idx + 1)];
}
