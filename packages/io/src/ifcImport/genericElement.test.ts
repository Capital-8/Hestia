import { describe, expect, it } from 'vitest';
import { hull2 } from './geometry.ts';
import type { Pt2 } from './ifc.ts';
import { outlineOf, weldTris } from './genericElement.ts';

/** Cubo unitário como 12 triângulos com vértices próprios (36 vértices soltos, como o leitor de malha entrega). */
const CORNERS = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];
const FACES = [
  [0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6], [0, 4, 5], [0, 5, 1],
  [3, 2, 6], [3, 6, 7], [0, 3, 7], [0, 7, 4], [1, 5, 6], [1, 6, 2],
];
const cubeTris = (): number[] => FACES.flatMap((f) => f.flatMap((i) => CORNERS[i]!));

describe('malha genérica: soldagem de vértices', () => {
  it('um cubo de 12 triângulos soltos (36 vértices) vira 8 vértices e 36 índices', () => {
    const tris = cubeTris();
    expect(tris.length / 3).toBe(36);
    const { positions, indices } = weldTris(tris);
    expect(positions.length / 3).toBe(8);
    expect(indices.length).toBe(36);
    expect(indices.every((i) => i >= 0 && i < 8)).toBe(true);
  });

  it('o contorno do cubo soldado é igual ao hull de todos os vértices soltos', () => {
    const tris = cubeTris();
    const loose: Pt2[] = [];
    for (let i = 0; i < tris.length; i += 3) loose.push({ x: tris[i]!, y: tris[i + 1]! });
    const { positions } = weldTris(tris);
    expect(outlineOf(positions)).toEqual(hull2(loose));
    expect(outlineOf(positions)).toHaveLength(4);
  });

  it('descarta triângulos degenerados (índices repetidos) e mantém os vértices no contorno', () => {
    const tris = [0, 0, 0, 0, 0, 0, 1, 0, 0, ...cubeTris()];
    const { positions, indices } = weldTris(tris);
    expect(indices.length).toBe(36);
    expect(positions.length / 3).toBe(8);
    expect(indices.every((i) => i < 8)).toBe(true);
  });

  it('vértices a menos de 1e-6 m um do outro viram um só, e o primeiro vértice é o que fica', () => {
    // Dois triângulos com o mesmo triângulo quase sobreposto (diferença de 4e-10 e 1e-7 m).
    const tris = [0, 0, 0, 1, 0, 0, 0, 1, 0, 4e-10, 0, 0, 1, 1e-7, 0, 0, 1, 0];
    const { positions, indices } = weldTris(tris);
    expect(positions.length / 3).toBe(3);
    expect(Array.from(positions.slice(0, 3))).toEqual([0, 0, 0]);
    expect(Array.from(indices)).toEqual([0, 1, 2, 0, 1, 2]);
  });

  it('corpo sem triângulo não gera malha', () => {
    const w = weldTris([]);
    expect(w.positions).toHaveLength(0);
    expect(w.indices).toHaveLength(0);
    expect(w.positions).toBeInstanceOf(Float32Array);
  });
});
