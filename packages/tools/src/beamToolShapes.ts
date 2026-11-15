import {
  angleOf,
  arcFromSagitta,
  dist,
  mid,
  sagFromThreePoints,
  sub,
  type SketchSeg,
  type Vec2,
} from '@hestia/geom';
import {
  beamAxisPolyline,
  beamLength,
  beamPolygon,
  formatQuantity,
  unitsOf,
  type BeamJustify,
  type BeamType,
} from '@hestia/model';
import { t as translate, type Lang } from './i18n.ts';
import { parseNumber, parseQuantityText } from './numeric.ts';
import { PICK_PX, facePreview } from './perimeterToolInput.ts';
import { anchorOf, buildShape, kindOf, pointsOf, promptOf, shapeName, stepsOf, type ShapeStep } from './perimeterToolShape.ts';
import { faceAt } from './sketchPickFace.ts';
import { shapeInputLabel, type ShapeKindId } from './sketchShapes.ts';
import type { BeamDrawShape, PreviewItem, ToolEnv } from './types.ts';

export const BEAM_SHAPE_KIND: Partial<Record<BeamDrawShape, ShapeKindId>> = {
  'poly-inscribed': 'inscribedPolygon',
  'poly-circumscribed': 'circumscribedPolygon',
  circle: 'circle',
  'arc-center': 'arcCenterEnds',
  'arc-tangent': 'arcTangent',
  ellipse: 'ellipse',
};

export const isArcBeamShape = (shape: BeamDrawShape): boolean => shape === 'arc' || shape === 'arc-3pt';

/** Gera itens de prévia (polígono do perfil + eixo tracejado) para um segmento de viga reto ou curvo. */
export function beamPreviewForSeg(
  seg: { a: Vec2; b: Vec2; sag?: number },
  justify: BeamJustify,
  type: BeamType,
): PreviewItem[] {
  const b = { a: seg.a, b: seg.b, justify, sag: seg.sag ?? 0 };
  const items: PreviewItem[] = [{ kind: 'polygon', ring: beamPolygon(b, type) }];
  const axis = beamAxisPolyline(b, 0);
  for (let i = 1; i < axis.length; i++) {
    items.push({ kind: 'line', a: axis[i - 1]!, b: axis[i]!, dashed: true });
  }
  return items;
}

/** Prévia do arco por 3 pontos com rótulo de raio e comprimento real do arco. */
export function beamArcPreview(
  env: ToolEnv,
  a: Vec2,
  chordEnd: Vec2,
  onArc: Vec2,
  justify: BeamJustify,
  type: BeamType,
): PreviewItem[] {
  const sag = sagFromThreePoints(a, onArc, chordEnd);
  const arc = arcFromSagitta(a, chordEnd, sag);
  const u = unitsOf(env.project());
  return [
    ...beamPreviewForSeg({ a, b: chordEnd, sag }, justify, type),
    {
      kind: 'label',
      at: onArc,
      text: arc ? `R ${formatQuantity(u, 'length', arc.radius)}  arco ${formatQuantity(u, 'length', arc.length)}` : 'reta',
    },
  ];
}

/** Junta cordas retas consecutivas muito curtas (ex.: elipse) para respeitar o comprimento mínimo de viga. */
export function normalizeBeamSegs(segs: readonly SketchSeg[], shape: BeamDrawShape): Array<{ a: Vec2; b: Vec2; sag: number }> {
  if (shape !== 'ellipse' || segs.length < 4) {
    return segs.map((s) => ({ a: s.a, b: s.b, sag: s.sag ?? 0 }));
  }
  const out: Array<{ a: Vec2; b: Vec2; sag: number }> = [];
  let start = segs[0]!.a;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    const isLast = i === segs.length - 1;
    if (s.sag) {
      out.push({ a: start, b: s.b, sag: s.sag });
      if (!isLast) start = segs[i + 1]!.a;
      continue;
    }
    if (isLast && dist(start, s.b) < 0.05 && out.length > 0 && out[out.length - 1]!.sag === 0) {
      out[out.length - 1]!.b = s.b;
      continue;
    }
    if (isLast || dist(start, s.b) >= 0.15) {
      out.push({ a: start, b: s.b, sag: 0 });
      if (!isLast) start = segs[i + 1]!.a;
    }
  }
  return out.filter((s) => beamLength(s) >= 0.05 && dist(s.a, s.b) >= 0.05);
}

