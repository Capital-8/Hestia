import { describe, expect, it } from 'vitest';
import { erroMaximoSimplificacao, simplificarPolilinha } from './simplificarPolilinha.ts';

/** Gerador pseudoaleatório determinístico (LCG), para o ruído dos testes. */
function sorteio(semente: number): () => number {
  let s = semente;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('simplificarPolilinha', () => {
  it('reta com ruído vira 2 pontos, com as pontas preservadas', () => {
    const r = sorteio(7);
    const xy: number[] = [];
    for (let k = 0; k <= 50; k++) xy.push(k * 2, (r() - 0.5) * 0.04 * (k === 0 || k === 50 ? 0 : 1));
    const out = simplificarPolilinha(xy, 0.05);
    expect(out).toEqual([xy[0], xy[1], xy[100], xy[101]]);
  });

  it('o erro máximo fica dentro da tolerância numa curva suave', () => {
    const xy: number[] = [];
    for (let k = 0; k <= 200; k++) xy.push(k * 0.1, Math.sin(k * 0.05) * 3);
    for (const tol of [0.01, 0.05, 0.2]) {
      const out = simplificarPolilinha(xy, tol);
      expect(out.length).toBeLessThan(xy.length);
      expect(erroMaximoSimplificacao(xy, out)).toBeLessThanOrEqual(tol + 1e-12);
      expect(out.slice(0, 2)).toEqual(xy.slice(0, 2));
      expect(out.slice(-2)).toEqual(xy.slice(-2));
    }
  });

  it('tolerância 0 desliga e devolve uma cópia', () => {
    const xy = [0, 0, 1, 0.001, 2, 0];
    const out = simplificarPolilinha(xy, 0);
    expect(out).toEqual(xy);
    expect(out).not.toBe(xy);
  });

  it('com 3 números por vértice mantém a cota dos vértices mantidos e mede o erro só em planta', () => {
    const xyz = [0, 0, 10, 5, 0.01, 11, 10, 0, 12, 10, 5, 13];
    const out = simplificarPolilinha(xyz, 0.05, 3);
    expect(out).toEqual([0, 0, 10, 10, 0, 12, 10, 5, 13]);
  });

  it('polilinha com menos de 3 vértices fica igual', () => {
    expect(simplificarPolilinha([0, 0, 5, 5], 1)).toEqual([0, 0, 5, 5]);
  });

  it('anel fechado mantém o primeiro vértice e não cai abaixo de 3 vértices', () => {
    const quadrado = [0, 0, 10, 0, 10, 10, 0, 10];
    const out = simplificarPolilinha(quadrado, 0.5, 2, true);
    expect(out).toEqual(quadrado);
    const redondo: number[] = [];
    for (let k = 0; k < 120; k++) redondo.push(Math.cos((k * Math.PI) / 60) * 20, Math.sin((k * Math.PI) / 60) * 20);
    const s = simplificarPolilinha(redondo, 0.2, 2, true);
    expect(s.length).toBeLessThan(redondo.length);
    expect(s.length).toBeGreaterThanOrEqual(6);
    expect(s.slice(0, 2)).toEqual(redondo.slice(0, 2));
  });

  it('não estoura a pilha com polilinha de 100 mil vértices', () => {
    const xy: number[] = [];
    for (let k = 0; k < 100000; k++) xy.push(k, k % 2 === 0 ? 0 : 0.001);
    expect(simplificarPolilinha(xy, 0.01)).toEqual([0, 0, 99999, 0.001]);
  });
});
