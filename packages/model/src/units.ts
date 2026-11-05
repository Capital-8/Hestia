/**
 * Serviço de unidades do projeto.
 *
 * O modelo guarda TODAS as medidas em metros (SI); este arquivo só converte para a unidade de exibição e de
 * volta. Grandezas: `length`, `smallLength`, `area`, `volume`, `angle`, `slope` e `currency`.
 *
 * Inclinação: o modelo grava `slopePercent` (percentual) em lajes e telhados. Aqui o valor de base é a
 * **razão** (rise/run), então quem vem de `slopePercent` divide por 100 e quem volta multiplica por 100.
 * Percentual exibido = razão × 100; graus = atan(razão) em graus.
 */
import { type Lang } from './i18n.ts';
import type { Project } from './types.ts';

export type LengthUnit = 'm' | 'cm' | 'mm' | 'ft' | 'in' | 'ft-in';
export type AreaUnit = 'm2' | 'cm2' | 'ft2';
export type VolumeUnit = 'm3' | 'l' | 'ft3';
export type AngleUnit = 'deg' | 'rad';
export type SlopeUnit = 'percent' | 'deg';
export type QuantityUnit = LengthUnit | AreaUnit | VolumeUnit | AngleUnit | SlopeUnit;

export type Quantity = 'length' | 'smallLength' | 'area' | 'volume' | 'angle' | 'slope' | 'currency';

export type Denominator = 2 | 4 | 8 | 16 | 32 | 64;

export interface QuantityFormat<U extends string> {
  unit: U;
  decimals: number;
  suppressZeros?: boolean;
  denominator?: Denominator;
}

export interface UnitsSettings {
  length?: QuantityFormat<LengthUnit>;
  smallLength?: QuantityFormat<LengthUnit>;
  area?: QuantityFormat<AreaUnit>;
  volume?: QuantityFormat<VolumeUnit>;
  angle?: QuantityFormat<AngleUnit>;
  slope?: QuantityFormat<SlopeUnit>;
  decimalSymbol?: ',' | '.';
  currency?: string;
}

export interface ResolvedUnits {
  length: Required<QuantityFormat<LengthUnit>>;
  smallLength: Required<QuantityFormat<LengthUnit>>;
  area: Required<QuantityFormat<AreaUnit>>;
  volume: Required<QuantityFormat<VolumeUnit>>;
  angle: Required<QuantityFormat<AngleUnit>>;
  slope: Required<QuantityFormat<SlopeUnit>>;
  decimalSymbol: ',' | '.';
  currency: string;
}

export const LENGTH_UNITS: readonly LengthUnit[] = ['m', 'cm', 'mm', 'ft', 'in', 'ft-in'];
export const AREA_UNITS: readonly AreaUnit[] = ['m2', 'cm2', 'ft2'];
export const VOLUME_UNITS: readonly VolumeUnit[] = ['m3', 'l', 'ft3'];
export const ANGLE_UNITS: readonly AngleUnit[] = ['deg', 'rad'];
export const SLOPE_UNITS: readonly SlopeUnit[] = ['percent', 'deg'];
export const DENOMINATORS: readonly Denominator[] = [2, 4, 8, 16, 32, 64];

const M_PER_FT = 0.3048;
const M_PER_IN = 0.0254;
const M2_PER_FT2 = 0.09290304;
const M3_PER_FT3 = 0.028316846592;
const DEG = 180 / Math.PI;

/** Unidades válidas por grandeza (currency não tem unidade própria: usa o símbolo do projeto). */
export function quantityUnits(q: Quantity): readonly QuantityUnit[] {
  switch (q) {
    case 'length':
    case 'smallLength':
      return LENGTH_UNITS;
    case 'area':
      return AREA_UNITS;
    case 'volume':
      return VOLUME_UNITS;
    case 'angle':
      return ANGLE_UNITS;
    case 'slope':
      return SLOPE_UNITS;
    case 'currency':
      return [];
  }
}

const DEFAULT_UNITS: ResolvedUnits = {
  length: { unit: 'm', decimals: 2, suppressZeros: false, denominator: 16 },
  smallLength: { unit: 'cm', decimals: 1, suppressZeros: false, denominator: 16 },
  area: { unit: 'm2', decimals: 2, suppressZeros: false, denominator: 16 },
  volume: { unit: 'm3', decimals: 3, suppressZeros: false, denominator: 16 },
  angle: { unit: 'deg', decimals: 1, suppressZeros: false, denominator: 16 },
  slope: { unit: 'percent', decimals: 1, suppressZeros: false, denominator: 16 },
  decimalSymbol: ',',
  currency: 'R$',
};

