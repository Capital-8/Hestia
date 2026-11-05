/**
 * Formatação de grandezas para texto de interface. Recebe sempre o valor em metros (SI) e as unidades
 * resolvidas do projeto; não guarda estado.
 */
import { decimalSymbolFor, type Lang } from './i18n.ts';
import {
  displayIn,
  effectiveUnit,
  formatFeetInches,
  unitSymbolFor,
  type Quantity,
  type QuantityUnit,
  type ResolvedUnits,
} from './units.ts';

export interface FormatOptions {
  /** Acrescenta o símbolo da unidade (padrão true). */
  withUnit?: boolean;
  /** Substitui as casas decimais da configuração. */
  decimals?: number;
  /** Remove zeros à direita (e o separador decimal sobrando). */
  trim?: boolean;
  /** Substitui a unidade da configuração; ignorada se não pertencer à grandeza. */
  unit?: QuantityUnit;
  /** Símbolo decimal explícito (vence o das unidades do projeto). */
  decimalSymbol?: ',' | '.';
  /** Idioma ativo: usa o símbolo decimal dele quando o projeto não sobrescreveu. */
  lang?: Lang;
}

function clampDecimals(v: number, fallback: number): number {
  if (!Number.isFinite(v)) return fallback;
  return Math.min(5, Math.max(0, Math.round(v)));
}

/** Arredonda para `decimals` casas com meio para cima (inclusive negativos) e evita o -0. */
function roundTo(v: number, decimals: number): number {
  const sign = v < 0 ? -1 : 1;
  const factor = 10 ** decimals;
  const scaled = Math.abs(v) * factor;
  const rounded = Math.round(scaled + Number.EPSILON * scaled);
  return (sign * rounded) / factor;
}

function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

function numberText(v: number, decimals: number, decimalSymbol: ',' | '.', trim: boolean): string {
  const rounded = roundTo(v, decimals);
  let text = (Object.is(rounded, -0) ? 0 : rounded).toFixed(decimals);
  if (trim) text = trimZeros(text);
  return decimalSymbol === ',' ? text.replace('.', ',') : text;
}

/**
 * Texto de uma grandeza. Arredonda depois de converter; `-0` vira `0`; sem separador de milhar. Espaço entre
 * número e unidade, exceto `°` e `%` (colados). `ft-in` já sai completo (`5' 6 1/2"`) e ignora `withUnit`.
 */
export function formatQuantity(u: ResolvedUnits, q: Quantity, si: number, o: FormatOptions = {}): string {
  const withUnit = o.withUnit !== false;
  const decimalSymbol = o.decimalSymbol ?? (o.lang ? decimalSymbolFor(o.lang) : u.decimalSymbol);
  if (q === 'currency') {
    const decimals = clampDecimals(o.decimals ?? 2, 2);
    const text = numberText(si, decimals, decimalSymbol, o.trim ?? false);
    return withUnit ? `${u.currency} ${text}` : text;
  }
  const fmt = u[q];
  const unit = effectiveUnit(u, q, o.unit);
  const decimals = clampDecimals(o.decimals ?? fmt.decimals, fmt.decimals);
  if (unit === 'ft-in') return formatFeetInches(si, fmt.denominator);
  const trim = o.trim ?? false;
  const text = numberText(displayIn(q, unit, si), decimals, decimalSymbol, trim || fmt.suppressZeros);
  if (!withUnit) return text;
  const symbol = unitSymbolFor(q, unit);
  return symbol === '°' || symbol === '%' ? `${text}${symbol}` : `${text} ${symbol}`;
}
