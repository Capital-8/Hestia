import { sheetInnerBox, sheetOf, viewportBox, type Command, type Id, type ProjectStore, type SheetBox, type SheetViewport } from '@hestia/model';
import { t, useI18n } from './i18n.ts';

/** Tradução imediata no idioma ativo (as recusas voltam como texto para a barra de status). */
const tr = (key: Parameters<typeof t>[1]): string => t(useI18n.getState().lang, key);

/**
 * Alinhamento e distribuição de vistas na prancha (Revit/ArchiCAD: *Align*). As contas ficam em funções puras para o
 * teste; a tela só chama a ação, que grava um único comando `batch` (um passo de desfazer).
 */

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';

/** Área de desenho da folha (mm de papel): onde as caixas podem ficar. */
export interface SheetInner {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Item de cálculo: a vista e a caixa dela na folha. */
export interface AlignItem {
  id: string;
  box: SheetBox;
}

export interface AlignPlacement {
  id: string;
  at: { x: number; y: number };
}

/** Limita a posição para a caixa caber na área de desenho; caixa maior que a área fica encostada no início. */
function clamped(value: number, size: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(value, hi - size));
}

const place = (item: AlignItem, at: { x: number; y: number }, inner: SheetInner): AlignPlacement => ({
  id: item.id,
  at: { x: clamped(at.x, item.box.w, inner.x0, inner.x1), y: clamped(at.y, item.box.h, inner.y0, inner.y1) },
});

/**
 * Posições para alinhar as vistas umas com as outras: `left`/`right`/`top`/`bottom` encostam na extremidade do conjunto
 * (menor x, maior x+w, menor y, maior y+h) e `hcenter`/`vcenter` centram no meio do conjunto. Devolve todas as vistas,
 * inclusive as que já estavam no lugar; cada eixo é limitado à área de desenho, sem encolher caixas.
 */
export function planAlign(items: AlignItem[], mode: AlignMode, inner: SheetInner): AlignPlacement[] {
  if (items.length === 0) return [];
  const minX = Math.min(...items.map((i) => i.box.x));
  const maxX = Math.max(...items.map((i) => i.box.x + i.box.w));
  const minY = Math.min(...items.map((i) => i.box.y));
  const maxY = Math.max(...items.map((i) => i.box.y + i.box.h));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return items.map((item) => {
    const { box } = item;
    switch (mode) {
      case 'left':
        return place(item, { x: minX, y: box.y }, inner);
      case 'right':
        return place(item, { x: maxX - box.w, y: box.y }, inner);
      case 'hcenter':
        return place(item, { x: cx - box.w / 2, y: box.y }, inner);
      case 'top':
        return place(item, { x: box.x, y: minY }, inner);
      case 'bottom':
        return place(item, { x: box.x, y: maxY - box.h }, inner);
      case 'vcenter':
        return place(item, { x: box.x, y: cy - box.h / 2 }, inner);
    }
  });
}

/**
 * Distribui as vistas igualando os vãos entre caixas, com a primeira e a última paradas (a "coluna"/"linha" cresce só
 * para dentro). Ordena pelo eixo antes de distribuir; menos de três vistas não tem vão a igualar e fica como está.
 */
export function planDistribute(items: AlignItem[], axis: 'h' | 'v', inner: SheetInner): AlignPlacement[] {
  if (items.length < 3) return items.map((item) => place(item, { x: item.box.x, y: item.box.y }, inner));
  const start = (b: SheetBox): number => (axis === 'h' ? b.x : b.y);
  const size = (b: SheetBox): number => (axis === 'h' ? b.w : b.h);
  const sorted = [...items].sort((a, b) => start(a.box) - start(b.box));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const span = start(last.box) + size(last.box) - start(first.box);
  const total = sorted.reduce((sum, item) => sum + size(item.box), 0);
  const gap = (span - total) / (sorted.length - 1);
  let cursor = start(first.box);
  return sorted.map((item) => {
    const at = { x: item.box.x, y: item.box.y };
    if (axis === 'h') at.x = cursor;
    else at.y = cursor;
    cursor += size(item.box) + gap;
    return place(item, at, inner);
  });
}

/** Vistas existentes da prancha, na ordem pedida, sem repetir id. */
function selectedViewports(viewports: SheetViewport[], ids: Id[]): SheetViewport[] {
  const seen = new Set<Id>();
  const picked: SheetViewport[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const vp = viewports.find((v) => v.id === id);
    if (!vp) continue;
    seen.add(id);
    picked.push(vp);
  }
  return picked;
}

const toCommand = (sheetId: Id, placement: AlignPlacement): Command => ({ type: 'updateViewport', sheetId, id: placement.id, patch: { at: placement.at } });

/** Alinha as vistas pedidas num único comando com desfazer. Devolve a recusa em pt-BR, ou null se gravou. */
export function alignViewportsAction(store: ProjectStore, sheetId: Id, ids: Id[], mode: AlignMode): string | null {
  const s = sheetOf(store.project, sheetId);
  if (!s) return tr('edc_sheet_missing');
  const viewports = selectedViewports(s.viewports, ids);
  if (viewports.length < 2) return tr('edc_select_two_views');
  const plan = planAlign(
    viewports.map((v) => ({ id: v.id, box: viewportBox(v) })),
    mode,
    sheetInnerBox(s),
  );
  try {
    store.exec({ type: 'batch', commands: plan.map((p) => toCommand(sheetId, p)) }, 'edc_undo_align_views');
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : tr('edc_align_views_failed');
  }
}

/** Distribui as vistas pedidas num único comando com desfazer. Devolve a recusa, ou null se gravou. */
export function distributeViewportsAction(store: ProjectStore, sheetId: Id, ids: Id[], axis: 'h' | 'v'): string | null {
  const s = sheetOf(store.project, sheetId);
  if (!s) return tr('edc_sheet_missing');
  const viewports = selectedViewports(s.viewports, ids);
  if (viewports.length < 2) return tr('edc_select_two_views');
  const plan = planDistribute(
    viewports.map((v) => ({ id: v.id, box: viewportBox(v) })),
    axis,
    sheetInnerBox(s),
  );
  try {
    store.exec({ type: 'batch', commands: plan.map((p) => toCommand(sheetId, p)) }, 'edc_undo_distribute_views');
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : tr('edc_distribute_views_failed');
  }
}
