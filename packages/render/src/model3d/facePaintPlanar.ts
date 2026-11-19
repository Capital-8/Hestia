import {
  difference,
  dist,
  intersection,
  multiArea,
  partitionFacePaint,
  ringArea,
  v2,
  type CoplanarFacePiece,
  type MultiPolygon,
  type Polygon,
  type Ring,
  type Vec2,
} from '@hestia/geom';
import {
  faceEntryToArtItems,
  layerPartsOf,
  slabRiseAt,
  unwrapElementFace,
  type JunctionLevel,
  type ResolvedFloor,
  type ResolvedSlab,
} from '@hestia/engine';
import {
  findExactFacePaint,
  findFacePaint,
  isFloor,
  isSlab,
  type FacePaintEntry,
  type FaceSlot,
  type Floor,
  type Id,
  type Project,
  type Slab,
  type SlabSlope,
} from '@hestia/model';
import { appendFaceExtrusionSolids } from './facePaintExtrusions.ts';
import { batchOf, emitFace, extrudeCaps, extrudePolygon, ofElement, pushWall, type SolidBatch } from './solids.ts';

const MIN_AREA = 1e-9;

export interface PartitionedEntry {
  baseMat: Id;
  explicit: CoplanarFacePiece[];
}

function oriented(r: Ring, ccw: boolean): Ring {
  return (ringArea(r) > 0) === ccw ? r : [...r].reverse();
}

function hasArt(entry: FacePaintEntry): boolean {
  return Boolean((entry.regions && entry.regions.length > 0) || (entry.dxfOverlays && entry.dxfOverlays.length > 0));
}

function mapMulti(m: MultiPolygon, fn: (pt: Vec2) => Vec2): MultiPolygon {
  return m.map((pl) => pl.map((r) => r.map(fn)));
}

/** Creates a cached face-paint partition lookup for an element layer. */
export function makePartitionLookup(
  p: Project,
  el: Floor | Slab,
  layerIndex: number,
  fallbackMatId: Id,
  exactBoundaryLayer?: boolean,
): (slot: FaceSlot) => PartitionedEntry | null {
  const cache = new Map<string, PartitionedEntry | null>();
  return (slot: FaceSlot): PartitionedEntry | null => {
    const key = `${slot}|${layerIndex}`;
    if (cache.has(key)) return cache.get(key)!;
    const entry =
      exactBoundaryLayer !== undefined
        ? findExactFacePaint(el.facePaints, slot, layerIndex) ??
          (exactBoundaryLayer ? findExactFacePaint(el.facePaints, slot, 'all') : undefined)
        : findFacePaint(el.facePaints, slot, layerIndex);
    if (!entry) {
      cache.set(key, null);
      return null;
    }
    const baseMat = entry.materialId ?? fallbackMatId;
    if (!hasArt(entry)) {
      const val = { baseMat, explicit: [] };
      cache.set(key, val);
      return val;
    }
    const unwrapped = unwrapElementFace(p, el.id, slot, entry.layer);
    const items = faceEntryToArtItems(entry, unwrapped?.defaultMaterialId ?? fallbackMatId);
    const part = unwrapped ? partitionFacePaint(unwrapped.boundary, baseMat, items) : { coplanar: [], extrusions: [] };
    const val = { baseMat, explicit: part.coplanar.filter((c) => c.materialId !== baseMat) };
    cache.set(key, val);
    return val;
  };
}

function matchPlanarEdge(el: Floor | Slab, p0: Vec2, q0: Vec2): { slot: FaceSlot; origin: Vec2; dir: Vec2 } | null {
  const segLen = dist(p0, q0);
  if (segLen < 1e-6) return null;
  const mid = v2((p0.x + q0.x) / 2, (p0.y + q0.y) / 2);
  const ux = (q0.x - p0.x) / segLen;
  const uy = (q0.y - p0.y) / segLen;
  const rings: Array<{ ringIdx: number; ring: Vec2[] }> = [{ ringIdx: 0, ring: el.boundary }];
  el.holes.forEach((h, idx) => rings.push({ ringIdx: idx + 1, ring: h }));
  for (const { ringIdx, ring } of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const edgeLen = dist(a, b);
      if (edgeLen < 1e-6) continue;
      const ex = (b.x - a.x) / edgeLen;
      const ey = (b.y - a.y) / edgeLen;
      if (Math.abs(ux * ey - uy * ex) > 0.02) continue;
      const proj = (mid.x - a.x) * ex + (mid.y - a.y) * ey;
      if (proj < -0.02 || proj > edgeLen + 0.02) continue;
      if (Math.abs((mid.x - a.x) * ey - (mid.y - a.y) * ex) < 0.02) {
        return { slot: `edge:${ringIdx}:${i}`, origin: a, dir: v2(ex, ey) };
      }
    }
  }
  return null;
}

