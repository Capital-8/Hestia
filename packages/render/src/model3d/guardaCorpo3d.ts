import type { MalhaGuardaCorpo } from '@hestia/engine';
import type { Id } from '@hestia/model';
import { ofElement, type SolidBatch } from './solids.ts';

/**
 * Sólidos 3D dos guarda-corpos (decisão 0055): a malha vem pronta do kernel (`guarda_malha`, sólidos fechados e orientados para fora) e aqui só vira
 * `SolidBatch` da categoria `railing`, um lote por material, com a faixa de índices de cada guarda-corpo (picking, realce, ocultar e isolar).
 * Normais por face (a malha do Rust compartilha vértices; o sombreado de ferragem pede arestas vivas).
 */
export function buildGuardaCorpoSolids(malhas: readonly MalhaGuardaCorpo[], visivel: (guardaId: Id) => boolean = () => true): SolidBatch[] {
  const porMaterial = new Map<Id, SolidBatch>();
  for (const m of malhas) {
    if (!visivel(m.guardaId)) continue;
    for (const parte of m.partes) {
      let b = porMaterial.get(parte.materialId);
      if (!b) {
        b = { materialId: parte.materialId, category: 'railing', positions: [], normals: [], indices: [], ids: [] };
        porMaterial.set(parte.materialId, b);
      }
      const lote = b;
      ofElement(lote, m.guardaId, () => {
        const pos = parte.positions;
        for (let t = 0; t + 2 < parte.indices.length; t += 3) {
          const ia = parte.indices[t]! * 3;
          const ib = parte.indices[t + 1]! * 3;
          const ic = parte.indices[t + 2]! * 3;
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
      });
    }
  }
  return [...porMaterial.values()];
}
