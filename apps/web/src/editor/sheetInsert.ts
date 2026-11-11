import { computeSection } from '@hestia/engine';
import {
  newViewportId,
  sectionGraphicsOf,
  sectionPoints,
  sheetInnerBox,
  sheetOf,
  sheetPlanViewOf,
  viewGraphicsOf,
  viewSourceIssue,
  viewportIssue,
  type Id,
  type Project,
  type ProjectStore,
  type Sheet,
  type SheetViewport,
  type SheetViewSource,
} from '@hestia/model';
import { levelBox, sectionBox, STAMP_H, STAMP_W } from '@hestia/render';
import { t, useI18n } from './i18n.ts';
import { defaultViewSize, freeSpot, newSheet, SCALE_OPTIONS } from './sheetActions.ts';

/**
 * Inserção em lote de vistas nas pranchas (decisão 0022): escolhe a escala que cabe, calcula o tamanho do conteúdo e
 * coloca tudo num único passo de desfazer. O que é puro fica aqui para o teste; a tela só chama.
 */

/** Folga entre a caixa da vista e a área de desenho / as outras vistas (mm de papel). */
const SPACING_MM = 10;
/** Folga em volta do conteúdo da vista (mm de papel), nas plantas e no 3D. */
const CONTENT_PADDING_MM = 30;
/**
 * Folga que `levelBox` já acrescenta em torno das paredes, por lado (m). O tamanho da vista mede só o conteúdo: a folga
 * de enquadramento da planta não entra, porque os 30 mm de papel abaixo já cumprem esse papel.
 */
const LEVEL_BOX_PADDING_M = 0.5;
/** Folga em volta do corte/elevação (m de modelo), convertida pela escala como o resto do desenho. */
const SECTION_PADDING_M = 0.3;
/** Tamanhos fixos das vistas que não vêm do modelo (mm de papel). */
const AREA_TABLE_SIZE = { w: 120, h: 120 } as const;
const MODEL_3D_SIZE = { w: 180, h: 130 } as const;
/** Prancha usada para o tamanho padrão de uma vista quando o nível não tem geometria (A3 deitada). */
const FALLBACK_SHEET = { size: 'A3', orientation: 'landscape', margin: 10 } as const;

interface Size {
  w: number;
  h: number;
}

/** Tamanho padrão de uma vista sem conteúdo (o mesmo de `defaultViewSize` numa A3). */
const fallbackSize = (view: SheetViewSource): Size => defaultViewSize(FALLBACK_SHEET, view);

/**
 * Tamanho do conteúdo da vista em mm de papel, já com a folga: planta e planta de área usam `levelBox`; corte e
 * elevação usam `sectionBox(computeSection(...))`; o quadro de áreas e o 3D têm tamanho fixo. Nível sem paredes ou
 * vista órfã caem no tamanho padrão do tipo.
 */
export function contentSizeMm(p: Project, view: SheetViewSource, scale: number): Size {
  // 1:100 → 10 mm de papel por metro de modelo (a escala é o denominador).
  const mmPerM = 1000 / scale;
  if (view.kind === 'plan' || view.kind === 'areaPlan') {
    const levelId = sheetPlanViewOf(p, view)?.levelId;
    const box = levelId ? levelBox(p, levelId) : null;
    if (!box) return fallbackSize(view);
    return {
      // `levelBox` já vem com 0,5 m de folga por lado; aqui medimos só o conteúdo e somamos a folga de papel.
      w: Math.max(0, box.maxX - box.minX - 2 * LEVEL_BOX_PADDING_M) * mmPerM + CONTENT_PADDING_MM,
      h: Math.max(0, box.maxY - box.minY - 2 * LEVEL_BOX_PADDING_M) * mmPerM + CONTENT_PADDING_MM,
    };
  }
  if (view.kind === 'section') {
    const section = p.views.find((v) => v.id === view.sectionId);
    if (!section) return fallbackSize(view);
    const pts = sectionPoints(p, section);
    const box = sectionBox(computeSection(p, { a: pts.a, b: pts.b, depth: section.depth }));
    return {
      w: (box.maxX - box.minX + SECTION_PADDING_M) * mmPerM,
      h: (box.maxY - box.minY + SECTION_PADDING_M) * mmPerM,
    };
  }
  return view.kind === 'areaTable' ? { ...AREA_TABLE_SIZE } : { ...MODEL_3D_SIZE };
}

/**
 * Maior escala que cabe na caixa (mm de papel): o menor denominador, testado de 1:20 a 1:500. Se nenhuma couber,
 * devolve a maior escala disponível (1:500) — quem chama decide recusar. Nunca devolve valor fora de `available`.
 */