function emitPlanarCapOnly(
  b: SolidBatch,
  poly: Polygon,
  zVal: number,
  isTop: boolean,
  slopeAt?: (x: number, y: number) => number,
): void {
  const dummy = { ...b, positions: [] as number[], normals: [] as number[], indices: [] as number[], ids: [] };
  extrudeCaps(dummy, poly, isTop ? zVal - 0.01 : zVal, isTop ? zVal : zVal + 0.01, isTop ? slopeAt : undefined, isTop ? undefined : slopeAt);
  const halfIdx = dummy.indices.length / 2;
  const startIdx = isTop ? 0 : halfIdx;
  const endIdx = isTop ? halfIdx : dummy.indices.length;
  const vOff = b.positions.length / 3;
  for (let i = 0; i < dummy.positions.length; i++) {
    b.positions.push(dummy.positions[i]!);
    b.normals.push(dummy.normals[i]!);
  }
  for (let i = startIdx; i < endIdx; i++) b.indices.push(vOff + dummy.indices[i]!);
}

/** Extrudes one resolved floor or slab layer into `byMat` with face paints on top, bottom, and edges. */
export function appendPaintedFloorOrSlabLayer(
  byMat: Map<Id, SolidBatch>,
  el: Floor | Slab,
  l: { layerIndex: number; materialId: Id },
  parts: readonly { poly: MultiPolygon; z0: number; z1: number }[],
  cat: 'floor' | 'slab',
  slope: SlabSlope | null,
  p: Project,
  topLayerIdx: number,
  bottomLayerIdx: number,
  elBottomZ: number,
): void {
  const getTopPart = makePartitionLookup(p, el, l.layerIndex, l.materialId, l.layerIndex === topLayerIdx);
  const getBotPart = makePartitionLookup(p, el, l.layerIndex, l.materialId, l.layerIndex === bottomLayerIdx);
  const getEdgePart = makePartitionLookup(p, el, l.layerIndex, l.materialId);
  const topOrigin = unwrapElementFace(p, el.id, 'top')?.origin2d ?? v2(0, 0);
  const botOrigin = unwrapElementFace(p, el.id, 'bottom')?.origin2d ?? v2(0, 0);

  for (const part of parts) {
    const topAt = slope ? (x: number, y: number): number => part.z1 + slabRiseAt(slope, { x, y }) : undefined;
    const botAt = slope ? (x: number, y: number): number => part.z0 + slabRiseAt(slope, { x, y }) : undefined;
    for (const poly of part.poly) {
      if (part.z1 - part.z0 < 1e-6 || !poly[0]) continue;
      for (const [isTop, capPart, zVal, zAt, origin] of [
        [true, getTopPart('top'), part.z1, topAt, topOrigin],
        [false, getBotPart('bottom'), part.z0, botAt, botOrigin],
      ] as const) {
        if (!capPart || capPart.explicit.length === 0) {
          const b = batchOf(byMat, capPart?.baseMat ?? l.materialId, cat);
          ofElement(b, el.id, () => emitPlanarCapOnly(b, poly, zVal, isTop, zAt));
        } else {
          const polyUV = mapMulti([poly], (pt) => v2(pt.x - origin.x, pt.y - origin.y));
          const covered: MultiPolygon[] = [];
          for (const piece of capPart.explicit) {
            const vis = intersection(polyUV, piece.poly);
            if (multiArea(vis) <= MIN_AREA) continue;
            covered.push(vis);
            const b = batchOf(byMat, piece.materialId, cat);
            const worldM = mapMulti(vis, (uv) => v2(uv.x + origin.x, uv.y + origin.y));
            ofElement(b, el.id, () => worldM.forEach((wp) => emitPlanarCapOnly(b, wp, zVal, isTop, zAt)));
          }
          const rem = covered.length ? difference(polyUV, ...covered) : polyUV;
          if (multiArea(rem) > MIN_AREA) {
            const b = batchOf(byMat, capPart.baseMat, cat);
            const worldM = mapMulti(rem, (uv) => v2(uv.x + origin.x, uv.y + origin.y));
            ofElement(b, el.id, () => worldM.forEach((wp) => emitPlanarCapOnly(b, wp, zVal, isTop, zAt)));
          }
        }
      }

      const zBotFn = (x: number, y: number): number => (botAt ? botAt(x, y) : part.z0);
      const zTopFn = (x: number, y: number): number => (topAt ? topAt(x, y) : part.z1);
      for (const ring of poly.map((r, i) => oriented(r, i === 0))) {
        for (let i = 0; i < ring.length; i++) {
          const p0 = ring[i]!;
          const q0 = ring[(i + 1) % ring.length]!;
          const matched = matchPlanarEdge(el, p0, q0);
          const edgePart = matched ? getEdgePart(matched.slot) : null;
          if (!edgePart || edgePart.explicit.length === 0 || !matched) {
            const b = batchOf(byMat, edgePart?.baseMat ?? l.materialId, cat);
            ofElement(b, el.id, () => pushWall(b, p0, q0, zBotFn(p0.x, p0.y), zBotFn(q0.x, q0.y), zTopFn(p0.x, p0.y), zTopFn(q0.x, q0.y)));
            continue;
          }
          const dx = q0.x - p0.x;
          const dy = q0.y - p0.y;
          const segLen = Math.hypot(dx, dy);
          if (segLen < 1e-9) continue;
          const u0 = (p0.x - matched.origin.x) * matched.dir.x + (p0.y - matched.origin.y) * matched.dir.y;
          const u1 = (q0.x - matched.origin.x) * matched.dir.x + (q0.y - matched.origin.y) * matched.dir.y;
          const v0 = part.z0 - elBottomZ;
          const v1 = part.z1 - elBottomZ;
          const polyUV: MultiPolygon = [[[v2(Math.min(u0, u1), v0), v2(Math.max(u0, u1), v0), v2(Math.max(u0, u1), v1), v2(Math.min(u0, u1), v1)]]];
          const n: [number, number, number] = [dy / segLen, -dx / segLen, 0];
          const to3 = (u: number, v: number): [number, number, number] => {
            const t = Math.abs(u1 - u0) > 1e-9 ? (u - u0) / (u1 - u0) : 0;
            const wx = p0.x + dx * t;
            const wy = p0.y + dy * t;
            return [wx, wy, elBottomZ + v + (slope ? slabRiseAt(slope, { x: wx, y: wy }) : 0)];
          };
          const covered: MultiPolygon[] = [];
          for (const piece of edgePart.explicit) {
            const vis = intersection(polyUV, piece.poly);
            if (multiArea(vis) <= MIN_AREA) continue;
            covered.push(vis);
            const b = batchOf(byMat, piece.materialId, cat);
            ofElement(b, el.id, () => emitFace(b, vis, to3, n));
          }
          const rem = covered.length ? difference(polyUV, ...covered) : polyUV;
          if (multiArea(rem) > MIN_AREA) {
            const b = batchOf(byMat, edgePart.baseMat, cat);
            ofElement(b, el.id, () => emitFace(b, rem, to3, n));
          }
        }
      }
    }
  }
}

