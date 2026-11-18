import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, defaultUnits, makeWall, openingRough, openingSpanOf, type Opening, type OpeningType } from '@hestia/model';
import { areaPerimetroDoContorno } from './furoContornoParede.ts';
import { OPENING_EXEC_KEYS, buildOpeningSchedule, openingScheduleToCsv, sumOpeningRows } from './index.ts';

const opening = (o: Partial<Opening> & Pick<Opening, 'id' | 'kind' | 'typeId' | 'hostId'>): Opening => ({
  offset: 1.5,
  flipHand: false,
  flipFacing: false,
  sillOverride: null,
  mark: '',
  ...o,
});

/** Porta de giro (ot_pgiro80) em três instâncias: duas iguais e uma espelhada (flipFacing); e uma janela. */
function cena(extra: (s: ProjectStore) => void = () => undefined): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addOpening', opening: opening({ id: 'd1', kind: 'door', typeId: 'ot_pgiro80', hostId: 'w1', offset: 1 }) });
  s.exec({ type: 'addOpening', opening: opening({ id: 'd2', kind: 'door', typeId: 'ot_pgiro80', hostId: 'w1', offset: 2, flipFacing: true }) });
  s.exec({ type: 'addOpening', opening: opening({ id: 'd3', kind: 'door', typeId: 'ot_pgiro80', hostId: 'w1', offset: 3 }) });
  s.exec({ type: 'addOpening', opening: opening({ id: 'j1', kind: 'window', typeId: 'ot_j240', hostId: 'w1', offset: 3.5 }) });
  extra(s);
  return s;
}

const tipo = (s: ProjectStore, id: string): OpeningType => s.project.openingTypes[id]!;

/** Célula por ';' fora de aspas (o CSV põe aspas nos textos que levam ';'). */
const celulas = (linha: string): string[] => linha.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/);

