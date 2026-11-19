import { describe, expect, it } from 'vitest';
import type { ScheduleTable } from './pluginSchedules.ts';
import { formatScheduleValue, projectUnitSymbol, quantityOfUnit, scheduleColumnQuantities, scheduleInProjectUnits } from './pluginScheduleUnits.ts';
import { resolveUnits, type UnitsSettings } from './units.ts';

const un = (patch: UnitsSettings = {}): ReturnType<typeof resolveUnits> => resolveUnits({ decimalSymbol: '.', ...patch });

/** Tabela em unidades do modelo: comprimento (metro), área (metro quadrado), volume (metro cúbico), texto e contagem. */
const tabela = (): ScheduleTable => ({
  columns: [
    { key: 'mat', title: 'Material' },
    { key: 'c', title: 'Comprimento', unit: 'm' },
    { key: 'a', title: 'Área', unit: 'm²' },
    { key: 'v', title: 'Volume', unit: 'm³' },
    { key: 'n', title: 'Quantidade', unit: 'un' },
  ],
  rows: [{ cells: ['Reboco', 3.048, 10, 1.5, 4], count: 2, elementIds: ['a', 'b'] }],
  totals: [null, 3.048, 10, 1.5, 4],
  errors: 0,
  truncated: false,
});

describe('quantitativo nas unidades do projeto', () => {
  it('a unidade declarada escolhe a grandeza; texto livre não converte', () => {
    expect(quantityOfUnit('m')).toBe('length');
    expect(quantityOfUnit('M²')).toBe('area');
    expect(quantityOfUnit('m2')).toBe('area');
    expect(quantityOfUnit(' m³ ')).toBe('volume');
    expect(quantityOfUnit('un')).toBeUndefined();
    expect(quantityOfUnit('kg')).toBeUndefined();
    expect(quantityOfUnit(undefined)).toBeUndefined();
    expect(scheduleColumnQuantities(tabela())).toEqual([undefined, 'length', 'area', 'volume', undefined]);
  });

  it('projeto em metro: valor com as casas do projeto e símbolo no cabeçalho', () => {
    const u = un({ length: { unit: 'm', decimals: 2 } });
    expect(formatScheduleValue(u, 'length', 3.048, 'en')).toBe('3.05');
    expect(projectUnitSymbol(u, 'length')).toBe('m');
    expect(projectUnitSymbol(u, 'area')).toBe('m²');
  });

  it('projeto em centímetro: 3,048 m vira 304,8 cm e o cabeçalho troca de símbolo', () => {
    const u = un({ length: { unit: 'cm', decimals: 1 } });
    const t = scheduleInProjectUnits(tabela(), u);
    expect(t.rows[0]!.cells[1]).toBe(304.8);
    expect(t.totals![1]).toBe(304.8);
    expect(t.columns[1]!.unit).toBe('cm');
  });

  it('projeto imperial: comprimento em pé, área em pé quadrado, volume convertido', () => {
    const u = un({ length: { unit: 'ft', decimals: 2 }, area: { unit: 'ft2', decimals: 2 } });
    const t = scheduleInProjectUnits(tabela(), u);
    expect(t.rows[0]!.cells[1]).toBeCloseTo(10, 2); // 3,048 m = 10,00 ft
    expect(t.rows[0]!.cells[2]).toBeCloseTo(107.64, 2); // 10 m² = 107,64 ft²
    expect(t.columns[1]!.unit).toBe('ft');
    expect(t.columns[2]!.unit).toBe('ft²');
  });

  it('pé e polegada sai como texto e sem unidade duplicada no cabeçalho', () => {
    const u = un({ length: { unit: 'ft-in', decimals: 0 } });
    const t = scheduleInProjectUnits(tabela(), u);
    expect(typeof t.rows[0]!.cells[1]).toBe('string');
    expect(t.columns[1]!.unit).toBeUndefined();
    expect(projectUnitSymbol(u, 'length')).toBeUndefined();
  });

  it('texto, contagem e coluna sem grandeza ficam como estão', () => {
    const t = scheduleInProjectUnits(tabela(), un({ length: { unit: 'cm', decimals: 1 } }));
    expect(t.rows[0]!.cells[0]).toBe('Reboco');
    expect(t.rows[0]!.cells[4]).toBe(4);
    expect(t.columns[4]!.unit).toBe('un');
    expect(t.totals![0]).toBeNull();
    expect(t.totals![4]).toBe(4);
  });

  it('não altera a tabela original e preserva contagem e ids das linhas', () => {
    const orig = tabela();
    const copia = JSON.stringify(orig);
    const t = scheduleInProjectUnits(orig, un({ length: { unit: 'cm', decimals: 1 } }));
    expect(JSON.stringify(orig)).toBe(copia);
    expect(t.rows[0]!.count).toBe(2);
    expect(t.rows[0]!.elementIds).toEqual(['a', 'b']);
  });

  it('na tela o separador decimal segue o idioma (como as demais telas); no CSV o número fica numérico', () => {
    const u = un({ length: { unit: 'm', decimals: 2 } });
    expect(formatScheduleValue(u, 'length', 3.048, 'pt')).toBe('3,05');
    expect(formatScheduleValue(u, 'length', 3.048, 'en')).toBe('3.05');
    expect(scheduleInProjectUnits(tabela(), u).rows[0]!.cells[1]).toBe(3.05);
  });

  it('sem total nem linhas: devolve a estrutura vazia', () => {
    const vazia: ScheduleTable = { columns: [{ key: 'c', title: 'C', unit: 'm' }], rows: [], totals: null, errors: 0, truncated: false };
    const t = scheduleInProjectUnits(vazia, un());
    expect(t.rows).toEqual([]);
    expect(t.totals).toBeNull();
  });
});