export function autoScaleForView(p: Project, view: SheetViewSource, box: Size, available: readonly number[] = SCALE_OPTIONS): number {
  const scales = [...available].sort((a, b) => a - b);
  for (const scale of scales) {
    const c = contentSizeMm(p, view, scale);
    if (c.w <= box.w + 1e-6 && c.h <= box.h + 1e-6) return scale;
  }
  return scales[scales.length - 1] ?? 500;
}

/** Vista a inserir: com `scale`, usa a escala dada; sem ela, a automática. */
export interface InsertRequest {
  view: SheetViewSource;
  scale?: number;
}

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Insere várias vistas na prancha num único passo de desfazer, cada uma no primeiro lugar livre com 10 mm de
 * afastamento (da esquerda para a direita, de baixo para cima). Sem escala, escolhe a maior que cabe. Se alguma não
 * couber, lança erro no idioma ativo antes de gravar qualquer coisa.
 */
export function addViewsAction(store: ProjectStore, sheetId: Id, reqs: InsertRequest[]): Id[] {
  const lang = useI18n.getState().lang;
  const sheet = sheetOf(store.project, sheetId);
  if (!sheet) throw new Error(t(lang, 'cvs_sheet_missing_err'));
  const inner = sheetInnerBox(sheet);
  const innerSize = { w: inner.x1 - inner.x0, h: inner.y1 - inner.y0 };
  const stamp: Rect = { x: inner.x1 - STAMP_W, y: inner.y0, w: STAMP_W, h: STAMP_H };

  // Planeja tudo antes de gravar: ou entram todas as vistas, ou nenhuma.
  const planned: SheetViewport[] = [];
  for (const [i, req] of reqs.entries()) {
    const sourceIssue = viewSourceIssue(store.project, req.view);
    if (sourceIssue) throw new Error(sourceIssue);
    const scale = req.scale ?? autoScaleForView(store.project, req.view, innerSize);
    if (!(Number.isFinite(scale) && scale > 0)) throw new Error(t(lang, 'cvs_scale_positive'));
    const size = contentSizeMm(store.project, req.view, scale);
    if (!(size.w <= innerSize.w + 1e-6 && size.h <= innerSize.h + 1e-6)) {
      throw new Error(t(lang, 'cvs_view_does_not_fit', { n: i + 1 }));
    }
    // As vistas já planejadas entram como obstáculos crescidos: é o que garante os 10 mm entre elas.
    const obstacles = [...sheet.viewports, ...planned].map((v) => ({
      ...v,
      at: { x: v.at.x - SPACING_MM, y: v.at.y - SPACING_MM },
      size: { w: v.size.w + SPACING_MM * 2, h: v.size.h + SPACING_MM * 2 },
    }));
    const at = freeSpot({ ...sheet, viewports: obstacles }, size);
    const rect: Rect = { x: at.x, y: at.y, w: size.w, h: size.h };
    const fits =
      at.x >= inner.x0 - 1e-6 &&
      at.y >= inner.y0 - 1e-6 &&
      at.x + size.w <= inner.x1 + 1e-6 &&
      at.y + size.h <= inner.y1 + 1e-6 &&
      !overlaps(rect, stamp) &&
      !obstacles.some((o) => overlaps(rect, { x: o.at.x, y: o.at.y, w: o.size.w, h: o.size.h }));
    if (!fits) throw new Error(t(lang, 'cvs_view_does_not_fit', { n: i + 1 }));
    planned.push({ id: newViewportId(), view: req.view, at, size, scale });
  }

  store.transaction(t(lang, 'cvs_undo_add_views'), () => {
    for (const viewport of planned) {
      store.exec({ type: 'addViewport', sheetId, viewport }, t(lang, 'cvs_undo_add_view'));
    }
  });
  return planned.map((v) => v.id);
}

/**
 * Cria uma prancha por nível, na ordem física dos níveis, com a planta do nível na área de desenho: a caixa da vista
 * começa no canto inferior esquerdo da área de desenho com 10 mm de folga (o desenho fica centrado dentro dela). Nome
 * `Planta — <nível>`, número automático e carimbo preenchido por `newSheet`. Tudo num único passo de desfazer.
 */
