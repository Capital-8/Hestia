import {
  desativarKernel,
  ErroKernelV1,
  ErroNaoImplementado,
  implKernel,
  kernelExigido,
  registrarFalhaKernel,
} from './kernel/contrato.ts';
import { union, intersection, difference } from './operacoesKernel.ts';
import { boxOf, multiArea, multiPoints, orientedRect, ringArea, type MultiPolygon, type Polygon, type Ring } from './polygon.ts';
import { rotate, v2, type Vec2 } from './vec.ts';

export type FaceShape2D =
  | { kind: 'rect'; u0: number; v0: number; u1: number; v1: number }
  | { kind: 'circle'; center: Vec2; radius: number }
  | { kind: 'ellipse'; center: Vec2; rx: number; ry: number; rotation?: number }
  | { kind: 'lineBand' | 'arcBand'; pts: Vec2[]; width: number; closed?: boolean }
  | { kind: 'arch'; u0: number; v0: number; u1: number; v1: number }
  | { kind: 'poly'; rings: Polygon };

export interface SlatsSpec {
  width: number;
  gap: number;
  depth: number;
  angleDeg: number;
  slatMaterialId: string;
  backMaterialId?: string;
}

export interface FaceArtItemInput {
  id: string;
  shape: FaceShape2D;
  materialId: string;
  order: number;
  baseOffset?: number;
  thickness?: number;
  cutMode?: 'clipBelow' | 'overlay';
  slats?: SlatsSpec;
}

export interface CoplanarFacePiece {
  materialId: string;
  poly: MultiPolygon;
  itemId?: string;
}

export interface ExtrudedFacePiece {
  itemId: string;
  materialId: string;
  poly: MultiPolygon;
  baseOffset: number;
  thickness: number;
}

export interface PartitionFaceResult {
  coplanar: CoplanarFacePiece[];
  extrusions: ExtrudedFacePiece[];
}

const MIN_DIM = 1e-6;
const MIN_AREA = 1e-9;

function sampleCircleSegs(radius: number, minSegs: number, maxSegs: number): number {
  const cos = Math.max(0, 1 - 0.001 / Math.max(radius, 1e-3));
  return Math.max(minSegs, Math.min(maxSegs, Math.ceil(Math.PI / Math.acos(cos))));
}

function octagonCap(center: Vec2, radius: number): Ring {
  const ring: Ring = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    ring.push(v2(center.x + radius * Math.cos(a), center.y + radius * Math.sin(a)));
  }
  return ring;
}

function bandToMultiPolygon(pts: readonly Vec2[], width: number, closed: boolean): MultiPolygon {
  if (!Number.isFinite(width) || width <= MIN_DIM || pts.length < 2) return [];
  const halfW = width / 2;
  const parts: MultiPolygon[] = [];
  const usedVerts = new Set<number>();
  const count = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < count; i++) {
    const a = pts[i]!;
    const j = (i + 1) % pts.length;
    const b = pts[j]!;
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segLen = Math.hypot(dx, dy);
    if (!Number.isFinite(segLen) || segLen <= 1e-7) continue;
    const ux = dx / segLen;
    const uy = dy / segLen;
    parts.push([[orientedRect((a.x + b.x) / 2, (a.y + b.y) / 2, ux, uy, segLen / 2, halfW)]]);
    usedVerts.add(i);
    usedVerts.add(j);
  }
  if (parts.length === 0) return [];
  for (const idx of usedVerts) {
    const p = pts[idx]!;
    parts.push([[octagonCap(p, halfW)]]);
  }
  return union(...parts);
}

