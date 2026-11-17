import { multiArea } from '@hestia/geom';
import { resolveCeilings, type ResolvedCeiling } from '@hestia/engine';
import type { DetailLevel, Id, Project } from '@hestia/model';
import type { Viewport } from '../viewport.ts';
import { mix } from './color.ts';
import { corPadraoSuperficie } from './materialPlan.ts';
import { unitsOf } from '@hestia/model';
import { fmtArea, labelPoint, outlineSelectionOps, SURFACE_TEXT_MM, type FloorOps } from './floors.ts';
import { defaultPaint, espessuraDeCorte, surfaceColor, type PlanPaint } from './style.ts';
import type { PlanTheme } from './types.ts';

const empty = (): FloorOps => ({ fills: [], strokes: [], labels: [] });

/** Cor do forro na planta: a do material da primeira camada (a de cima, como no tipo), ou cinza sem material. */
export function ceilingFillMaterial(c: ResolvedCeiling): Id | undefined {
  return c.layers[0]?.materialId;
}

/**
 * Forros na planta de forro (decisão 0021): contorno e furos preenchidos com a cor do material da primeira camada, com
 * hachura em médio/fino com zoom suficiente, e a faixa de contorno como nas lajes. Com etiquetas ligadas, marca e área.
 * Só a planta de forro (direção 'up') chama esta função; na planta baixa forro não é desenhado.
 */
export function ceilingFills(
  p: Project,
  levelId: Id,
  theme: PlanTheme,
  dark: boolean,
  detail: DetailLevel,
  v: Viewport,
  hidden?: ReadonlySet<Id>,
  paint: PlanPaint = defaultPaint('floor', v.zoom),
  scale = 100,
): FloorOps {
  const out = empty();
  const fillBase = dark ? theme.bg : '#ffffff';
  const fine = detail === 'fine';
  for (const c of resolveCeilings(p, levelId)) {
    if (hidden?.has(c.ceilingId)) continue;
    const materialId = ceilingFillMaterial(c);
    const m = materialId ? p.materials[materialId] : undefined;
    const cp = corPadraoSuperficie(m, { dark, detail, paint });
    const color = surfaceColor(cp.fundo, fillBase, dark ? 0.38 : 0.6, paint);
    const hatch = cp.padrao ? { ...cp.padrao, ...(fine ? {} : { zoomMin: 40 }) } : undefined;
    out.fills.push({ polygons: c.polygon, color, alpha: 1, hatch });
    const at = labelPoint(c.polygon);
    if (detail !== 'coarse') {
      out.fills.push({ polygons: c.polygon, color: mix(theme.ink, fillBase, 0.35), alpha: 1, contour: true, faixa: espessuraDeCorte(paint) });
    }
    if (p.settings.showTags && at) {
      const e = p.elements[c.ceilingId];
      const mark = e && e.kind === 'ceiling' ? e.mark : '';
      const text = [mark, fmtArea(unitsOf(p), multiArea(c.polygon), 1)].filter(Boolean).join(' · ');
      out.labels.push({ at, text, papel: { escala: scale, fontMm: SURFACE_TEXT_MM } });
    }
  }
  return out;
}

/** Destaque de seleção e de hover dos forros na planta de forro, no mesmo padrão das lajes. */
export function ceilingSelectionOps(p: Project, levelId: Id, selection: Id[], hover: Id | null, theme: PlanTheme, v: Viewport, hidden?: ReadonlySet<Id>, grips = true): FloorOps {
  const parts = resolveCeilings(p, levelId)
    .filter((c) => !hidden?.has(c.ceilingId))
    .map((c) => ({ id: c.ceilingId, polygon: c.polygon }));
  return outlineSelectionOps(parts, selection, hover, !p.settings.showTags, theme, unitsOf(p), v, grips);
}
