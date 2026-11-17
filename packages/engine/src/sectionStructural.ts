import { intersection, unionClipper, type MultiPolygon, type Polygon, type Vec2 } from '@hestia/geom';
import { beamProfileParts, beamStripPolygon, columnProfileStrips, type Id, type Project } from '@hestia/model';
import { EPS_T, lineIntervals, rect, sectionFrame, type SectionLine } from './sectionGeom.ts';
import type { SectionBeyond, SectionOrigin } from './section.ts';
import { resolveBeamsOnLevel, resolveColumnsOnLevel, resolveFootingsOnLevel } from './structural.ts';

/** Faixa de elemento estrutural cortada pela linha: material, polígono (t, z) e a origem (pilar, viga ou sapata). */
export interface StructuralCut {
  materialId: Id;
  polygon: Polygon;
  origin: SectionOrigin;
}

export interface StructuralSection {
  cut: StructuralCut[];
  beyond: SectionBeyond[];
  zMin: number;
  zMax: number;
}

function cutRects(
  ring: readonly Vec2[],
  z0: number,
  z1: number,
  line: SectionLine,
  length: number,
  d: Vec2,
  n: Vec2,
): Polygon[] {
  const polys: Polygon[] = [];
  for (const [t0, t1] of lineIntervals([ring as Vec2[]], line.a, d, n)) {
    const lo = Math.max(0, t0);
    const hi = Math.min(length, t1);
    if (hi - lo < EPS_T) continue;
    polys.push([rect(lo, hi, z0, z1)]);
  }
  return polys;
}

function addBeyond(
  ring: readonly Vec2[],
  z0: number,
  z1: number,
  materialId: Id,
  origin: SectionOrigin,
  length: number,
  slab: MultiPolygon,
  along: (v: Vec2) => number,
  dist: (v: Vec2) => number,
  out: StructuralSection,
): void {
  for (const sp of intersection([[ring as Vec2[]]], slab)) {
    const outer = sp[0];
    if (!outer || outer.length < 3) continue;
    const ts = outer.map(along);
    const tMin = Math.max(0, Math.min(...ts));
    const tMax = Math.min(length, Math.max(...ts));
    if (tMax - tMin < EPS_T) continue;
    out.beyond.push({
      ...origin,
      materialId,
      layerIndex: 0,
      depth: Math.max(0, Math.min(...outer.map(dist))),
      polygons: [[rect(tMin, tMax, z0, z1)]],
    });
    out.zMin = Math.min(out.zMin, z0);
    out.zMax = Math.max(out.zMax, z1);
  }
}

function addPrism(
  ring: readonly Vec2[],
  z0: number,
  z1: number,
  materialId: Id,
  origin: SectionOrigin,
  line: SectionLine,
  length: number,
  d: Vec2,
  n: Vec2,
  slab: MultiPolygon,
  along: (v: Vec2) => number,
  dist: (v: Vec2) => number,
  out: StructuralSection,
): void {
  for (const polygon of cutRects(ring, z0, z1, line, length, d, n)) {
    out.cut.push({ materialId, polygon, origin });
    out.zMin = Math.min(out.zMin, z0);
    out.zMax = Math.max(out.zMax, z1);
  }
  addBeyond(ring, z0, z1, materialId, origin, length, slab, along, dist, out);
}

/**
 * Elementos estruturais (pilares, vigas e sapatas) de um nível no corte e na elevação:
 * a faixa cortada pela linha gera polígonos t×z em `cut`, e as partes dentro da profundidade de visão geram `beyond`.
 */
export function sectionOfStructural(p: Project, levelId: Id, line: SectionLine): StructuralSection {
  const { length, d, n, slab } = sectionFrame(line);
  const out: StructuralSection = { cut: [], beyond: [], zMin: Infinity, zMax: -Infinity };
  if (length < 1e-6) return out;

  const along = (v: Vec2): number => (v.x - line.a.x) * d.x + (v.y - line.a.y) * d.y;
  const dist = (v: Vec2): number => (v.x - line.a.x) * n.x + (v.y - line.a.y) * n.y;

  for (const col of resolveColumnsOnLevel(p, levelId)) {
    if (col.type.shape === 'i-section') {
      for (const polygon of cutRects(col.polygon, col.z0, col.z1, line, length, d, n)) {
        out.cut.push({ materialId: col.type.materialId, polygon, origin: { columnId: col.id } });
        out.zMin = Math.min(out.zMin, col.z0);
        out.zMax = Math.max(out.zMax, col.z1);
      }
      for (const strip of columnProfileStrips(col.column, col.type)) {
        addBeyond(strip, col.z0, col.z1, col.type.materialId, { columnId: col.id }, length, slab, along, dist, out);
      }
      continue;
    }
    addPrism(col.polygon, col.z0, col.z1, col.type.materialId, { columnId: col.id }, line, length, d, n, slab, along, dist, out);
  }

  for (const beam of resolveBeamsOnLevel(p, levelId)) {
    const parts = beamProfileParts(beam.beam, beam.type, beam.z0, beam.z1);
    if (parts.length === 1) {
      addPrism(beam.polygon, beam.z0, beam.z1, beam.type.materialId, { beamId: beam.id }, line, length, d, n, slab, along, dist, out);
      continue;
    }
    const cutPolys: Polygon[] = [];
    for (const part of parts) {
      const strip = beamStripPolygon(beam.beam, part.s0, part.s1);
      cutPolys.push(...cutRects(strip, part.z0, part.z1, line, length, d, n));
      addBeyond(strip, part.z0, part.z1, beam.type.materialId, { beamId: beam.id }, length, slab, along, dist, out);
    }
    if (cutPolys.length > 0) {
      const merged: MultiPolygon = cutPolys.length === 1
        ? [cutPolys[0]!]
        : unionClipper(...cutPolys.map((poly): MultiPolygon => [poly]));
      for (const polygon of merged) {
        out.cut.push({ materialId: beam.type.materialId, polygon, origin: { beamId: beam.id } });
      }
      out.zMin = Math.min(out.zMin, beam.z0);
      out.zMax = Math.max(out.zMax, beam.z1);
    }
  }

  for (const foot of resolveFootingsOnLevel(p, levelId)) {
    addPrism(foot.polygon, foot.z0, foot.z1, foot.type.materialId, { footingId: foot.id }, line, length, d, n, slab, along, dist, out);
  }

  return out;
}
