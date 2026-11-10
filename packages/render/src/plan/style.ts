import {
  DEFAULT_VIEW_GRAPHICS,
  GRAPHICS_CATEGORIES,
  defaultOverride,
  detailOf,
  graphicsOf,
  floorViewId,
  lineWeightMm,
  PLAN_VISUAL_STYLES,
  planViewOf as vistaDoModelo,
  viewGraphicsOf,
  type CategoryOverride,
  type DetailLevel,
  type GraphicsCategory,
  type Id,
  type PartialStructure,
  type Project,
  type ProjectGraphics,
  type VisualStyle,
} from '@hestia/model';
import { mix } from './color.ts';
import { espessuraDePapel } from './espessura.ts';
import type { Espessura, FillOp, LabelOp, StrokeOp } from './types.ts';

/** Estilo visual que a planta desenha (decisão 0015 §2.3): arame, linha oculta (o padrão) ou sombreado. */
export type PlanVisual = Extract<VisualStyle, 'wireframe' | 'hiddenLine' | 'shaded'>;

/**
 * Como uma categoria aparece na planta nesta vista: visibilidade, cor (substitui a do material), meio-tom, transparência
 * e as larguras de linha em px de tela (corte e projeção), já convertidas por `paperMmToPx`.
 */
export interface PlanPaint {
  visible: boolean;
  visual: PlanVisual;
  /** Cor de base das superfícies desta categoria nesta vista; null = a do material. */
  color: string | null;
  halftone: boolean;
  /** Fator das alphas dos preenchimentos: 1 − transparência. */
  alpha: number;
  /** Largura do que é cortado (contornos principais), em px no zoom da vista. */
  cutPx: number;
  /** Largura do que está acima/abaixo do corte, além, e das linhas finas do elemento, em px no zoom da vista. */
  projPx: number;
  /** Espessura de corte em mm de papel (a GPU aplica o zoom): para os traços da categoria. */
  cut: Espessura;
  /** Espessura de projeção em mm de papel (a GPU aplica o zoom): para os traços da categoria. */
  proj: Espessura;
}

/** Gráficos da planta de um nível já resolvidos para o desenho (com o zoom corrente). */
export interface PlanStyle {
  scale: number;
  detail: DetailLevel;
  visual: PlanVisual;
  partial: PartialStructure;
  paint: Record<GraphicsCategory, PlanPaint>;
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
    alpha: 1 - ov.transparency,
    cutPx: cut.widthPx,
    projPx: proj.widthPx,
    cut,
    proj,
  };
}

/**
 * Gráficos da planta do nível para o desenho: escala, detalhe, estilo visual e substituições por categoria, com as
 * larguras em px de tela no `zoom` corrente. Sem gráficos salvos na vista, o detalhe é o do projeto (`settings.detail`),
 * como antes da decisão 0015; com eles, vale `detailOf` (pela escala). `viewId` opcional: sem ele vale a planta de piso
 * do nível. A planta de área usa os gráficos da vista (hoje os do nível) e a escala da planta (`scaleOverride`).
 */
export function planStyleOf(p: Project, levelId: Id, zoom: number, scaleOverride?: number, viewId: Id = floorViewId(levelId)): PlanStyle {
  const g = viewGraphicsOf(p, viewId);
  const gp = graphicsOf(p);
  const visual: PlanVisual = isPlanVisual(g.style) ? g.style : 'hiddenLine';
  const saved = vistaDoModelo(p, viewId)?.graphics !== undefined;
  const detail: DetailLevel = saved ? detailOf(g, gp) : (p.settings.detail ?? 'medium');
  const escala = scaleOverride && scaleOverride > 0 ? scaleOverride : g.scale;
  const paint = {} as Record<GraphicsCategory, PlanPaint>;
  for (const c of GRAPHICS_CATEGORIES) paint[c] = paintOf(gp, c, g.overrides[c], zoom, escala, visual);
  return { scale: escala, detail, visual, partial: g.partialStructure, paint };
}

/**
 * Espessura de corte da categoria como `Espessura` (papel + largura do zoom de construção): é o que o traço leva para a
 * GPU aplicar o zoom. Estilo montado à mão, sem `cut` (testes), cai na largura em px.
 */
export const espessuraDeCorte = (pt: Pick<PlanPaint, 'cutPx' | 'cut'>): Espessura => pt.cut ?? { widthPx: pt.cutPx };
/** Espessura de projeção da categoria como `Espessura` (ver `espessuraDeCorte`). */
export const espessuraDeProjecao = (pt: Pick<PlanPaint, 'projPx' | 'proj'>): Espessura => pt.proj ?? { widthPx: pt.projPx };

/** Estilo de uma categoria sem substituição nenhuma (padrão do Hestia) no `zoom` dado. */
export function defaultPaint(c: GraphicsCategory, zoom: number): PlanPaint {
  return paintOf(graphicsOf({}), c, defaultOverride(), zoom, DEFAULT_VIEW_GRAPHICS.scale, 'hiddenLine');
}

/**
 * Cor de uma superfície da categoria: a do material (ou a substituída na vista) misturada com o papel por `t`. No
 * sombreado (`shaded`) vai sem mistura, na cor do material.
 */
export function surfaceColor(materialColor: string, paper: string, t: number, pt: PlanPaint): string {
  const base = pt.color ?? materialColor;
  return pt.visual === 'shaded' ? base : mix(base, paper, t);
}

interface Ops {
  fills: FillOp[];
  strokes: StrokeOp[];
  labels: LabelOp[];
}

/**
 * Aplica o estilo de uma categoria às operações dela: no arame, só as faixas de contorno; transparência nas alphas das
 * superfícies (não nos contornos); meio-tom (50 % com o papel) nas cores de preenchimento, hachura e traço.
 */
export function paintOps(ops: Ops, pt: PlanPaint, paper: string): Ops {
  const wire = pt.visual === 'wireframe';
  if (!wire && pt.alpha === 1 && !pt.halftone) return ops;
  const fills: FillOp[] = [];
  for (const f of ops.fills) {
    if (wire && !f.contour) continue;
    const k = f.contour ? 1 : pt.alpha;
    const out: FillOp = { polygons: f.polygons, color: pt.halftone ? mix(f.color, paper, 0.5) : f.color, alpha: f.alpha * k };
    if (f.contour) out.contour = true;
    if (f.faixa) out.faixa = f.faixa;
    if (f.deslocamentoPx) out.deslocamentoPx = f.deslocamentoPx;
    if (f.hatch) out.hatch = { kind: f.hatch.kind, color: pt.halftone ? mix(f.hatch.color, paper, 0.5) : f.hatch.color, alpha: (f.hatch.alpha ?? 1) * k, ...(f.hatch.zoomMin !== undefined ? { zoomMin: f.hatch.zoomMin } : {}) };
    fills.push(out);
  }
  const strokes = pt.halftone ? ops.strokes.map((s) => ({ ...s, color: mix(s.color, paper, 0.5) })) : ops.strokes;
  return { fills, strokes, labels: ops.labels };
}