/** Padrões do programa no idioma pedido: PT devolve sempre a mesma referência. */
export function defaultUnits(lang: Lang = 'pt'): ResolvedUnits {
  return lang === 'en' ? EN_DEFAULT_UNITS : DEFAULT_UNITS;
}

/** Padrões do programa em EN (ponto decimal e dólar). */
const EN_DEFAULT_UNITS: ResolvedUnits = { ...DEFAULT_UNITS, decimalSymbol: '.', currency: '$' };

function clampDecimals(v: unknown, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(5, Math.max(0, Math.round(v)));
}

function resolveFormat<U extends string>(
  valid: readonly U[],
  base: Required<QuantityFormat<U>>,
  input: QuantityFormat<U> | undefined,
): Required<QuantityFormat<U>> {
  const unit = input && valid.includes(input.unit) ? input.unit : base.unit;
  const decimals = clampDecimals(input?.decimals, base.decimals);
  const suppressZeros = typeof input?.suppressZeros === 'boolean' ? input.suppressZeros : base.suppressZeros;
  const denominator =
    input?.denominator !== undefined && DENOMINATORS.includes(input.denominator)
      ? input.denominator
      : base.denominator;
  return { unit, decimals, suppressZeros, denominator };
}

/** Mescla campo a campo com os padrões; casas decimais fora de 0..5 são limitadas. */
export function resolveUnits(u: UnitsSettings | undefined, lang: Lang = 'pt'): ResolvedUnits {
  const fallback = defaultUnits(lang);
  if (!u) return fallback;
  const decimalSymbol = u.decimalSymbol === '.' || u.decimalSymbol === ',' ? u.decimalSymbol : fallback.decimalSymbol;
  const currency = typeof u.currency === 'string' && u.currency.trim() ? u.currency.trim() : fallback.currency;
  return {
    length: resolveFormat(LENGTH_UNITS, fallback.length, u.length),
    smallLength: resolveFormat(LENGTH_UNITS, fallback.smallLength, u.smallLength),
    area: resolveFormat(AREA_UNITS, fallback.area, u.area),
    volume: resolveFormat(VOLUME_UNITS, fallback.volume, u.volume),
    angle: resolveFormat(ANGLE_UNITS, fallback.angle, u.angle),
    slope: resolveFormat(SLOPE_UNITS, fallback.slope, u.slope),
    decimalSymbol,
    currency,
  };
}

const cache = new WeakMap<object, Partial<Record<Lang, ResolvedUnits>>>();

/**
 * Unidades de um projeto, memoizadas pela identidade de `settings.units` e pelo idioma. Sem `units` devolve a
 * referência de `defaultUnits(lang)`.
 */
export function unitsOf(p: Pick<Project, 'settings'> | undefined, lang: Lang = 'pt'): ResolvedUnits {
  const settings = p?.settings?.units;
  if (!settings) return defaultUnits(lang);
  const byLang = cache.get(settings) ?? {};
  const hit = byLang[lang];
  if (hit) return hit;
  const resolved = resolveUnits(settings, lang);
  byLang[lang] = resolved;
  cache.set(settings, byLang);
  return resolved;
}

/** Símbolo da unidade da grandeza (para rótulos de campo). */
export function unitSymbol(u: ResolvedUnits, q: Quantity): string {
  return q === 'currency' ? u.currency : unitSymbolFor(q, u[q].unit);
}

/** Símbolo de uma unidade explícita de uma grandeza (ignora a configuração do projeto). */
export function unitSymbolFor(q: Exclude<Quantity, 'currency'>, unit: QuantityUnit): string {
  switch (q) {
    case 'length':
    case 'smallLength':
      switch (unit) {
        case 'm':
          return 'm';
        case 'cm':
          return 'cm';
        case 'mm':
          return 'mm';
        case 'ft':
          return 'ft';
        case 'in':
          return 'in';
        default:
          return "'";
      }
    case 'area':
      return unit === 'm2' ? 'm²' : unit === 'cm2' ? 'cm²' : 'ft²';
    case 'volume':
      return unit === 'm3' ? 'm³' : unit === 'l' ? 'L' : 'ft³';
    case 'angle':
      return unit === 'deg' ? '°' : 'rad';
    case 'slope':
      return unit === 'percent' ? '%' : '°';
  }
}

