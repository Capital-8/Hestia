import { add, dist, mul, norm, sub, type Vec2 } from '@hestia/geom';
import { rampMaxSlope, rampNormRowFor, type RampType } from '@hestia/model';
import { numLang, t, type Lang } from './i18nMessages.ts';
import { flightsFor, maxRiseFor } from './rampPlan.ts';

/**
 * Cálculo numérico do modo "livre" da rampa (prévia em tempo real e otimizador). Tudo puro e O(nº de lances):
 * nada de `resolveRamps`, validação de projeto nem operações booleanas.
 */

/** Tolerância de desnível ao decidir "nível alcançado" (m). */
export const LIVE_RISE_TOL = 0.005;

const EPS = 1e-9;

/** Um pedaço do layout: lance (sobe) ou patamar (plano). `at` = distância do início do trecho. */
export interface LayoutPiece {
  kind: 'flight' | 'landing';
  at: number;
  length: number;
  /** Desnível vencido (0 no patamar). */
  rise: number;
}

export interface SegmentLayout {
  pieces: LayoutPiece[];
  /** Desnível acumulado no lance corrente ao fim do trecho (zera no patamar). */
  carry: number;
  /** Desnível total vencido no trecho. */
  rise: number;
  /** Distância horizontal coberta pelos pedaços. */
  length: number;
}

function core(limit: number, riseLimit: number, c: number, s: number, maxRise: number, P: number): SegmentLayout {
  const pieces: LayoutPiece[] = [];
  let rem = limit;
  let need = riseLimit;
  let cur = c;
  let pos = 0;
  let rise = 0;
  const cap = maxRise > 0 ? maxRise : Infinity;
  if (!(s > 0)) {
    if (limit > EPS && Number.isFinite(limit)) pieces.push({ kind: 'flight', at: 0, length: limit, rise: 0 });
    return { pieces, carry: cur, rise: 0, length: Number.isFinite(limit) ? limit : 0 };
  }
  for (let guard = 0; guard < 2000 && rem > EPS && need > EPS; guard++) {
    const room = cap - cur;
    if (room <= EPS) {
      // Esgotou o desnível máximo do lance: patamar (consome distância, não sobe).
      const l = Math.min(P > 0 ? P : 0, rem);
      if (l > EPS) {
        pieces.push({ kind: 'landing', at: pos, length: l, rise: 0 });
        pos += l;
        rem -= l;
      }
      cur = 0;
      continue;
    }
    const fl = Math.min(rem, room / s, need / s);
    if (!(fl > EPS)) break;
    const r = fl * s;
    pieces.push({ kind: 'flight', at: pos, length: fl, rise: r });
    pos += fl;
    rem -= fl;
    cur += r;
    rise += r;
    need -= r;
  }
  return { pieces, carry: cur, rise, length: pos };
}

/**
 * Layout de `d` metros de trecho à inclinação `s` (fração): lance até `maxRise` de desnível acumulado (`c` = já
 * acumulado no lance corrente), depois patamar de `P` m, e repete. Não emite patamar sem distância sobrando.
 */
export function layoutSegment(d: number, c: number, s: number, maxRise: number, P: number): SegmentLayout {
  return core(Math.max(0, d), Infinity, c, s, maxRise, P);
}

/** Como `layoutSegment`, mas pára exatamente quando vencer `riseNeeded` de desnível (sem patamar no fim). */
export function layoutUntilRise(riseNeeded: number, c: number, s: number, maxRise: number, P: number): SegmentLayout {
  return core(Infinity, Math.max(0, riseNeeded), c, s, maxRise, P);
}

// ---------------------------------------------------------------------------------------------------------------
// Falta/sobra em tempo real
// ---------------------------------------------------------------------------------------------------------------

export interface LiveInput {
  /** Desnível total da rampa (m). */
  H: number;
  mode: 'slope' | 'length';
  type: RampType;
  /** Modo 'slope': inclinação de trabalho; modo 'length': meta (ausente = máximo da norma do tipo). Ausente = padrão do tipo. */
  slope?: number;
  /** Distância horizontal do percurso até o cursor (lances + patamares). */
  pathLength: number;
  /** Desnível já vencido por trechos anteriores (m). */
  riseDone?: number;
  /** Desnível acumulado no lance corrente ao início do trecho vivo (m). */
  carry?: number;
  /** Modo 'length': soma dos patamares já contidos em `pathLength` (m). Padrão 0. */
  landingsLength?: number;
}

