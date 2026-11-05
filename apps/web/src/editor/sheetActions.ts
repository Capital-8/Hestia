import { newSheetId, newViewportId, areaPlanOf, projectSheets, sectionPoints, sheetDimsMm, sheetInnerBox, sheetIssue, sheetOf, viewportAnchor, viewportIssue, type Command, type Id, type Project, type ProjectStore, type Sheet, type SheetViewport, type SheetViewSource } from '@hestia/model';
import { buildSheetDrawList, levelBox, sectionBox, STAMP_W, stampHeightOf, type SheetDrawList } from '@hestia/render';
import { computeSection } from '@hestia/engine';
import { exportSheetsPdf } from '@hestia/io';
import { fmtDate, t, useI18n, type Lang } from './i18n.ts';

/**
 * Ações sobre pranchas (decisão 0022): cada uma é um comando com desfazer. O que é função pura (número, posição, cópia)
 * fica aqui para o teste; a tela só chama.
 */

/** Passo da grade para procurar lugar livre (mm). */
const SPOT_STEP = 10;
/** Tamanho padrão de uma vista nova (mm de papel); encolhe se não couber na área de desenho. */
const DEFAULT_SIZE: Record<SheetViewSource['kind'], { w: number; h: number }> = { plan: { w: 180, h: 130 }, areaPlan: { w: 180, h: 130 }, areaTable: { w: 120, h: 120 }, section: { w: 180, h: 100 }, '3d': { w: 180, h: 130 } };
export const SCALE_OPTIONS = [20, 25, 50, 100, 200, 500] as const;

/** Número seguinte da prancha: A-101, A-102, … a partir do que já existe. */
export function nextSheetNumber(p: Pick<Project, 'sheets'>): string {
  const used = new Set(projectSheets(p).map((s) => s.number));
  let n = 101 + projectSheets(p).length;
  while (used.has(`A-${n}`)) n++;
  return `A-${n}`;
}

/** Prancha nova, A3 deitada, com o carimbo preenchido com o nome do projeto e a data de hoje. */
export function newSheet(p: Pick<Project, 'sheets' | 'name'>, today = new Date()): Sheet {
  const lang = useI18n.getState().lang;
  return {
    id: newSheetId(),
    number: nextSheetNumber(p),
    name: t(lang, 'cvs_new_sheet'),
    size: 'A3',
    orientation: 'landscape',
    margin: 10,
    titleBlock: { project: p.name, client: '', author: '', date: fmtDate(lang, today), revision: '0' },
    viewports: [],
  };
}

/** Limita a posição de `at` para a caixa da vista ficar inteira dentro da área de desenho. */
export function clampedAt(s: Pick<Sheet, 'size' | 'orientation' | 'margin'>, size: { w: number; h: number }, at: { x: number; y: number }): { x: number; y: number } {
  const box = sheetInnerBox(s);
  return {
    x: Math.min(Math.max(at.x, box.x0), box.x1 - size.w),
    y: Math.min(Math.max(at.y, box.y0), box.y1 - size.h),
  };
}

/** Tamanho padrão de uma vista do tipo dado, reduzido para caber na área de desenho. */
export function defaultViewSize(s: Pick<Sheet, 'size' | 'orientation' | 'margin'>, source: SheetViewSource): { w: number; h: number } {
  const box = sheetInnerBox(s);
  const want = DEFAULT_SIZE[source.kind];
  return { w: Math.min(want.w, box.x1 - box.x0), h: Math.min(want.h, box.y1 - box.y0) };
}

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Caixa do carimbo na folha (o carimbo cresce com as revisões da prancha). */
const stampRect = (s: Pick<Sheet, 'size' | 'orientation' | 'margin' | 'revisions'>): Rect => {
  const box = sheetInnerBox(s);
  return { x: box.x1 - STAMP_W, y: box.y0, w: STAMP_W, h: stampHeightOf(s) };
};

