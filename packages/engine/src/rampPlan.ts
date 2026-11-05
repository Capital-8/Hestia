import { add, dist, len, mid, mul, norm, perp, sub, type Vec2 } from '@hestia/geom';
import { rampNormRowFor, type Ramp, type RampInputMode, type RampShape, type RampType } from '@hestia/model';
import {
  generateLShape,
  generateStraightRun,
  generateUShape,
  type StairComponentSketch,
} from './stairGenerators.ts';
import type { StairCurve, StairLandingSketch, StairRunSketch } from './stairSketch.ts';
import { t, type Lang } from './i18nMessages.ts';

/** Entrada do planejamento puro da rampa (sem projeto, sem níveis). */
export interface RampPlanInput {
  /** Centro da borda de início (1º clique). */
  start: Vec2;
  /** Direção de subida (não precisa ser unitária). */
  dir: Vec2;
  /** Desnível total (m). */
  H: number;
  type: RampType;
  shape: RampShape;
  turn: 'left' | 'right';
  /** Largura do lance (m). */
  width: number;
  /** L/U; padrão max(width, type.landingMinLength). */
  landingDepth?: number;
  mode: RampInputMode;
  /** Modo 'length': comprimento TOTAL do percurso (m): soma dos lances + patamares. */
  length?: number;
  /** Modo 'slope': inclinação alvo (fração); ausente = type.defaultSlope. */
  slope?: number;
  /** Idioma das mensagens de erro (padrão `'pt'`). */
  lang?: Lang;
}

export interface RampPlan {
  /** Componentes do croqui, em ordem; cada lance com `generatedBy = shape`. */
  parts: StairComponentSketch[];
  /** Nº de lances. */
  flights: number;
  /** Comprimento horizontal de cada lance (m). */
  flightLengths: number[];
  /** Desnível de cada lance (m). */
  rises: number[];
  /** Comprimento do patamar gerado (m). */
  landingDepth: number;
  /** Inclinação (fração). */
  slope: number;
  /** Soma dos lances + patamares. */
  pathLength: number;
  /** Explicação em pt-BR (a ferramenta monta a nota do modo 'slope'). */
  note?: string;
}

export type RampPlanResult = RampPlan | { error: string };

/** Menor nº de lances: vence o desnível total com o máximo por lance. */
export const flightsFor = (H: number, maxRise: number): number => Math.max(1, Math.ceil(H / maxRise - 1e-9));

/** Desnível máximo por lance para a inclinação: a linha da tabela; sem linha, a última (tabela vazia → null). */
export function maxRiseFor(type: RampType, slope: number): number | null {
  const row = rampNormRowFor(type, slope);
  if (row) return row.maxRise;
  const last = type.normTable[type.normTable.length - 1];
  return last ? last.maxRise : null;
}

/** Patamar retangular em coordenadas locais, no mesmo formato do `landing()` privado de `stairGenerators.ts`. */
export function inlineLanding(
  at: (u: number, v: number) => Vec2,
  u0: number,
  u1: number,
  v0: number,
  v1: number,
): StairComponentSketch {
  const line = (a: Vec2, b: Vec2): StairCurve => ({ a, b, sag: 0 });
  const landing: StairLandingSketch = {
    boundary: [
      line(at(u0, v1), at(u0, v0)),
      line(at(u0, v0), at(u1, v0)),
      line(at(u1, v0), at(u1, v1)),
      line(at(u1, v1), at(u0, v1)),
    ],
  };
  return { kind: 'landing', landing };
}

/** Marca cada lance com o gerador que o produziu. */
export const tagRuns = (parts: StairComponentSketch[], shape: RampShape): StairComponentSketch[] =>
  parts.map((p) => (p.kind === 'run' ? { kind: 'run', run: { ...p.run, generatedBy: shape } } : p));