export type LiveRemaining =
  | {
      mode: 'slope';
      status: 'falta' | 'alcancado' | 'passou';
      slope: number;
      /** Desnível vencido até o cursor (limitado ao topo) ou, em `passou`, até o ponto de fechamento. */
      rise: number;
      /** `falta`: desnível que falta (m); senão 0. */
      falta: number;
      /** `falta`: rampa que falta, falta/s (m); senão 0. */
      faltaLength: number;
      /** `passou`: desnível a mais que o cursor subiria (m); senão 0. */
      excess: number;
      /** `passou`: percurso que sobra além do fechamento (m); senão 0. */
      excessLength: number;
      /** Distância (do início do trecho vivo) em que o desnível fecha; null se ainda não fecha. */
      closeAt: number | null;
    }
  | {
      mode: 'length';
      /** Inclinação resultante H / comprimento de lances. */
      slope: number;
      /** Meta de inclinação. */
      target: number;
      withinNorm: boolean;
      /** Comprimento de rampa que falta para atingir a meta (m); 0 se já está dentro. */
      faltaLength: number;
    };

/** Inclinação mínima de trabalho (fração): evita H / 0 = Infinity quando a barra de opções chega com 0. */
export const MIN_LIVE_SLOPE = 1e-3;

/** Falta/sobra de desnível (modo 'slope') ou de comprimento (modo 'length') para o cursor atual. */
export function liveRemaining(i: LiveInput): LiveRemaining {
  const { H, type } = i;
  const P = type.landingMinLength;
  if (i.mode === 'length') {
    const lf = Math.max(1e-9, i.pathLength - (i.landingsLength ?? 0));
    const slope = H / lf;
    const target = Math.max(MIN_LIVE_SLOPE, i.slope ?? rampMaxSlope(type) ?? type.defaultSlope);
    const withinNorm = slope <= target + 1e-6;
    return { mode: 'length', slope, target, withinNorm, faltaLength: withinNorm ? 0 : Math.max(0, H / target - lf) };
  }
  const s = Math.max(MIN_LIVE_SLOPE, i.slope ?? type.defaultSlope);
  const total = H - (i.riseDone ?? 0);
  const maxRise = maxRiseFor(type, s) ?? 0;
  const lay = layoutSegment(i.pathLength, i.carry ?? 0, s, maxRise, P);
  const falta = total - lay.rise;
  if (Math.abs(falta) <= LIVE_RISE_TOL) {
    return { mode: 'slope', status: 'alcancado', slope: s, rise: lay.rise, falta: 0, faltaLength: 0, excess: 0, excessLength: 0, closeAt: closeAt(total, i.carry ?? 0, s, maxRise, P) };
  }
  if (falta > 0) {
    return { mode: 'slope', status: 'falta', slope: s, rise: lay.rise, falta, faltaLength: falta / s, excess: 0, excessLength: 0, closeAt: null };
  }
  const at = closeAt(total, i.carry ?? 0, s, maxRise, P);
  const excessLength = Math.max(0, i.pathLength - at);
  return { mode: 'slope', status: 'passou', slope: s, rise: total, falta: 0, faltaLength: 0, excess: excessLength * s, excessLength, closeAt: at };
}

/** Distância (do início do trecho) em que o desnível `total` fecha. */
function closeAt(total: number, c: number, s: number, maxRise: number, P: number): number {
  return layoutUntilRise(total, c, s, maxRise, P).length;
}

// ---------------------------------------------------------------------------------------------------------------
// Otimizador ("Ajustar")
// ---------------------------------------------------------------------------------------------------------------

