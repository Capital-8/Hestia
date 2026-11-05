import type { Command, Id, ProjectStore, Sheet, SheetViewport } from '@hestia/model';
import { t, useI18n } from '../../editor/i18n.ts';
import { clampedAt } from '../../editor/sheetActions.ts';
import type { PaperBox } from './sheetSelection.ts';

/**
 * Gravações de um gesto de layout: todas viram **um** comando `batch` (um passo de desfazer) e todas limitam a caixa à
 * área de desenho antes de gravar. Devolvem a recusa no idioma ativo, ou null quando gravaram.
 */

const refused = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  return t(useI18n.getState().lang, 'cvs_refused');
};

/** Move as vistas `ids` para as caixas dadas (mm de papel). */
export function commitMove(store: ProjectStore, sheetId: Id, sheet: Sheet, ids: readonly string[], boxes: Record<string, PaperBox>): string | null {
  const cmds: Command[] = [];
  for (const id of ids) {
    const vp = sheet.viewports.find((v) => v.id === id);
    const b = boxes[id];
    if (!vp || !b) continue;
    const at = clampedAt(sheet, vp.size, { x: b.x, y: b.y });
    if (Math.abs(at.x - vp.at.x) < 1e-6 && Math.abs(at.y - vp.at.y) < 1e-6) continue;
    const patch: Partial<Omit<SheetViewport, 'id'>> = { at };
    // A âncora acompanha a vista (o desenho continua no mesmo ponto relativo à caixa).
    if (vp.anchor) patch.anchor = { x: vp.anchor.x + (at.x - vp.at.x), y: vp.anchor.y + (at.y - vp.at.y) };
    cmds.push({ type: 'updateViewport', sheetId, id, patch });
  }
  if (cmds.length === 0) return null;
  try {
    const lang = useI18n.getState().lang;
    store.exec({ type: 'batch', commands: cmds }, t(lang, cmds.length > 1 ? 'cvs_undo_move_many' : 'cvs_undo_move_one'));
    return null;
  } catch (e) {
    return refused(e);
  }
}

/** Nudge por teclado (mm). */
export function commitNudge(store: ProjectStore, sheetId: Id, sheet: Sheet, ids: readonly string[], dx: number, dy: number): string | null {
  const boxes: Record<string, PaperBox> = {};
  for (const v of sheet.viewports) if (ids.includes(v.id) && v.locked !== true) boxes[v.id] = { x: v.at.x + dx, y: v.at.y + dy, w: v.size.w, h: v.size.h };
  return Object.keys(boxes).length === 0 ? t(useI18n.getState().lang, 'cvs_all_locked') : commitMove(store, sheetId, sheet, ids, boxes);
}

/** Remove as vistas selecionadas (as travadas ficam). */
export function commitRemove(store: ProjectStore, sheetId: Id, sheet: Sheet, ids: readonly string[]): string | null {
  const targets = sheet.viewports.filter((v) => ids.includes(v.id) && v.locked !== true).map((v) => v.id);
  const lang = useI18n.getState().lang;
  if (targets.length === 0) return t(lang, 'cvs_all_locked');
  try {
    store.exec(
      { type: 'batch', commands: targets.map((id) => ({ type: 'removeViewport', sheetId, id }) satisfies Command) },
      t(lang, targets.length > 1 ? 'cvs_undo_delete_many' : 'cvs_undo_delete_one'),
    );
    return null;
  } catch (e) {
    return refused(e);
  }
}
