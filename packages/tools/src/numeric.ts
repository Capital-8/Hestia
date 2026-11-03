import { fromDisplay, parseQuantity, type LengthUnit, type Quantity, type ResolvedUnits } from '@hestia/model';
import { t as translate, type DictKey, type Lang } from './i18n.ts';

/** Interpreta medidas digitadas: "3,5", "3.50+0,15", "(2+1)*0,5". Sem eval. Devolve null se inválido. */
export function parseNumber(text: string): number | null {
  const src = text.trim().replace(/,/g, '.').replace(/\s+/g, '');
  if (!src) return null;
  let i = 0;
  const peek = (): string => src[i] ?? '';
  const num = (): number | null => {
    const m = /^\d*\.?\d+/.exec(src.slice(i));
    if (!m) return null;
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const factor = (): number | null => {
    if (peek() === '-') {
      i++;
      const v = factor();
      return v === null ? null : -v;
    }
    if (peek() === '+') {
      i++;
      return factor();
    }
    if (peek() === '(') {
      i++;
      const v = expr();
      if (peek() !== ')') return null;
      i++;
      return v;
    }
    return num();
  };
  const term = (): number | null => {
    let v = factor();
    while (v !== null && (peek() === '*' || peek() === '/')) {
      const op = src[i++];
      const r = factor();
      if (r === null) return null;
      v = op === '*' ? v * r : r === 0 ? null : v / r;
    }
    return v;
  };
  const expr = (): number | null => {
    let v = term();
    while (v !== null && (peek() === '+' || peek() === '-')) {
      const op = src[i++];
      const r = term();
      if (r === null) return null;
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const out = expr();
  return out !== null && i === src.length && Number.isFinite(out) ? out : null;
}

/**
 * Texto digitado em ferramentas, em metros (SI). Tenta primeiro valor com unidade (`120cm`, `1,2m`);
 * se não for, interpreta como expressão aritmética sem sufixo (`1,2+0,3`, `(2+1)*0,5`) na unidade de
 * exibição da grandeza. Sufixo dentro de expressão (`2*60cm`) não é suportado e devolve `null`.
 */
export function parseQuantityText(text: string, u: ResolvedUnits, q: Quantity): number | null {
  const direct = parseQuantity(u, q, text);
  if (direct !== null) return direct;
  const value = parseNumber(text);
  return value === null ? null : fromDisplay(u, q, value);
}

const LENGTH_NAME_KEYS: Record<LengthUnit, DictKey> = {
  m: 'tl_unit_meters',
  cm: 'tl_unit_centimeters',
  mm: 'tl_unit_millimeters',
  ft: 'tl_unit_feet',
  in: 'tl_unit_inches',
  'ft-in': 'tl_unit_feet_inches',
};

const LENGTH_NAMES: Record<LengthUnit, string> = {
  m: 'metros',
  cm: 'centímetros',
  mm: 'milímetros',
  ft: 'pés',
  in: 'polegadas',
  'ft-in': 'pés e polegadas',
};

/** Nome por extenso da unidade de comprimento do projeto, para mensagens de erro das ferramentas. */
export function lengthUnitName(u: ResolvedUnits, lang: Lang = 'pt'): string {
  return lang === 'en' ? translate(lang, LENGTH_NAME_KEYS[u.length.unit]) : LENGTH_NAMES[u.length.unit];
}
