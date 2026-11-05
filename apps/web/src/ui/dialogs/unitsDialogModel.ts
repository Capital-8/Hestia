import {
  defaultUnits,
  formatQuantity,
  resolveUnits,
  type Quantity,
  type QuantityFormat,
  type QuantityUnit,
  type ResolvedUnits,
  type UnitsSettings,
} from '@hestia/model';
import { t as translate, type Dict, type Lang } from '../../editor/i18n.ts';

/** Linhas da tabela do diálogo, na ordem do plano. */
export const QUANTITY_KEYS = ['length', 'smallLength', 'area', 'volume', 'angle', 'slope'] as const;
export type QuantityKey = (typeof QUANTITY_KEYS)[number];

export type DraftFormat<U extends string> = Required<QuantityFormat<U>>;

export interface UnitsDraft {
  length: DraftFormat<'m' | 'cm' | 'mm' | 'ft' | 'in' | 'ft-in'>;
  smallLength: DraftFormat<'m' | 'cm' | 'mm' | 'ft' | 'in' | 'ft-in'>;
  area: DraftFormat<'m2' | 'cm2' | 'ft2'>;
  volume: DraftFormat<'m3' | 'l' | 'ft3'>;
  angle: DraftFormat<'deg' | 'rad'>;
  slope: DraftFormat<'percent' | 'deg'>;
  decimalSymbol: ',' | '.';
  currency: string;
}

const QUANTITY_LABEL_KEYS: Record<Quantity, keyof Dict> = {
  length: 'dlc_qty_length',
  smallLength: 'dlc_qty_small_length',
  area: 'dlc_qty_area',
  volume: 'dlc_qty_volume',
  angle: 'dlc_qty_angle',
  slope: 'dlc_qty_slope',
  currency: 'dlc_qty_currency',
};

/** Rótulos das grandezas no idioma pedido. */
export function quantityLabels(lang: Lang): Record<Quantity, string> {
  const out = {} as Record<Quantity, string>;
  for (const q of Object.keys(QUANTITY_LABEL_KEYS) as Quantity[]) out[q] = translate(lang, QUANTITY_LABEL_KEYS[q]);
  return out;
}

/** Rótulos em PT (compatibilidade com consumidores antigos). */
export const QUANTITY_LABELS: Record<Quantity, string> = quantityLabels('pt');

const UNIT_LABEL_KEYS: Record<QuantityUnit, keyof Dict> = {
  m: 'dlc_unit_name_m',
  cm: 'dlc_unit_name_cm',
  mm: 'dlc_unit_name_mm',
  ft: 'dlc_unit_name_ft',
  in: 'dlc_unit_name_in',
  'ft-in': 'dlc_unit_name_ft_in',
  m2: 'dlc_unit_name_m2',
  cm2: 'dlc_unit_name_cm2',
  ft2: 'dlc_unit_name_ft2',
  m3: 'dlc_unit_name_m3',
  l: 'dlc_unit_name_l',
  ft3: 'dlc_unit_name_ft3',
  deg: 'dlc_unit_name_deg',
  rad: 'dlc_unit_name_rad',
  percent: 'dlc_unit_name_percent',
};

/** Rótulos das unidades no idioma pedido. */
export function unitLabels(lang: Lang): Record<QuantityUnit, string> {
  const out = {} as Record<QuantityUnit, string>;
  for (const u of Object.keys(UNIT_LABEL_KEYS) as QuantityUnit[]) out[u] = translate(lang, UNIT_LABEL_KEYS[u]);
  return out;
}

/** Rótulos em PT (compatibilidade com consumidores antigos). */
export const UNIT_LABELS: Record<QuantityUnit, string> = unitLabels('pt');

/** Valores SI dos exemplos ao vivo (um por grandeza). */
export const EXAMPLES: Array<[Quantity, number]> = [
  ['length', 1234.5678],
  ['smallLength', 0.0123],
  ['area', 123.4567],
  ['volume', 1.23456],
  ['angle', Math.PI / 4],
  ['slope', 0.267949],
  ['currency', 1234.5678],
];