/** Constrói segmentos válidos do catálogo de formas, filtrando trechos degenerados. */
export function buildBeamShapeSegs(
  shape: BeamDrawShape,
  step: ShapeStep,
  flags: Record<string, boolean>,
): Array<{ a: Vec2; b: Vec2; sag: number }> {
  const raw = buildShape(step.shape.id, step.vals, flags);
  const segs = normalizeBeamSegs(raw, shape);
  return segs.every((s) => dist(s.a, s.b) >= 0.05 && beamLength(s) >= 0.05) ? segs : [];
}

/** Monta a prévia da forma multi-passos enquanto o usuário move o cursor. */
export function previewBeamShapeStep(
  shape: BeamDrawShape,
  step: ShapeStep,
  cursor: Vec2,
  justify: BeamJustify,
  type: BeamType,
  flags: Record<string, boolean>,
): PreviewItem[] {
  const steps = stepsOf(step.shape);
  const input = steps[step.idx];
  if (!input) return [];
  const anchor = anchorOf(step);
  let value: unknown = null;
  if (input.kind === 'point') value = cursor;
  else if (input.kind === 'length' && anchor) value = dist(cursor, anchor);
  else if (input.kind === 'angle' && anchor) value = angleOf(sub(cursor, anchor));
  else if (input.kind === 'count') value = 6;

  const isPolyRadius =
    (step.shape.id === 'inscribedPolygon' || step.shape.id === 'circumscribedPolygon') && step.idx === 1;
  let segs: SketchSeg[] = [];
  if (value !== null && step.idx === steps.length - 1) {
    segs = buildShape(step.shape.id, { ...step.vals, [input.key]: value }, flags);
  } else if (value !== null && isPolyRadius) {
    segs = buildShape(step.shape.id, { ...step.vals, [input.key]: value, sides: 6 }, flags);
  }

  const out: PreviewItem[] = pointsOf(step).map((at) => ({ kind: 'point', at }));
  if (segs.length > 0) {
    for (const s of normalizeBeamSegs(segs, shape)) out.push(...beamPreviewForSeg(s, justify, type));
  } else if (anchor) {
    out.push({ kind: 'line', a: anchor, b: cursor, dashed: true });
  }
  return out;
}

/** Rótulo de prompt para barra de entrada numérica no passo ativo. */
export function beamShapeInputPrompt(step: ShapeStep | null, lang: Lang, lenLabel: string): string | null {
  const input = step ? stepsOf(step.shape)[step.idx] : undefined;
  if (!step || !input) return null;
  if (input.kind === 'length' || input.kind === 'angle' || input.kind === 'count') {
    return shapeInputLabel(input.label, lang);
  }
  if (input.kind === 'point' && anchorOf(step)) return lenLabel;
  return null;
}

/** Converte texto digitado em valor da entrada atual da forma. */
export function parseBeamShapeInput(env: ToolEnv, step: ShapeStep, text: string, lang: Lang): unknown | null {
  const input = stepsOf(step.shape)[step.idx];
  if (!input) return null;
  const q = input.kind === 'length' ? 'length' : input.kind === 'angle' ? 'angle' : null;
  const v = q ? parseQuantityText(text, unitsOf(env.project()), q) : parseNumber(text);
  if (v === null) {
    env.say(translate(lang, 'tl_msg_invalid_number_plain'));
    return null;
  }
  if (input.kind === 'length' && v <= 0) {
    env.say(translate(lang, 'tl_msg_length_positive_m'));
    return null;
  }
  if (input.kind === 'count' && (!Number.isInteger(v) || v < 3)) {
    env.say(translate(lang, 'tl_msg_sides_int'));
    return null;
  }
  return v;
}

/** Prévia da ferramenta no modo "Selecionar face / linha". */
export function previewBeamPickFace(
  env: ToolEnv,
  at: Vec2,
  cycle: number,
  justify: BeamJustify,
  type: BeamType,
  lang: Lang,
): { items: PreviewItem[]; msg: string } {
  const tol = PICK_PX * env.metersPerPixel();
  const pick = faceAt(env, at, tol, cycle);
  if (!pick) return facePreview(env, at, cycle, lang);
  return {
    items: [
      ...beamPreviewForSeg(pick.seg, justify, type),
      { kind: 'label', at: mid(pick.seg.a, pick.seg.b), text: pick.label },
    ],
    msg: translate(lang, 'tl_msg_face_preview', { label: pick.label }),
  };
}

/** Mensagem de status orientando o passo corrente da forma. */
export function beamShapePromptMsg(step: ShapeStep, lang: Lang): string {
  return translate(lang, 'tl_msg_shape_prompt', {
    shape: shapeName(step.shape, lang),
    prompt: promptOf(step, lang),
  });
}

export function initBeamShapeStep(shape: BeamDrawShape): ShapeStep {
  return { shape: kindOf(BEAM_SHAPE_KIND[shape]!), idx: 0, vals: {} };
}
