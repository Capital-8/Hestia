import type { MalhaGuardaCorpo } from '@hestia/engine';
import type { Id } from '@hestia/model';
import { acrescentarTriangulosFaceados } from './malhaFacetada3d.ts';
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
      ofElement(lote, m.guardaId, () => acrescentarTriangulosFaceados(lote, parte.positions, parte.indices));
    }
  }
  return [...porMaterial.values()];
}
