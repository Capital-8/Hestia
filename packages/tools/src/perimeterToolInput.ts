import { dist, mid, type SketchDraft, type SketchSeg, type Vec2 } from '@hestia/geom';
import { parseQuantityText } from './numeric.ts';
import type { ResolvedUnits } from '@hestia/model';
import { selectSegsMode, setSegSlope, effectiveSeg } from './perimeterSession.ts';
import { SELECT_PX, hasSeg, hitSeg, segLines, triangleHit, roomHint } from './perimeterToolPick.ts';
import { t as translate, type Lang } from './i18n.ts';
import { perimeterFromBox } from './sketchByPerimeter.ts';
import { kindOf, promptOf, shapeName } from './perimeterToolShape.ts';
import { faceAt } from './sketchPickFace.ts';
import { selectionModeOf } from './perimeterToolSelect.ts';
import type { PointerInfo, PreviewItem, ToolEnv } from './types.ts';

/** Tolerância de captura de face, eixo ou borda, em px de tela (como as outras ferramentas de captura). */
export const PICK_PX = 10;
/** Caixa menor que isto (em px) é clique, não contorno. */
export const BOX_MIN_PX = 4;

/**
 * Destino digitado de Mover/Copiar como deslocamento: "dx;dy" em metros, ou "dx, dy" com a vírgula seguida de espaço.
 * Com ";" cada parte pode usar vírgula decimal ("2,5;3"); com ", " o par precisa de exatamente um separador com espaço
 * ("2, 3", "2,5, 3,5"). Vírgula sem espaço é decimal: "2,5" continua sendo o número único 2,5 (distância), não um par.
 */
export function parseDelta(text: string, u: ResolvedUnits): Vec2 | null {
  const t = text.trim();
  if (!t) return null;
  const parts = t.includes(';') ? t.split(';') : t.split(', ');
  if (parts.length !== 2) return null;
  const x = parseQuantityText(parts[0]!, u, 'length');
  const y = parseQuantityText(parts[1]!, u, 'length');
  return x === null || y === null ? null : { x, y };
}

/** Prévia da face sob o cursor: realce, rótulo e aviso para a barra de status. */
export function facePreview(env: ToolEnv, at: Vec2, cycle: number, lang: Lang = 'pt'): { items: PreviewItem[]; msg: string } {
  const pick = faceAt(env, at, PICK_PX * env.metersPerPixel(), cycle);
  if (!pick) return { items: [], msg: translate(lang, 'tl_msg_point_face_axis_edge') };
  return {
    items: [...segLines(pick.seg, { halo: true }), { kind: 'label', at: mid(pick.seg.a, pick.seg.b), text: pick.label }],
    msg: translate(lang, 'tl_msg_face_preview', { label: pick.label }),
  };
}

/** Linha da face sob o cursor, ou o motivo de não servir (sem face, ou já está no esboço). */
export function facePick(env: ToolEnv, at: Vec2, cycle: number, d: SketchDraft, lang: Lang = 'pt'): { seg: SketchSeg; label: string } | { msg: string } {
  const pick = faceAt(env, at, PICK_PX * env.metersPerPixel(), cycle);
  if (!pick) return { msg: translate(lang, 'tl_msg_nothing_face') };
  if (hasSeg(d.segs, pick.seg)) return { msg: translate(lang, 'tl_msg_line_in_sketch') };
  return { seg: pick.seg, label: pick.label };
}

/**
 * Clique no modo de seleção. Linha de limite: seleciona a linha sob o cursor (Shift soma, Ctrl subtrai), e `geom` é false. Inclinação:
 * liga ou desliga o `definesSlope` da aresta do triângulo, e `geom` é true (muda a geometria do passo).
 */
export function selectClick(d: SketchDraft, p: PointerInfo, slope: boolean, mpp: number, selectHint: string, lang: Lang = 'pt'): { next: SketchDraft; geom: boolean; msg: string } {
  if (slope) {
    const id = triangleHit(d, p.raw, mpp);
    if (!id) return { next: d, geom: false, msg: translate(lang, 'tl_msg_click_slope_triangle') };
    const on = effectiveSeg(d, d.segs.find((s) => s.id === id)!).definesSlope;
    return { next: setSegSlope(d, id, { definesSlope: !on }), geom: true, msg: translate(lang, on ? 'tl_msg_edge_no_slope' : 'tl_msg_edge_slope') };
  }
  const id = hitSeg(d.segs, p.raw, SELECT_PX * mpp);
  const mode = id === null && !p.shift ? 'replace' : selectionModeOf(p);
  const next = selectSegsMode(d, id ? [id] : [], mode);
  const n = next.selected.length;
  return { next, geom: false, msg: n > 0 ? translate(lang, 'tl_msg_lines_selected_delete', { n }) : selectHint };
}

/** Contorno pelas paredes da caixa de `a` a `b`, ou null se a caixa é um clique. `segs` vazio = nada pego (aviso em `msg`). */
export function boxPick(env: ToolEnv, a: Vec2, b: Vec2, lang: Lang = 'pt'): { segs: SketchSeg[]; msg: string } | null {
  if (dist(a, b) < BOX_MIN_PX * env.metersPerPixel()) return null;
  const r = perimeterFromBox(env, a, b);
  if (r.segs.length === 0) return { segs: [], msg: r.warnings.join(' ') || translate(lang, 'tl_msg_no_walls_box') };
  return { segs: r.segs, msg: [...r.warnings, translate(lang, 'tl_msg_box_outline_added', { n: r.segs.length })].join(' ') };
}

const PICK_HINT = (lang: Lang): string => translate(lang, 'tl_hint_perim_pick');
const BOX_HINT = (lang: Lang): string => translate(lang, 'tl_hint_perim_box');

/** Dica da barra de status ao escolher uma forma da galeria (ou uma das capturas). */
export function shapeHintOf(kind: string, lang: Lang = 'pt'): string {
  if (kind === 'pickFace') return PICK_HINT(lang);
  if (kind === 'byPerimeter') return BOX_HINT(lang);
  if (kind === 'pickRoom') return roomHint(lang);
  const k = kindOf(kind as Parameters<typeof kindOf>[0]);
  return translate(lang, 'tl_msg_shape_prompt', { shape: shapeName(k, lang), prompt: promptOf({ shape: k, idx: 0, vals: {} }, lang) });
}