export interface OptimizeInput {
  /** Desnível total (m). */
  H: number;
  type: RampType;
  /**
   * Comprimentos desenhados dos trechos (m), de eixo a eixo do percurso (lances + patamares). Entre dois trechos
   * há um patamar de giro de `turnLanding`.
   */
  segments: number[];
  /**
   * 'slope': só o candidato da barra; 'length': a inclinação exata do croqui se a norma aceita, senão o de menor
   * ajuste; 'auto': a barra e cada linha da tabela de norma (inclinação livre dentro da tabela).
   */
  mode: 'slope' | 'length' | 'auto';
  /** Inclinação da barra (fração); ausente = padrão do tipo. */
  slope?: number;
  /** Profundidade do patamar de giro (m); padrão = patamar mínimo do tipo. */
  turnLanding?: number;
  /** Idioma das mensagens do resumo (padrão `'pt'`). */
  lang?: Lang;
}

export interface OptimizeCandidate {
  slope: number;
  flights: number;
  /** Comprimento horizontal de cada lance (iguais). */
  flightLength: number;
  /** Comprimento do percurso necessário (lances + patamares). */
  pathLength: number;
  /** Necessário - desenhado (m): positivo estica o último trecho; negativo trunca. */
  delta: number;
  /** Soma das violações de norma (0 = respeita a norma). */
  violation: number;
  messages: string[];
}

export interface OptimizeResult extends OptimizeCandidate {
  /** Trechos ajustados (último esticado ou truncado a partir do fim; nunca some o 1º). */
  segments: number[];
  /** Resumo no idioma pedido (`lang`). */
  note: string;
}

const SEG_MIN = 0.01;

function fmtIn(lang: Lang) {
  return (n: number, d = 2): string => numLang(n, d, lang);
}

/** Candidato à inclinação `s` fixa. */
function candidateAt(i: OptimizeInput, s: number, drawn: number, turns: number, D: number): OptimizeCandidate {
  const { H, type } = i;
  const mr = maxRiseFor(type, s);
  const n = Math.max(turns + 1, mr ? flightsFor(H, mr) : 1);
  return build(i, s, n, H / s, drawn, turns, D);
}

function landingsLength(n: number, turns: number, D: number, P: number): number {
  return turns * D + Math.max(0, n - 1 - turns) * P;
}

function build(i: OptimizeInput, s: number, n: number, lf: number, drawn: number, turns: number, D: number): OptimizeCandidate {
  const { H, type } = i;
  const lang = i.lang ?? 'pt';
  const fmt = fmtIn(lang);
  const P = type.landingMinLength;
  const pathLength = lf + landingsLength(n, turns, D, P);
  const messages: string[] = [];
  let violation = 0;
  if (type.normTable.length > 0) {
    const smax = rampMaxSlope(type)!;
    if (s > smax + 1e-6) {
      violation += s - smax;
      messages.push(t(lang, 'egb_live_ramp_slope', { slope: fmt(s * 100), max: fmt(smax * 100) }));
    }
    const row = rampNormRowFor(type, s);
    const mr = maxRiseFor(type, s);
    if (mr && H / n > mr + 1e-9) {
      violation += H / n - mr;
      messages.push(t(lang, 'egb_live_ramp_rise', { h: fmt(H / n), max: fmt(mr) }));
    }
    if (row && row.maxFlights !== null && n > row.maxFlights) {
      violation += n - row.maxFlights;
      messages.push(t(lang, 'egb_live_ramp_flights', { n, max: row.maxFlights }));
    }
  }
  return { slope: s, flights: n, flightLength: lf / n, pathLength, delta: pathLength - drawn, violation, messages };
}

/** Inclinação do croqui: menor nº de lances `n` que torna coerente `s = H / (percurso - patamares)`. */
function fitCandidate(i: OptimizeInput, drawn: number, turns: number, D: number): OptimizeCandidate | null {
  const P = i.type.landingMinLength;
  for (let n = turns + 1; n <= 40; n++) {
    const lf = drawn - landingsLength(n, turns, D, P);
    if (!(lf > 0)) continue;
    const s = i.H / lf;
    const mr = maxRiseFor(i.type, s);
    if (!mr || i.H / n <= mr + 1e-9) return build(i, s, n, lf, drawn, turns, D);
  }
  return null;
}

