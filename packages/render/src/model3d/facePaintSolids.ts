import {
  boxOf,
  difference,
  intersection,
  multiArea,
  multiPoints,
  partitionFacePaint,
  ringArea,
  union,
  v2,
  type CoplanarFacePiece,
  type MultiPolygon,
  type Ring,
  type Vec2,
} from '@hestia/geom';
import {
  bandTopAt,
  faceEntryToArtItems,
  frameOfWall,
  fuseBands,
  normalAt,
  openingGeometry,
  toLocal,
  unwrapElementFace,
  wallLayerBandsAfterJunction,
  type JunctionLevel,
  type LayerBand,
  type ResolvedLevel,
  type ResolvedWall,
  type WallFrame,
} from '@hestia/engine';
import {
  findFacePaint,
  isFacePaintableElement,
  isWall,
  openingsOfWall,
  totalThickness,
  wallType,
  type FacePaintEntry,
  type FaceSlot,
  type GraphicsCategory,
  type Id,
  type Project,
  type Wall,
  type WallFaceSlot,
} from '@hestia/model';
import { appendFaceExtrusionSolids } from './facePaintExtrusions.ts';
import { weldBands } from './layerTopology.ts';
import { appendSolid, batchOf, emitFace, ofElement, wallLayerSolid, type LevelSolids, type SolidBatch } from './solids.ts';

const LINE_EPS = 3e-7;
const Z_EPS = 1e-9;
const MIN_AREA = 1e-9;

interface PlanLine {
  m: Vec2;
  c: number;
  plus: MultiPolygon[];
  minus: MultiPolygon[];
}

interface PartitionedEntry {
  baseMat: Id;
  explicit: CoplanarFacePiece[];
}

function oriented(r: Ring, ccw: boolean): Ring {
  return (ringArea(r) > 0) === ccw ? r : [...r].reverse();
}

function unionAll(ms: MultiPolygon[]): MultiPolygon {
  const parts = ms.filter((m) => m.length > 0);
  if (parts.length === 0) return [];
  return parts.length === 1 ? parts[0]! : union(...parts);
}

function hasArt(entry: FacePaintEntry): boolean {
  return Boolean((entry.regions && entry.regions.length > 0) || (entry.dxfOverlays && entry.dxfOverlays.length > 0));
}

function mapMulti(m: MultiPolygon, fn: (pt: Vec2) => Vec2): MultiPolygon {
  return m.map((pl) => pl.map((r) => r.map(fn)));
}

/** Checks whether any element in `ids` has at least one `FacePaintEntry`. */
export function hasFacePaintIn(p: Project | undefined, ids: readonly Id[]): boolean {
  if (!p) return false;
  for (const id of ids) {
    const el = p.elements[id];
    if (isFacePaintableElement(el) && el.facePaints?.length) return true;
  }
  return false;
}

/** Fast-path lookup for a single `(elementId, face, layerIndex)` material override. */
export function faceSlotMaterialOverride(
  p: Project | undefined,
  elementId: Id,
  face: FaceSlot,
  layerIndex: number,
  defaultMaterialId: Id,
): Id {
  const el = p?.elements[elementId];
  if (!isFacePaintableElement(el) || !el.facePaints?.length) return defaultMaterialId;
  return findFacePaint(el.facePaints, face, layerIndex)?.materialId ?? defaultMaterialId;
}

/** Cache key suffix for `wallLayerKey` when a wall has face paints. */
export function facePaintWallKey(p: Project | undefined, wallId: Id): string {
  const el = p?.elements[wallId];
  if (!isWall(el) || !el.facePaints?.length) return '';
  return `|fp:${JSON.stringify(el.facePaints)}`;
}

function makeWallPartitionLookup(
  p: Project,
  w: Wall,
  layerIndex: number,
  fallbackMatId: Id,
): (slot: FaceSlot) => PartitionedEntry | null {
  const cache = new Map<string, PartitionedEntry | null>();
  return (slot: FaceSlot): PartitionedEntry | null => {
    const key = `${slot}|${layerIndex}`;
    if (cache.has(key)) return cache.get(key)!;
    const entry = findFacePaint(w.facePaints, slot, layerIndex);
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
    const unwrapped = unwrapElementFace(p, w.id, slot, entry.layer);
    const items = faceEntryToArtItems(entry, unwrapped?.defaultMaterialId ?? fallbackMatId);
    const part = unwrapped ? partitionFacePaint(unwrapped.boundary, baseMat, items) : { coplanar: [], extrusions: [] };
    const val = { baseMat, explicit: part.coplanar.filter((c) => c.materialId !== baseMat) };
    cache.set(key, val);
    return val;
  };
}

