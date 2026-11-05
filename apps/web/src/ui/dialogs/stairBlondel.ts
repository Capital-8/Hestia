import type { StairType } from '@hestia/model';
import type { Lang } from '../../editor/i18n.ts';
import { computeStairCalc } from './stairTypeCalc.ts';

/** Campos do tipo que entram na conta ao vivo do cartão de Blondel. */
export type BlondelInput = Pick<
  StairType,
  'maxRiser' | 'minTread' | 'maxTread' | 'calcRiserFactor' | 'calcTreadFactor' | 'calcTarget' | 'calcMin' | 'calcMax'
>;

/** Números da conta ao vivo, no passo a passo do cartão (metros internos). */
export interface BlondelLive {
  valid: boolean;
  height: number;
  quotient: number;
  risers: number;
  riser: number;
  riserShown: number;
  treadRaw: number;
  tread: number;
  clamp: 'min' | 'max' | null;
  sum: number;
  status: 'ok' | 'warn' | 'bad';
  side: 'below' | 'above' | 'in';
  delta: number;
}

/** Arredonda a 0,1 cm (metros internos): é o espelho que a tela mostra e reusa nos passos seguintes. */
export const round01cm = (m: number): number => Math.round(m * 1000) / 1000;

/** Fator da fórmula como texto: inteiros sem casas, senão até 2 casas sem zeros à direita. */
function factorText(v: number, lang: Lang): string {
  const s = Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''); // units-ok: valores da fórmula de Blondel no cartão técnico
  return lang === 'en' ? s : s.replace('.', ','); // units-ok: separador decimal do cartão de Blondel
}

/** Fórmula do tipo com os fatores simplificados: a=2/b=1 ⇒ "2·R + T"; pt usa vírgula decimal. */
export function formulaText(a: number, b: number, lang: Lang): string {
  const term = (f: number, sym: 'R' | 'T'): string => {
    const s = factorText(f, lang);
    return s === '1' ? sym : `${s}·${sym}`;
  };
  return `${term(a, 'R')} + ${term(b, 'T')}`;
}

const TOL = 0.0005;

const invalid = (): BlondelLive => ({
  valid: false,
  height: 0,
  quotient: 0,
  risers: 0,
  riser: 0,
  riserShown: 0,
  treadRaw: 0,
  tread: 0,
  clamp: null,
  sum: 0,
  status: 'bad',
  side: 'in',
  delta: 0,
});

/**
 * Conta do cartão de Blondel: usa `computeStairCalc` para os números que o motor calcula (N, R, estado e diferença) e
 * refaz o piso e a soma a partir do R arredondado a 0,1 cm, para a conta fechar na tela. O estado (✓/!/✕) é sempre o
 * exato do motor; só a soma exibida pode diferir em até 0,1 cm.
 */
export function blondelLive(type: BlondelInput, floorToFloor: number): BlondelLive {
  const calc = computeStairCalc(type, floorToFloor);
  if (!calc.valid) return invalid();
  const {
    maxRiser,
    minTread,
    maxTread,
    calcRiserFactor: a,
    calcTreadFactor: b,
    calcTarget: target,
    calcMin,
    calcMax,
  } = type;
  const riser = calc.riser;
  const riserShown = round01cm(riser);
  const treadRaw = (target - a * riserShown) / b;
  const tread = Math.min(maxTread, Math.max(minTread, treadRaw));
  const clamp: BlondelLive['clamp'] =
    treadRaw < minTread - 1e-9 ? 'min' : treadRaw > maxTread + 1e-9 ? 'max' : null;
  const sum = a * riserShown + b * tread;
  const exact = a * riser + b * tread;
  const side: BlondelLive['side'] =
    exact < calcMin - TOL ? 'below' : exact > calcMax + TOL ? 'above' : 'in';
  return {
    valid: true,
    height: floorToFloor,
    quotient: floorToFloor / maxRiser,
    risers: calc.risers,
    riser,
    riserShown,
    treadRaw,
    tread,
    clamp,
    sum,
    status: calc.status,
    side,
    delta: calc.delta,
  };
}
