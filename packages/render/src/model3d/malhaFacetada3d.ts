import type { SolidBatch } from './solids.ts';

/**
 * Acrescenta ao lote `lote` os triângulos de uma malha do kernel (`positions` x, y, z e `indices` de 3 em 3), com normal POR FACE: a malha do Rust compartilha
 * vértices, e o sombreado de ferragem e de peça prismática pede arestas vivas. Triângulo degenerado é descartado. Usado pelo guarda-corpo e pela estrutura.
 */
export function acrescentarTriangulosFaceados(lote: SolidBatch, pos: ArrayLike<number>, indices: ArrayLike<number>): void {
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const ia = indices[t]! * 3;
    const ib = indices[t + 1]! * 3;
    const ic = indices[t + 2]! * 3;
    const ux = pos[ib]! - pos[ia]!;
    const uy = pos[ib + 1]! - pos[ia + 1]!;
    const uz = pos[ib + 2]! - pos[ia + 2]!;
    const vx = pos[ic]! - pos[ia]!;
    const vy = pos[ic + 1]! - pos[ia + 1]!;
    const vz = pos[ic + 2]! - pos[ia + 2]!;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-18) continue;
    nx /= l;
    ny /= l;
    nz /= l;
    const base = lote.positions.length / 3;
    for (const i of [ia, ib, ic]) {
      lote.positions.push(pos[i]!, pos[i + 1]!, pos[i + 2]!);
      lote.normals.push(nx, ny, nz);
    }
    lote.indices.push(base, base + 1, base + 2);
  }
}