export function sheetsPerLevelAction(store: ProjectStore, scale = 100): Id[] {
  const lang = useI18n.getState().lang;
  if (!(Number.isFinite(scale) && scale > 0)) throw new Error(t(lang, 'cvs_scale_positive'));
  const levels = [...store.project.levels];
  const ids: Id[] = [];
  store.transaction(t(lang, 'cvs_undo_create_level_sheets'), () => {
    for (const level of levels) {
      const sheet: Sheet = { ...newSheet(store.project), name: t(lang, 'cvs_plan_sheet_name', { level: level.name }) };
      const inner = sheetInnerBox(sheet);
      const view: SheetViewSource = { kind: 'plan', levelId: level.id };
      const want = contentSizeMm(store.project, view, scale);
      const size: Size = {
        w: Math.max(1, Math.min(want.w, inner.x1 - inner.x0 - 2 * SPACING_MM)),
        h: Math.max(1, Math.min(want.h, inner.y1 - inner.y0 - 2 * SPACING_MM)),
      };
      const at = { x: inner.x0 + SPACING_MM, y: inner.y0 + SPACING_MM };
      const viewport: SheetViewport = { id: newViewportId(), view, at, size, scale };
      const issue = viewportIssue(sheet, viewport);
      if (issue) throw new Error(issue);
      store.exec({ type: 'addSheet', sheet }, t(lang, 'cvs_undo_create_sheet'));
      store.exec({ type: 'addViewport', sheetId: sheet.id, viewport }, t(lang, 'cvs_undo_add_view'));
      ids.push(sheet.id);
    }
  });
  return ids;
}

/** Escala natural de uma vista (a que ela tem no projeto), usada ao arrastá-la do navegador para a prancha. */
export function naturalScaleOf(p: Project, view: SheetViewSource): number {
  if (view.kind === 'plan' || view.kind === 'areaPlan') {
    const plan = sheetPlanViewOf(p, view);
    // Planta de área: a escala dela; piso: a dos gráficos da vista (sem vista, 100).
    return plan?.kind === 'area' ? (plan.area?.scale ?? 100) : plan ? viewGraphicsOf(p, plan.id).scale : 100;
  }
  if (view.kind === 'section') return sectionGraphicsOf(p).scale;
  return 100;
}

/** Plano de uma vista arrastada: onde a caixa fica, em que escala e se a escala teve de descer para caber. */
export interface DragPlacement {
  at: { x: number; y: number };
  size: Size;
  scale: number;
  /** A escala natural não coube na folha e foi trocada pela maior que cabe. */
  adjusted: boolean;
}

/**
 * Coloca a vista arrastada com o centro no ponto onde o ponteiro foi solto, na escala natural da vista (como o Revit).
 * Se essa escala não couber na área de desenho, desce para a maior que cabe; se nem assim couber, devolve null.
 */
export function dragPlacement(p: Project, sheet: Sheet, view: SheetViewSource, centre: { x: number; y: number }): DragPlacement | null {
  const inner = sheetInnerBox(sheet);
  const innerSize = { w: inner.x1 - inner.x0, h: inner.y1 - inner.y0 };
  let scale = naturalScaleOf(p, view);
  let size = contentSizeMm(p, view, scale);
  let adjusted = false;
  if (size.w > innerSize.w + 1e-6 || size.h > innerSize.h + 1e-6) {
    scale = autoScaleForView(p, view, innerSize);
    size = contentSizeMm(p, view, scale);
    adjusted = true;
    if (size.w > innerSize.w + 1e-6 || size.h > innerSize.h + 1e-6) return null;
  }
  return {
    at: {
      x: Math.min(Math.max(centre.x - size.w / 2, inner.x0), Math.max(inner.x0, inner.x1 - size.w)),
      y: Math.min(Math.max(centre.y - size.h / 2, inner.y0), Math.max(inner.y0, inner.y1 - size.h)),
    },
    size,
    scale,
    adjusted,
  };
}

/** Grava a vista arrastada na posição já ajustada (encaixe/clamp feitos por quem chama): um passo de desfazer. */
export function addViewportAtAction(store: ProjectStore, sheetId: Id, view: SheetViewSource, placement: DragPlacement): Id {
  const lang = useI18n.getState().lang;
  const sheet = sheetOf(store.project, sheetId);
  if (!sheet) throw new Error(t(lang, 'cvs_sheet_missing_err'));
  const issue = viewSourceIssue(store.project, view);
  if (issue) throw new Error(issue);
  const viewport: SheetViewport = { id: newViewportId(), view, at: placement.at, size: placement.size, scale: placement.scale };
  const invalid = viewportIssue(sheet, viewport);
  if (invalid) throw new Error(invalid);
  store.exec({ type: 'addViewport', sheetId, viewport }, t(lang, 'cvs_undo_add_view'));
  return viewport.id;
}
