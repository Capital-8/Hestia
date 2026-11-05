import { add, dist, dot, mul, norm, perp, sub, type Vec2 } from '@hestia/geom';
import type { RampInputMode, RampType } from '@hestia/model';
import { layoutSegment, layoutUntilRise, LIVE_RISE_TOL, type LayoutPiece } from './rampLive.ts';
import { inlineLanding, maxRiseFor, planRamp, tagRuns, type RampPlan, type RampPlanResult } from './rampPlan.ts';
import { generateStraightRun, type StairComponentSketch } from './stairGenerators.ts';
import { FREE_COLLINEAR_ANGLE, FREE_MAX_TURN_ANGLE, findSelfOverlap, turnLandingSketch } from './freePathGeom.ts';
import { numLang, t, type Lang } from './i18nMessages.ts';

export { FREE_COLLINEAR_ANGLE, FREE_MAX_TURN_ANGLE } from './freePathGeom.ts';

/** Trecho de lance mínimo entre dois patamares de giro (m). */
const MIN_FLIGHT = 0.05;
/** Distância mínima entre vértices consecutivos (m): menor que isso, o vértice é ignorado. */
const MIN_SEGMENT = 0.01;

export interface RampFreeOptions {
  /** Largura do lance (m). */
  width: number;
  mode: RampInputMode;
  /** Modo 'slope': inclinação alvo (fração); ausente = padrão do tipo. */
  slope?: number;
  /** Profundidade do patamar de giro; padrão max(largura, patamar mínimo do tipo); nunca menor que a largura. */
  landingDepth?: number;
  /** Índices (do trajeto original) de vértices que viram patamar mesmo se colineares. */
  manualLandings?: number[];
  /** Idioma das mensagens (padrão `'pt'`). */
  lang?: Lang;
}

interface Seg {
  a: Vec2;
  d: Vec2;
  len: number;
}

interface Turn {
  /** Vértice. */
  v: Vec2;
  dA: Vec2;
  dB: Vec2;
  /** +1 = giro à esquerda (lado interno = esquerda). */
  sgn: number;
  /** Ângulo de giro (rad). */
  theta: number;
  /** Recuo mínimo (m): evita polígono autointerceptante. */
  tMin: number;
  /** Recuo preferido (m): área do patamar >= D x D. */
  tPref: number;
  /** Recuo usado (m). */
  t: number;
  /** Este vértice vira patamar de giro? */
  on: boolean;
}

/**
 * Planeja uma rampa de trajeto livre (vértices clicados). Cada trecho é um lance reto (com patamares em linha a cada
 * desnível máximo da norma); cada vértice com giro >= 3° (ou marcado) vira patamar de giro com mitra, de área >= D x D
 * quando o trecho comporta. Um trecho só equivale ao `planRamp` reto. Devolve `{ error }` se o trajeto não comporta o
 * patamar (trecho curto demais, retorno agudo): nunca gera polígono autointerceptante.
 */