/** Rascunho editável a partir das unidades resolvidas do projeto. */
export function draftFrom(u: ResolvedUnits): UnitsDraft {
  return {
    length: { ...u.length },
    smallLength: { ...u.smallLength },
    area: { ...u.area },
    volume: { ...u.volume },
    angle: { ...u.angle },
    slope: { ...u.slope },
    decimalSymbol: u.decimalSymbol,
    currency: u.currency,
  };
}

function normalizado<U extends string>(f: DraftFormat<U>): DraftFormat<U> {
  return f.unit === 'ft-in' ? f : { ...f, denominator: 16 };
}

/** Configuração completa do rascunho (ainda com todos os campos). */
export function draftSettings(d: UnitsDraft): UnitsSettings {
  return {
    length: normalizado(d.length),
    smallLength: normalizado(d.smallLength),
    area: normalizado(d.area),
    volume: normalizado(d.volume),
    angle: normalizado(d.angle),
    slope: normalizado(d.slope),
    decimalSymbol: d.decimalSymbol,
    currency: d.currency.trim(),
  };
}

function igual<U extends string>(a: DraftFormat<U>, b: DraftFormat<U>): boolean {
  const x = normalizado(a);
  const y = normalizado(b);
  return x.unit === y.unit && x.decimals === y.decimals && x.suppressZeros === y.suppressZeros && x.denominator === y.denominator;
}

/**
 * Configuração a gravar: só as grandezas que diferem do padrão. Igual ao padrão em tudo → `undefined`
 * (o diálogo grava `units: undefined`).
 */
export function applyDraft(d: UnitsDraft): UnitsSettings | undefined {
  const padrao = draftFrom(defaultUnits());
  const completo = draftSettings(d);
  const out: UnitsSettings = {};
  if (!igual(d.length, padrao.length)) out.length = completo.length;
  if (!igual(d.smallLength, padrao.smallLength)) out.smallLength = completo.smallLength;
  if (!igual(d.area, padrao.area)) out.area = completo.area;
  if (!igual(d.volume, padrao.volume)) out.volume = completo.volume;
  if (!igual(d.angle, padrao.angle)) out.angle = completo.angle;
  if (!igual(d.slope, padrao.slope)) out.slope = completo.slope;
  if (d.decimalSymbol !== padrao.decimalSymbol) out.decimalSymbol = d.decimalSymbol;
  if (d.currency.trim() !== padrao.currency) out.currency = completo.currency;
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Erro de validação do rascunho, ou `null` se estiver tudo certo. */
export function validateDraft(d: UnitsDraft, lang: Lang = 'pt'): string | null {
  const labels = quantityLabels(lang);
  for (const key of QUANTITY_KEYS) {
    const casas = d[key].decimals;
    if (!Number.isInteger(casas) || casas < 0 || casas > 5) {
      return translate(lang, 'dlc_units_err_decimals', { label: labels[key] });
    }
    if (d[key].unit === 'ft-in' && ![2, 4, 8, 16, 32, 64].includes(d[key].denominator)) {
      return translate(lang, 'dlc_units_err_fraction', { label: labels[key] });
    }
  }
  const moeda = d.currency.trim();
  if (moeda.length < 1 || moeda.length > 4) return translate(lang, 'dlc_units_err_currency');
  return null;
}

/** Linhas do exemplo ao vivo: valor de referência (SI) → valor com as escolhas do rascunho. */
export function exampleLines(d: UnitsDraft, lang: Lang = 'pt'): Array<{ q: Quantity; label: string; text: string }> {
  const padrao = defaultUnits();
  const unidades = resolveUnits(draftSettings(d));
  const labels = quantityLabels(lang);
  return EXAMPLES.map(([q, si]) => ({
    q,
    label: labels[q],
    text: `${formatQuantity(padrao, q, si, { decimals: 4, trim: true })} → ${formatQuantity(unidades, q, si)}`,
  }));
}
