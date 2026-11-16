import { describe, expect, it } from 'vitest';
import { createEmptyProject, defaultUnits, makeWall, ProjectStore, type Opening } from '@hestia/model';
import { buildOpeningSchedule, OPENING_EXTRA_KEYS, openingScheduleToCsv, sumOpeningRows, type OpeningScheduleRow } from './index.ts';

const opening = (o: Partial<Opening> & Pick<Opening, 'id' | 'kind' | 'typeId' | 'hostId'>): Opening => ({
  offset: 1.5,
  flipHand: false,
  flipFacing: false,
  sillOverride: null,
  mark: '',
  ...o,
});

const linhasCsv = (rows: OpeningScheduleRow[], extra: Parameters<typeof openingScheduleToCsv>[4] = []): string[] => {
  const totals = sumOpeningRows(rows);
  return openingScheduleToCsv(rows, totals, defaultUnits(), 'pt', extra).replace(/^﻿/, '').split('\r\n').filter((l) => l.length > 0);
};

/*
 * Altura própria da instância (heightOverride): antes o quadro usava a altura do TIPO e ignorava o override (porta 0,80 x
 * 2,10 com altura própria 1,84 saía com 1,68 m²). Agora cada medida efetiva vira uma linha do quadro.
 */
describe('altura própria no quadro de portas e janelas', () => {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 8, y: 0 } }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 3 }, b: { x: 8, y: 3 } }) });
  // P-02 (80 x 210, folha 0,72 x 2,05): uma instância segue o tipo; outra tem altura própria 1,84; a terceira repete o tipo.
  s.exec({ type: 'addOpening', opening: opening({ id: 'd1', kind: 'door', typeId: 'ot_p80', hostId: 'w1', offset: 1 }) });
  s.exec({ type: 'addOpening', opening: opening({ id: 'd2', kind: 'door', typeId: 'ot_p80', hostId: 'w1', offset: 3, heightOverride: 1.84 }) });
  s.exec({ type: 'addOpening', opening: opening({ id: 'd3', kind: 'door', typeId: 'ot_p80', hostId: 'w1', offset: 5, heightOverride: 2.1 }) });
  // J-06 (janela de correr 240 x 120, peitoril 1,10): uma com peitoril próprio 0,90, outra com o peitoril do tipo.
  s.exec({ type: 'addOpening', opening: opening({ id: 'j1', kind: 'window', typeId: 'ot_j240', hostId: 'w2', offset: 2, sillOverride: 0.9 }) });
  s.exec({ type: 'addOpening', opening: opening({ id: 'j2', kind: 'window', typeId: 'ot_j240', hostId: 'w2', offset: 6 }) });
  const tab = buildOpeningSchedule(s.project);
  const portas = tab.rows.filter((r) => r.typeId === 'ot_p80');
  const janelas = tab.rows.filter((r) => r.typeId === 'ot_j240');

  it('instância com altura própria vira linha à parte, com a área da altura efetiva (0,80 x 1,84 = 1,472 m²)', () => {
    expect(portas).toHaveLength(2);
    const propria = portas[0]!;
    expect(propria).toMatchObject({ code: 'P-02', count: 1, variant: 'altura própria 1,84 m' });
    expect(propria.height).toBeCloseTo(1.84, 9);
    expect(propria.unitArea).toBeCloseTo(1.472, 9);
    expect(propria.totalArea).toBeCloseTo(1.472, 9);
    expect(propria.roughHeight).toBeCloseTo(1.84, 9); // o vão bruto segue a altura efetiva
    expect(propria.leafHeight).toBeCloseTo(1.79, 9); // a folha desloca pela mesma diferença (2,05 − 0,26)
    expect(propria.leafWidth).toBeCloseTo(0.72, 9);
  });

  it('as instâncias que seguem o tipo (inclusive a que repete a altura do tipo) formam a linha do tipo, com 1,68 m² cada', () => {
    const tipo = portas[1]!;
    expect(tipo).toMatchObject({ code: 'P-02', count: 2, variant: '' });
    expect(tipo.height).toBeCloseTo(2.1, 9);
    expect(tipo.unitArea).toBeCloseTo(1.68, 9);
    expect(tipo.totalArea).toBeCloseTo(3.36, 9);
  });

  it('peitoril próprio também vira linha: "peitoril próprio 0,90 m", com a área do peitoril do tipo na outra', () => {
    expect(janelas).toHaveLength(2);
    expect(janelas[0]).toMatchObject({ count: 1, sill: 0.9, variant: 'peitoril próprio 0,90 m' });
    expect(janelas[1]).toMatchObject({ count: 1, variant: '' });
    expect(janelas[1]!.sill).toBeCloseTo(1.1, 9);
    expect(janelas[0]!.unitArea).toBeCloseTo(2.88, 9); // 2,40 x 1,20: a área segue a altura, não o peitoril
  });

  it('totais: a soma das linhas bate com as instâncias e as áreas efetivas (4 portas, 2 janelas, 10,592 m²)', () => {
    expect(tab.totals.count).toBe(5);
    expect(tab.totals.doorCount).toBe(3);
    expect(tab.totals.windowCount).toBe(2);
    expect(tab.totals.totalArea).toBeCloseTo(3.36 + 1.472 + 2.88 + 2.88, 9);
    expect(sumOpeningRows(portas).totalArea).toBeCloseTo(4.832, 9);
  });

  it('a linha com altura própria aparece no CSV com o desvio no campo Tipo', () => {
    const lines = linhasCsv(tab.rows);
    expect(lines.some((l) => l.startsWith('P-02;Porta 80 x 210 (altura própria 1,84 m);Porta de giro;Porta;0,80;1,84;'))).toBe(true);
  });
});

