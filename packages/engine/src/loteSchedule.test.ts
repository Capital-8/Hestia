import { describe, expect, it } from 'vitest';
import { createEmptyProject, defaultUnits, ProjectStore, type Lot, type Project } from '@hestia/model';
import { buildLoteSchedule, LIMITE_AUSENTE, loteScheduleToCsv, situacaoMaxima, situacaoMinima, type RotulosCsvLote } from './loteSchedule.ts';
import { loteL1, projetoI1, projetoLote } from './fixtureLote.ts';

const comLimites = (p: Project, limites: Lot['limites']): Project => {
  const s = new ProjectStore(p);
  s.exec({ type: 'updateLot', id: 'lote_l1', patch: { limites } });
  return s.project;
};

const ROTULOS: RotulosCsvLote = {
  lote: 'Lote',
  area: 'Área',
  areaEdificavel: 'Área edificável',
  areaProjecao: 'Área da projeção',
  areaConstruida: 'Área construída',
  taxaOcupacao: 'Taxa de ocupação',
  coefAproveitamento: 'Coeficiente de aproveitamento',
  permeabilidade: 'Permeabilidade',
  limite: 'limite',
  marca: 'marca',
  dentro: 'dentro',
  excede: 'excede',
};

describe('tabela Índices do lote', () => {
  it('I1: área, área edificável, projeção e área construída do lote', () => {
    const [r] = buildLoteSchedule(projetoI1()).rows;
    expect(r).toBeDefined();
    expect(r!.nome).toBe('L1');
    expect(r!.area).toBeCloseTo(360, 9);
    expect(r!.areaEdificavel).toBeCloseTo(198, 9);
    expect(r!.areaProjecao).toBeCloseTo(90, 9);
    expect(r!.areaConstruida).toBeCloseTo(180, 9);
  });

  it('I1: taxa de ocupação 0,25, coeficiente 0,5 e permeabilidade 0,6667 (1e-4)', () => {
    const [r] = buildLoteSchedule(projetoI1()).rows;
    expect(r!.taxaOcupacao.valor).toBeCloseTo(0.25, 4);
    expect(r!.coefAproveitamento.valor).toBeCloseTo(0.5, 4);
    expect(r!.permeabilidade.valor).toBeCloseTo(0.6667, 4);
  });

  it('I1 com limites que cabem e que não cabem: taxa dentro, coeficiente e permeabilidade excede', () => {
    const [r] = buildLoteSchedule(comLimites(projetoI1(), { taxaOcupacaoMax: 0.3, coefAproveitamentoMax: 0.4, permeabilidadeMin: 0.7 })).rows;
    expect(r!.taxaOcupacao).toMatchObject({ limite: 0.3, situacao: 'dentro' });
    expect(r!.coefAproveitamento).toMatchObject({ limite: 0.4, situacao: 'excede' });
    expect(r!.permeabilidade).toMatchObject({ limite: 0.7, situacao: 'excede' });
  });

  it('I1 com os outros limites: taxa excede; coeficiente igual ao limite conta como dentro; permeabilidade acima do mínimo é dentro', () => {
    const [r] = buildLoteSchedule(comLimites(projetoI1(), { taxaOcupacaoMax: 0.2, coefAproveitamentoMax: 0.5, permeabilidadeMin: 0.6 })).rows;
    expect(r!.taxaOcupacao.situacao).toBe('excede');
    expect(r!.coefAproveitamento.situacao).toBe('dentro');
    expect(r!.permeabilidade.situacao).toBe('dentro');
  });

  it('limite ausente: limite e marca nulos, e o CSV mostra "—"', () => {
    const [r] = buildLoteSchedule(projetoI1()).rows;
    expect(r!.taxaOcupacao).toEqual({ valor: expect.closeTo(0.25, 4), limite: null, situacao: null });
    expect(r!.coefAproveitamento.limite).toBeNull();
    expect(r!.permeabilidade.situacao).toBeNull();
    const linha = loteScheduleToCsv(buildLoteSchedule(projetoI1()), defaultUnits('pt'), ROTULOS, 'pt').replace('﻿', '').trimEnd().split('\r\n')[1]!;
    expect(linha.split(';').filter((c) => c === LIMITE_AUSENTE)).toHaveLength(6);
  });

  it('CSV de I1: cabeçalho com as colunas de cada índice e a linha do lote', () => {
    const s = buildLoteSchedule(comLimites(projetoI1(), { taxaOcupacaoMax: 0.3, coefAproveitamentoMax: 0.4, permeabilidadeMin: 0.7 }));
    const linhas = loteScheduleToCsv(s, defaultUnits('pt'), ROTULOS, 'pt').replace('﻿', '').trimEnd().split('\r\n');
    expect(linhas[0]).toBe(
      'Lote;Área (m²);Área edificável (m²);Área da projeção (m²);Área construída (m²);Taxa de ocupação (%);Taxa de ocupação - limite (%);Taxa de ocupação - marca;' +
        'Coeficiente de aproveitamento;Coeficiente de aproveitamento - limite;Coeficiente de aproveitamento - marca;Permeabilidade (%);Permeabilidade - limite (%);Permeabilidade - marca',
    );
    expect(linhas[1]).toBe('L1;360,00;198,00;90,00;180,00;25,00;30,00;dentro;0,50;0,40;excede;66,67;70,00;excede');
  });

  it('lote sem edificação: índices zero, sem divisão por zero (nenhum NaN no CSV)', () => {
    const p = projetoLote(loteL1());
    const [r] = buildLoteSchedule(p).rows;
    expect(r!.areaProjecao).toBe(0);
    expect(r!.areaConstruida).toBe(0);
    expect(r!.taxaOcupacao.valor).toBe(0);
    expect(r!.coefAproveitamento.valor).toBe(0);
    expect(r!.permeabilidade.valor).toBeCloseTo(1, 9);
    const csv = loteScheduleToCsv(buildLoteSchedule(p), defaultUnits('pt'), ROTULOS, 'pt');
    expect(csv).not.toMatch(/NaN|Infinity/);
  });

  it('projeto sem lote: tabela vazia, e o CSV só traz o cabeçalho', () => {
    const s = buildLoteSchedule(createEmptyProject());
    expect(s.rows).toEqual([]);
    expect(loteScheduleToCsv(s, defaultUnits('pt'), ROTULOS, 'pt').trimEnd().split('\r\n')).toHaveLength(1);
  });
});

describe('marca dos índices', () => {
  it('no limite exato conta como dentro (teto e piso)', () => {
    expect(situacaoMaxima(0.5, 0.5)).toBe('dentro');
    expect(situacaoMinima(0.6, 0.6)).toBe('dentro');
  });

  it('sem limite não há marca', () => {
    expect(situacaoMaxima(0.9, undefined)).toBeNull();
    expect(situacaoMinima(0.1, undefined)).toBeNull();
  });
});
