import { defaultUnits, formatQuantity, unitSymbol, type Quantity, type ResolvedUnits } from '@hestia/model';
import { decimalSymbolFor, type Lang } from './i18n.ts';

/**
 * Separador decimal da célula exportada: se as unidades ainda são o padrão do programa (o projeto não sobrescreveu),
 * segue o idioma ativo; se o projeto configurou um separador, respeita o do projeto.
 */
function csvDecimalSymbol(units: ResolvedUnits, lang: Lang): ',' | '.' {
  return units === defaultUnits('pt') || units === defaultUnits('en') ? decimalSymbolFor(lang) : units.decimalSymbol;
}

/** Célula numérica de um quadro exportado: valor SI na unidade do projeto, sem o símbolo (fica no cabeçalho). */
export function scheduleCsvCell(units: ResolvedUnits, q: Quantity, si: number, decimals: number, lang: Lang = 'pt'): string {
  return formatQuantity(units, q, si, { decimals, withUnit: false, decimalSymbol: csvDecimalSymbol(units, lang) });
}

/** Número sem grandeza (Rw, U, fator solar) de um quadro exportado, com o separador decimal do CSV. */
export function scheduleCsvNumber(units: ResolvedUnits, v: number, decimals: number, lang: Lang = 'pt'): string {
  // units-ok: número de coluna do quadro (custo em moeda e contagens), não é grandeza com unidade do projeto
  return v.toFixed(decimals).replace('.', csvDecimalSymbol(units, lang));
}

/** Rótulo de coluna de um quadro exportado, com o símbolo da unidade do projeto. */
export function scheduleCsvHeader(units: ResolvedUnits, label: string, q: Quantity): string {
  return `${label} (${unitSymbol(units, q)})`;
}