function lengthFromSi(unit: LengthUnit, si: number): number {
  switch (unit) {
    case 'm':
      return si;
    case 'cm':
      return si * 100;
    case 'mm':
      return si * 1000;
    case 'ft':
    case 'ft-in':
      return si / M_PER_FT;
    case 'in':
      return si / M_PER_IN;
  }
}

function lengthToSi(unit: LengthUnit, display: number): number {
  switch (unit) {
    case 'm':
      return display;
    case 'cm':
      return display / 100;
    case 'mm':
      return display / 1000;
    case 'ft':
    case 'ft-in':
      return display * M_PER_FT;
    case 'in':
      return display * M_PER_IN;
  }
}

/** Converte o valor SI com uma unidade explícita (checada antes por `quantityUnits`). */
export function displayIn(q: Quantity, unit: QuantityUnit, si: number): number {
  if (q === 'currency') return si;
  if (q === 'length' || q === 'smallLength') return lengthFromSi(unit as LengthUnit, si);
  if (q === 'area') {
    if (unit === 'cm2') return si * 1e4;
    if (unit === 'ft2') return si / M2_PER_FT2;
    return si;
  }
  if (q === 'volume') {
    if (unit === 'l') return si * 1000;
    if (unit === 'ft3') return si / M3_PER_FT3;
    return si;
  }
  if (q === 'angle') return unit === 'deg' ? si * DEG : si;
  if (unit === 'percent') return si * 100;
  return Math.atan(si) * DEG;
}

/** Converte da unidade explícita para SI. */
export function siFrom(q: Quantity, unit: QuantityUnit, display: number): number {
  if (q === 'currency') return display;
  if (q === 'length' || q === 'smallLength') return lengthToSi(unit as LengthUnit, display);
  if (q === 'area') {
    if (unit === 'cm2') return display / 1e4;
    if (unit === 'ft2') return display * M2_PER_FT2;
    return display;
  }
  if (q === 'volume') {
    if (unit === 'l') return display / 1000;
    if (unit === 'ft3') return display * M3_PER_FT3;
    return display;
  }
  if (q === 'angle') return unit === 'deg' ? display / DEG : display;
  if (unit === 'percent') return display / 100;
  return Math.tan(display / DEG);
}

/** Converte metros (SI) para a unidade de exibição da grandeza. Para `ft-in`, devolve pés decimais. */
export function toDisplay(u: ResolvedUnits, q: Quantity, si: number): number {
  return q === 'currency' ? si : displayIn(q, u[q].unit, si);
}

/** Converte da unidade de exibição para metros (SI). Para `ft-in`, recebe pés decimais. */
export function fromDisplay(u: ResolvedUnits, q: Quantity, display: number): number {
  return q === 'currency' ? display : siFrom(q, u[q].unit, display);
}

/** Unidade efetiva de uma formatação: `override` só vale se pertencer à grandeza. */
export function effectiveUnit(
  u: ResolvedUnits,
  q: Exclude<Quantity, 'currency'>,
  override?: QuantityUnit,
): QuantityUnit {
  if (override && quantityUnits(q).includes(override)) return override;
  return u[q].unit;
}

/** Converte metros para pés e polegadas fracionárias já formatados (ex.: `5' 6 1/2"`). */
export function formatFeetInches(meters: number, denominator: Denominator = 16): string {
  const total = meters / M_PER_IN;
  const sign = total < 0 ? '-' : '';
  const scaled = Math.round(Math.abs(total) * denominator);
  if (scaled === 0) return `0"`;
  const feet = Math.floor(scaled / (12 * denominator));
  const rest = scaled - feet * 12 * denominator;
  const whole = Math.floor(rest / denominator);
  let num = rest - whole * denominator;
  let den = denominator;
  while (num > 0 && num % 2 === 0) {
    num /= 2;
    den /= 2;
  }
  const inch = num > 0 ? `${whole > 0 ? `${whole} ` : ''}${num}/${den}"` : `${whole}"`;
  return feet > 0 ? `${sign}${feet}' ${inch}` : `${sign}${inch}`;
}
