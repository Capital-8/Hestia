import { describe, expect, it } from 'vitest';
import { NIVEL_TODOS } from './esquema.gerado.ts';
import {
  referenciaEstatisticasNivel,
  referenciaParedesNaCaixa,
  referenciaParesProximos,
  type LinhaParede,
} from './referencia.ts';

const p = (id: number, nivel: number, ax: number, ay: number, bx: number, by: number, espessura = 0.2): LinhaParede => ({
  id,
  nivel,
  ax,
  ay,
  bx,
  by,
  espessura,
});

describe('referência de força bruta', () => {
  const ps = [p(3, 0, 0, 0, 4, 0), p(1, 0, 4, 0, 4, 3), p(2, 1, 10, 10, 12, 10), p(9, 0, 20, 20, 21, 20)];

  it('estatisticas_nivel', () => {
    expect(referenciaEstatisticasNivel(ps, 0)).toEqual({ nParedes: 3, caixa: [0, 0, 21, 20], comprimentoTotal: 8 });
    expect(referenciaEstatisticasNivel(ps, 5)).toEqual({ nParedes: 0, caixa: [0, 0, 0, 0], comprimentoTotal: 0 });
    expect(referenciaEstatisticasNivel(ps, NIVEL_TODOS).nParedes).toBe(4);
  });

  it('paredes_na_caixa: espessura conta, fronteira inclusiva, ids crescentes', () => {
    expect(Array.from(referenciaParedesNaCaixa(ps, 0, -1, -1, 5, 1))).toEqual([1, 3]);
    // a parede 3 tem caixa y de -0.1 a 0.1: uma caixa que começa em y = 0.1 a toca (inclusivo)
    expect(Array.from(referenciaParedesNaCaixa(ps, 0, 1, 0.1, 2, 5))).toEqual([3]);
    expect(Array.from(referenciaParedesNaCaixa(ps, 0, 1, 0.1000001, 2, 5))).toEqual([]);
    expect(Array.from(referenciaParedesNaCaixa(ps, 0, 100, 100, 101, 101))).toEqual([]);
    expect(Array.from(referenciaParedesNaCaixa(ps, NIVEL_TODOS, 9, 9, 13, 11))).toEqual([2]);
  });

  it('pares_proximos: a<b, ordem lexicográfica, tol inclusiva', () => {
    expect(Array.from(referenciaParesProximos(ps, 0, 0))).toEqual([1, 3]);
    expect(Array.from(referenciaParesProximos(ps, 0, 20))).toEqual([1, 3, 1, 9, 3, 9]);
    const a = p(1, 0, 0, 0, 1, 0, 0);
    const b = p(2, 0, 1.5, 0, 2, 0, 0); // vão de 0,5
    expect(Array.from(referenciaParesProximos([a, b], 0, 0.5))).toEqual([1, 2]);
    expect(Array.from(referenciaParesProximos([a, b], 0, 0.4999))).toEqual([]);
  });
});
