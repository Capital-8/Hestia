import { angleOf, dist, sub, type SketchSeg, type Vec2 } from '@hestia/geom';
import { detailLineSegments } from '@hestia/model';
import { buildShape, anchorOf, kindOf, pointsOf, stepsOf, type ShapeStep } from './perimeterToolShape.ts';
import type { ShapeKindId } from './sketchShapes.ts';
import type { PreviewItem, WallDrawShape } from './types.ts';

export { beamShapeInputPrompt as detailShapeInputPrompt, beamShapePromptMsg as detailShapePromptMsg, parseBeamShapeInput as parseDetailShapeInput } from './beamToolShapes.ts';

/** Forma da galeria -> forma do núcleo comum (`sketchShapes.ts`). Todas as formas de `WallDrawShape` têm entrada. */
export const DETAIL_SHAPE_KIND: Record<WallDrawShape, ShapeKindId> = {
  line: 'line',
  rect: 'rectangle',
  'poly-inscribed': 'inscribedPolygon',
  'poly-circumscribed': 'circumscribedPolygon',
  circle: 'circle',
  arc: 'arcThreePoints',
  'arc-center': 'arcCenterEnds',
  'arc-tangent': 'arcTangent',
  ellipse: 'ellipse',
};

export const DETAIL_POLYGON_DEFAULT_SIDES = 6;
export const DETAIL_POLYGON_MIN_SIDES = 3;
export const DETAIL_POLYGON_MAX_SIDES = 64;
/** Comprimento mínimo de um trecho gravado (m). */
export const DETAIL_MIN_LEN = 0.01;

/** Número de lados válido (inteiro 3..64); fora disso, o padrão (6) ou o limite. */
export function detailPolygonSides(n: number | undefined): number {
  if (n === undefined || !Number.isFinite(n)) return DETAIL_POLYGON_DEFAULT_SIDES;
  return Math.min(DETAIL_POLYGON_MAX_SIDES, Math.max(DETAIL_POLYGON_MIN_SIDES, Math.round(n)));
}

export interface DetailSeg { a: Vec2; b: Vec2; sag: number }

/** Converte os trechos do núcleo em `{a,b,sag}`: arco continua UMA linha com `sag`; descarta trechos < 0,01 m. */
export function normalizeDetailSegs(segs: readonly SketchSeg[]): DetailSeg[] {
  return segs.map((s) => ({ a: s.a, b: s.b, sag: s.sag ?? 0 })).filter((s) => dist(s.a, s.b) >= DETAIL_MIN_LEN);
}

/** Avança sobre entradas de contagem (os lados do polígono vêm da opção, já em `vals.sides`). */
export function skipCountInputs(step: ShapeStep): void {
  const steps = stepsOf(step.shape);
  while (steps[step.idx]?.kind === 'count') step.idx += 1;
}

export function initDetailShapeStep(shape: WallDrawShape, sides: number | undefined): ShapeStep {
  const st: ShapeStep = { shape: kindOf(DETAIL_SHAPE_KIND[shape]), idx: 0, vals: {} };
  if (st.shape.inputs.some((i) => i.kind === 'count')) st.vals.sides = detailPolygonSides(sides);
  return st;
}

/** Trechos finais da forma concluída; vazio se degenerada (algum trecho < 0,01 m). */
export function buildDetailShapeSegs(step: ShapeStep, flags: Record<string, boolean>): DetailSeg[] {
  const raw = buildShape(step.shape.id, step.vals, flags);
  const segs = normalizeDetailSegs(raw);
  return segs.length > 0 && segs.length === raw.length ? segs : [];
}

/** Linhas de prévia (tracejadas) de um trecho; o arco vira polilinha pelo helper do modelo. */
export function detailSegPreview(s: DetailSeg): PreviewItem[] {
  return detailLineSegments({ id: '', a: s.a, b: s.b, style: 'solid', ...(s.sag ? { sag: s.sag } : {}) }).map(([a, b]) => ({ kind: 'line' as const, a, b, dashed: true }));
}

/** Prévia do passo: pontos dados e, no último passo, a forma inteira com o valor que o cursor daria. */
export function previewDetailShapeStep(step: ShapeStep, cursor: Vec2, flags: Record<string, boolean>): PreviewItem[] {
  const steps = stepsOf(step.shape);
  const input = steps[step.idx];
  const out: PreviewItem[] = pointsOf(step).map((at) => ({ kind: 'point', at }));
  if (!input) return out;
  const anchor = anchorOf(step);
  let value: unknown = null;
  if (input.kind === 'point') value = cursor;
  else if (input.kind === 'length' && anchor) value = dist(cursor, anchor);
  else if (input.kind === 'angle' && anchor) value = angleOf(sub(cursor, anchor));
  const last = step.idx === steps.length - 1 || steps.slice(step.idx + 1).every((i) => i.kind === 'count');
  if (value !== null && last) {
    for (const s of normalizeDetailSegs(buildShape(step.shape.id, { ...step.vals, [input.key]: value }, flags))) out.push(...detailSegPreview(s));
  } else if (anchor) {
    out.push({ kind: 'line', a: anchor, b: cursor, dashed: true });
  }
  return out;
}
