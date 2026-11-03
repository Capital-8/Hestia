import { areaTableAllRows, computeSection, resolveLevel } from '@hestia/engine';
import { areaPlanOf, levelGraphicsOf, sectionAnnotationsOf, sectionGraphicsOf, sectionPoints, unitsOf, type Id, type Project, type SheetViewport, type SheetViewSource } from '@hestia/model';
import type { Vec2 } from '@hestia/geom';
import { buildPlanDrawList, levelBox } from '../plan/build.ts';
import { LIGHT } from '../plan/types.ts';
import { buildSectionDrawList, sectionBox } from '../section/build.ts';
import { partsOf, toPaper, viewMappingOf } from './convert.ts';
import { emptyParts, type ViewportParts } from './types.ts';
import { fmtNumLang as fmtNum, t, type Lang } from '../i18n.ts';

/**
 * Projeto com a escala da vista da prancha: os gráficos do nível (ou do corte) passam a usar a escala da própria vista,
 * então os pesos (`lineWeightMm`) e o detalhe saem da escala escolhida na prancha, não da do nível.
 */
function withSheetScale(p: Project, view: SheetViewSource, scale: number): Project {
  if (view.kind === 'plan') {
    const graphics = { ...levelGraphicsOf(p, view.levelId), scale };
    return { ...p, levels: p.levels.map((l) => (l.id === view.levelId ? { ...l, graphics } : l)) };
  }
  if (view.kind === 'section') return { ...p, sectionGraphics: { ...sectionGraphicsOf(p), scale } };
  if (view.kind === 'areaPlan') {
    const plan = areaPlanOf(p, view.planId);
    if (!plan) return p;
    const graphics = { ...levelGraphicsOf(p, plan.levelId), scale };
    return { ...p, levels: p.levels.map((l) => (l.id === plan.levelId ? { ...l, graphics } : l)) };
  }
  return p;
}

const centreOf = (b: { minX: number; minY: number; maxX: number; maxY: number } | null): Vec2 =>
  b ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 } : { x: 0, y: 0 };

/** Planta de um nível na escala da vista, centrada no conteúdo do nível. Nível inexistente: sem partes. */
export function planPartsOf(p: Project, levelId: Id, vp: SheetViewport, lang: Lang = 'pt'): ViewportParts {
  if (!p.levels.some((l) => l.id === levelId)) return emptyParts();
  const pp = withSheetScale(p, { kind: 'plan', levelId }, vp.scale);
  const centre = centreOf(levelBox(p, levelId));
  const m = viewMappingOf(vp, centre);
  const list = buildPlanDrawList({
    project: pp,
    levelId,
    resolved: resolveLevel(p, levelId),
    below: null,
    viewport: { cx: m.cx, cy: m.cy, zoom: m.zoom, width: m.width, height: m.height },
    theme: LIGHT,
    dark: false,
    selection: [],
    hover: null,
    preview: [],
    inference: null,
    showGrid: false,
    lang,
  });
  return partsOf(list, toPaper(vp, m), LIGHT);
}

/** Viewport órfã (vista apagada): o quadro mostra o aviso em vez de lançar ou sumir sem explicação. */
export function removedViewParts(vp: SheetViewport, lang: Lang = 'pt'): ViewportParts {
  const out = emptyParts();
  out.texts.push({ at: { x: vp.at.x + vp.size.w / 2, y: vp.at.y + vp.size.h / 2 }, text: t(lang, 'rn_sheet_view_removed'), sizeMm: 3, rotation: 0, center: true, color: '#7a828c' });
  return out;
}

/** Planta de área na escala da vista, centrada no conteúdo do nível. Planta inexistente: sem partes. */
export function areaPlanPartsOf(p: Project, planId: Id, vp: SheetViewport, lang: Lang = 'pt'): ViewportParts {
  const plan = areaPlanOf(p, planId);
  if (!plan) return removedViewParts(vp, lang);
  if (!p.levels.some((l) => l.id === plan.levelId)) return emptyParts();
  const pp = withSheetScale(p, { kind: 'plan', levelId: plan.levelId }, vp.scale);
  const centre = centreOf(levelBox(p, plan.levelId));
  const m = viewMappingOf(vp, centre);
  const list = buildPlanDrawList({
    project: pp,
    levelId: plan.levelId,
    resolved: resolveLevel(p, plan.levelId),
    below: null,
    areaPlan: { ...plan, scale: vp.scale, graphics: { ...plan.graphics, referenceLines: plan.graphics.referenceLinesPrint ? plan.graphics.referenceLines : 'never' } },
    viewport: { cx: m.cx, cy: m.cy, zoom: m.zoom, width: m.width, height: m.height },
    theme: LIGHT,
    dark: false,
    selection: [],
    hover: null,
    preview: [],
    inference: null,
    showGrid: false,
    lang,
  });
  return partsOf(list, toPaper(vp, m), LIGHT);
}