/**
 * Lugar para uma vista nova: a primeira posição da grade (passo de 10 mm, de baixo para cima) em que a caixa cabe na
 * área de desenho sem tocar as vistas existentes nem o carimbo (canto inferior direito, por cima da folha). Sem lugar
 * livre, o canto inferior esquerdo.
 */
export function freeSpot(s: Pick<Sheet, 'size' | 'orientation' | 'margin' | 'viewports' | 'revisions'>, size: { w: number; h: number }): { x: number; y: number } {
  const box = sheetInnerBox(s);
  const stamp = stampRect(s);
  const taken = (r: Rect): boolean => overlaps(r, stamp) || s.viewports.some((v) => overlaps(r, { x: v.at.x, y: v.at.y, w: v.size.w, h: v.size.h }));
  for (let y = box.y0; y + size.h <= box.y1 + 1e-6; y += SPOT_STEP) {
    for (let x = box.x0; x + size.w <= box.x1 + 1e-6; x += SPOT_STEP) {
      if (!taken({ x, y, w: size.w, h: size.h })) return { x, y };
    }
  }
  return { x: box.x0, y: box.y0 };
}

/** Comando que duplica a prancha com ids novos (vistas inclusas) e número seguinte. Prancha inexistente: null. */
export function duplicateSheetCommand(p: Pick<Project, 'sheets'>, id: Id): Command | null {
  const lang = useI18n.getState().lang;
  const src = sheetOf(p, id);
  if (!src) return null;
  const copy: Sheet = {
    ...src,
    id: newSheetId(),
    number: nextSheetNumber(p),
    name: `${src.name}${t(lang, 'cvs_copy_suffix')}`,
    titleBlock: { ...src.titleBlock },
    viewports: src.viewports.map((v) => ({ ...v, id: newViewportId(), at: { ...v.at }, size: { ...v.size }, ...(v.anchor ? { anchor: { ...v.anchor } } : {}) })),
  };
  return { type: 'batch', commands: [{ type: 'addSheet', sheet: copy }] };
}

export const addSheetAction = (store: ProjectStore): Id => {
  const s = newSheet(store.project);
  store.exec({ type: 'addSheet', sheet: s }, t(useI18n.getState().lang, 'cvs_undo_create_sheet'));
  return s.id;
};

/** Tamanho de uma planta de área na prancha: o conteúdo do nível na escala, com 30 mm de folga. */
export function areaPlanSheetSize(p: Project, planId: Id, scale: number): { w: number; h: number } {
  const plan = areaPlanOf(p, planId);
  const box = plan ? levelBox(p, plan.levelId) : null;
  if (!box) return { w: 180, h: 130 };
  return { w: (box.maxX - box.minX) * (scale / 1000) + 30, h: (box.maxY - box.minY) * (scale / 1000) + 30 };
}

/**
 * Adiciona uma vista (planta, planta de área, corte ou 3D) na escala dada, no primeiro lugar livre. Para planta de
 * área, o tamanho sai do conteúdo do nível e a escala desce se não couber na folha. Erro no idioma ativo se recusar.
 */
export function addViewAction(store: ProjectStore, sheetId: Id, view: SheetViewSource, scale: number): Id {
  const lang = useI18n.getState().lang;
  const s = sheetOf(store.project, sheetId);
  if (!s) throw new Error(t(lang, 'cvs_sheet_missing_err'));
  const inner = sheetInnerBox(s);
  let vpScale = scale;
  let size = view.kind === 'areaPlan' ? areaPlanSheetSize(store.project, view.planId, vpScale) : defaultViewSize(s, view);
  if (view.kind === 'areaPlan' && (size.w > inner.x1 - inner.x0 || size.h > inner.y1 - inner.y0)) {
    const k = Math.min((inner.x1 - inner.x0) / size.w, (inner.y1 - inner.y0) / size.h);
    vpScale = Math.max(10, Math.round(scale * k));
    size = areaPlanSheetSize(store.project, view.planId, vpScale);
  }
  const at = freeSpot(s, size);
  const vp: SheetViewport = { id: newViewportId(), view, at, size, scale: vpScale };
  store.exec({ type: 'addViewport', sheetId, viewport: vp }, t(lang, 'cvs_undo_add_view'));
  return vp.id;
}

