import { malhaParaMundo, versaoClienteFuro, type CamadaFurada, type ResolvedWall } from '@hestia/engine';
import type { SolidBatch } from './solids.ts';

/**
 * 3D da camada de parede com vão por contorno (troca atômica, docs/estudo-esquadrias/26): a malha furada do cliente entra no
 * lugar da extrusão por faixas com furo retangular. Sombreamento chapado (normal do triângulo), como o resto das paredes.
 */

/** Acrescenta ao lote a malha do cliente (x = u, y = s, z relativo à base) já no mundo. */
function emitirMalha(b: SolidBatch, rw: ResolvedWall, vertices: ArrayLike<number>, indices: ArrayLike<number>): void {
  const mundo = (i: number): [number, number, number] => malhaParaMundo(rw, vertices[i * 3]!, vertices[i * 3 + 1]!, vertices[i * 3 + 2]!);
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const [p, q, r] = [mundo(indices[t]!), mundo(indices[t + 1]!), mundo(indices[t + 2]!)];
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2];
    const vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-18) continue;
    const base = b.positions.length / 3;
    for (const v of [p, q, r]) {
      b.positions.push(v[0], v[1], v[2]);
      b.normals.push(nx / l, ny / l, nz / l);
    }
    b.indices.push(base, base + 1, base + 2);
  }
}

/** Malhas furadas e retornos da camada. No recuo retangular (`malhas` nulo) só os retornos; as faixas o chamador extruda. */
export function emitirCamadaFurada(b: SolidBatch, rw: ResolvedWall, cf: CamadaFurada): void {
  for (const m of cf.malhas ?? []) emitirMalha(b, rw, m.malha.vertices, m.malha.indices);
  for (const r of cf.retornos) emitirMalha(b, rw, r.vertices, r.indices);
}

/** Parte da chave de cache do sólido da camada: os vãos por contorno e a versão do cliente (trocar o cliente invalida). */
export const chaveFuroContorno = (rw: ResolvedWall): string => (rw.furosContorno?.length ? `|fc=${versaoClienteFuro()}:${JSON.stringify(rw.furosContorno)}` : '');