/** Quadro geral de áreas (todas as plantas), desenhado em mm de papel na caixa da vista. */
export function areaTablePartsOf(p: Project, vp: SheetViewport, lang: Lang = 'pt'): ViewportParts {
  const out = emptyParts();
  const rows = areaTableAllRows(p, lang);
  if (rows.length === 0) return out;
  const x0 = vp.at.x + 3;
  const x1 = vp.at.x + vp.size.w - 3;
  const yTop = vp.at.y + vp.size.h - 6;
  const yBottom = vp.at.y + 4;
  const rowH = Math.max(3.6, Math.min(5.2, (yTop - yBottom - 8) / (rows.length + 1)));
  const ink = '#16181c';
  const grey = '#8a929c';
  const w = x1 - x0;
  const cols = [
    { key: 'number', x: x0, w: w * 0.1, label: t(lang, 'rn_col_no') },
    { key: 'name', x: x0 + w * 0.1, w: w * 0.45, label: t(lang, 'rn_col_room') },
    { key: 'level', x: x0 + w * 0.55, w: w * 0.2, label: t(lang, 'rn_col_level') },
    { key: 'area', x: x0 + w * 0.75, w: w * 0.15, label: t(lang, 'rn_col_area') },
    { key: 'percent', x: x0 + w * 0.9, w: w * 0.1, label: t(lang, 'rn_col_percent') },
  ] as const;
  const line = (y: number, color = grey): void => {
    out.paths.push({ pts: [{ x: x0, y }, { x: x1, y }], closed: false, widthMm: 0.15, color });
  };
  out.paths.push({ pts: [{ x: x0, y: yBottom }, { x: x1, y: yBottom }, { x: x1, y: yTop + 6 }, { x: x0, y: yTop + 6 }], closed: true, widthMm: 0.25, color: ink });
  out.texts.push({ at: { x: x0 + 1.5, y: yTop + 1.5 }, text: t(lang, 'rn_sheet_area_table'), sizeMm: 3.2, rotation: 0, center: false, color: ink });
  const headerY = yTop - 5;
  for (const c of cols) out.texts.push({ at: { x: c.x + 1, y: headerY }, text: c.label, sizeMm: 2.1, rotation: 0, center: false, color: grey });
  line(headerY - 2.5);
  const dec = unitsOf(p).decimalSymbol;
  rows.forEach((r, i) => {
    const y = headerY - 2.5 - rowH * (i + 0.65);
    const bold = r.kind !== 'room';
    const vals: Record<string, string> = {
      number: r.number,
      name: r.name,
      level: r.levelName,
      area: fmtNum(r.area, 2, dec),
      percent: `${fmtNum(r.percent, 1, dec)}%`,
    };
    for (const c of cols) out.texts.push({ at: { x: c.x + 1, y }, text: vals[c.key] ?? '', sizeMm: bold ? 2.3 : 2.2, rotation: 0, center: false, color: ink });
    if (bold) line(y - rowH * 0.6, ink);
  });
  return out;
}

/** Corte ou elevação de uma vista de seção do projeto na escala da vista, centrada na caixa do corte. */
export function sectionPartsOf(p: Project, sectionId: Id, vp: SheetViewport): ViewportParts {
  const view = p.views.find((v) => v.id === sectionId);
  if (!view) return emptyParts();
  const pp = withSheetScale(p, { kind: 'section', sectionId }, vp.scale);
  const pts = sectionPoints(p, view);
  const section = computeSection(pp, { a: pts.a, b: pts.b, depth: view.depth });
  const m = viewMappingOf(vp, centreOf(sectionBox(section)));
  const list = buildSectionDrawList({
    project: pp,
    section,
    viewport: { cx: m.cx, cy: m.cy, zoom: m.zoom, width: m.width, height: m.height },
    theme: LIGHT,
    dark: false,
    showGrid: false,
    // Cotas, textos e detalhes da vista entram na prancha/PDF (antes a seção saía sem as anotações dela).
    annotations: sectionAnnotationsOf(view),
    levelExtents: view.levelExtents,
  });
  return partsOf(list, toPaper(vp, m), LIGHT);
}