/** Move uma vista; a posição é limitada à área de desenho antes de gravar. Devolve a recusa, ou null se gravou. */
export function moveViewportAction(store: ProjectStore, sheetId: Id, vpId: Id, at: { x: number; y: number }): string | null {
  const lang = useI18n.getState().lang;
  const s = sheetOf(store.project, sheetId);
  const vp = s?.viewports.find((v) => v.id === vpId);
  if (!s || !vp) return t(lang, 'cvs_view_missing');
  if (vp.locked === true) return t(lang, 'cvs_locked_move');
  const next = clampedAt(s, vp.size, at);
  const patch: Partial<Omit<SheetViewport, 'id'>> = { at: next };
  // A âncora acompanha a vista: o desenho continua no mesmo ponto relativo à caixa.
  if (vp.anchor) patch.anchor = { x: vp.anchor.x + (next.x - vp.at.x), y: vp.anchor.y + (next.y - vp.at.y) };
  try {
    store.exec({ type: 'updateViewport', sheetId, id: vpId, patch }, t(lang, 'cvs_undo_move_one'));
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : t(lang, 'cvs_failed_move_view');
  }
}

/** Folga (m) que o `levelBox` já acrescenta em volta das paredes (0,5 m de cada lado). */
const LEVEL_BOX_PAD_M = 1;

/** Caixa do conteúdo de uma vista em metros (largura × altura), ou null quando não há modelo a enquadrar. */
export function viewContentBoxM(p: Project, view: SheetViewSource): { w: number; h: number } | null {
  if (view.kind === 'plan') {
    const b = levelBox(p, view.levelId);
    return b ? { w: Math.max(0.1, b.maxX - b.minX - LEVEL_BOX_PAD_M), h: Math.max(0.1, b.maxY - b.minY - LEVEL_BOX_PAD_M) } : null;
  }
  if (view.kind === 'areaPlan') {
    const plan = areaPlanOf(p, view.planId);
    const b = plan ? levelBox(p, plan.levelId) : null;
    return b ? { w: Math.max(0.1, b.maxX - b.minX - LEVEL_BOX_PAD_M), h: Math.max(0.1, b.maxY - b.minY - LEVEL_BOX_PAD_M) } : null;
  }
  if (view.kind === 'section') {
    const section = p.views.find((v) => v.id === view.sectionId);
    if (!section) return null;
    const pts = sectionPoints(p, section);
    const box = sectionBox(computeSection(p, { a: pts.a, b: pts.b, depth: section.depth }));
    return box ? { w: box.maxX - box.minX, h: box.maxY - box.minY } : null;
  }
  return null;
}

/** Tamanho de moldura (mm de papel) que enquadra o conteúdo na escala dada, com folga `padMm` de cada lado. */
export function fitSizeMm(p: Project, view: SheetViewSource, scale: number, padMm = 8): { w: number; h: number } | null {
  const c = viewContentBoxM(p, view);
  if (!c) return null;
  // 1:50 → 1 m do mundo vale 20 mm de papel.
  const k = 1000 / scale;
  return { w: Math.max(20, c.w * k + padMm * 2), h: Math.max(20, c.h * k + padMm * 2) };
}

