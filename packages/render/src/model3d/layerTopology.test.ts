import { describe, expect, it } from 'vitest';
import type { SolidBatch } from './solids.ts';
import { splitTJunctions, weldBands } from './layerTopology.ts';

const meshWithTJunction = (): SolidBatch => ({
  materialId: 'mat',
  category: 'wall',
  positions: [
    0, 0, 0, 2, 0, 0, 0, 1, 0, // primeira face, com aresta longa A–B
    1, 0, 0, 1, -1, 0, 2, -1, 0, // segunda face introduz o vértice Q no meio de A–B
  ],
  normals: Array.from({ length: 6 }, () => [0, 0, 1]).flat(),
  indices: [0, 1, 2, 3, 4, 5],
  ids: [],
});

/** Malha com a face de aresta longa 0–10 em y=0 e uma segunda face com os vértices `extra` (x, y, z por vértice). */
const longEdgeMesh = (extra: number[]): SolidBatch => ({
  materialId: 'mat',
  category: 'wall',
  positions: [0, 0, 0, 10, 0, 0, 0, 1, 0, ...extra],
  normals: Array.from({ length: 3 + extra.length / 3 }, () => [0, 0, 1]).flat(),
  indices: [0, 1, 2, 3, 4, 5],
  ids: [],
});

/** Verdadeiro se nenhuma aresta de triângulo passa, a menos de 1e-6, por um vértice da malha que não seja seu extremo. */
function noVertexOnAnyEdge(mesh: SolidBatch): boolean {
  const point = (i: number): number[] => [mesh.positions[i * 3]!, mesh.positions[i * 3 + 1]!, mesh.positions[i * 3 + 2]!];
  const nVert = mesh.positions.length / 3;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = mesh.indices[t + e]!;
      const b = mesh.indices[t + ((e + 1) % 3)]!;
      const A = point(a);
      const d = point(b).map((c, k) => c - A[k]!);
      const l2 = d[0]! * d[0]! + d[1]! * d[1]! + d[2]! * d[2]!;
      for (let v = 0; v < nVert; v++) {
        if (v === a || v === b) continue;
        const p = point(v).map((c, k) => c - A[k]!);
        const s = (p[0]! * d[0]! + p[1]! * d[1]! + p[2]! * d[2]!) / l2;
        if (s <= 0 || s >= 1) continue;
        const r = p.map((c, k) => c - s * d[k]!);
        if (Math.hypot(r[0]!, r[1]!, r[2]!) < 1e-6) return false;
      }
    }
  }
  return true;
}

describe('divisão de T-junctions na malha 3D', () => {
  it('divide a aresta longa no vértice existente e mantém índices válidos', () => {
    const mesh = meshWithTJunction();

    splitTJunctions(mesh, 0, 0);

    expect(mesh.indices).toHaveLength(9);
    expect(mesh.positions.slice(18, 21)).toEqual([1, 0, 0]);
    expect(mesh.indices.every((index) => index < mesh.positions.length / 3)).toBe(true);
  });

  it('não altera uma malha sem T-junctions', () => {
    const mesh = meshWithTJunction();
    mesh.indices = [3, 4, 5];

    splitTJunctions(mesh, 0, 0);

    expect(mesh.indices).toEqual([3, 4, 5]);
    expect(mesh.positions).toHaveLength(18);
  });

  it('divide a mesma aresta longa em vários vértices que caem em células diferentes da grade', () => {
    const mesh = longEdgeMesh([3, 0, 0, 7, 0, 0, 7, -1, 0]);

    splitTJunctions(mesh, 0, 0);

    expect(mesh.indices.length).toBeGreaterThan(6);
    expect(mesh.indices.every((index) => index < mesh.positions.length / 3)).toBe(true);
    expect(noVertexOnAnyEdge(mesh)).toBe(true);
  });

  it('não divide aresta por vértice que passa a 1e-5 dela (acima da tolerância de 3e-7)', () => {
    const mesh = longEdgeMesh([5, 1e-5, 0, 5.5, -1, 0, 4.5, -1, 0]);

    splitTJunctions(mesh, 0, 0);

    expect(mesh.positions).toHaveLength(18);
    expect(mesh.indices).toHaveLength(6);
  });

  it('divide aresta por vértice que passa a 1e-7 dela (dentro da tolerância)', () => {
    const mesh = longEdgeMesh([5, 1e-7, 0, 5.5, -1, 0, 4.5, -1, 0]);

    splitTJunctions(mesh, 0, 0);

    expect(mesh.indices.length).toBeGreaterThan(6);
    expect(noVertexOnAnyEdge(mesh)).toBe(true);
  });
});

describe('weldBands · tolerância de soldagem', () => {
  // Anel com dois vértices a 0,0007 m (a ponta de uma face de arco e o canto da tampa, J5-D3).
  const banda = (): Parameters<typeof weldBands>[0] => [{ z0: 0, z1: 1, poly: [[[{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.0007 }, { x: 0, y: 1 }]]] } as never];
  it('tolerância padrão (1,5 mm) funde os dois vértices (anel de 3)', () => {
    expect(weldBands(banda())[0]!.poly[0]![0]!.length).toBe(3);
  });
  it('tolerância de 0,2 mm (parede inclinada) mantém os quatro vértices em suas posições', () => {
    const r = weldBands(banda(), 2e-4)[0]!.poly[0]![0]!;
    expect(r.length).toBe(4);
    expect(r[2]!.y).toBeCloseTo(0.0007, 12);
  });
});
