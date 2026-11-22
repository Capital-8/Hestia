import { ringArea, type Ring } from '@hestia/geom';
import { rampBody, type RampPlane, type ResolvedRamp } from '@hestia/engine';
import type { Id } from '@hestia/model';
import { batchOf, extrudeCaps, ofElement, pushWall, type SolidBatch } from './solids.ts';

/** Cota do plano da rampa no ponto (x, y): `z = a·x + b·y + c`. */
const planeZ = (pl: RampPlane, x: number, y: number): number => pl.a * x + pl.b * y + pl.c;

/** Anel no sentido anti-horário (interior à esquerda), para a normal de cada aresta apontar para fora. */
const counterClockwise = (r: Ring): Ring => (ringArea(r) > 0 ? r : [...r].reverse());

/**
 * Sólidos das rampas (3D): um lote por material do tipo, com a categoria própria `ramp` (ocultar a escada não oculta a
 * rampa; adendo 2 do ADR 0060). Cada peça de `rampBody` (lance com topo inclinado e fundo paralelo; patamar plano) é um
 * prisma entre os dois planos; as paredes saem das arestas do anel anti-horário. Rampa com erro não gera malha.
 */
export function buildRampSolids(ramps: ResolvedRamp[]): SolidBatch[] {
  const byMat = new Map<Id, SolidBatch>();
  for (const rr of ramps) {
    const { pieces } = rampBody(rr);
    for (const piece of pieces) {
      const b = batchOf(byMat, rr.type.materialId, 'ramp');
      const topAt = (x: number, y: number): number => planeZ(piece.top, x, y);
      const bottomAt = (x: number, y: number): number => planeZ(piece.bottom, x, y);
      ofElement(b, rr.id, () => {
        extrudeCaps(b, [piece.polygon], 0, 0, topAt, bottomAt);
        const ring = counterClockwise(piece.polygon);
        for (let i = 0; i < ring.length; i++) {
          const p = ring[i]!;
          const q = ring[(i + 1) % ring.length]!;
          pushWall(b, p, q, bottomAt(p.x, p.y), bottomAt(q.x, q.y), topAt(p.x, p.y), topAt(q.x, q.y));
        }
      });
    }
  }
  return [...byMat.values()];
}