/** Caixa centrada no centro atual com o tamanho novo, encaixada na área de desenho. */
function centredBox(s: Sheet, vp: SheetViewport, size: { w: number; h: number }): { at: { x: number; y: number }; size: { w: number; h: number }; anchor: { x: number; y: number } } {
  const box = sheetInnerBox(s);
  const w = Math.min(size.w, box.x1 - box.x0);
  const h = Math.min(size.h, box.y1 - box.y0);
  const at = clampedAt(s, { w, h }, { x: vp.at.x + (vp.size.w - w) / 2, y: vp.at.y + (vp.size.h - h) / 2 });
  return { at, size: { w, h }, anchor: { x: at.x + w / 2, y: at.y + h / 2 } };
}

/**
 * Redimensiona a vista (Revit: arrastar a *Crop Region*): a caixa é encaixada na área de desenho e o desenho continua
 * na mesma escala. Na primeira vez, grava a âncora no centro atual do conteúdo para a caixa crescer/encolher sem
 * mover o desenho. Um passo de desfazer por gesto. Devolve a recusa, ou null.
 */
export function resizeViewportAction(store: ProjectStore, sheetId: Id, vpId: Id, rect: { x: number; y: number; w: number; h: number }): string | null {
  const lang = useI18n.getState().lang;
  const s = sheetOf(store.project, sheetId);
  const vp = s?.viewports.find((v) => v.id === vpId);
  if (!s || !vp) return t(lang, 'cvs_view_missing');
  if (vp.locked === true) return t(lang, 'cvs_locked_resize');
  const box = sheetInnerBox(s);
  const w = Math.max(5, Math.min(rect.w, box.x1 - box.x0));
  const h = Math.max(5, Math.min(rect.h, box.y1 - box.y0));
  const at = clampedAt(s, { w, h }, { x: rect.x, y: rect.y });
  try {
    if (Math.abs(w - vp.size.w) < 1e-6 && Math.abs(h - vp.size.h) < 1e-6 && Math.abs(at.x - vp.at.x) < 1e-6 && Math.abs(at.y - vp.at.y) < 1e-6) return null;
    const patch: Partial<Omit<SheetViewport, 'id'>> = { at, size: { w, h } };
    // Sem âncora (arquivo antigo), fixa a posição atual do conteúdo: o primeiro redimensionamento já não pula.
    if (!vp.anchor) patch.anchor = viewportAnchor(vp);
    store.exec({ type: 'updateViewport', sheetId, id: vpId, patch }, t(lang, 'cvs_undo_resize_view'));
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : t(lang, 'cvs_failed_resize_view');
  }
}

/**
 * Muda a escala da vista. Com `fitFrame` (padrão), a moldura cresce/encolhe junto para enquadrar o conteúdo — o
 * comportamento esperado ao trocar 1:100 por 1:50 (ArchiCAD). Sem ele, a moldura fica e o desenho é recortado (Revit).
 */
export function setViewportScaleAction(store: ProjectStore, sheetId: Id, vpId: Id, scale: number, fitFrame = true): string | null {
  const lang = useI18n.getState().lang;
  const s = sheetOf(store.project, sheetId);
  const vp = s?.viewports.find((v) => v.id === vpId);
  if (!s || !vp) return t(lang, 'cvs_view_missing');
  if (!(Number.isFinite(scale) && scale > 0)) return t(lang, 'cvs_scale_positive');
  if (vp.locked === true) return t(lang, 'cvs_locked_scale');
  const patch: Partial<Omit<SheetViewport, 'id'>> = { scale };
  if (fitFrame) {
    const size = fitSizeMm(store.project, vp.view, scale);
    if (size) Object.assign(patch, centredBox(s, vp, size));
  }
  try {
    store.exec({ type: 'updateViewport', sheetId, id: vpId, patch }, t(lang, 'cvs_undo_change_scale'));
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : t(lang, 'cvs_failed_change_scale');
  }
}

/**
 * Troca o ponto de vista 3D da vista selecionada: `pointId` escolhe um ponto salvo do catálogo; `null` volta ao
 * enquadramento padrão (decisão 0040). Só vale para vista 3D. Devolve a recusa, ou null quando gravou.
 */
