import {
  DEFAULT_VIEW_GRAPHICS,
  GRAPHICS_CATEGORIES,
  defaultOverride,
  detailOf,
  graphicsOf,
  planGraphicsOf,
  planGraphicsSaved,
  lineWeightMm,
  PLAN_VISUAL_STYLES,
  apresentacaoDe,
  type Apresentacao,
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
  /** 0..1 — mistura da cor com o papel (0 = cor original; 1 = papel). */
  clareamento: number;
  /** 0..1 — opacidade do preenchimento/hachura e das linhas (1 = opaco). */
  opacidade: number;
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

function paintOf(gp: ProjectGraphics, c: GraphicsCategory, ov: CategoryOverride, zoom: number, scale: number, visual: PlanVisual, apresentacao?: Apresentacao): PlanPaint {
  const base = gp.categories[c];
  const espessura = (weight: number): Espessura => espessuraDePapel(lineWeightMm(gp.lineWeights, weight, scale), zoom, scale);
  const cut = espessura(ov.cutWeight ?? base.cutWeight);
  const proj = espessura(ov.projectionWeight ?? base.projectionWeight);
  const ap = apresentacao ? apresentacaoDe(apresentacao) : undefined;
  const halftone = ap ? ap.tone === 'halftone' || ov.halftone : ov.halftone;
  const clareamento = ap ? Math.max(ap.clareamento ?? (ap.tone === 'halftone' ? 0.5 : 0), ov.halftone ? 0.5 : 0) : halftone ? 0.5 : 0;
  return {
    visible: ov.visible && (ap ? ap.tone !== 'hidden' : true),
    visual,
    color: ov.color ?? null,
    halftone,
    clareamento,
    opacidade: ap?.opacidade ?? 1,
    alpha: 1 - ov.transparency,
    cutPx: cut.widthPx,
    projPx: proj.widthPx,
    cut,
    proj,
  };
}

/**
 * Gráficos da planta do nível para o desenho: escala, detalhe, estilo visual e substituições por categoria, com as
 * larguras em px de tela no `zoom` corrente. Sem gráficos salvos na planta, o detalhe é o do projeto (`settings.detail`),
 * como antes da decisão 0015; com eles, vale `detailOf` (pela escala). `planId` (decisão 0060): planta de disciplina do
 * nível; ausente, desconhecida ou de outro nível = planta padrão (`Level.graphics`), o comportamento de sempre.
 *
 * `apresentacoes` (plano de UX de 2026-11-23) é a apresentação da disciplina de trabalho por categoria (tom, clareamento e
 * opacidade). Sem o mapa, o resultado é o de hoje.
 */
export function planStyleOf(p: Project, levelId: Id, zoom: number, scaleOverride?: number, planId?: Id, apresentacoes?: Partial<Record<GraphicsCategory, Apresentacao>>): PlanStyle {
  const g = planGraphicsOf(p, levelId, planId);
  const gp = graphicsOf(p);
  const visual: PlanVisual = isPlanVisual(g.style) ? g.style : 'hiddenLine';
  const saved = planGraphicsSaved(p, levelId, planId);
  const detail: DetailLevel = saved ? detailOf(g, gp) : (p.settings.detail ?? 'medium');
  const escala = scaleOverride && scaleOverride > 0 ? scaleOverride : g.scale;
  const paint = {} as Record<GraphicsCategory, PlanPaint>;
  for (const c of GRAPHICS_CATEGORIES) paint[c] = paintOf(gp, c, g.overrides[c], zoom, escala, visual, apresentacoes?.[c]);
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
 * superfícies (não nos contornos); clareamento (mistura com o papel) nas cores de preenchimento, hachura e traço; e a
 * opacidade da apresentação nas alphas (as linhas nunca abaixo de 0,3, para não sumirem).
 */
export function paintOps(ops: Ops, pt: PlanPaint, paper: string): Ops {
  const wire = pt.visual === 'wireframe';
  const clareamento = pt.clareamento ?? 0;
  const op = Math.min(1, Math.max(0, pt.opacidade ?? 1));
  if (!wire && pt.alpha === 1 && !pt.halftone && clareamento === 0 && op === 1) return ops;
  const clarear = (color: string): string => (clareamento > 0 ? mix(color, paper, clareamento) : color);
  const fills: FillOp[] = [];
  for (const f of ops.fills) {
    if (wire && !f.contour) continue;
    const k = f.contour ? op : pt.alpha * op;
    const out: FillOp = { polygons: f.polygons, color: clarear(f.color), alpha: f.alpha * k };
    if (f.contour) out.contour = true;
    if (f.faixa) out.faixa = f.faixa;
    if (f.deslocamentoPx) out.deslocamentoPx = f.deslocamentoPx;
    if (f.hatch) out.hatch = { kind: f.hatch.kind, color: clarear(f.hatch.color), alpha: (f.hatch.alpha ?? 1) * k, ...(f.hatch.zoomMin !== undefined ? { zoomMin: f.hatch.zoomMin } : {}) };
    fills.push(out);
  }
  let strokes = ops.strokes;
  if (pt.clareamento > 0) strokes = strokes.map((s) => ({ ...s, color: clarear(s.color) }));
  if (op < 1) {
    const linha = Math.max(0.3, op);
    strokes = strokes.map((s) => ({ ...s, alpha: (s.alpha ?? 1) * linha }));
  }
  return { fills, strokes, labels: ops.labels };
}