function archToMultiPolygon(u0: number, v0: number, u1: number, v1: number): MultiPolygon {
  const minU = Math.min(u0, u1);
  const maxU = Math.max(u0, u1);
  const minV = Math.min(v0, v1);
  const maxV = Math.max(v0, v1);
  if (![minU, maxU, minV, maxV].every(Number.isFinite)) return [];
  const w = maxU - minU;
  const h = maxV - minV;
  if (w <= MIN_DIM || h <= MIN_DIM) return [];
  const r = w / 2;
  const cx = (minU + maxU) / 2;
  const segs = Math.max(16, Math.min(90, Math.ceil(sampleCircleSegs(r, 32, 180) / 2)));
  const ring: Ring = [];
  if (h > r + 1e-7) {
    const vTop = maxV - r;
    ring.push(v2(minU, minV), v2(maxU, minV));
    for (let i = 0; i <= segs; i++) {
      const a = (Math.PI * i) / segs;
      ring.push(v2(cx + r * Math.cos(a), vTop + r * Math.sin(a)));
    }
  } else {
    const vCenter = maxV - r;
    const sinMin = Math.max(0, Math.min(1, (minV - vCenter) / r));
    const a0 = Math.asin(sinMin);
    const a1 = Math.PI - a0;
    const steps = Math.max(8, Math.ceil((segs * (a1 - a0)) / Math.PI));
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      ring.push(v2(cx + r * Math.cos(a), vCenter + r * Math.sin(a)));
    }
  }
  return multiArea([[ring]]) > MIN_AREA ? [[ring]] : [];
}

/** Converts a 2D face shape into a MultiPolygon in face (u, v) coordinates. */
export function shapeToMultiPolygon(shape: FaceShape2D): MultiPolygon {
  switch (shape.kind) {
    case 'rect': {
      const minU = Math.min(shape.u0, shape.u1);
      const maxU = Math.max(shape.u0, shape.u1);
      const minV = Math.min(shape.v0, shape.v1);
      const maxV = Math.max(shape.v0, shape.v1);
      if (![minU, maxU, minV, maxV].every(Number.isFinite)) return [];
      if (maxU - minU <= MIN_DIM || maxV - minV <= MIN_DIM) return [];
      return [[[v2(minU, minV), v2(maxU, minV), v2(maxU, maxV), v2(minU, maxV)]]];
    }
    case 'circle': {
      const { center, radius } = shape;
      if (!Number.isFinite(center.x) || !Number.isFinite(center.y) || !Number.isFinite(radius) || radius <= MIN_DIM) {
        return [];
      }
      const n = sampleCircleSegs(radius, 24, 180);
      const ring: Ring = [];
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n;
        ring.push(v2(center.x + radius * Math.cos(a), center.y + radius * Math.sin(a)));
      }
      return [[ring]];
    }
    case 'ellipse': {
      const { center, rx, ry, rotation = 0 } = shape;
      if (![center.x, center.y, rx, ry, rotation].every(Number.isFinite) || rx <= MIN_DIM || ry <= MIN_DIM) {
        return [];
      }
      const n = sampleCircleSegs(Math.max(rx, ry), 48, 120);
      const c = Math.cos(rotation);
      const s = Math.sin(rotation);
      const ring: Ring = [];
      for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / n;
        const lx = rx * Math.cos(a);
        const ly = ry * Math.sin(a);
        ring.push(v2(center.x + lx * c - ly * s, center.y + lx * s + ly * c));
      }
      return [[ring]];
    }
    case 'arch':
      return archToMultiPolygon(shape.u0, shape.v0, shape.u1, shape.v1);
    case 'lineBand':
    case 'arcBand':
      return bandToMultiPolygon(shape.pts, shape.width, shape.closed ?? false);
    case 'poly': {
      const { rings } = shape;
      if (!rings || rings.length === 0 || rings[0]!.length < 3) return [];
      const outer = rings[0]!;
      if (!outer.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) return [];
      if (Math.abs(ringArea(outer)) <= MIN_AREA) return [];
      const holes = rings.slice(1).filter((r) => r.length >= 3 && r.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
      const poly: Polygon = [outer, ...holes];
      return multiArea([poly]) > MIN_AREA ? [poly] : [];
    }
  }
}