const better = (a: OptimizeCandidate, b: OptimizeCandidate): boolean => {
  if (Math.abs(a.violation - b.violation) > 1e-9) return a.violation < b.violation;
  if (Math.abs(Math.abs(a.delta) - Math.abs(b.delta)) > 1e-9) return Math.abs(a.delta) < Math.abs(b.delta);
  if (Math.abs(a.slope - b.slope) > 1e-9) return a.slope < b.slope;
  return a.flights < b.flights;
};

/** Ajusta o último trecho (estica ou trunca a partir do fim, sem eliminar o 1º). */
function adjustSegments(segments: number[], delta: number): number[] {
  const out = segments.slice();
  if (delta >= 0) {
    out[out.length - 1] = out[out.length - 1]! + delta;
    return out;
  }
  let cut = -delta;
  while (cut > 1e-12) {
    const k = out.length - 1;
    const room = out[k]! - SEG_MIN;
    if (room >= cut || k === 0) {
      out[k] = Math.max(SEG_MIN, out[k]! - cut);
      break;
    }
    cut -= out[k]!;
    out.pop();
  }
  return out;
}

/**
 * Ajusta o croqui à norma do tipo (tabela editável, sem valores fixos). Custo lexicográfico: violações de norma,
 * menor desvio do croqui, menor inclinação, menos lances. Sem candidato válido devolve o de menor violação.
 */
export function optimizeRamp(i: OptimizeInput): OptimizeResult {
  const { type } = i;
  const drawn = i.segments.reduce((a, b) => a + b, 0);
  const turns = Math.max(0, i.segments.length - 1);
  const D = i.turnLanding ?? type.landingMinLength;
  const bar = Math.max(MIN_LIVE_SLOPE, i.slope ?? type.defaultSlope);

  const cands: OptimizeCandidate[] = [];
  if (i.mode === 'slope') {
    cands.push(candidateAt(i, bar, drawn, turns, D));
  } else if (i.mode === 'length') {
    const fit = fitCandidate(i, drawn, turns, D);
    if (fit && fit.violation === 0) cands.push(fit);
    else {
      if (fit) cands.push(fit);
      for (const s of [bar, ...type.normTable.map((r) => r.maxSlope)]) cands.push(candidateAt(i, s, drawn, turns, D));
    }
  } else {
    for (const s of [bar, ...type.normTable.map((r) => r.maxSlope)]) cands.push(candidateAt(i, s, drawn, turns, D));
  }
  let best = cands[0]!;
  for (const c of cands) if (better(c, best)) best = c;

  const segments = adjustSegments(i.segments, best.delta);
  const mudou = Math.abs(best.delta) > 1e-9;
  const sinal = best.delta >= 0 ? '+' : '-';
  const lang = i.lang ?? 'pt';
  const fmt = fmtIn(lang);
  const flight = t(lang, best.flights === 1 ? 'egb_live_flight_one' : 'egb_live_flight_many');
  const note =
    t(lang, 'egb_live_ramp_adjusted', { slope: fmt(best.slope * 100), n: best.flights, flight }) +
    (mudou ? t(lang, 'egb_live_ramp_last_segment', { sign: sinal, d: fmt(Math.abs(best.delta), 1) }) : t(lang, 'egb_live_ramp_kept')) +
    (best.violation > 0 ? t(lang, 'egb_live_no_option', { message: best.messages.join(' ') }) : '');
  return { ...best, segments, note };
}

/**
 * Trajeto (vértices) depois do "Ajustar": mantém a direção de cada trecho e usa os comprimentos de `segments`
 * (`OptimizeResult.segments`: último esticado ou truncado, nunca some o 1º). Trechos a mais são descartados.
 */
export function rebuildPathFromSegments(path: Vec2[], segments: number[]): Vec2[] {
  const out: Vec2[] = [{ ...path[0]! }];
  const n = Math.min(segments.length, path.length - 1);
  for (let i = 0; i < n; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const dir = dist(a, b) > 1e-12 ? norm(sub(b, a)) : { x: 1, y: 0 };
    out.push(add(out[i]!, mul(dir, segments[i]!)));
  }
  return out;
}
