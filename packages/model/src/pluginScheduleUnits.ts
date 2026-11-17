/**
 * Quantitativos de suplementos nas unidades do projeto (ADR 0057, fase E). O avaliador trabalha sempre em unidades do
 * modelo (metro, metro quadrado, metro cúbico); aqui o valor é convertido só para exibir e exportar, com as casas decimais
 * e a unidade que o usuário configurou. A unidade declarada na coluna do manifesto (`unit`) escolhe a grandeza; texto
 * livre (por exemplo `un` ou `kg`) não é convertido. Puro: não escreve no projeto.
 */
import type { Lang } from './i18n.ts';
import type { ScheduleCell, ScheduleTable } from './pluginSchedules.ts';
import { effectiveUnit, unitSymbolFor, type ResolvedUnits } from './units.ts';
import { formatQuantity } from './unitsFormat.ts';

/** Grandezas que um quantitativo converte: comprimento, área e volume. */
export type ScheduleQuantity = 'length' | 'area' | 'volume';

/** Unidade declarada no manifesto -> grandeza do app (só metro, metro quadrado e metro cúbico convertem). */
const QUANTITY_OF_UNIT: Readonly<Record<string, ScheduleQuantity>> = {
  m: 'length',
  'm²': 'area', m2: 'area', // units-ok: texto da unidade declarada no manifesto, não formata medida
  'm³': 'volume', m3: 'volume', // units-ok: idem
};

/** Grandeza da coluna pela unidade declarada; `undefined` quando a unidade não é convertível. */
export function quantityOfUnit(unit: string | undefined): ScheduleQuantity | undefined {
  return unit === undefined ? undefined : QUANTITY_OF_UNIT[unit.trim().toLowerCase()];
}

/** Grandeza de cada coluna da tabela (índice igual ao das colunas). */
export const scheduleColumnQuantities = (t: ScheduleTable): Array<ScheduleQuantity | undefined> => t.columns.map((c) => quantityOfUnit(c.unit));

/** Símbolo da unidade do projeto para o cabeçalho; `undefined` em pé e polegada, que já sai completo no valor. */
export function projectUnitSymbol(u: ResolvedUnits, q: ScheduleQuantity): string | undefined {
  const unit = effectiveUnit(u, q);
  return unit === 'ft-in' ? undefined : unitSymbolFor(q, unit);
}

/** Texto de uma célula numérica de coluna convertível, nas unidades e casas decimais do projeto (sem a unidade). */
export const formatScheduleValue = (u: ResolvedUnits, q: ScheduleQuantity, si: number, lang: Lang): string => formatQuantity(u, q, si, { withUnit: false, lang });

/**
 * Cópia da tabela com os números das colunas convertíveis nas unidades do projeto e arredondados às casas dele, e o
 * símbolo da unidade do projeto no cabeçalho. Serve à exportação CSV (a célula continua número; o separador decimal
 * do arquivo é decidido na hora de gravar). Colunas sem grandeza e o texto ficam como estão.
 */
export function scheduleInProjectUnits(table: ScheduleTable, u: ResolvedUnits): ScheduleTable {
  const quantities = scheduleColumnQuantities(table);
  const convert = (c: ScheduleCell, q: ScheduleQuantity | undefined): ScheduleCell => {
    if (q === undefined || typeof c !== 'number') return c;
    const text = formatQuantity(u, q, c, { withUnit: false, decimalSymbol: '.' });
    const n = Number(text);
    return Number.isFinite(n) && text.trim() !== '' ? n : text; // pé e polegada não é número: sai como texto
  };
  return {
    ...table,
    columns: table.columns.map((c, i) => {
      const q = quantities[i];
      if (q === undefined) return c;
      const symbol = projectUnitSymbol(u, q);
      const { unit: _old, ...rest } = c;
      return symbol ? { ...rest, unit: symbol } : rest;
    }),
    rows: table.rows.map((r) => ({ ...r, cells: r.cells.map((c, i) => convert(c, quantities[i])) })),
    totals: table.totals ? table.totals.map((c, i) => convert(c, quantities[i])) : null,
  };
}