export function setViewportView3DPointAction(store: ProjectStore, sheetId: Id, vpId: Id, pointId: Id | null): string | null {
  const lang = useI18n.getState().lang;
  const s = sheetOf(store.project, sheetId);
  const vp = s?.viewports.find((v) => v.id === vpId);
  if (!s || !vp) return t(lang, 'cvs_view_missing');
  if (vp.view.kind !== '3d') return t(lang, 'cvs_3d_point_only');
  const view: SheetViewSource = pointId ? { kind: '3d', pointId } : { kind: '3d' };
  try {
    store.exec({ type: 'updateViewport', sheetId, id: vpId, patch: { view } }, t(lang, 'cvs_undo_change_3d_point'));
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : t(lang, 'cvs_failed_change_point');
  }
}

/** Ajusta a moldura ao conteúdo na escala atual, mantendo o centro (Revit: *Size Crop* > Fit). */
export function fitViewportAction(store: ProjectStore, sheetId: Id, vpId: Id, padMm = 8): string | null {
  const lang = useI18n.getState().lang;
  const s = sheetOf(store.project, sheetId);
  const vp = s?.viewports.find((v) => v.id === vpId);
  if (!s || !vp) return t(lang, 'cvs_view_missing');
  const size = fitSizeMm(store.project, vp.view, vp.scale, padMm);
  if (!size) return t(lang, 'cvs_view_no_model');
  if (vp.locked === true) return t(lang, 'cvs_locked_frame');
  const next = centredBox(s, vp, size);
  try {
    store.exec({ type: 'updateViewport', sheetId, id: vpId, patch: { at: next.at, size: next.size, anchor: next.anchor } }, t(lang, 'cvs_undo_fit_frame'));
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : t(lang, 'cvs_failed_fit_frame');
  }
}

/**
 * Move o conteúdo dentro da moldura (pan da vista): desloca a âncora em mm de papel, sem tocar na caixa e sem o limite
 * artificial do `offset` antigo (o desenho pode sair de vista e voltar).
 */
export function moveViewportContentAction(store: ProjectStore, sheetId: Id, vpId: Id, offset: { x: number; y: number }): string | null {
  const lang = useI18n.getState().lang;
  const s = sheetOf(store.project, sheetId);
  const vp = s?.viewports.find((v) => v.id === vpId);
  if (!s || !vp) return t(lang, 'cvs_view_missing');
  if (vp.locked === true) return t(lang, 'cvs_locked_content');
  if (!(Number.isFinite(offset.x) && Number.isFinite(offset.y))) return t(lang, 'cvs_offset_finite');
  const base = viewportAnchor(vp);
  try {
    store.exec(
      { type: 'updateViewport', sheetId, id: vpId, patch: { anchor: { x: base.x + offset.x, y: base.y + offset.y }, offset: undefined } },
      t(lang, 'cvs_undo_move_content'),
    );
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : t(lang, 'cvs_failed_move_content');
  }
}

/** Trava/destrava a vista (Revit: *Pin*): travada, ela não se move, não se redimensiona e não troca de escala. */
export function toggleViewportLockAction(store: ProjectStore, sheetId: Id, vpId: Id): string | null {
  const lang = useI18n.getState().lang;
  const s = sheetOf(store.project, sheetId);
  const vp = s?.viewports.find((v) => v.id === vpId);
  if (!s || !vp) return t(lang, 'cvs_view_missing');
  try {
    store.exec(
      { type: 'updateViewport', sheetId, id: vpId, patch: { locked: vp.locked !== true } },
      t(lang, vp.locked === true ? 'cvs_undo_unlock_view' : 'cvs_undo_lock_view'),
    );
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : t(lang, 'cvs_failed_lock_view');
  }
}

/** Mensagem de recusa para as propriedades da folha (tamanho, margem), ou null se a prancha está válida. */
export function sheetProblem(s: Sheet): string | null {
  return sheetIssue(s) ?? s.viewports.map((v) => viewportIssue(s, v)).find((x) => x !== null) ?? null;
}