export function planRampFree(path: Vec2[], H: number, type: RampType, o: RampFreeOptions): RampPlanResult {
  const lang = o.lang ?? 'pt';
  const w = o.width;
  if (!(w > 0)) return { error: t(lang, 'egb_err_ramp_width') };
  if (!(H > 0)) return { error: t(lang, 'egb_err_ramp_rise') };

  // Limpa vértices repetidos, guardando o índice original (para os patamares manuais).
  const pts: Vec2[] = [];
  const orig: number[] = [];
  path.forEach((p, i) => {
    if (pts.length === 0 || dist(p, pts[pts.length - 1]!) >= MIN_SEGMENT) {
      pts.push(p);
      orig.push(i);
    }
  });
  if (pts.length < 2) return { error: t(lang, 'egb_err_path_points') };
  const target = o.slope ?? type.defaultSlope;
  if (o.mode === 'slope' && !(target > 0)) return { error: t(lang, 'egb_err_slope_positive') };

  // Um trecho: igual à rampa reta.
  if (pts.length === 2) {
    const total = dist(pts[0]!, pts[1]!);
    return planRamp({
      start: pts[0]!,
      dir: sub(pts[1]!, pts[0]!),
      H,
      type,
      shape: 'straight',
      turn: 'left',
      width: w,
      mode: o.mode,
      length: o.mode === 'length' ? total : undefined,
      slope: o.mode === 'slope' ? target : undefined,
      lang,
    });
  }

  const P = type.landingMinLength;
  const D = Math.max(o.landingDepth ?? Math.max(w, P), w);
  const manual = new Set(o.manualLandings ?? []);

  const segs: Seg[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const l = dist(pts[i]!, pts[i + 1]!);
    segs.push({ a: pts[i]!, d: norm(sub(pts[i + 1]!, pts[i]!)), len: l });
  }
  // Vértices interiores: turns[k] liga segs[k] e segs[k+1].
  const turns: Turn[] = [];
  for (let k = 0; k + 1 < segs.length; k++) {
    const dA = segs[k]!.d;
    const dB = segs[k + 1]!.d;
    const c = Math.max(-1, Math.min(1, dot(dA, dB)));
    const theta = Math.acos(c);
    const cr = dA.x * dB.y - dA.y * dB.x;
    const sgn = cr >= 0 ? 1 : -1;
    const on = theta >= FREE_COLLINEAR_ANGLE || manual.has(orig[k + 1]!);
    if (theta > FREE_MAX_TURN_ANGLE) {
      return { error: t(lang, 'egb_err_sharp_turn', { n: k + 2 }) };
    }
    const tMin = (w / 2) * Math.tan(theta / 2);
    const tPref = Math.max((D * D) / (2 * w), tMin);
    turns.push({ v: pts[k + 1]!, dA, dB, sgn, theta, tMin, tPref, t: on ? tPref : 0, on });
  }

  // Recuos: cada trecho precisa comportar os dois recuos + um lance mínimo. Reduz até o mínimo geométrico.
  for (let pass = 0; pass < 8; pass++) {
    for (let k = 0; k < segs.length; k++) {
      const ta = k > 0 && turns[k - 1]!.on ? turns[k - 1]! : null;
      const tb = k < turns.length && turns[k]!.on ? turns[k]! : null;
      const need = (ta?.t ?? 0) + (tb?.t ?? 0) + MIN_FLIGHT;
      if (need <= segs[k]!.len + 1e-9) continue;
      const floor = (ta?.tMin ?? 0) + (tb?.tMin ?? 0) + MIN_FLIGHT;
      if (floor > segs[k]!.len + 1e-9) return { error: t(lang, 'egb_err_segment_short', { n: k + 1 }) };
      const slack = segs[k]!.len - floor;
      const wantExtra = (ta ? ta.t - ta.tMin : 0) + (tb ? tb.t - tb.tMin : 0);
      const f = wantExtra > 0 ? Math.min(1, slack / wantExtra) : 0;
      if (ta) ta.t = ta.tMin + (ta.t - ta.tMin) * f;
      if (tb) tb.t = tb.tMin + (tb.t - tb.tMin) * f;
    }
  }

  // Intervalo útil de cada trecho [a, b] (distância desde o início do trecho).
  const range = segs.map((sg, k) => {
    const a = k > 0 && turns[k - 1]!.on ? turns[k - 1]!.t : 0;
    const b = sg.len - (k < turns.length && turns[k]!.on ? turns[k]!.t : 0);
    return { a, b, e: Math.max(0, b - a) };
  });

  // Inclinação de trabalho.
  let s = target;
  if (o.mode === 'length') {
    const E = range.reduce((acc, r) => acc + r.e, 0);
    s = H / E;
    for (let it = 0; it < 30; it++) {
      let landings = 0;
      let c = 0;
      segs.forEach((_, k) => {
        const lay = layoutSegment(range[k]!.e, c, s, maxRiseFor(type, s) ?? 0, P);
        landings += lay.pieces.filter((p) => p.kind === 'landing').length;
        c = k < turns.length && turns[k]!.on ? 0 : lay.carry;
      });
      const flightsLen = E - landings * P;
      if (!(flightsLen > 0)) break;
      const next = H / flightsLen;
      if (Math.abs(next - s) < 1e-9) break;
      s = next;
    }
  }
  const mr = maxRiseFor(type, s) ?? 0;

  // Layout trecho a trecho, com o desnível acumulado do lance corrente reiniciando nos patamares de giro.
  type Placed = { seg: number; piece: LayoutPiece };
  const placed: Placed[] = [];
  const turnsUsed: number[] = [];
  let c = 0;
  let remRise = H;
  let closed = false;
  let extended = 0;
  let truncated = false;
  for (let k = 0; k < segs.length && !closed; k++) {
    const { e } = range[k]!;
    let lay = layoutSegment(e, c, s, mr, P);
    if (o.mode === 'slope' && lay.rise >= remRise - LIVE_RISE_TOL) {
      lay = layoutUntilRise(remRise, c, s, mr, P);
      closed = true;
      truncated = k + 1 < segs.length || lay.length < e - 1e-6;
    }
    const pcs = lay.pieces.slice();
    const hasTurn = k < turns.length && turns[k]!.on;
    if (!closed && hasTurn && pcs.length > 0 && pcs[pcs.length - 1]!.kind === 'landing') pcs.pop();
    pcs.forEach((p) => placed.push({ seg: k, piece: p }));
    remRise -= lay.rise;
    c = lay.carry;
    if (!closed && hasTurn) {
      turnsUsed.push(k);
      c = 0;
    }
    if (!closed && k === segs.length - 1 && o.mode === 'slope' && remRise > LIVE_RISE_TOL) {
      // O trajeto acabou antes do topo: estende o último trecho na sua direção.
      const startAt = pcs.length > 0 ? pcs[pcs.length - 1]!.at + pcs[pcs.length - 1]!.length : 0;
      const ext = layoutUntilRise(remRise, c, s, mr, P);
      ext.pieces.forEach((p, idx) => {
        const prev = placed[placed.length - 1];
        // O 1º pedaço da extensão continua o lance anterior (mesma direção): um lance só.
        if (idx === 0 && p.kind === 'flight' && prev && prev.seg === k && prev.piece.kind === 'flight') {
          prev.piece = { ...prev.piece, length: prev.piece.length + p.length, rise: prev.piece.rise + p.rise };
        } else placed.push({ seg: k, piece: { ...p, at: p.at + startAt } });
      });
      extended = ext.length;
      remRise -= ext.rise;
    }
  }

  // Monta os componentes na ordem do trajeto.
  const parts: StairComponentSketch[] = [];
  const segOf: number[] = [];
  const flightLengths: number[] = [];
  const rawRises: number[] = [];
  let pathLength = 0;
  const lastSeg = placed.length > 0 ? placed[placed.length - 1]!.seg : 0;
  segs.forEach((sg, k) => {
    if (k > lastSeg) return;
    const { a } = range[k]!;
    const at = (u: number, v: number): Vec2 => add(sg.a, add(mul(sg.d, u), mul(perp(sg.d), v)));
    for (const { seg, piece } of placed) {
      if (seg !== k) continue;
      const u0 = a + piece.at;
      pathLength += piece.length;
      if (piece.kind === 'flight') {
        parts.push({ kind: 'run', run: generateStraightRun({ start: at(u0, 0), dir: sg.d, width: w, risers: 2, tread: piece.length }) });
        segOf.push(k);
        flightLengths.push(piece.length);
        rawRises.push(piece.rise);
      } else {
        parts.push(inlineLanding(at, u0, u0 + piece.length, -w / 2, w / 2));
        segOf.push(k);
      }
    }
    if (turnsUsed.includes(k)) {
      parts.push(turnLandingSketch(turns[k]!.v, turns[k]!.dA, turns[k]!.dB, w, turns[k]!.t));
      segOf.push(k);
      pathLength += 2 * turns[k]!.t;
    }
  });

  if (flightLengths.length === 0) return { error: t(lang, 'egb_err_path_short_flight') };
  // Só na criação/regeneração (a prévia da sessão não passa por aqui): trechos não adjacentes não podem se sobrepor.
  const clash = findSelfOverlap(parts, segOf);
  if (clash) return { error: t(lang, 'egb_err_path_overlap', { n: segOf[clash.a]! + 1 }) };
  const sumL = flightLengths.reduce((x, y) => x + y, 0);
  const sumR = rawRises.reduce((x, y) => x + y, 0);
  // Soma das elevações = H exatamente (distribui o resíduo proporcionalmente ao comprimento).
  const rises = o.mode === 'length' ? flightLengths.map((l) => (H * l) / sumL) : rawRises.map((r) => (r * H) / (sumR || 1));
  const slope = H / sumL;

  const notes: string[] = [];
  if (extended > 1e-6) notes.push(t(lang, 'egb_note_path_extended', { d: numLang(extended, 2, lang) }));
  if (truncated) notes.push(t(lang, 'egb_note_path_shortened'));
  const plan: RampPlan = {
    parts: tagRuns(parts, 'straight'),
    flights: flightLengths.length,
    flightLengths,
    rises,
    landingDepth: turnsUsed.length > 0 ? D : P,
    slope,
    pathLength,
  };
  if (notes.length > 0) plan.note = notes.join(' ');
  return plan;
}