/** Generates parallel slat strips clipped to the given 2D region. */
export function generateSlatStrips(regionPoly: MultiPolygon, slats: SlatsSpec): MultiPolygon[] {
  if (
    regionPoly.length === 0 ||
    !Number.isFinite(slats.width) ||
    !Number.isFinite(slats.gap) ||
    !Number.isFinite(slats.angleDeg) ||
    slats.width <= MIN_DIM ||
    slats.gap < 0
  ) {
    return [];
  }
  const pts = multiPoints(regionPoly);
  if (pts.length === 0) return [];
  const box = boxOf(pts);
  if (!Number.isFinite(box.minX)) return [];

  const k = implKernel();
  if (k?.ripas) {
    try {
      return k.ripas(regionPoly, slats.width, slats.gap, slats.angleDeg);
    } catch (e) {
      const texto = e instanceof Error ? e.message : String(e);
      if (kernelExigido()) {
        if (!(e instanceof ErroNaoImplementado)) {
          registrarFalhaKernel();
          desativarKernel(`falha em ripas: ${texto}`);
        }
        throw e instanceof ErroKernelV1 ? e : new ErroKernelV1('ripas', texto);
      }
      if (!(e instanceof ErroNaoImplementado)) {
        registrarFalhaKernel();
        desativarKernel(`falha em ripas: ${texto}`);
      }
    }
  }

  const pitch = slats.width + slats.gap;
  const rad = (slats.angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const px = -dy;
  const py = dx;

  const corners = [
    v2(box.minX, box.minY),
    v2(box.maxX, box.minY),
    v2(box.maxX, box.maxY),
    v2(box.minX, box.maxY),
  ];
  let pMin = Infinity;
  let pMax = -Infinity;
  let dMin = Infinity;
  let dMax = -Infinity;
  for (const c of corners) {
    const pv = c.x * px + c.y * py;
    const dv = c.x * dx + c.y * dy;
    if (pv < pMin) pMin = pv;
    if (pv > pMax) pMax = pv;
    if (dv < dMin) dMin = dv;
    if (dv > dMax) dMax = dv;
  }

  const dMid = (dMin + dMax) / 2;
  const halfAlong = (dMax - dMin) / 2 + 1;
  const halfAcross = slats.width / 2;
  const kStart = Math.floor(pMin / pitch) - 1;
  const kEnd = Math.ceil(pMax / pitch) + 1;

  const strips: MultiPolygon[] = [];
  for (let k = kStart; k <= kEnd; k++) {
    const pCenter = k * pitch;
    const cx = dMid * dx + pCenter * px;
    const cy = dMid * dy + pCenter * py;
    const stripRing = orientedRect(cx, cy, dx, dy, halfAlong, halfAcross);
    const clippedStrip = intersection(regionPoly, [[stripRing]]);
    if (multiArea(clippedStrip) > MIN_AREA) strips.push(clippedStrip);
  }
  return strips;
}

interface OccupiedExtrusion {
  lo: number;
  hi: number;
  poly: MultiPolygon;
}

/** Partitions a 2D face into non-overlapping coplanar pieces and clipped 3D extrusion pieces. */
export function partitionFacePaint(
  facePoly: MultiPolygon,
  baseMaterialId: string,
  items: readonly FaceArtItemInput[],
): PartitionFaceResult {
  if (facePoly.length === 0 || multiArea(facePoly) <= MIN_AREA) {
    return { coplanar: [], extrusions: [] };
  }

  const sorted = [...items].sort((a, b) => b.order - a.order);
  const shapes = new Map<string, MultiPolygon>();
  for (const item of sorted) {
    shapes.set(item.id, shapeToMultiPolygon(item.shape));
  }

  const coplanar: CoplanarFacePiece[] = [];
  let remaining = facePoly;

  for (const item of sorted) {
    const poly = shapes.get(item.id) ?? [];
    if (poly.length === 0) continue;
    const hasThickness = Boolean(item.thickness && Math.abs(item.thickness) > MIN_DIM);
    if (!hasThickness && !item.slats) {
      const vis = intersection(remaining, poly);
      if (multiArea(vis) > MIN_AREA) {
        coplanar.push({ materialId: item.materialId, poly: vis, itemId: item.id });
        remaining = difference(remaining, poly);
      }
    } else if (item.slats?.backMaterialId) {
      const backPoly = intersection(remaining, poly);
      if (multiArea(backPoly) > MIN_AREA) {
        coplanar.push({ materialId: item.slats.backMaterialId, poly: backPoly, itemId: item.id });
        remaining = difference(remaining, poly);
      }
    }
  }

  if (multiArea(remaining) > MIN_AREA) {
    coplanar.push({ materialId: baseMaterialId, poly: remaining });
  }

  const extrusions: ExtrudedFacePiece[] = [];
  const occupied: OccupiedExtrusion[] = [];

  for (const item of sorted) {
    const thickness = item.slats ? item.slats.depth : (item.thickness ?? 0);
    if (!item.slats && Math.abs(thickness) <= MIN_DIM) continue;
    if (item.slats && Math.abs(thickness) <= MIN_DIM) continue;

    const shapePoly = shapes.get(item.id) ?? [];
    if (shapePoly.length === 0) continue;

    const clipped = intersection(facePoly, shapePoly);
    if (multiArea(clipped) <= MIN_AREA) continue;

    const baseOffset = item.baseOffset ?? 0;
    const w0 = baseOffset;
    const w1 = baseOffset + thickness;
    const lo = Math.min(w0, w1);
    const hi = Math.max(w0, w1);

    let resolvedPoly = clipped;
    if (item.cutMode !== 'overlay') {
      const blockers = occupied.filter((occ) => Math.min(occ.hi, hi) - Math.max(occ.lo, lo) > MIN_DIM).map((occ) => occ.poly);
      if (blockers.length > 0) {
        resolvedPoly = difference(resolvedPoly, ...blockers);
      }
    }

    if (multiArea(resolvedPoly) <= MIN_AREA) continue;
    occupied.push({ lo, hi, poly: resolvedPoly });

    if (item.slats) {
      const strips = generateSlatStrips(resolvedPoly, item.slats);
      for (const stripPoly of strips) {
        extrusions.push({
          itemId: item.id,
          materialId: item.slats.slatMaterialId,
          poly: stripPoly,
          baseOffset,
          thickness,
        });
      }
    } else {
      extrusions.push({
        itemId: item.id,
        materialId: item.materialId,
        poly: resolvedPoly,
        baseOffset,
        thickness,
      });
    }
  }

  return { coplanar, extrusions };
}

/** Minimum gap required between slats on a concave curved face to prevent front-edge collision. */
export function concaveSlatMinGap(radius: number, slatWidth: number, depth: number): number {
  if (!Number.isFinite(slatWidth) || !Number.isFinite(depth) || Number.isNaN(radius)) return 0;
  if (depth <= 0 || slatWidth <= 0) return 0;
  if (radius <= depth + MIN_DIM) return Infinity;
  return Math.max(0, (slatWidth * depth) / (radius - depth));
}

/** Scales, rotates (degrees CCW), and translates DXF paths in face (u, v) coordinates. */
export function transformDxfPaths(
  paths: readonly { pts: Vec2[]; closed: boolean }[],
  offset: Vec2,
  rotationDeg: number,
  scale: number,
): Array<{ pts: Vec2[]; closed: boolean }> {
  const rad = (rotationDeg * Math.PI) / 180;
  return paths.map((path) => ({
    closed: path.closed,
    pts: path.pts.map((p) => {
      const scaled = v2(p.x * scale, p.y * scale);
      const rotated = rotationDeg !== 0 ? rotate(scaled, rad) : scaled;
      return v2(rotated.x + offset.x, rotated.y + offset.y);
    }),
  }));
}
