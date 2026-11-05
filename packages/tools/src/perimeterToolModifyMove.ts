import { add, angleOf, len, sub, type SketchDraft, type Vec2 } from '@hestia/geom';
import { unitsOf, type ResolvedUnits } from '@hestia/model';
import { arraySegs, copySegs, mirrorSegs, offsetLoop, offsetSegs, rotateSegs } from './perimeterModify.ts';
import { MOD_TOL, curveOf, traceDist } from './perimeterModifyCurve.ts';
import type { PerimeterModifyKind } from './perimeterModifyKind.ts';
import { moveSegs, removeSegs } from './perimeterSession.ts';
import { alongTo, clearData, dashedLine, fmt, ghost, halo, segById, type ModHost, type Step } from './perimeterToolModifyStep.ts';
import type { PointerInfo, PreviewItem } from './types.ts';
import { t as translate, type Lang } from './i18n.ts';

/** Comandos com a opção Tab de copiar ou mover (ou copiar, no espelho e na rotação). */
const COPY_KINDS: ReadonlySet<PerimeterModifyKind> = new Set(['offset', 'rotate', 'mirror']);

const refuse = (h: ModHost, msg: string): false => {
  h.say(msg);
  return false;
};

const lg = (h: ModHost): Lang => h.lang?.() ?? 'pt';

/** Tipo de entrada numérica do estágio, ou null se o estágio não pede número. */
export function transformPromptKind(kind: PerimeterModifyKind, st: Step): 'offset' | 'angle' | 'length' | 'count' | null {
  if (kind === 'offset') return st.stage === 1 ? 'offset' : null;
  if (kind === 'rotate') return st.stage === 2 ? 'angle' : null;
  if (kind === 'array') return st.stage === 2 ? 'length' : st.stage === 3 ? 'count' : null;
  if (kind === 'move' || kind === 'copy') return st.stage === 2 ? 'length' : null;
  return null;
}

/** Rótulo da entrada numérica do estágio, ou null se o estágio não pede número. */
export function transformPrompt(kind: PerimeterModifyKind, st: Step, lang: Lang = 'pt'): string | null {
  switch (transformPromptKind(kind, st)) {
    case 'offset': return translate(lang, 'tl_inp_offset_click');
    case 'angle': return translate(lang, 'tl_inp_angle_deg');
    case 'length': return translate(lang, 'tl_inp_length');
    case 'count': return translate(lang, 'tl_inp_count');
    default: return null;
  }
}

/** Dica do estágio atual, com o modo de Tab (copiar ou mover) quando o comando tem a opção. */
export function transformHint(kind: PerimeterModifyKind, st: Step, u: ResolvedUnits, lang: Lang = 'pt'): string {
  const mode = translate(lang, st.copy ? 'tl_mode_copy' : 'tl_mode_move');
  switch (kind) {
    case 'offset':
      return st.num === null
        ? translate(lang, 'tl_hint_mv_offset', { mode })
        : translate(lang, 'tl_hint_mv_offset_num', { d: fmt(u, st.num), mode });
    case 'move':
      return st.stage === 1 ? translate(lang, 'tl_hint_mv_move_base') : translate(lang, 'tl_hint_mv_move_dest');
    case 'copy':
      return st.stage === 1 ? translate(lang, 'tl_hint_mv_copy_base') : translate(lang, 'tl_hint_mv_copy_dest');
    case 'rotate':
      return st.stage === 1
        ? translate(lang, 'tl_hint_mv_rot_center', { mode })
        : translate(lang, 'tl_hint_mv_rot_angle', { mode });
    case 'mirror':
      return st.stage === 1 ? translate(lang, 'tl_hint_mv_mirror_first', { mode }) : translate(lang, 'tl_hint_mv_mirror_second');
    case 'array':
      if (st.stage === 1) return translate(lang, 'tl_hint_mv_array_base');
      if (st.stage === 2) return translate(lang, 'tl_hint_mv_array_step');
      return translate(lang, 'tl_hint_mv_array_count');
    default:
      return '';
  }
}

/** Menor distância das linhas selecionadas ao ponto (o lado do deslocamento pelo clique). */
function nearestDist(d: SketchDraft, ids: string[], at: Vec2): number {
  let best = Infinity;
  for (const id of ids) {
    const s = segById(d, id);
    if (s) best = Math.min(best, traceDist(curveOf(s), at));
  }
  return Number.isFinite(best) ? best : 0;
}

/** Deslocamento: laço ou cadeia com cantos recalculados; senão cópias paralelas. */
function offsetNext(d: SketchDraft, ids: string[], dist: number, side: Vec2): SketchDraft | null {
  return offsetLoop(d, ids, dist, side) ?? offsetSegs(d, ids, dist, side);
}