function classifyWallLateralSlot(
  p: Project,
  w: Wall,
  f: WallFrame,
  baseZ: number,
  ln: PlanLine,
  nx: number,
  ny: number,
  polySZ: MultiPolygon,
): WallFaceSlot | null {
  const pts = multiPoints(polySZ);
  if (pts.length === 0) return null;
  const box = boxOf(pts);
  const sMid = (box.minX + box.maxX) / 2;
  const zMid = (box.minY + box.maxY) / 2;
  const d: Vec2 = { x: -ln.m.y, y: ln.m.x };
  const loc = toLocal(f, v2(ln.c * ln.m.x + sMid * d.x, ln.c * ln.m.y + sMid * d.y));
  const normAtT = normalAt(f, loc.t);
  const dotExt = (nx * normAtT.x + ny * normAtT.y) * f.sign;
  if (dotExt > 0.9 && Math.abs(loc.s - f.sExt) < 0.03) return 'sideExt';
  if (dotExt < -0.9 && Math.abs(loc.s - f.sInt) < 0.03) return 'sideInt';
  if (!f.arc) {
    const dotU = nx * f.u.x + ny * f.u.y;
    if (dotU < -0.95 && Math.abs(loc.t) < 0.05) return 'endA';
    if (dotU > 0.95 && Math.abs(loc.t - f.length) < 0.05) return 'endB';
    if (Math.abs(dotU) > 0.95 && w.facePaints?.some((e) => e.face.startsWith('opening:'))) {
      for (const o of openingsOfWall(p, w.id)) {
        const g = openingGeometry(p, o, f);
        if (zMid < baseZ + g.sill - 0.01 || zMid > baseZ + g.sill + g.roughHeight + 0.01) continue;
        if (dotU > 0.95 && Math.abs(loc.t - (o.offset - g.roughWidth / 2)) < 0.03) return `opening:${o.id}:jambLeft`;
        if (dotU < -0.95 && Math.abs(loc.t - (o.offset + g.roughWidth / 2)) < 0.03) return `opening:${o.id}:jambRight`;
      }
    }
  }
  return null;
}

function classifyWallCapSlot(
  p: Project,
  w: Wall,
  f: WallFrame,
  baseZ: number,
  zVal: number,
  isTop: boolean,
  polyXY: MultiPolygon,
): WallFaceSlot {
  if (w.facePaints?.some((e) => e.face.startsWith('opening:'))) {
    const pts = multiPoints(polyXY);
    if (pts.length > 0) {
      const box = boxOf(pts);
      const midLoc = toLocal(f, v2((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2));
      for (const o of openingsOfWall(p, w.id)) {
        const g = openingGeometry(p, o, f);
        if (Math.abs(midLoc.t - o.offset) > g.roughWidth / 2 + 0.02) continue;
        if (isTop && Math.abs(zVal - (baseZ + g.sill)) < 0.015) return `opening:${o.id}:sill`;
        if (!isTop && Math.abs(zVal - (baseZ + g.sill + g.roughHeight)) < 0.015) return `opening:${o.id}:head`;
      }
    }
  }
  return isTop ? 'top' : 'bottom';
}

function emitPartitioned2D(
  byMat: Map<Id, SolidBatch>,
  wallId: Id,
  cat: GraphicsCategory,
  polyUV: MultiPolygon,
  part: PartitionedEntry,
  uvToLocal: (uv: Vec2) => Vec2,
  to3: (x: number, y: number) => [number, number, number],
  normal: [number, number, number],
): void {
  if (polyUV.length === 0) return;
  const covered: MultiPolygon[] = [];
  for (const piece of part.explicit) {
    const vis = intersection(polyUV, piece.poly);
    if (multiArea(vis) <= MIN_AREA) continue;
    covered.push(vis);
    const b = batchOf(byMat, piece.materialId, cat);
    ofElement(b, wallId, () => emitFace(b, mapMulti(vis, uvToLocal), to3, normal));
  }
  const rem = covered.length > 0 ? difference(polyUV, ...covered) : polyUV;
  if (multiArea(rem) > MIN_AREA) {
    const b = batchOf(byMat, part.baseMat, cat);
    ofElement(b, wallId, () => emitFace(b, mapMulti(rem, uvToLocal), to3, normal));
  }
}

function collectBandLines(
  poly: MultiPolygon,
  z0: number,
  zTop: (x: number, y: number) => number,
  lines: PlanLine[],
): void {
  for (const pl of poly) {
    for (const ring of pl.map((r, i) => oriented(r, i === 0))) {
      for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const L = Math.hypot(dx, dy);
        if (L < 1e-9) continue;
        let nx = dy / L;
        let ny = -dx / L;
        let plus = true;
        if (nx < -1e-12 || (Math.abs(nx) <= 1e-12 && ny < 0)) {
          nx = -nx;
          ny = -ny;
          plus = false;
        }
        const m: Vec2 = { x: nx, y: ny };
        const c = nx * p.x + ny * p.y;
        let ln = lines.find(
          (l) =>
            Math.abs(l.m.x * ny - l.m.y * nx) < LINE_EPS &&
            Math.abs(l.m.x * p.x + l.m.y * p.y - l.c) < LINE_EPS &&
            Math.abs(l.m.x * q.x + l.m.y * q.y - l.c) < LINE_EPS,
        );
        if (!ln) {
          ln = { m, c, plus: [], minus: [] };
          lines.push(ln);
        }
        const sp = -ln.m.y * p.x + ln.m.x * p.y;
        const sq = -ln.m.y * q.x + ln.m.x * q.y;
        const tp = zTop(p.x, p.y);
        const tq = zTop(q.x, q.y);
        const [sLo, sHi, tLo, tHi] = sp <= sq ? [sp, sq, tp, tq] : [sq, sp, tq, tp];
        if (sHi - sLo < 1e-9 || (tLo - z0 < Z_EPS && tHi - z0 < Z_EPS)) continue;
        const ring2: Ring = [
          { x: sLo, y: z0 },
          { x: sHi, y: z0 },
          { x: sHi, y: tHi },
          { x: sLo, y: tLo },
        ];
        (plus ? ln.plus : ln.minus).push([[ring2]]);
      }
    }
  }
}

