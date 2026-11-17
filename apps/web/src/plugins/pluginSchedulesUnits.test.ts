import { describe, expect, it } from 'vitest';
import type { RegisteredSchedule } from '@hestia/plugin-api';
import { resolveUnits, type ScheduleTable } from '@hestia/model';
import { scheduleCsvFile } from './pluginSchedules.ts';

const reg = { pluginId: 'com.exemplo.q', id: 'q' } as unknown as RegisteredSchedule;

const tabela = (): ScheduleTable => ({
  columns: [{ key: 'mat', title: 'Material' }, { key: 'c', title: 'Comprimento', unit: 'm' }, { key: 'a', title: 'Área', unit: 'm²' }],
  rows: [{ cells: ['Reboco', 3.048, 10], count: 1, elementIds: ['a'] }],
  totals: [null, 3.048, 10],
  errors: 0,
  truncated: false,
});

const BOM = String.fromCharCode(0xfeff);
const linhas = (csv: string): string[] => csv.split(BOM).join('').trim().split(/\r?\n/);

describe('CSV do quantitativo nas unidades do projeto', () => {
  it('sem unidades informadas mantém os valores do modelo (metro e metro quadrado)', () => {
    const { conteudo } = scheduleCsvFile(reg, tabela(), 'en', 'Total');
    expect(linhas(conteudo)[1]).toBe('Reboco,3.048,10');
  });

  it('projeto em centímetro: valor convertido e símbolo da unidade no cabeçalho', () => {
    const u = resolveUnits({ length: { unit: 'cm', decimals: 1 } });
    const l = linhas(scheduleCsvFile(reg, tabela(), 'en', 'Total', u).conteudo);
    expect(l[0]).toContain('Comprimento (cm)');
    expect(l[1]).toBe('Reboco,304.8,10');
    expect(l[2]).toBe('Total,304.8,10');
  });

  it('idioma com vírgula decimal: ponto e vírgula como separador e vírgula decimal', () => {
    const u = resolveUnits({ length: { unit: 'cm', decimals: 1 } });
    const l = linhas(scheduleCsvFile(reg, tabela(), 'pt', 'Total', u).conteudo);
    expect(l[1]).toBe('Reboco;304,8;10');
  });
});