function offsetAt(h: ModHost, st: Step, at: Vec2): void {
  const d = h.draft();
  const ids = d.selected;
  const dist = st.num ?? nearestDist(d, ids, at);
  if (!(dist > MOD_TOL)) return h.say(translate(lg(h), 'tl_msg_click_side_outside'));
  const next = offsetNext(d, ids, dist, at);
  if (!next) return h.say(translate(lg(h), 'tl_msg_offset_fail'));
  h.commit(st.copy ? next : removeSegs(next, ids));
  st.num = null;
  h.say(translate(lg(h), 'tl_msg_offset_done', { d: fmt(unitsOf(h.project?.()), dist) }));
}

/** Ângulo (radianos) de girar até a referência (ponta a da primeira linha) passar pelo cursor, em torno de `c`. */
function rotAngle(d: SketchDraft, c: Vec2, at: Vec2): number | null {
  const first = d.selected[0];
  const ref = first ? segById(d, first)?.a : undefined;
  if (!ref || len(sub(ref, c)) <= MOD_TOL) return null;
  const a = angleOf(sub(at, c)) - angleOf(sub(ref, c));
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function applyRotate(h: ModHost, st: Step, ang: number): boolean {
  const d = h.draft();
  const next = rotateSegs(d, d.selected, st.pts[0]!, ang, st.copy);
  if (!next) return refuse(h, translate(lg(h), 'tl_msg_angle_zero'));
  h.commit(next);
  clearData('rotate', st);
  h.say(translate(lg(h), 'tl_msg_rotated', { hint: transformHint('rotate', st, unitsOf(h.project?.()), lg(h)) }));
  return true;
}

function rotateClick(h: ModHost, st: Step, at: Vec2): void {
  if (st.stage === 1) {
    st.pts = [at];
    st.stage = 2;
    return h.say(transformHint('rotate', st, unitsOf(h.project?.()), lg(h)));
  }
  const ang = rotAngle(h.draft(), st.pts[0]!, at);
  if (ang === null) return h.say(translate(lg(h), 'tl_msg_ref_at_center'));
  applyRotate(h, st, ang);
}

function mirrorClick(h: ModHost, st: Step, at: Vec2): void {
  if (st.stage === 1) {
    st.pts = [at];
    st.stage = 2;
    return h.say(transformHint('mirror', st, unitsOf(h.project?.()), lg(h)));
  }
  const d = h.draft();
  const next = mirrorSegs(d, d.selected, st.pts[0]!, at, st.copy);
  if (!next) return h.say(translate(lg(h), 'tl_msg_axis_zero'));
  h.commit(next);
  clearData('mirror', st);
  h.say(translate(lg(h), 'tl_msg_mirrored', { hint: transformHint('mirror', st, unitsOf(h.project?.()), lg(h)) }));
}

/**
 * Destino do passo (mover, copiar ou fim do passo da matriz). Copiar com Ctrl repete a partir da mesma base.
 */
function destAt(h: ModHost, kind: PerimeterModifyKind, st: Step, dest: Vec2, ctrl: boolean): boolean {
  const base = st.pts[0]!;
  if (kind === 'array') {
    st.pts = [base, dest];
    st.stage = 3;
    h.say(transformHint(kind, st, unitsOf(h.project?.()), lg(h)));
    return true;
  }
  const delta = sub(dest, base);
  if (len(delta) <= MOD_TOL) return refuse(h, translate(lg(h), 'tl_msg_dest_equals_base'));
  const d = h.draft();
  if (kind === 'move') {
    h.commit(moveSegs(d, d.selected, delta));
    clearData(kind, st);
    h.say(translate(lg(h), 'tl_msg_moved', { hint: transformHint(kind, st, unitsOf(h.project?.()), lg(h)) }));
    return true;
  }
  const next = copySegs(d, d.selected, delta);
  if (!next) return refuse(h, translate(lg(h), 'tl_msg_dest_equals_base'));
  h.commit(next);
  if (ctrl) {
    h.say(translate(lg(h), 'tl_msg_copy_made'));
    return true;
  }
  clearData(kind, st);
  h.say(translate(lg(h), 'tl_msg_copied', { hint: transformHint(kind, st, unitsOf(h.project?.()), lg(h)) }));
  return true;
}

/** Destino digitado como deslocamento (dx,dy) no estágio de destino de Mover/Copiar, sem depender do cursor. */
export function transformDelta(h: ModHost, kind: PerimeterModifyKind, st: Step, delta: Vec2): boolean {
  const base = st.pts[0];
  if (!base || st.stage !== 2) return false;
  return destAt(h, kind, st, add(base, delta), false);
}

/** Matriz: quantidade de itens (inclui o original). Devolve false se a quantidade ou o passo não servem. */
function arrayCount(h: ModHost, st: Step, count: number): boolean {
  if (!Number.isInteger(count) || count < 2) return refuse(h, translate(lg(h), 'tl_msg_count_int'));
  const d = h.draft();
  const next = arraySegs(d, d.selected, sub(st.pts[1]!, st.pts[0]!), count);
  if (!next) return refuse(h, translate(lg(h), 'tl_msg_step_zero'));
  h.commit(next);
  clearData('array', st);
  h.say(translate(lg(h), 'tl_msg_array_done', { n: count, hint: transformHint('array', st, unitsOf(h.project?.()), lg(h)) }));
  return true;
}

/** Clique num comando de transformação. `at` é o ponto do passo (capturado quando o estágio pede ponto). */
export function transformClick(h: ModHost, kind: PerimeterModifyKind, st: Step, p: PointerInfo, at: Vec2): void {
  if (kind === 'offset') return offsetAt(h, st, at);
  if (kind === 'rotate') return rotateClick(h, st, at);
  if (kind === 'mirror') return mirrorClick(h, st, at);
  if (st.stage === 1) {
    st.pts = [at];
    st.stage = 2;
    return h.say(transformHint(kind, st, unitsOf(h.project?.()), lg(h)));
  }
  if (st.stage === 2) {
    destAt(h, kind, st, at, p.ctrl);
    return;
  }
  h.say(transformHint(kind, st, unitsOf(h.project?.()), lg(h)));
}

/**
 * Valor digitado no estágio com entrada numérica: distância do deslocamento, ângulo em graus, distância ao destino
 * (na direção do cursor) ou quantidade da matriz. `cursor` dá a direção da distância.
 */
export function transformType(h: ModHost, kind: PerimeterModifyKind, st: Step, v: number, cursor: Vec2): boolean {
  if (kind === 'offset') {
    if (!(v > MOD_TOL)) return refuse(h, translate(lg(h), 'tl_msg_length_positive_m'));
    st.num = v;
    h.say(transformHint(kind, st, unitsOf(h.project?.()), lg(h)));
    return true;
  }
  if (kind === 'rotate') return applyRotate(h, st, (v * Math.PI) / 180);
  if (kind === 'array' && st.stage === 3) return arrayCount(h, st, v);
  if (!(v > MOD_TOL)) return refuse(h, translate(lg(h), 'tl_msg_length_positive_m'));
  return destAt(h, kind, st, alongTo(st.pts[0]!, cursor, v), false);
}

/** Enter no estágio da quantidade da matriz: usa a quantidade padrão das opções. */
export function transformConfirm(h: ModHost, kind: PerimeterModifyKind, st: Step): void {
  if (kind === 'array' && st.stage === 3) arrayCount(h, st, h.options().arrayCount);
}

/** Tab nos comandos com copiar/mover: alterna e mostra a dica. Devolve false se o comando não tem a opção. */
export function transformTab(h: ModHost, kind: PerimeterModifyKind, st: Step): boolean {
  if (!COPY_KINDS.has(kind)) return false;
  st.copy = !st.copy;
  h.say(transformHint(kind, st, unitsOf(h.project?.()), lg(h)));
  return true;
}

/** Prévia de um comando de transformação com o cursor em `at`: linhas de origem realçadas e o resultado tracejado. */
export function transformPreview(h: ModHost, kind: PerimeterModifyKind, st: Step, at: Vec2): PreviewItem[] {
  const d = h.draft();
  const ids = d.selected;
  const sources = ids.flatMap((id) => halo(d, id));
  if (kind === 'offset') {
    const dist = st.num ?? nearestDist(d, ids, at);
    return dist > MOD_TOL ? [...sources, ...ghost(d, offsetNext(d, ids, dist, at))] : sources;
  }
  if (st.stage === 1) return sources;
  const base = st.pts[0]!;
  if (kind === 'move' || kind === 'copy') {
    const delta = sub(at, base);
    const next = kind === 'move' ? moveSegs(d, ids, delta) : copySegs(d, ids, delta);
    return [...sources, dashedLine(base, at), ...ghost(d, next)];
  }
  if (kind === 'rotate') {
    const ang = rotAngle(d, base, at);
    return ang === null ? sources : [...sources, ...ghost(d, rotateSegs(d, ids, base, ang, st.copy))];
  }
  if (kind === 'mirror') return [...sources, dashedLine(base, at), ...ghost(d, mirrorSegs(d, ids, base, at, st.copy))];
  if (kind === 'array') {
    const fixed = st.stage === 3;
    const end = fixed ? st.pts[1]! : at;
    const count = fixed ? h.options().arrayCount : 2;
    return [...sources, dashedLine(base, end), ...ghost(d, arraySegs(d, ids, sub(end, base), count))];
  }
  return sources;
}