describe('quadro executivo (opt-in, o quadro padrão não muda)', () => {
  it('sem `executivo` a linha não tem o bloco executivo e o CSV segue o formato de antes', () => {
    const tab = buildOpeningSchedule(cena().project);
    expect(tab.rows.every((r) => r.exec === undefined)).toBe(true);
    const linha = openingScheduleToCsv(tab.rows, tab.totals, defaultUnits()).replace(/^ /, '').split('\r\n')[0]!;
    expect(linha.split(';')).toHaveLength(21);
  });

  it('a espelhada vira linha própria; a quantidade por tipo soma as duas', () => {
    const rows = buildOpeningSchedule(cena().project, 'pt', { executivo: true }).rows.filter((r) => r.typeId === 'ot_pgiro80');
    expect(rows.map((r) => [r.count, r.exec!.mirrored, r.exec!.typeCount])).toEqual([
      [2, false, 3],
      [1, true, 3],
    ]);
  });

  it('contorno e perímetro do vão retangular seguem W x H; área total = unitária x quantidade', () => {
    const r = buildOpeningSchedule(cena().project, 'pt', { executivo: true }).rows.find((x) => x.typeId === 'ot_pgiro80' && !x.exec!.mirrored)!;
    expect(r.exec!.contourArea).toBeCloseTo(r.width * r.height, 9);
    expect(r.exec!.perimeter).toBeCloseTo(2 * (r.width + r.height), 9);
    expect(r.exec!.contourAreaTotal).toBeCloseTo(r.exec!.contourArea * r.count, 9);
  });

  it('peças do quadro de peças ligadas à linha: batente com volume e vidro por esquadria', () => {
    const r = buildOpeningSchedule(cena().project, 'pt', { executivo: true }).rows.find((x) => x.typeId === 'ot_pgiro80')!;
    expect(r.exec!.frameVolume).toBeGreaterThan(0);
    expect(r.exec!.leafVolume).toBeGreaterThan(0);
  });

  it('ferragens por unidade: dobradiças e maçaneta da porta de giro, totais pela quantidade', () => {
    const r = buildOpeningSchedule(cena().project, 'pt', { executivo: true }).rows.find((x) => x.typeId === 'ot_pgiro80' && !x.exec!.mirrored)!;
    expect(r.exec!.hingesPerUnit).toBeGreaterThan(0);
    expect(r.exec!.handlesPerUnit).toBe(1);
    expect(r.exec!.hingesTotal).toBe(r.exec!.hingesPerUnit * r.count);
    expect(r.exec!.handlesTotal).toBe(r.count);
  });

  it('sistema de assentamento: folga do sistema soma 2 x por lado no vão bruto (e a leitura do modelo bate)', () => {
    const s = cena((st) => st.exec({ type: 'upsertOpeningType', openingType: { ...tipo(st, 'ot_pgiro80'), settingSystem: 'contramarco' } }));
    const r = buildOpeningSchedule(s.project, 'pt', { executivo: true }).rows.find((x) => x.typeId === 'ot_pgiro80')!;
    expect(r.exec!.settingSystem).toBe('Contramarco');
    expect(r.exec!.settingClearance).toBeCloseTo(0.025, 9);
    expect(r.roughWidth).toBeCloseTo(r.width + 0.05, 9);
    expect(r.roughHeight).toBeCloseTo(r.height + 0.05, 9);
    expect(openingRough({ ...tipo(s, 'ot_pgiro80'), ...openingSpanOf(tipo(s, 'ot_pgiro80')) }).width).toBeCloseTo(r.roughWidth, 9);
  });

  it('sem sistema (projeto antigo) a folga é zero e o vão bruto não muda', () => {
    const base = buildOpeningSchedule(cena().project).rows.find((x) => x.typeId === 'ot_pgiro80')!;
    const r = buildOpeningSchedule(cena().project, 'pt', { executivo: true }).rows.find((x) => x.typeId === 'ot_pgiro80')!;
    expect(r.exec!.settingClearance).toBe(0);
    expect(r.exec!.settingSystem).toBe('');
    expect(r.roughWidth).toBeCloseTo(base.roughWidth, 9);
  });

  it('vão com arco: área e perímetro do contorno real, menores que o retângulo W x H', () => {
    const shape = { kind: 'round' as const, width: 0.9, height: 2.1 };
    const s = cena((st) => st.exec({ type: 'upsertOpeningType', openingType: { ...tipo(st, 'ot_pgiro80'), id: 'ot_arco', name: 'Arco', shape } }));
    s.exec({ type: 'addOpening', opening: opening({ id: 'a1', kind: 'door', typeId: 'ot_arco', hostId: 'w1', offset: 3.2 }) });
    const r = buildOpeningSchedule(s.project, 'pt', { executivo: true }).rows.find((x) => x.typeId === 'ot_arco')!;
    const esperado = areaPerimetroDoContorno({ ...shape, width: r.width, height: r.height });
    expect(r.exec!.contourArea).toBeCloseTo(esperado.area, 9);
    expect(r.exec!.perimeter).toBeCloseTo(esperado.perimetro, 9);
    expect(r.exec!.contourArea).toBeLessThan(r.width * r.height);
  });

  it('CSV executivo: colunas novas ao fim (as antigas idênticas), mesmo número de células em toda linha', () => {
    const s = cena();
    const padrao = buildOpeningSchedule(s.project);
    const exec = buildOpeningSchedule(s.project, 'pt', { executivo: true });
    const linhasPadrao = openingScheduleToCsv(padrao.rows, padrao.totals, defaultUnits()).replace(/^ /, '').split('\r\n').filter((l) => l !== '');
    const linhas = openingScheduleToCsv(exec.rows, exec.totals, defaultUnits(), 'pt', [], true).replace(/^ /, '').split('\r\n').filter((l) => l !== '');
    expect(linhas[0]!.startsWith(linhasPadrao[0]! + ';')).toBe(true);
    expect(celulas(linhas[0]!)).toHaveLength(21 + OPENING_EXEC_KEYS.length);
    expect(new Set(linhas.map((l) => celulas(l).length)).size).toBe(1); // cabeçalho, linhas e total com o mesmo número de células
    expect(linhas.some((l) => celulas(l).includes('Sim'))).toBe(true);
  });

  it('total executivo: soma do contorno total e das dobradiças; quantidades de portas e janelas não mudam', () => {
    const exec = buildOpeningSchedule(cena().project, 'pt', { executivo: true });
    const padrao = buildOpeningSchedule(cena().project);
    expect(sumOpeningRows(exec.rows).count).toBe(sumOpeningRows(padrao.rows).count);
    expect(sumOpeningRows(exec.rows).totalArea).toBeCloseTo(sumOpeningRows(padrao.rows).totalArea, 9);
  });
});
