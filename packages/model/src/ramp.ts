import type { Id } from './types.ts';
import { decimalSymbolFor, t, type Lang } from './i18n.ts';
import { DEFAULT_STAIR_OPENING_MARGIN } from './stair.ts';
import type { Ramp, RampNormRow, RampType } from './rampTypes.ts';

/** Tipo de rampa usado por padrão quando o projeto não escolhe outro. */
export const defaultRampTypeId: Id = 'rmt_nbr9050';

/** Inclinação padrão (fração): 1:12 = 8,33 %. */
export const DEFAULT_RAMP_SLOPE = 1 / 12;

/** Tolerância ao comparar inclinações (fração). */
export const RAMP_SLOPE_EPS = 1e-6;

/** Tabela da NBR 9050 (fonte secundária; conferir a norma vigente). Em ordem crescente de `maxSlope`. */
export const DEFAULT_RAMP_NORM_NBR9050: RampNormRow[] = [
  { maxSlope: 0.05, maxRise: 1.5, maxFlights: null },
  { maxSlope: 0.0625, maxRise: 1.0, maxFlights: null },
  { maxSlope: 1 / 12, maxRise: 0.8, maxFlights: 15 },
];

/** Tabela do ADA 2010 (§405, fonte primária). */
export const DEFAULT_RAMP_NORM_ADA: RampNormRow[] = [
  { maxSlope: 1 / 12, maxRise: 0.762, maxFlights: null },
];

type RampInput = { id: Id; typeId: Id; levelId: Id } & Partial<Omit<Ramp, 'order' | 'kind'>>;

/** Constrói uma rampa com os campos padrão; `order` é atribuído pelo comando addRamp. */
export function makeRamp(r: RampInput): Omit<Ramp, 'order'> {
  return {
    kind: 'ramp',
    topLevelId: null,
    baseOffset: 0,
    topOffset: 0,
    height: 0.8,
    components: [],
    shape: 'straight',
    turn: 'left',
    landingDepth: 1.2,
    inputMode: 'length',
    slopeTarget: null,
    openingMode: 'headroom',
    openingHeadroom: null,
    openingMargin: DEFAULT_STAIR_OPENING_MARGIN,
    openingRect: false,
    mark: '',
    comments: '',
    ...r,
  };
}

/** Tipos de rampa iniciais no idioma pedido. */
export function rampTypes(lang: Lang = 'pt'): RampType[] {
  return [
    {
      id: 'rmt_nbr9050',
      name: t(lang, 'md_ramp_nbr9050'),
      code: 'RP-01',
      description: t(lang, 'md_ramp_nbr9050_desc'),
      materialId: 'mat_concreto',
      structuralDepth: 0.15,
      landingThickness: 0.15,
      defaultWidth: 1.5,
      minWidth: 1.2,
      defaultSlope: 1 / 12,
      landingMinLength: 1.2,
      minHeadroom: 2.1,
      normProfile: 'nbr9050',
      normChecked: false,
      normTable: DEFAULT_RAMP_NORM_NBR9050.map((row) => ({ ...row })),
      cost: 0,
    },
    {
      id: 'rmt_ada',
      name: t(lang, 'md_ramp_ada'),
      code: 'RP-02',
      description: t(lang, 'md_ramp_ada_desc'),
      materialId: 'mat_concreto',
      structuralDepth: 0.15,
      landingThickness: 0.15,
      defaultWidth: 1.2,
      minWidth: 0.915,
      defaultSlope: 1 / 12,
      landingMinLength: 1.525,
      minHeadroom: 2.1,
      normProfile: 'ada',
      normChecked: true,
      normTable: DEFAULT_RAMP_NORM_ADA.map((row) => ({ ...row })),
      cost: 0,
    },
  ];
}

/** Tipos de rampa em PT (compatibilidade); use `rampTypes(lang)` para o idioma ativo. */
export const DEFAULT_RAMP_TYPES: RampType[] = rampTypes('pt');

/** 1ª mensagem de erro do tipo de rampa, ou null. */
export function rampTypeIssue(tipo: RampType, lang: Lang = 'pt'): string | null {
  if (!(tipo.defaultSlope > 0)) return t(lang, 'md_ramp_slope_positive');
  if (!(tipo.structuralDepth > 0)) return t(lang, 'md_ramp_structural_positive');
  if (!(tipo.landingThickness > 0)) return t(lang, 'md_ramp_landing_positive');
  if (!(tipo.defaultWidth > 0)) return t(lang, 'md_ramp_width_positive');
  if (!(tipo.minWidth > 0)) return t(lang, 'md_ramp_min_width_positive');
  if (!(tipo.landingMinLength > 0)) return t(lang, 'md_ramp_landing_min_positive');
  if (!(tipo.minHeadroom > 0)) return t(lang, 'md_ramp_headroom_positive');
  let prev = -Infinity;
  for (const row of tipo.normTable) {
    if (!(row.maxSlope > 0) || !(row.maxRise > 0) || row.maxSlope < prev) {
      return t(lang, 'md_ramp_norm_order');
    }
    prev = row.maxSlope;
    if (row.maxFlights !== null && (!Number.isInteger(row.maxFlights) || row.maxFlights < 1)) {
      return t(lang, 'md_ramp_max_flights');
    }
  }
  return null;
}

/** Maior `maxSlope` da tabela; null se vazia. */
export function rampMaxSlope(t: Pick<RampType, 'normTable'>): number | null {
  const last = t.normTable[t.normTable.length - 1];
  return last ? last.maxSlope : null;
}

/** 1ª linha (crescente) com `slope <= maxSlope + RAMP_SLOPE_EPS`; null se passa de todas. */
export function rampNormRowFor(t: Pick<RampType, 'normTable'>, slope: number): RampNormRow | null {
  for (const row of t.normTable) if (slope <= row.maxSlope + RAMP_SLOPE_EPS) return row;
  return null;
}

/** Percentual com 2 casas e o símbolo decimal do idioma: `formatRampPercent(1/12)` = `8,33 %`. */
export function formatRampPercent(slope: number, langOrSymbol: Lang | ',' | '.' = 'pt'): string {
  const symbol = langOrSymbol === ',' || langOrSymbol === '.' ? langOrSymbol : decimalSymbolFor(langOrSymbol);
  return `${(slope * 100).toFixed(2).replace('.', symbol)} %`;
}

/**
 * Razão `1:X` com 1 casa, sem `,0` no fim: `formatRampRatio(1/12)` = `1:12`; `formatRampRatio(0.075)` = `1:13,3`.
 * Inclinação <= 0 → `—`.
 */
export function formatRampRatio(slope: number, langOrSymbol: Lang | ',' | '.' = 'pt'): string {
  if (!(slope > 0)) return '—';
  const symbol = langOrSymbol === ',' || langOrSymbol === '.' ? langOrSymbol : decimalSymbolFor(langOrSymbol);
  const r = (1 / slope).toFixed(1).replace('.', symbol);
  return `1:${r.replace(new RegExp(`\\${symbol}0$`), '')}`;
}

/** Texto da inclinação em % e em `1:X`: `formatRampSlope(1/12)` = `8,33 % (1:12)`. */
export function formatRampSlope(slope: number): string {
  return `${formatRampPercent(slope)} (${formatRampRatio(slope)})`;
}