/*
 * Colunas opcionais (desligadas por padrão): só entram no CSV quando pedidas, com o valor do tipo e a unidade do projeto.
 */
describe('colunas opcionais do quadro', () => {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 8, y: 0 } }) });
  const base = createEmptyProject().openingTypes.ot_j120!;
  s.exec({
    type: 'upsertOpeningType',
    openingType: { ...base, id: 'ot_full', fireRating: 'EI 30', acousticRw: 32, uValue: 1.4, description: 'Janela de teste', manufacturer: 'Acme', cost: 850.5, solarFactor: 0.35 },
  });
  s.exec({ type: 'upsertOpeningType', openingType: { ...createEmptyProject().openingTypes.ot_p80!, id: 'ot_p80s', solarFactor: 0.5 } });
  s.exec({ type: 'addOpening', opening: opening({ id: 'j1', kind: 'window', typeId: 'ot_full', hostId: 'w', offset: 2 }) });
  s.exec({ type: 'addOpening', opening: opening({ id: 'j2', kind: 'window', typeId: 'ot_full', hostId: 'w', offset: 6 }) });
  s.exec({ type: 'addOpening', opening: opening({ id: 'd1', kind: 'door', typeId: 'ot_p80s', hostId: 'w', offset: 4 }) });
  const tab = buildOpeningSchedule(s.project);
  const janela = tab.rows.find((r) => r.typeId === 'ot_full')!;
  const porta = tab.rows.find((r) => r.typeId === 'ot_p80s')!;

  it('sem colunas pedidas, o CSV é o de sempre: 21 colunas e nenhum dado opcional', () => {
    const lines = linhasCsv(tab.rows);
    expect(lines[0]!.split(';')).toHaveLength(21);
    expect(lines[0]!.endsWith(';Ferragens')).toBe(true);
    expect(lines.at(-1)!.split(';')).toHaveLength(21);
  });

  it('com as colunas pedidas, saem no fim do cabeçalho na ordem dada, com unidade e formato do projeto', () => {
    const lines = linhasCsv(tab.rows, OPENING_EXTRA_KEYS);
    expect(lines[0]!.split(';').slice(21)).toEqual([
      'Resistência ao fogo',
      'Rw (dB)',
      'U (W/m²K)',
      'Descrição',
      'Fabricante',
      'Custo unitário (R$)',
      'Custo total (R$)',
      'Fator solar',
    ]);
    expect(lines[0]!.split(';')).toHaveLength(29);
  });

  it('valores da janela: fogo, Rw, U (decimal com vírgula), custo unitário 850,50, custo total 1701,00 e fator solar 0,35', () => {
    const lines = linhasCsv(tab.rows, ['fireRating', 'acousticRw', 'uValue', 'description', 'manufacturer', 'unitCost', 'totalCost', 'solarFactor']);
    const linhaJanela = lines.find((l) => l.includes('Janela de teste'))!;
    expect(linhaJanela.split(';').slice(-8)).toEqual(['EI 30', '32', '1,40', 'Janela de teste', 'Acme', '850,50', '1701,00', '0,35']);
  });

  it('custo total = custo unitário × quantidade (2 janelas), e o total do CSV soma só o custo total', () => {
    expect(janela).toMatchObject({ count: 2, unitCost: 850.5, totalCost: 1701 });
    expect(sumOpeningRows(tab.rows).totalCost).toBeCloseTo(1701, 9);
    const lines = linhasCsv(tab.rows, ['unitCost', 'totalCost']);
    expect(lines.at(-1)!.split(';').slice(-2)).toEqual(['', '1701,00']);
  });

  it('fator solar só vale para janela: a porta fica vazia mesmo com o valor no tipo', () => {
    expect(porta.solarFactor).toBeNull();
    expect(janela.solarFactor).toBeCloseTo(0.35, 9);
  });

  it('tipo sem custo deixa custo unitário e total vazios e não entra na soma', () => {
    expect(porta).toMatchObject({ unitCost: null, totalCost: null });
    const lines = linhasCsv(tab.rows, ['unitCost', 'totalCost']);
    expect(lines.find((l) => l.includes('Porta 80 x 210'))!.split(';').slice(-2)).toEqual(['', '']);
  });
});

/*
 * Sem override e sem colunas opcionais, a linha é a mesma de antes (literal copiado da saída anterior à mudança).
 */
describe('sem altura própria nem colunas opcionais, o quadro não muda', () => {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addOpening', opening: opening({ id: 'd1', kind: 'door', typeId: 'ot_p80', hostId: 'w', offset: 1 }) });
  const tab = buildOpeningSchedule(s.project);

  it('linha da porta P-02 igual à saída anterior, com variante vazia', () => {
    const lines = linhasCsv(tab.rows);
    expect(lines[1]).toBe('P-02;Porta 80 x 210;Porta de giro;Porta;0,80;2,10;0,80;2,10;0,00;1;0,00;0,00;1;1,68;1,68;0,72;2,05;Madeira;dobradiça padrão, abre à esquerda de a→b;;"maçaneta a 1,00 m; 3 dobradiças; folga inferior 0,7 cm"');
    expect(tab.rows[0]!.variant).toBe('');
  });
});