/** Builds floor solids (handling painted floors and extrusions) when any floor on the level has face paints. */
export function buildPaintedFloorSolids(floors: ResolvedFloor[], jl: JunctionLevel | undefined, p: Project): SolidBatch[] {
  const byMat = new Map<Id, SolidBatch>();
  for (const f of floors) {
    const el = p.elements[f.floorId];
    const painted = isFloor(el) && Boolean(el.facePaints?.length);
    const nonMem = f.layers.filter((x) => !x.membrane);
    const topIdx = nonMem[0]?.layerIndex ?? 0;
    const botIdx = nonMem[nonMem.length - 1]?.layerIndex ?? 0;
    for (const l of f.layers) {
      if (l.membrane) continue;
      const parts = layerPartsOf(jl?.elements.get(f.floorId), l.layerIndex, [{ poly: l.polygon, z0: l.z0, z1: l.z1 }]);
      if (painted && isFloor(el)) {
        appendPaintedFloorOrSlabLayer(byMat, el, l, parts, 'floor', null, p, topIdx, botIdx, f.bottomZ);
        continue;
      }
      const b = batchOf(byMat, l.materialId, 'floor');
      ofElement(b, f.floorId, () => {
        for (const part of parts) for (const poly of part.poly) extrudePolygon(b, poly, part.z0, part.z1);
      });
    }
  }
  if (floors.length) appendFaceExtrusionSolids(byMat, p, floors[0]!.levelId, new Set(floors.map((x) => x.floorId)));
  return [...byMat.values()];
}

/** Builds slab solids (handling painted slabs and extrusions) when any slab on the level has face paints. */
export function buildPaintedSlabSolids(slabs: ResolvedSlab[], jl: JunctionLevel | undefined, p: Project): SolidBatch[] {
  const byMat = new Map<Id, SolidBatch>();
  for (const s of slabs) {
    const sl = s.slope;
    const el = p.elements[s.slabId];
    const painted = isSlab(el) && Boolean(el.facePaints?.length);
    const nonMem = s.layers.filter((x) => !x.membrane);
    const topIdx = nonMem[0]?.layerIndex ?? 0;
    const botIdx = nonMem[nonMem.length - 1]?.layerIndex ?? 0;
    for (const l of s.layers) {
      if (l.membrane) continue;
      const parts = layerPartsOf(jl?.elements.get(s.slabId), l.layerIndex, [{ poly: l.polygon, z0: l.z0, z1: l.z1 }]);
      if (painted && isSlab(el)) {
        appendPaintedFloorOrSlabLayer(byMat, el, l, parts, 'slab', sl, p, topIdx, botIdx, s.bottomZ);
        continue;
      }
      const b = batchOf(byMat, l.materialId, 'slab');
      ofElement(b, s.slabId, () => {
        for (const part of parts) {
          const topAt = sl ? (x: number, y: number): number => part.z1 + slabRiseAt(sl, { x, y }) : undefined;
          const bottomAt = sl ? (x: number, y: number): number => part.z0 + slabRiseAt(sl, { x, y }) : undefined;
          for (const poly of part.poly) extrudePolygon(b, poly, part.z0, part.z1, topAt, bottomAt);
        }
      });
    }
  }
  if (slabs.length) appendFaceExtrusionSolids(byMat, p, slabs[0]!.levelId, new Set(slabs.map((x) => x.slabId)));
  return [...byMat.values()];
}
