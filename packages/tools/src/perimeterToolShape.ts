import { sub, type SketchSeg, type Vec2 } from '@hestia/geom';
import {
  SHAPE_KINDS,
  arcCenterEnds,
  arcThreePoints,
  arcTangent,
  circleShape,
  circumscribedPolygon,
  ellipseShape,
  filletShape,
  inscribedPolygon,
  lineShape,
  rectangleShape,
  rotatedRectangleShape,
  type ShapeKind,
  type ShapeKindId,
  shapeInputLabel,
  shapeLabel,
} from './sketchShapes.ts';
import { segLines } from './perimeterToolPick.ts';
import type { PreviewItem } from './types.ts';
import { t as translate, type Lang } from './i18n.ts';

/** Forma em andamento: a forma, o índice da próxima entrada que pede valor e os valores dados até agora. */
export interface ShapeStep {
  shape: ShapeKind;
  idx: number;
  vals: Record<string, unknown>;
}

/** Entradas que pedem valor. As de sinalizador (ex.: sentido anti-horário) são opções com Tab, não passos. */
export const stepsOf = (shape: ShapeKind): ShapeKind['inputs'][number][] => shape.inputs.filter((i) => i.kind !== 'flag');

export const kindOf = (id: ShapeKindId): ShapeKind => SHAPE_KINDS.find((k) => k.id === id)!;

const isPoint = (v: unknown): v is Vec2 => typeof v === 'object' && v !== null && 'x' in v && 'y' in v;

/** Pontos já dados na forma, na ordem em que foram pedidos. */
export function pointsOf(step: ShapeStep | null): Vec2[] {
  return step ? (Object.values(step.vals).filter(isPoint) as Vec2[]) : [];
}

/** Último ponto dado: âncora da captura, da guia e da medida digitada. */
export function anchorOf(step: ShapeStep | null): Vec2 | null {
  const pts = pointsOf(step);
  return pts.length > 0 ? pts[pts.length - 1]! : null;
}

/** Texto da barra para o passo: o que a ferramenta espera agora. */
export function promptOf(step: ShapeStep, lang: Lang = 'pt'): string {
  const input = stepsOf(step.shape)[step.idx];
  if (!input) return '';
  const label = shapeInputLabel(input.label, lang);
  const low = label.toLowerCase();
  return translate(lang, input.kind === 'point' || input.kind === 'segment' ? 'tl_prompt_click' : 'tl_prompt_type', { label: low });
}

/** Rótulo da forma no idioma pedido. */
export function shapeName(shape: ShapeKind, lang: Lang = 'pt'): string {
  return shapeLabel(shape, lang);
}

/**
 * Linhas da forma para os valores dados. Entradas degeneradas devolvem lista vazia. Os ids saem novos: quem
 * adiciona ao rascunho renumera (`addSegs`); no filete, as duas linhas aparadas mantêm o id de origem.
 */
export function buildShape(id: ShapeKindId, v: Record<string, unknown>, flags: Record<string, boolean> = {}): SketchSeg[] {
  const p = (k: string): Vec2 => v[k] as Vec2;
  const n = (k: string): number => v[k] as number;
  switch (id) {
    case 'line':
      return lineShape(p('a'), p('b'));
    case 'rectangle':
      return rectangleShape(p('p1'), p('p2'));
    case 'rotatedRectangle':
      return rotatedRectangleShape(p('p1'), p('p2'), p('widthPoint'));
    case 'inscribedPolygon':
      return inscribedPolygon(p('center'), p('vertex'), n('sides'));
    case 'circumscribedPolygon':
      return circumscribedPolygon(p('center'), p('edgeMid'), n('sides'));
    case 'circle':
      return circleShape(p('center'), p('radiusPoint'));
    case 'arcThreePoints':
      return arcThreePoints(p('start'), p('end'), p('onArc'));
    case 'arcCenterEnds':
      return arcCenterEnds(p('center'), p('start'), p('end'), flags.ccw === true);
    case 'arcTangent':
      return arcTangent(p('start'), sub(p('tangentPoint'), p('start')), p('end'));
    case 'fillet': {
      const r = filletShape(v.segA as SketchSeg, v.segB as SketchSeg, n('radius'));
      return r ? [r.a, r.b, r.arc] : [];
    }
    case 'ellipse':
      return ellipseShape(p('center'), n('rx'), n('ry'), n('rotation'));
  }
}

/**
 * Prévia de um passo com o valor que o cursor daria à entrada pendente. Mostra os pontos dados; se o valor fecha a
 * forma, desenha a forma inteira; senão, a guia da âncora até o cursor.
 */
export function stepPreview(step: ShapeStep, value: unknown, anchor: Vec2 | null, cursor: Vec2 | null, flags: Record<string, boolean>): PreviewItem[] {
  const out: PreviewItem[] = pointsOf(step).map((at) => ({ kind: 'point', at }));
  const steps = stepsOf(step.shape);
  const key = steps[step.idx]?.key;
  if (key !== undefined && value !== null && step.idx === steps.length - 1) {
    for (const s of buildShape(step.shape.id, { ...step.vals, [key]: value }, flags)) out.push(...segLines(s, { dashed: true }));
  } else if (anchor && cursor) {
    out.push({ kind: 'line', a: anchor, b: cursor, dashed: true });
  }
  return out;
}
