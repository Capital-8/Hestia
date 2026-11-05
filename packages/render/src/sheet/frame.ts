import type { Project, Sheet, SheetViewport, SheetViewSource } from '@hestia/model';
import { sectionTitleOf, sheetInnerBox, areaPlanOf, view3DPointOf, viewportFrameVisible, viewportLabel } from '@hestia/model';
import { emptyParts, type ViewportParts } from './types.ts';
import { t as translate, type Lang } from '../i18n.ts';

/** Altura das linhas do carimbo e largura da caixa (mm de papel). */
export const STAMP_W = 120;
export const STAMP_ROW = 8;
export const STAMP_HEAD = 12;
export const STAMP_H = STAMP_HEAD + STAMP_ROW * 4;
/** Tinta do desenho impresso (o mesmo tom escuro da planta em papel). */
const paperInk = '#16181c';
const FRAME_MM = 0.5;
const VIEW_MM = 0.25;
const LINE_MM = 0.25;
/** Barra de escala gráfica: 20 mm em 4 segmentos de 5 mm, 1,6 mm de altura. */
const SCALE_BAR_MM = 20;
const SCALE_BAR_SEGMENTS = 4;
const SCALE_BAR_H_MM = 1.6;
const SCALE_BAR_GAP_MM = 3;
/** Largura média de um caractere (fração da altura), a mesma estimativa de `plan/dimLabels.ts`. */
const CHAR_W = 0.6;

const rectPts = (x0: number, y0: number, x1: number, y1: number) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/** Nome da vista na legenda: nível, corte ou o ponto de vista 3D. Vista sem origem válida fica "Vista inexistente". */
export function captionOf(p: Project, view: SheetViewSource, vp: SheetViewport, lang: Lang = 'pt'): string {
  const base = vp.title?.trim() ? vp.title.trim() : sourceName(p, view, lang);
  // Vista 3D não tem escala de desenho (a câmera define o enquadramento): o Revit imprime "NTS".
  return view.kind === '3d' ? `${base} · ${translate(lang, 'rn_sheet_no_scale')}` : `${base} · 1:${vp.scale}`;
}

function sourceName(p: Project, view: SheetViewSource, lang: Lang): string {
  const missing = translate(lang, 'rn_sheet_view_missing');
  if (view.kind === 'plan') return p.levels.find((l) => l.id === view.levelId)?.name ?? missing;
  if (view.kind === 'areaPlan') return areaPlanOf(p, view.planId)?.name ?? missing;
  if (view.kind === 'areaTable') return translate(lang, 'rn_sheet_area_table');
  if (view.kind === 'section') {
    const found = p.views.find((v) => v.id === view.sectionId);
    return found ? sectionTitleOf(found) : missing;
  }
  return (view.pointId ? view3DPointOf(p, view.pointId)?.name : undefined) ?? '3D';
}

/** Escalas usadas na prancha, sem repetição, em ordem: "1:50 · 1:100". Só vistas com escala (o 3D não entra). */
function scalesLine(s: Sheet, lang: Lang): string {
  const set = [...new Set(s.viewports.filter((v) => v.view.kind !== '3d').map((v) => v.scale))];
  return set.length ? set.map((k) => `1:${k}`).join(' · ') : translate(lang, 'rn_sheet_no_scale');
}

/** Altura total do carimbo, já contando a tabela de revisões (uma linha por revisão, acima do bloco). */
export const stampHeightOf = (s: Pick<Sheet, 'revisions'>): number => STAMP_H + (s.revisions?.length ?? 0) * STAMP_ROW;

/** Barra de escala gráfica de 20 mm: 4 segmentos de 5 mm, preenchimento alternado e contorno fino. */
function scaleBarParts(out: ViewportParts, x0: number, yBase: number): void {
  const seg = SCALE_BAR_MM / SCALE_BAR_SEGMENTS;
  const top = yBase + SCALE_BAR_H_MM;
  for (let i = 0; i < SCALE_BAR_SEGMENTS; i += 2) {
    out.fills.push({ polygons: [[rectPts(x0 + i * seg, yBase, x0 + (i + 1) * seg, top)]], color: paperInk });
  }
  out.paths.push({ pts: rectPts(x0, yBase, x0 + SCALE_BAR_MM, top), closed: true, widthMm: VIEW_MM, color: paperInk });
  for (let i = 1; i < SCALE_BAR_SEGMENTS; i++) {
    const x = x0 + i * seg;
    out.paths.push({ pts: [{ x, y: yBase }, { x, y: top }], closed: false, widthMm: LINE_MM, color: paperInk });
  }
}

/**
 * Moldura, legenda de cada vista e carimbo, em mm de papel. Fica por cima das vistas (o carimbo tem fundo branco e
 * cobre o que estiver sob ele).
 */
