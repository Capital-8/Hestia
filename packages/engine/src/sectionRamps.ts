import { intersection, type Polygon, type Ring, type Vec2 } from '@hestia/geom';
import type { Id, Project } from '@hestia/model';
import { planeZ, rampBody, type RampBodyPiece } from './rampBody.ts';
import type { ResolvedRamp } from './ramps.ts';
import type { SectionBeyond } from './section.ts';
import { EPS_T, lineIntervals, sectionFrame, type SectionLine } from './sectionGeom.ts';
import { prismSnapRings, type SectionSnapRing } from './sectionSnapRings.ts';
import { convexHull } from './sectionStairs.ts';

/**
 * Rampas no corte e na elevação. Cada peça de `rampBody` (lance com topo e fundo inclinados; patamar plano) vira, no
 * plano de corte, um quadrilátero sobre o intervalo que a linha atravessa, com `zTop` e `zBot` pelo plano em cada ponta.
 * Além do plano, a projeção convexa dos vértices (topo e fundo), como nas escadas monolíticas.
 */
export interface RampSection {
  /** Corte por rampa: material do tipo e a rampa de origem (`rampId`). */
  cut: Array<{ materialId: Id; polygon: Polygon; rampId: Id }>;
  beyond: SectionBeyond[];
  /** Aneis (t, z) antes da envoltoria, so para captura (snap). */
  snapRings: SectionSnapRing[];
  /** Cotas extremas (Infinity/−Infinity sem rampa na linha). */
  zMin: number;
  zMax: number;
}

/** Cota do topo e do fundo da peça no ponto `v`. */
const topAt = (piece: RampBodyPiece, v: Vec2): number => planeZ(piece.top, v.x, v.y);
const bottomAt = (piece: RampBodyPiece, v: Vec2): number => planeZ(piece.bottom, v.x, v.y);

/** Corte e projeção das rampas do nível para a linha de corte (ou de elevação, com `depth` grande). */
export function sectionOfRamps(ramps: ResolvedRamp[], line: SectionLine, _p: Project): RampSection {
  const out: RampSection = { cut: [], beyond: [], snapRings: [], zMin: Infinity, zMax: -Infinity };
  const { length, d, n, slab } = sectionFrame(line);
  if (length < 1e-6 || ramps.length === 0) return out;
  const along = (v: Vec2): number => (v.x - line.a.x) * d.x + (v.y - line.a.y) * d.y;
  const dist2 = (v: Vec2): number => (v.x - line.a.x) * n.x + (v.y - line.a.y) * n.y;
  const at = (t: number): Vec2 => ({ x: line.a.x + d.x * t, y: line.a.y + d.y * t });
  const grow = (z0: number, z1: number): void => {
    out.zMin = Math.min(out.zMin, z0);
    out.zMax = Math.max(out.zMax, z1);
  };

  for (const rr of ramps) {
    const materialId = rr.type.materialId;
    for (const piece of rampBody(rr).pieces) {
      for (const [t0, t1] of lineIntervals([piece.polygon], line.a, d, n)) {
        const lo = Math.max(0, t0);
        const hi = Math.min(length, t1);
        if (hi - lo < EPS_T) continue;
        const b0 = bottomAt(piece, at(lo));
        const b1 = bottomAt(piece, at(hi));
        const u0 = topAt(piece, at(lo));
        const u1 = topAt(piece, at(hi));
        const ring: Ring = [
          { x: lo, y: b0 },
          { x: hi, y: b1 },
          { x: hi, y: u1 },
          { x: lo, y: u0 },
        ];
        out.cut.push({ materialId, polygon: [ring], rampId: rr.id });
        out.snapRings.push({ hostId: rr.id, ring });
        grow(Math.min(b0, b1, u0, u1), Math.max(b0, b1, u0, u1));
      }
      for (const sp of intersection([[piece.polygon]], slab)) {
        const outer = sp[0];
        if (!outer || outer.length < 3) continue;
        const ts = outer.map(along);
        const tMin = Math.max(0, Math.min(...ts));
        const tMax = Math.min(length, Math.max(...ts));
        if (tMax - tMin < EPS_T) continue;
        const pts: Vec2[] = outer.flatMap((v) => [
          { x: along(v), y: topAt(piece, v) },
          { x: along(v), y: bottomAt(piece, v) },
        ]);
        const hull = convexHull(pts);
        if (hull.length < 3) continue;
        out.snapRings.push(...prismSnapRings(rr.id, outer, along, (v) => topAt(piece, v), (v) => bottomAt(piece, v)));
        out.beyond.push({
          rampId: rr.id,
          materialId,
          layerIndex: 0,
          depth: Math.max(0, Math.min(...outer.map(dist2))),
          polygons: [[hull]],
        });
        grow(Math.min(...pts.map((q) => q.y)), Math.max(...pts.map((q) => q.y)));
      }
    }
  }
  return out;
}
