/**
 * Conversão de campos de suplemento entre a API (metro e radiano) e as unidades do projeto (spec 08 §4, fase H).
 * `length` e `angle` são exibidos e digitados nas unidades configuradas no projeto, com o separador decimal dele;
 * o handler recebe sempre metro e radiano. `number` (sem unidade) usa só o separador decimal do projeto.
 */
import { formatQuantity, parseQuantity, unitSymbol, type ResolvedUnits } from '@hestia/model';
import type { DialogField } from '@hestia/plugin-api';

const QUANTITY = { length: 'length', angle: 'angle' } as const;

/** O campo é uma grandeza com unidade (comprimento ou ângulo)? */
export const isQuantityField = (f: Pick<DialogField, 'type'>): boolean => f.type === 'length' || f.type === 'angle';

/** Texto de um número sem unidade: até 6 casas, sem zeros à direita, com o separador decimal do projeto. */
export function plainNumberText(v: number, u: ResolvedUnits): string {
  const t = String(Math.round(v * 1e6) / 1e6);
  return u.decimalSymbol === ',' ? t.replace('.', ',') : t;
}

/** Lê um número sem unidade digitado (aceita vírgula ou ponto). `null` se não for número finito. */
export function parsePlainNumber(text: string): number | null {
  const s = text.trim().replace(',', '.');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Valor da API (metro/radiano) como texto nas unidades do projeto (sem o símbolo; ele vai ao lado do campo). */
export function fieldToText(f: Pick<DialogField, 'type'>, api: number, u: ResolvedUnits): string {
  if (f.type === 'length' || f.type === 'angle') return formatQuantity(u, QUANTITY[f.type], api, { withUnit: false });
  return plainNumberText(api, u);
}

/** Texto digitado nas unidades do projeto como valor da API (metro/radiano). `null` se inválido. */
export function textToField(f: Pick<DialogField, 'type'>, text: string, u: ResolvedUnits): number | null {
  if (f.type === 'length' || f.type === 'angle') return parseQuantity(u, QUANTITY[f.type], text);
  return parsePlainNumber(text);
}

/** Símbolo da unidade do projeto para o campo (`m`, `cm`, `°`...); vazio para `number` e para pés-polegadas (o texto já traz). */
export function fieldUnitSymbol(f: Pick<DialogField, 'type'>, u: ResolvedUnits): string {
  if (f.type !== 'length' && f.type !== 'angle') return '';
  if (f.type === 'length' && u.length.unit === 'ft-in') return '';
  return unitSymbol(u, QUANTITY[f.type]);
}

/** Valor de uma célula/valor de painel: grandeza formatada com unidade do projeto; texto e booleano como são. */
export function displayValue(v: string | number | boolean | undefined, unit: 'length' | 'angle' | undefined, u: ResolvedUnits): string {
  if (v === undefined) return '';
  if (typeof v === 'number') return unit ? formatQuantity(u, QUANTITY[unit], v) : plainNumberText(v, u);
  return String(v);
}
