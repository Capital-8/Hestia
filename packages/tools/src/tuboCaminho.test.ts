import { describe, expect, it } from 'vitest';
import { eixoDaDirecao, eixoOposto, planejarCaminhoOrtogonal, type Eixo } from './tuboCaminho.ts';

/*
 * Caminho em 90° que respeita as direções das entradas (ficha C8a). Os números de trechos e de joelhos abaixo são a conta da busca
 * (menor número de trechos, depois menor comprimento); `minimo` e `desvio` são dados de entrada, aqui valores de teste.
 */

const X = eixoDaDirecao([1, 0, 0]) as Eixo;
const Y = eixoDaDirecao([0, 1, 0]) as Eixo;
const Z = eixoDaDirecao([0, 0, 1]) as Eixo;
const MIN = 0.1;
const DESV = 0.2;
const plano = (a: [number, number, number], b: [number, number, number], saida: Eixo | null, chegada: Eixo | null) => planejarCaminhoOrtogonal(a, b, saida, chegada, 'subir_primeiro', MIN, DESV);

describe('eixos', () => {
  it('direção axial vira o eixo; direção girada fora dos eixos não vira nada; o oposto é o eixo contrário', () => {
    expect(eixoDaDirecao([0, 0, -1])).toEqual([0, 0, -1]);
    expect(eixoDaDirecao([Math.SQRT1_2, Math.SQRT1_2, 0])).toBeNull();
    expect(eixoOposto(X)).toEqual([-1, 0, 0]);
  });
});

describe('planejarCaminhoOrtogonal', () => {
  it('saída e chegada no mesmo eixo, em linha reta: um trecho, nenhum joelho', () => {
    expect(plano([0, 0, 0], [2, 0, 0], X, X)).toEqual({ intermediarios: [], trechos: 1 });
  });

  it('saída em X e chegada em Y: um L, com o joelho no canto (b.x, a.y)', () => {
    expect(plano([0, 0, 0], [2, 3, 0], X, Y)).toEqual({ intermediarios: [[2, 0, 0]], trechos: 2 });
  });

  it('saída lateral e chegada lateral com desnível: horizontal, vertical e horizontal; o desvio em X se divide ao meio', () => {
    const r = plano([0, 0, 0], [2, 0, 0.5], X, X);
    expect(r?.trechos).toBe(3);
    expect(r?.intermediarios).toEqual([[1, 0, 0], [1, 0, 0.5]]);
  });

  it('saída lateral e chegada vertical (por baixo): horizontal e vertical, um joelho só', () => {
    expect(plano([0, 0, 0], [2, 0, 0.5], X, Z)).toEqual({ intermediarios: [[2, 0, 0]], trechos: 2 });
  });

  it('entradas que não se enxergam (as duas para +X, uma acima da outra no plano): desvio em U, de `desvio` para fora', () => {
    const r = planejarCaminhoOrtogonal([0, 0, 0], [0, 3, 0], X, eixoOposto(X), 'subir_primeiro', MIN, DESV);
    expect(r?.trechos).toBe(3);
    expect(r?.intermediarios).toEqual([[DESV, 0, 0], [DESV, 3, 0]]);
  });

  it('ponta livre (sem direção) numa das pontas: só a outra restringe; sem restrição nenhuma o menor caminho é o reto', () => {
    expect(plano([0, 0, 0], [2, 3, 0], X, null)?.trechos).toBe(2);
    expect(plano([0, 0, 0], [2, 0, 0], null, null)).toEqual({ intermediarios: [], trechos: 1 });
  });

  it('o modo de cota decide o empate: subir primeiro põe o vertical antes, andar primeiro depois', () => {
    const subir = planejarCaminhoOrtogonal([0, 0, 0], [2, 3, 1], null, X, 'subir_primeiro', MIN, DESV);
    const andar = planejarCaminhoOrtogonal([0, 0, 0], [2, 3, 1], null, X, 'andar_primeiro', MIN, DESV);
    expect(subir?.trechos).toBe(3);
    expect(subir?.intermediarios[0]).toEqual([0, 0, 1]);
    expect(andar?.intermediarios[0]).toEqual([0, 3, 0]);
  });

  it('trecho menor que o mínimo (cabe a curva) não vale: o caminho procura outro e nunca devolve perna curta', () => {
    const r = plano([0, 0, 0], [0.05, 0, 0.5], X, X);
    const pontos = [[0, 0, 0], ...(r?.intermediarios ?? []), [0.05, 0, 0.5]];
    for (let i = 1; i < pontos.length; i++) {
      const p = pontos[i - 1] as number[];
      const q = pontos[i] as number[];
      expect(Math.hypot(q[0]! - p[0]!, q[1]! - p[1]!, q[2]! - p[2]!)).toBeGreaterThanOrEqual(MIN - 1e-9);
    }
  });
});
