import { formatQuantity, type ResolvedUnits } from '@hestia/model';
import { csvText } from './csv.ts';
import { scheduleCsvCell, scheduleCsvHeader, scheduleCsvNumber } from './scheduleCsv.ts';
import { t, type EngineScheduleKey, type Lang } from './i18n.ts';
import type { OpeningScheduleRow } from './openingSchedule.ts';

/**
 * Colunas opcionais do quadro de portas e janelas (desligadas por padrão no diálogo): dados que hoje só existem no tipo.
 * `unitCost` é o custo do tipo; `totalCost` = custo × quantidade da linha; `solarFactor` só vale para janela.
 */
export const OPENING_EXTRA_KEYS = ['fireRating', 'acousticRw', 'uValue', 'description', 'manufacturer', 'unitCost', 'totalCost', 'solarFactor'] as const;
export type OpeningExtraKey = (typeof OPENING_EXTRA_KEYS)[number];

const HEADER_KEY: Record<OpeningExtraKey, EngineScheduleKey> = {
  fireRating: 'egs_csv_col_fogo',
  acousticRw: 'egs_csv_col_rw',
  uValue: 'egs_csv_col_u',
  description: 'egs_csv_col_descricao',
  manufacturer: 'egs_csv_col_fabricante',
  unitCost: 'egs_csv_col_custo_unitario',
  totalCost: 'egs_csv_col_custo_total',
  solarFactor: 'egs_csv_col_fator_solar',
};

/** Cabeçalho CSV de uma coluna opcional; custos levam o símbolo de moeda do projeto. */
export function openingExtraCsvHeader(k: OpeningExtraKey, u: ResolvedUnits, lang: Lang): string {
  const label = t(lang, HEADER_KEY[k]);
  return k === 'unitCost' || k === 'totalCost' ? scheduleCsvHeader(u, label, 'currency') : label;
}

/** Célula CSV de uma coluna opcional; vazia quando a linha não tem o dado (ex.: fator solar de porta). */
export function openingExtraCsvCell(r: OpeningScheduleRow, k: OpeningExtraKey, u: ResolvedUnits, lang: Lang): string {
  switch (k) {
    case 'fireRating':
    case 'description':
    case 'manufacturer':
      return csvText(r[k]);
    case 'acousticRw':
      return r.acousticRw === null ? '' : scheduleCsvNumber(u, r.acousticRw, 0, lang);
    case 'uValue':
      return r.uValue === null ? '' : scheduleCsvNumber(u, r.uValue, 2, lang);
    case 'solarFactor':
      return r.solarFactor === null ? '' : scheduleCsvNumber(u, r.solarFactor, 2, lang);
    case 'unitCost':
      return r.unitCost === null ? '' : scheduleCsvCell(u, 'currency', r.unitCost, 2, lang);
    case 'totalCost':
      return r.totalCost === null ? '' : scheduleCsvCell(u, 'currency', r.totalCost, 2, lang);
  }
}

/**
 * Desvio da linha em relação ao tipo: altura e/ou peitoril próprios das instâncias ("altura própria 1,84 m; peitoril
 * próprio 0,90 m"). Vazio quando as instâncias seguem o tipo (um override igual ao do tipo não conta).
 */
export function openingOwnMeasureText(u: ResolvedUnits, lang: Lang, own: { height: number; sill: number }, type: { height: number; sill: number }): string {
  const parts: string[] = [];
  if (own.height !== type.height) parts.push(t(lang, 'egs_opening_own_height', { value: formatQuantity(u, 'length', own.height, { decimals: 2 }) }));
  if (own.sill !== type.sill) parts.push(t(lang, 'egs_opening_own_sill', { value: formatQuantity(u, 'length', own.sill, { decimals: 2 }) }));
  return parts.join('; ');
}

/** Nome da linha no quadro: o tipo e, quando a linha agrupa instâncias com medida própria, o desvio entre parênteses. */
export const openingRowLabel = (r: Pick<OpeningScheduleRow, 'typeName' | 'variant'>): string => (r.variant ? `${r.typeName} (${r.variant})` : r.typeName);
