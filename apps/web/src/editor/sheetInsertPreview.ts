import { sheetInnerBox, sheetOf, type Id, type Project, type ProjectStore, type Sheet, type SheetViewSource } from '@hestia/model';
import { t, useI18n } from './i18n.ts';
import { addViewportAtAction, addViewsAction, autoScaleForView, contentSizeMm, freeSpotFor, naturalScaleOf } from './sheetInsert.ts';

/**
 * Lógica pura da janela "Inserir vistas" (escolha de escala e inserção): que escalas oferecer, como ler uma escala
 * digitada, a escala de cada modo e a inserção no ponto solto (Shift ao arrastar). Quanto a vista ocupa e se cabe
 * (`previewInsert`) só decide esse caso; a lista de vistas da janela não tem prévia.
 */

/** Escalas oferecidas na janela (denominadores), de 1:20 a 1:500; qualquer outra entra como personalizada. */
export const INSERT_SCALES: readonly number[] = [20, 25, 50, 75, 100, 125, 150, 200, 250, 500];

/** Faixa aceita para a escala personalizada (denominador). */
export const CUSTOM_SCALE_MIN = 1;
export const CUSTOM_SCALE_MAX = 5000;

/** Lê "1:75", "1/75" ou "75"; null se vazio, não numérico ou fora de [1, 5000]. Inteiro (denominador). */
export function parseCustomScale(text: string): number | null {
  const m = /^\s*(?:1\s*[:/]\s*)?(\d+(?:[.,]\d+)?)\s*$/.exec(text);
  if (!m) return null;
  const n = Math.round(Number(m[1]!.replace(',', '.')));
  return Number.isFinite(n) && n >= CUSTOM_SCALE_MIN && n <= CUSTOM_SCALE_MAX ? n : null;
}

export interface InsertPreview {
  scale: number;
  /** Tamanho que a vista ocupa na folha nessa escala (mm de papel). */
  size: { w: number; h: number };
  /** Cabe na área de desenho (ignorando as outras vistas). */
  fitsSheet: boolean;
  /** Quanto passa da área de desenho (mm, 0 se couber). */
  overflow: { w: number; h: number };
  /** Posição da caixa (canto inferior esquerdo) ou null se não há lugar. Com `centre`, centrada ali e limitada à área. */
  at: { x: number; y: number } | null;
  /** Cabe, mas no lugar escolhido sobrepõe outras vistas ou o carimbo? (só com `centre`) */
  overlapsOthers: boolean;
}

const EPS = 1e-6;

/** Escala inicial da janela: a natural da vista se couber na folha; senão a maior que cabe. */
export function initialInsertScale(p: Project, sheet: Sheet, view: SheetViewSource): number {
  const inner = sheetInnerBox(sheet);
  const box = { w: inner.x1 - inner.x0, h: inner.y1 - inner.y0 };
  const natural = naturalScaleOf(p, view);
  const c = contentSizeMm(p, view, natural);
  return c.w <= box.w + EPS && c.h <= box.h + EPS ? natural : autoScaleForView(p, view, box);
}

/** Prévia de inserir `view` na escala `scale`: tamanho, se cabe e onde fica. */
export function previewInsert(p: Project, sheet: Sheet, view: SheetViewSource, scale: number, centre?: { x: number; y: number }): InsertPreview {
  const inner = sheetInnerBox(sheet);
  const innerW = inner.x1 - inner.x0;
  const innerH = inner.y1 - inner.y0;
  const size = contentSizeMm(p, view, scale);
  const overflow = { w: Math.max(0, size.w - innerW), h: Math.max(0, size.h - innerH) };
  const fitsSheet = overflow.w <= EPS && overflow.h <= EPS;
  if (!fitsSheet) return { scale, size, fitsSheet, overflow, at: null, overlapsOthers: false };
  if (centre) {
    const at = {
      x: Math.min(Math.max(centre.x - size.w / 2, inner.x0), inner.x1 - size.w),
      y: Math.min(Math.max(centre.y - size.h / 2, inner.y0), inner.y1 - size.h),
    };
    const rect = { x: at.x, y: at.y, w: size.w, h: size.h };
    const hit = sheet.viewports.some((v) => at.x < v.at.x + v.size.w && v.at.x < at.x + rect.w && at.y < v.at.y + v.size.h && v.at.y < at.y + rect.h);
    return { scale, size, fitsSheet, overflow, at, overlapsOthers: hit };
  }
  const spot = freeSpotFor(sheet, [], size);
  return { scale, size, fitsSheet, overflow, at: spot, overlapsOthers: false };
}

/** Modo de escala da janela: a da vista, a maior que cabe ou um denominador escolhido/digitado. */
export type ScaleMode = 'natural' | 'auto' | number;

/** Escala efetiva de uma vista num modo: `natural` cai na maior que cabe quando a natural não cabe. */
export function scaleForMode(p: Project, sheet: Sheet, view: SheetViewSource, mode: ScaleMode): number {
  if (typeof mode === 'number') return mode;
  const inner = sheetInnerBox(sheet);
  if (mode === 'auto') return autoScaleForView(p, view, { w: inner.x1 - inner.x0, h: inner.y1 - inner.y0 });
  return initialInsertScale(p, sheet, view);
}

/**
 * Insere as vistas na escala do modo. Uma só vista com `centre` entra centrada no ponto (soltura do arraste); o resto
 * segue o caminho do lote (primeiro lugar livre). Um passo de desfazer; lança Error se algo não couber.
 */
export function insertViewsWithMode(store: ProjectStore, sheetId: Id, views: readonly SheetViewSource[], mode: ScaleMode, centre?: { x: number; y: number }): Id[] {
  const sheet = sheetOf(store.project, sheetId);
  if (!sheet) throw new Error(t(useI18n.getState().lang, 'cvs_sheet_missing_err'));
  const first = views[0];
  if (views.length === 1 && centre && first) {
    const scale = scaleForMode(store.project, sheet, first, mode);
    const pv = previewInsert(store.project, sheet, first, scale, centre);
    if (!pv.fitsSheet || !pv.at) throw new Error(t(useI18n.getState().lang, 'cvs_drop_too_big'));
    return [addViewportAtAction(store, sheetId, first, { at: pv.at, size: pv.size, scale, adjusted: false })];
  }
  return addViewsAction(store, sheetId, views.map((view) => ({ view, scale: scaleForMode(store.project, sheet, view, mode) })));
}