/** Desenho de todas as pranchas, na ordem da lista (o que o PDF imprime). */
export function sheetDrawLists(p: Project, lang: Lang = useI18n.getState().lang): SheetDrawList[] {
  return projectSheets(p)
    .map((s) => buildSheetDrawList(p, s.id, lang))
    .filter((d): d is SheetDrawList => d !== null);
}

/** PDF com uma página por prancha. Sem pranchas: null (nada a exportar). */
export function sheetsPdfOf(p: Project, lang: Lang = useI18n.getState().lang): Uint8Array | null {
  const lists = sheetDrawLists(p, lang);
  if (lists.length === 0) return null;
  return exportSheetsPdf(lists, p.name);
}

/**
 * Sem pranchas, o PDF exporta a planta do nível atual numa prancha nova (escala 1:100), para não virar beco sem saída.
 * São dois comandos com desfazer (criar prancha, colocar a vista). Devolve o id da prancha criada.
 */
export function pranchaDaPlantaAtual(store: ProjectStore, levelId: Id): Id {
  // Um único passo de desfazer: prancha e vista somem juntas (com Ctrl+Z não sobra prancha vazia).
  let id = '';
  store.transaction(t(useI18n.getState().lang, 'cvs_undo_create_sheet_plan'), () => {
    id = addSheetAction(store);
    addViewAction(store, id, { kind: 'plan', levelId }, 100);
  });
  return id;
}


/**
 * Muda folha (tamanho, orientação ou margem) reencaixando as vistas na nova área de desenho, em vez de recusar quando
 * alguma ficaria fora. É um único passo de desfazer: primeiro as vistas encolhem/movem, depois a folha muda (o comando
 * `updateSheet` valida a folha nova com as vistas já dentro). Devolve a recusa, ou null quando gravou.
 */
export function changeSheetAction(store: ProjectStore, sheetId: Id, patch: Partial<Pick<Sheet, 'size' | 'orientation' | 'margin'>>): string | null {
  const lang = useI18n.getState().lang;
  const s = sheetOf(store.project, sheetId);
  if (!s) return t(lang, 'cvs_sheet_missing_err');
  const next: Sheet = { ...s, ...patch };
  const dims = sheetDimsMm(next);
  const m = next.margin;
  const inner = { x0: m, y0: m, x1: dims.w - m, y1: dims.h - m };
  const cmds: Command[] = [];
  for (const v of s.viewports) {
    const w = Math.max(5, Math.min(v.size.w, inner.x1 - inner.x0));
    const h = Math.max(5, Math.min(v.size.h, inner.y1 - inner.y0));
    const x = Math.min(Math.max(v.at.x, inner.x0), inner.x1 - w);
    const y = Math.min(Math.max(v.at.y, inner.y0), inner.y1 - h);
    const moved = Math.abs(x - v.at.x) > 1e-6 || Math.abs(y - v.at.y) > 1e-6;
    const resized = Math.abs(w - v.size.w) > 1e-6 || Math.abs(h - v.size.h) > 1e-6;
    if (!moved && !resized) continue;
    const patch: Partial<Omit<SheetViewport, 'id'>> = { at: { x, y }, size: { w, h } };
    // A âncora acompanha o deslocamento (o desenho continua relativo à caixa) e a caixa nova.
    if (v.anchor) patch.anchor = { x: v.anchor.x + (x - v.at.x), y: v.anchor.y + (y - v.at.y) };
    cmds.push({ type: 'updateViewport', sheetId, id: v.id, patch });
  }
  try {
    store.exec({ type: 'batch', commands: [...cmds, { type: 'updateSheet', id: sheetId, patch }] }, t(lang, 'cvs_undo_change_sheet'));
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : t(lang, 'cvs_failed_change_sheet');
  }
}
