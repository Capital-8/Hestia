import {
  GRAPHICS_CATEGORIES,
  PLAN_VISUAL_STYLES,
  apresentacaoDe,
  detailOf,
  graphicsOf,
  lineWeightMm,
  sectionGraphicsOf,
  type Apresentacao,
  type CategoryOverride,
  type GraphicsCategory,
  type Project,
  type ProjectGraphics,
  type Tone,
  type VisualStyle,
} from '@hestia/model';
import { espessuraDePapel } from '../plan/espessura.ts';
import type { PlanPaint, PlanStyle, PlanVisual } from '../plan/style.ts';
import type { Espessura } from '../plan/types.ts';

/** Gráficos do corte/elevação resolvidos para o desenho (as larguras já em px de tela no zoom corrente). */
export interface SectionStyle extends PlanStyle {
  /** A vista tem `sectionGraphics` salvo: os pesos valem; sem ele, o desenho mantém os traços fixos de antes. */
  saved: boolean;
}

const isPlanVisual = (v: VisualStyle): v is PlanVisual => (PLAN_VISUAL_STYLES as readonly VisualStyle[]).includes(v);

function paintOf(gp: ProjectGraphics, c: GraphicsCategory, ov: CategoryOverride, zoom: number, scale: number, visual: PlanVisual): PlanPaint {
  const base = gp.categories[c];
  const espessura = (weight: number): Espessura => espessuraDePapel(lineWeightMm(gp.lineWeights, weight, scale), zoom, scale);
  const cut = espessura(ov.cutWeight ?? base.cutWeight);
  const proj = espessura(ov.projectionWeight ?? base.projectionWeight);
  return {
    visible: ov.visible,
    visual,
    color: ov.color ?? null,
    halftone: ov.halftone,
    clareamento: ov.halftone ? 0.5 : 0,
    opacidade: 1,
    alpha: 1 - ov.transparency,
    cutPx: cut.widthPx,
    projPx: proj.widthPx,
    cut,
    proj,
  };
}

/**
 * Gráficos do corte/elevação: escala, detalhe, estilo visual e substituições por categoria. Como a vista cruza níveis,
 * as configurações ficam em `Project.sectionGraphics` (decisão 0015); sem o campo salvo, o detalhe é o do projeto
 * (`settings.detail`) e o desenho mantém os traços fixos anteriores à decisão.
 *
 * `toneCategories` é o tom da disciplina de trabalho por categoria (decisão 0060, adendo 3, decisão 4): `hidden` desliga
 * a categoria no desenho e `halftone` a atenua; `normal` (ou ausente) não altera nada. `apresentacoes` (plano de UX de
 * 2026-11-23) traz o tom, o clareamento e a opacidade da categoria; ele vence o tom legado. Sem os mapas, o resultado é o
 * de antes.
 */
export function sectionStyleOf(p: Project, zoom: number, toneCategories?: Partial<Record<GraphicsCategory, Tone>>, apresentacoes?: Partial<Record<GraphicsCategory, Apresentacao>>): SectionStyle {
  const g = sectionGraphicsOf(p);
  const gp = graphicsOf(p);
  const visual: PlanVisual = isPlanVisual(g.style) ? g.style : 'hiddenLine';
  const saved = p.sectionGraphics !== undefined;
  const detail = saved ? detailOf(g, gp) : (p.settings.detail ?? 'medium');
  const paint = {} as Record<GraphicsCategory, PlanPaint>;
  for (const c of GRAPHICS_CATEGORIES) {
    const base = paintOf(gp, c, g.overrides[c], zoom, g.scale, visual);
    const ap = apresentacoes?.[c] ? apresentacaoDe(apresentacoes[c]) : undefined;
    if (ap) {
      const halftone = ap.tone === 'halftone' || base.halftone;
      paint[c] = {
        ...base,
        visible: ap.tone !== 'hidden' && base.visible,
        halftone,
        clareamento: Math.max(ap.clareamento ?? (ap.tone === 'halftone' ? 0.5 : 0), base.halftone ? 0.5 : 0),
        opacidade: ap.opacidade ?? 1,
      };
      continue;
    }
    const tom = toneCategories?.[c];
    paint[c] = tom === 'hidden' ? { ...base, visible: false } : tom === 'halftone' ? { ...base, halftone: true, clareamento: 0.5 } : base;
  }
  return { saved, scale: g.scale, detail, visual, partial: g.partialStructure, paint };
}
