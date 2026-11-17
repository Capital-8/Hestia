import { formatQuantity, unitSymbol, type Quantity, type ResolvedUnits } from '@hestia/model';

/** Valor de uma célula de quadro na unidade do projeto, sem o símbolo (ele fica no cabeçalho). */
export function scheduleCell(units: ResolvedUnits, q: Quantity, si: number, decimals?: number): string {
  return formatQuantity(units, q, si, { withUnit: false, decimals });
}

/** Número sem grandeza (Rw, U, fator solar) com o separador decimal do projeto. */
export function scheduleNumber(units: ResolvedUnits, v: number, decimals: number): string {
  // units-ok: número de coluna do quadro (custo em moeda e contagens), não é grandeza com unidade do projeto
  return v.toFixed(decimals).replace('.', units.decimalSymbol);
}

/** Rótulo da coluna com o símbolo da unidade do projeto entre parênteses. */
export function scheduleHeader(units: ResolvedUnits, label: string, q: Quantity): string {
  const symbol = unitSymbol(units, q);
  // O rótulo pode já trazer o símbolo (chaves antigas com "(m)"): não duplica.
  return label.includes(`(${symbol})`) ? label : `${label} (${symbol})`;
}