/** Extrudes one resolved wall layer into `byMat` with coplanar face paint splitting and zero z-fighting. */
export function appendPaintedWallLayer(
  byMat: Map<Id, SolidBatch>,
  rw: ResolvedWall,
  l: ResolvedWall['layers'][number],
  p: Project,
  jl?: JunctionLevel,
): void {
  const w = p.elements[rw.wallId];
  const f = isWall(w) ? frameOfWall(p, w.id) : null;
  if (!isWall(w) || !f || !w.facePaints?.length) return;

  const bands = fuseBands(wallLayerBandsAfterJunction(jl, rw, l));
  const cleaned = weldBands(weldBands(bands).map((b) => ({ ...b, poly: union(b.poly) })));
  const flat = cleaned.filter((b) => !b.slope);
  const zsFlat: number[] = [];
  for (const b of flat) for (const z of [b.z0, b.z1]) if (!zsFlat.some((q) => Math.abs(q - z) < Z_EPS)) zsFlat.push(z);
  zsFlat.sort((x, y) => x - y);
  const slabs: LayerBand[] = [];
  for (let k = 0; k + 1 < zsFlat.length; k++) {
    const za = zsFlat[k]!;
    const zb = zsFlat[k + 1]!;
    const poly = unionAll(flat.filter((b) => b.z0 <= za + Z_EPS && b.z1 >= zb - Z_EPS).map((b) => b.poly));
    if (poly.length) slabs.push({ z0: za, z1: zb, poly });
  }

  const lines: PlanLine[] = [];
  const flatTops: Array<{ z: number; poly: MultiPolygon }> = [];
  const bottoms: Array<{ z: number; poly: MultiPolygon }> = [];
  const zs: number[] = [];
  const addZ = (z: number): void => {
    if (!zs.some((q) => Math.abs(q - z) < Z_EPS)) zs.push(z);
  };
  const getPartition = makeWallPartitionLookup(p, w, l.layerIndex, l.materialId);
  const emitSimple = (mat: Id, poly: MultiPolygon, to3: (u: number, v: number) => [number, number, number], n: [number, number, number]): void => {
    if (poly.length === 0) return;
    const b = batchOf(byMat, mat, 'wall');
    ofElement(b, rw.wallId, () => emitFace(b, poly, to3, n));
  };

  for (const band of [...slabs, ...cleaned.filter((b) => b.slope)]) {
    if (band.poly.length === 0) continue;
    const z0 = rw.baseZ + band.z0;
    const flatTop = rw.baseZ + band.z1;
    const slope = band.slope;
    const zTop = (x: number, y: number): number => (slope ? rw.baseZ + bandTopAt(band, { x, y }) : flatTop);
    bottoms.push({ z: z0, poly: band.poly });
    addZ(z0);
    if (slope) {
      const k = (slope.h1 - slope.h0) / (slope.t1 - slope.t0);
      const gx = k * slope.d.x;
      const gy = k * slope.d.y;
      const len = Math.hypot(gx, gy, 1);
      emitSimple(getPartition('top')?.baseMat ?? l.materialId, band.poly, (x, y) => [x, y, zTop(x, y)], [-gx / len, -gy / len, 1 / len]);
    } else {
      flatTops.push({ z: flatTop, poly: band.poly });
      addZ(flatTop);
    }
    collectBandLines(band.poly, z0, zTop, lines);
  }

  const thick = totalThickness(wallType(p, w));
  for (const ln of lines) {
    const pl = unionAll(ln.plus);
    const mi = unionAll(ln.minus);
    const d: Vec2 = { x: -ln.m.y, y: ln.m.x };
    const to3 = (s: number, z: number): [number, number, number] => [ln.c * ln.m.x + s * d.x, ln.c * ln.m.y + s * d.y, z];
    const emitSide = (polySZ: MultiPolygon, sgn: 1 | -1): void => {
      if (polySZ.length === 0) return;
      const n: [number, number, number] = [ln.m.x * sgn, ln.m.y * sgn, 0];
      const slot = classifyWallLateralSlot(p, w, f, rw.baseZ, ln, n[0], n[1], polySZ);
      const part = slot ? getPartition(slot) : null;
      if (!part || part.explicit.length === 0) return emitSimple(part?.baseMat ?? l.materialId, polySZ, to3, n);
      const pts = multiPoints(polySZ);
      if (pts.length === 0) return;
      const box = boxOf(pts);
      const sMin = box.minX;
      const sMax = box.maxX;
      if (sMax - sMin < 1e-9) return emitSimple(part.baseMat, polySZ, to3, n);
      const pA = v2(ln.c * ln.m.x + sMin * d.x, ln.c * ln.m.y + sMin * d.y);
      const pB = v2(ln.c * ln.m.x + sMax * d.x, ln.c * ln.m.y + sMax * d.y);
      let uA: number;
      let uB: number;
      if (slot === 'sideExt' || slot === 'sideInt') {
        const sFace = slot === 'sideExt' ? f.sExt : f.sInt;
        const scaleU = f.arc ? Math.max(0.01, f.arc.radius + f.arc.k * sFace) / f.arc.radius : 1;
        uA = toLocal(f, pA).t * scaleU;
        uB = toLocal(f, pB).t * scaleU;
      } else {
        uA = Math.min(thick, Math.max(0, f.extOffset - f.sign * toLocal(f, pA).s));
        uB = Math.min(thick, Math.max(0, f.extOffset - f.sign * toLocal(f, pB).s));
      }
      if (Math.abs(uB - uA) < 1e-9) return emitSimple(part.baseMat, polySZ, to3, n);
      const polyUV = mapMulti(polySZ, (pt) => v2(uA + ((pt.x - sMin) / (sMax - sMin)) * (uB - uA), pt.y - rw.baseZ));
      const uvToSZ = (uv: Vec2): Vec2 => v2(sMin + ((uv.x - uA) / (uB - uA)) * (sMax - sMin), rw.baseZ + uv.y);
      emitPartitioned2D(byMat, rw.wallId, 'wall', polyUV, part, uvToSZ, to3, n);
    };
    if (pl.length) emitSide(mi.length ? difference(pl, mi) : pl, 1);
    if (mi.length) emitSide(pl.length ? difference(mi, pl) : mi, -1);
  }

  for (const Z of zs) {
    const tops = unionAll(flatTops.filter((q) => Math.abs(q.z - Z) < Z_EPS).map((q) => q.poly));
    const bots = unionAll(bottoms.filter((q) => Math.abs(q.z - Z) < Z_EPS).map((q) => q.poly));
    for (const [vis, isTop] of [[tops.length && bots.length ? difference(tops, bots) : tops, true], [bots.length && tops.length ? difference(bots, tops) : bots, false]] as const) {
      if (vis.length === 0) continue;
      const part = getPartition(classifyWallCapSlot(p, w, f, rw.baseZ, Z, isTop, vis));
      emitSimple(part?.baseMat ?? l.materialId, vis, (x, y) => [x, y, Z], [0, 0, isTop ? 1 : -1]);
    }
  }
}

/** Builds level wall solids (with painted layers and extrusions) when any wall on the level has face paints. */
export function buildPaintedLevelSolids(r: ResolvedLevel, jl: JunctionLevel | undefined, p: Project): LevelSolids {
  const byMat = new Map<Id, SolidBatch>();
  for (const rw of Object.values(r.walls)) {
    const w = p.elements[rw.wallId];
    const hasPaint = isWall(w) && Boolean(w.facePaints?.length);
    for (const l of rw.layers) {
      if (hasPaint) appendPaintedWallLayer(byMat, rw, l, p, jl);
      else appendSolid(batchOf(byMat, l.materialId, 'wall'), wallLayerSolid(rw, l, jl, p));
    }
  }
  appendFaceExtrusionSolids(byMat, p, r.levelId, new Set(Object.keys(r.walls)));
  return { batches: [...byMat.values()] };
}