export function furnitureParts(p: Project, s: Sheet, lang: Lang = 'pt'): ViewportParts {
  const out = emptyParts();
  const box = sheetInnerBox(s);
  out.paths.push({ pts: rectPts(box.x0, box.y0, box.x1, box.y1), closed: true, widthMm: FRAME_MM, color: paperInk });
  for (const v of s.viewports) {
    // Moldura e legenda são opcionais por vista (Revit: *Crop Region* e *View Title*).
    if (viewportFrameVisible(v)) {
      out.paths.push({ pts: rectPts(v.at.x, v.at.y, v.at.x + v.size.w, v.at.y + v.size.h), closed: true, widthMm: VIEW_MM, color: paperInk });
    }
    const label = viewportLabel(v);
    if (!label.show) continue;
    const caption = captionOf(p, v.view, v, lang);
    const yBase = v.at.y - 3.5;
    out.texts.push({ at: { x: v.at.x, y: yBase }, text: caption, sizeMm: label.sizeMm, rotation: 0, center: false, color: paperInk });
    if (label.rule) {
      // Linha do Revit sob o texto: metade da caixa, no mínimo 20 mm, nunca maior que a caixa.
      const w = Math.min(v.size.w, Math.max(20, v.size.w / 2));
      out.paths.push({ pts: [{ x: v.at.x, y: yBase - 1 }, { x: v.at.x + w, y: yBase - 1 }], closed: false, widthMm: VIEW_MM, color: paperInk });
    }
    if (label.scaleBar && v.view.kind !== '3d') scaleBarParts(out, v.at.x + caption.length * label.sizeMm * CHAR_W + SCALE_BAR_GAP_MM, yBase);
  }
  const tb = s.titleBlock;
  const x0 = box.x1 - STAMP_W;
  const y0 = box.y0;
  const top = y0 + stampHeightOf(s);
  /** Topo do carimbo clássico; a tabela de revisões fica logo acima, entre `top` e `stampTop`. */
  const stampTop = y0 + STAMP_H;
  out.fills.push({ polygons: [[rectPts(x0, y0, box.x1, top)]], color: '#ffffff' });
  out.paths.push({ pts: rectPts(x0, y0, box.x1, top), closed: true, widthMm: FRAME_MM, color: paperInk });
  for (let i = 1; i <= 4; i++) {
    const y = stampTop - STAMP_HEAD - (i - 1) * STAMP_ROW;
    out.paths.push({ pts: [{ x: x0, y }, { x: box.x1, y }], closed: false, widthMm: LINE_MM, color: paperInk });
  }
  const text = (x: number, y: number, value: string, size = 2.5) => out.texts.push({ at: { x, y }, text: value, sizeMm: size, rotation: 0, center: false, color: paperInk });
  // Disciplina entra no cabeçalho, ao lado do número e do nome da prancha.
  const head = s.discipline?.trim() ? `${s.number}  ${s.name}  ·  ${s.discipline.trim()}` : `${s.number}  ${s.name}`;
  text(x0 + 3, stampTop - 8, head, 4.5);
  const row = (i: number) => stampTop - STAMP_HEAD - (i - 1) * STAMP_ROW - 5;
  text(x0 + 3, row(1), translate(lang, 'rn_sheet_tb_project', { value: tb.project }));
  text(x0 + 3, row(2), translate(lang, 'rn_sheet_tb_client', { value: tb.client }));
  text(x0 + 3, row(3), translate(lang, 'rn_sheet_tb_author', { value: tb.author }));
  text(x0 + 62, row(3), translate(lang, 'rn_sheet_tb_date', { value: tb.date }));
  text(x0 + 3, row(4), translate(lang, 'rn_sheet_tb_revision', { value: tb.revision }));
  text(x0 + 62, row(4), translate(lang, 'rn_sheet_tb_scale', { value: tb.scaleNote?.trim() ? tb.scaleNote : scalesLine(s, lang) }));
  // Tabela de revisões ACIMA do carimbo: uma linha por revisão, com separador sob cada uma.
  const revisions = s.revisions ?? [];
  revisions.forEach((r, i) => {
    const bottom = top - (i + 1) * STAMP_ROW;
    text(x0 + 3, bottom + 3, translate(lang, 'rn_sheet_tb_rev', { tag: r.tag }), 2.2);
    text(x0 + 22, bottom + 3, r.date, 2.2);
    text(x0 + 48, bottom + 3, r.description, 2.2);
    out.paths.push({ pts: [{ x: x0, y: bottom }, { x: box.x1, y: bottom }], closed: false, widthMm: LINE_MM, color: paperInk });
  });
  return out;
}
