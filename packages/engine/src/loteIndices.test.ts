import { describe, expect, it } from 'vitest';
import { indicesDoLote, projecaoDaEdificacao } from './loteIndices.ts';
import { loteL1, projetoI1, projetoLote } from './fixtureLote.ts';
import { multiArea } from '@hestia/geom';
import type { Lot } from '@hestia/model';

const lote = (p: ReturnType<typeof projetoI1>): Lot => p.elements.lote_l1 as Lot;

describe('índices do lote', () => {
  it('i1_indices', () => {
    const p = projetoI1();
    const i = indicesDoLote(p, lote(p));
    expect(i.areaLote).toBeCloseTo(360, 6);
    expect(i.areaProjecao).toBeCloseTo(90, 6);
    expect(i.areaConstruida).toBeCloseTo(180, 6);
    expect(i.taxaOcupacao).toBeCloseTo(0.25, 9);
    expect(i.coefAproveitamento).toBeCloseTo(0.5, 9);
    expect(Math.abs(i.permeabilidade - 0.6667)).toBeLessThan(1e-4);
    expect(i.projecaoForaDoEdificavel).toBeLessThan(1e-6);
    expect(multiArea(projecaoDaEdificacao(p))).toBeCloseTo(90, 6);
  });

  it('lote sem edificação: índices zero e sem divisão por zero', () => {
    const p = projetoLote();
    const i = indicesDoLote(p, p.elements.lote_l1 as Lot);
    expect(i.taxaOcupacao).toBe(0);
    expect(i.coefAproveitamento).toBe(0);
    expect(i.areaProjecao).toBe(0);
    expect(i.permeabilidade).toBeCloseTo(1, 9);
    for (const v of Object.values(i)) expect(Number.isFinite(v)).toBe(true);
  });

  it('lote de área zero não divide por zero', () => {
    const p = projetoI1();
    const degenerado: Lot = { ...loteL1(), order: 0, contorno: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], lados: lote(p).lados.slice(0, 3) };
    const i = indicesDoLote(p, degenerado);
    expect([i.taxaOcupacao, i.coefAproveitamento, i.permeabilidade]).toEqual([0, 0, 0]);
  });

  it('só a parte dentro do lote conta', () => {
    const p = projetoI1();
    const pequeno: Lot = { ...lote(p), contorno: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 30 }, { x: 0, y: 30 }], lados: lote(p).lados };
    const i = indicesDoLote(p, pequeno);
    expect(i.areaProjecao).toBeCloseTo(4.5 * 10, 6);
  });
});
