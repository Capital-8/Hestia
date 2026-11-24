import { describe, expect, it } from 'vitest';
import { quadrosDoCaminho } from './corposQuadro.ts';

const perto = (a: number[], b: number[]): void => {
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 9));
};

describe('quadrosDoCaminho', () => {
  it('caminho reto em +Z: N = X, B = Y', () => {
    const q = quadrosDoCaminho([0, 0, 0, 0, 0, 1]);
    expect(q).toHaveLength(2);
    perto(q[0]!.T, [0, 0, 1]);
    perto(q[0]!.N, [1, 0, 0]);
    perto(q[0]!.B, [0, 1, 0]);
  });

  it('T0 = +X: N = Z × X = Y e B = Z', () => {
    const q = quadrosDoCaminho([0, 0, 0, 1, 0, 0]);
    perto(q[0]!.N, [0, 1, 0]);
    perto(q[0]!.B, [0, 0, 1]);
  });

  it('L coplanar (+Z depois +X): sem torção, B constante e T bissetor no vértice', () => {
    const q = quadrosDoCaminho([0, 0, 0, 0, 0, 1, 1, 0, 1]);
    expect(q).toHaveLength(3);
    const r = Math.SQRT1_2;
    perto(q[1]!.T, [r, 0, r]);
    for (const quadro of q) {
      perto(quadro.B, q[0]!.B);
      expect(Math.hypot(...quadro.T)).toBeCloseTo(1, 9);
      expect(quadro.N[0] * quadro.T[0] + quadro.N[1] * quadro.T[1] + quadro.N[2] * quadro.T[2]).toBeCloseTo(0, 9);
    }
  });

  it('caminho degenerado devolve lista vazia', () => {
    expect(quadrosDoCaminho([0, 0, 0])).toEqual([]);
  });
});
