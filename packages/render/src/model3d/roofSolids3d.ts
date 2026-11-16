import type { Polygon, Vec2 } from '@hestia/geom';
import { planeZ, type ResolvedRoof } from '@hestia/engine';
import type { Id } from '@hestia/model';
import { emendaDaAgua } from './roofEmendas3d.ts';
import { batchOf, extrudeCaps, ofElement, oriented, pushWall, type SolidBatch } from './solids.ts';

/**
 * Sólidos dos telhados (D2): por água e por camada, uma extrusão cujo topo segue o plano da água menos `below` e cuja
 * base está `thickness` abaixo, na vertical. Empenas não entram aqui: a parede ajusta o topo no motor.
 */
export function buildRoofSolids(roofs: ResolvedRoof[]): SolidBatch[] {
  const byMat = new Map<Id, SolidBatch>();
  for (const r of roofs) {
    r.planes.forEach((pl, k) => {
      // As emendas entre águas de mesma cota (facetas de um arco) não levam parede: sem elas, a vista de arestas não
      // desenha um raio em cada lado amostrado.
      const emenda = emendaDaAgua(r, k);
      for (const l of r.layers) {
        if (l.thickness < 1e-6) continue;
        const b = batchOf(byMat, l.materialId, 'roof');
        const topAt = (x: number, y: number): number => planeZ(pl, { x, y }) - l.below;
        const bottomAt = (x: number, y: number): number => topAt(x, y) - l.thickness;
        ofElement(b, r.roofId, () => {
          for (const poly of pl.polygon) extrudeRoofPolygon(b, poly, l.thickness, topAt, bottomAt, emenda);
        });
      }
    });
  }
  return [...byMat.values()];
}

/** Extrusão de uma água por camada (como `extrudePolygon`), sem a parede das emendas com outra água (`emenda`). */
function extrudeRoofPolygon(b: SolidBatch, poly: Polygon, espessura: number, topAt: (x: number, y: number) => number, bottomAt: (x: number, y: number) => number, emenda: (p: Vec2, q: Vec2) => boolean): void {
  if (espessura < 1e-6 || !poly[0]) return;
  extrudeCaps(b, poly, 0, espessura, topAt, bottomAt);
  for (const ring of poly.map((r, i) => oriented(r, i === 0))) {
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!;
      const q = ring[(i + 1) % ring.length]!;
      if (emenda(p, q)) continue;
      pushWall(b, p, q, bottomAt(p.x, p.y), bottomAt(q.x, q.y), topAt(p.x, p.y), topAt(q.x, q.y));
    }
  }
}