/** Planeja uma rampa reta, em L ou em U; devolve `{ error }` com entrada inválida. */
export function planRamp(i: RampPlanInput): RampPlanResult {
  const lang = i.lang ?? 'pt';
  if (!(i.width > 0)) return { error: t(lang, 'egb_err_ramp_width') };
  if (!(i.H > 0)) return { error: t(lang, 'egb_err_ramp_rise') };
  const d = len(i.dir) > 1e-12 ? norm(i.dir) : null;
  if (!d) return { error: t(lang, 'egb_err_ramp_dir') };
  const n = perp(d);
  const at = (u: number, v: number): Vec2 => add(i.start, add(mul(d, u), mul(n, v)));

  const straight = i.shape === 'straight';
  const P = i.type.landingMinLength;
  const D = i.landingDepth ?? Math.max(i.width, i.type.landingMinLength);
  if (!straight && D <= 0) return { error: t(lang, 'egb_err_length_short') };
  if (i.shape === 'lshape' && D < i.width) return { error: t(lang, 'egb_err_l_landing') };

  let flights: number;
  let totalL: number;
  let slope: number;
  let landingDepth: number;
  const target = i.slope ?? i.type.defaultSlope;

  if (i.mode === 'slope') {
    if (!(target > 0)) return { error: t(lang, 'egb_err_slope_positive') };
    if (straight) {
      const maxRise = maxRiseFor(i.type, target);
      flights = maxRise ? flightsFor(i.H, maxRise) : 1;
      totalL = i.H / target;
      landingDepth = P;
    } else {
      flights = 2;
      totalL = i.H / target;
      landingDepth = D;
    }
    slope = target;
  } else {
    const total = i.length;
    if (total === undefined || !(total > 0)) return { error: t(lang, 'egb_err_length_positive') };
    if (straight) {
      flights = 1;
      totalL = total;
      slope = i.H / total;
      if (i.type.normTable.length > 0) {
        let found = false;
        for (let k = 1; k <= 30; k++) {
          const sum = total - (k - 1) * P;
          if (!(sum > 0)) continue;
          const s = i.H / sum;
          const row = rampNormRowFor(i.type, s);
          if (row && i.H / k <= row.maxRise + 1e-9) {
            flights = k;
            totalL = sum;
            slope = s;
            found = true;
            break;
          }
        }
        if (!found) {
          flights = 1;
          totalL = total;
          slope = i.H / total;
        }
      }
      landingDepth = P;
    } else {
      totalL = total - D;
      if (!(totalL > 0)) return { error: t(lang, 'egb_err_length_short') };
      flights = 2;
      slope = i.H / totalL;
      landingDepth = D;
    }
  }

  const flightLengths = Array.from({ length: flights }, () => totalL / flights);
  const rises = Array.from({ length: flights }, () => i.H / flights);
  const pathLength = totalL + (flights - 1) * landingDepth;

  let parts: StairComponentSketch[];
  if (straight) {
    parts = [];
    const tread = flightLengths[0]!;
    for (let k = 0; k < flights; k++) {
      const u = k * (tread + landingDepth);
      parts.push({ kind: 'run', run: generateStraightRun({ start: at(u, 0), dir: d, width: i.width, risers: 2, tread }) });
      if (k + 1 < flights) {
        const u0 = u + tread;
        parts.push(inlineLanding(at, u0, u0 + landingDepth, -i.width / 2, i.width / 2));
      }
    }
  } else if (i.shape === 'lshape') {
    parts = generateLShape({ start: i.start, dir: d, width: i.width, risersFirst: 2, risersSecond: 2, tread: flightLengths[0]!, turn: i.turn, landingDepth: D });
  } else {
    parts = generateUShape({ start: i.start, dir: d, width: i.width, risersFirst: 2, risersSecond: 2, tread: flightLengths[0]!, turn: i.turn, landingDepth: D });
  }

  return {
    parts: tagRuns(parts, i.shape),
    flights,
    flightLengths,
    rises,
    landingDepth,
    slope,
    pathLength,
  };
}

/**
 * Base de regeneração lida do 1º componente (deve ser um lance com exatamente 2 espelhos): centro da borda de início,
 * direção de subida e largura. Null se a geometria é inválida.
 */
export function rampBasis(r: Ramp): { start: Vec2; dir: Vec2; width: number } | null {
  const first = r.components[0];
  if (!first || first.kind !== 'run' || first.risers.length !== 2) return null;
  const [a, b] = first.risers as [StairCurve, StairCurve];
  const start = mid(a.a, a.b);
  const end = mid(b.a, b.b);
  const dv = sub(end, start);
  const l = len(dv);
  const width = dist(a.a, a.b);
  if (!(l > 1e-9) || !(width > 1e-9)) return null;
  return { start, dir: mul(dv, 1 / l), width };
}

/** Reexporta o tipo de croqui usado por quem monta os componentes (evita importar de `stairSketch`). */
export type { StairRunSketch };
