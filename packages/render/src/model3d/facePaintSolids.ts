import { boxOf, difference, intersection, multiArea, multiPoints, partitionFacePaint, union, v2, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import { bandTopAt, faceEntryToArtItems, frameOfWall, fuseBands, normalAt, openingGeometry, tangentAt, toLocal, unwrapElementFace, wallLayerBandsAfterJunction, type JunctionLevel, type LayerBand, type ResolvedLevel, type ResolvedWall, type WallFrame } from '@hestia/engine';
import { findExactFacePaint, findFacePaint, isFacePaintableElement, isWall, layerSpans, openingsOfWall, type FacePaintEntry, type FaceSlot, type Id, type Project, type Wall, type WallFaceSlot } from '@hestia/model';
import { appendFaceExtrusionSolids } from './facePaintExtrusions.ts';
import {
  buildWallGlassPassThrough,
  layerSingleSideGlassCutTV,
  mapMulti,
  mergeOuterGlassPartition,
  oriented,
  scaleMultiU,
  unionAll,
  wallHasAllLayerTransparency,
  wallOtherToUVMapping,
  wallSideToUVMapping,
  type PartitionedFaceEntry,
  type SideUVMapping,
} from './facePaintGlass.ts';
import { splitTJunctions, weldBands } from './layerTopology.ts';
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

function hasArt(entry: FacePaintEntry): boolean {
  return Boolean((entry.regions && entry.regions.length > 0) || (entry.dxfOverlays && entry.dxfOverlays.length > 0));
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

/** Returns `[extLayerIdx, intLayerIdx]` for the outermost and innermost regular wall layers. */
export function wallBoundaryLayerIndices(rw: ResolvedWall): [number, number] {
  const regular = rw.layers.filter((x) => x.layerIndex >= 0);
  const src = regular.length > 0 ? regular : rw.layers;
  return [src[0]?.layerIndex ?? 0, src[src.length - 1]?.layerIndex ?? 0];
}

/** Returns `true` if `w.facePaints` has at least one entry applicable to `layerIndex`. */
export function wallLayerHasFacePaint(
  w: Wall,
  layerIndex: number,
  extLayerIdx: number,
  intLayerIdx: number,
  p?: Project,
): boolean {
  if (!w.facePaints?.length) return false;
  if (wallHasAllLayerTransparency(p, w)) return true;
  for (const e of w.facePaints) {
    if (e.layer === layerIndex) return true;
    if (e.layer === 'all') {
      if (e.face === 'sideExt') {
        if (layerIndex === extLayerIdx) return true;
      } else if (e.face === 'sideInt') {
        if (layerIndex === intLayerIdx) return true;
      } else {
        return true;
      }
    }
  }
  return false;
}

function makeWallPartitionLookup(
  p: Project,
  w: Wall,
  layerIndex: number,
  fallbackMatId: Id,
  isExtLayer: boolean,
  isIntLayer: boolean,
): (slot: FaceSlot) => PartitionedFaceEntry | null {
  const cache = new Map<string, PartitionedFaceEntry | null>();
  return (slot: FaceSlot): PartitionedFaceEntry | null => {
    const key = `${slot}|${layerIndex}`;
    if (cache.has(key)) return cache.get(key)!;
    const entry =
      slot === 'sideExt'
        ? findExactFacePaint(w.facePaints, 'sideExt', layerIndex) ??
          (isExtLayer ? findExactFacePaint(w.facePaints, 'sideExt', 'all') : undefined)
        : slot === 'sideInt'
          ? findExactFacePaint(w.facePaints, 'sideInt', layerIndex) ??
            (isIntLayer ? findExactFacePaint(w.facePaints, 'sideInt', 'all') : undefined)
          : findFacePaint(w.facePaints, slot, layerIndex);
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
  sLayerExt: number,
  sLayerInt: number,
): WallFaceSlot | null {
  const pts = multiPoints(polySZ);
  if (pts.length === 0) return null;
  const box = boxOf(pts);
  const sMid = (box.minX + box.maxX) / 2;
  const zMid = (box.minY + box.maxY) / 2;
  const d: Vec2 = { x: -ln.m.y, y: ln.m.x };
  const pAt = (s: number): Vec2 => v2(ln.c * ln.m.x + s * d.x, ln.c * ln.m.y + s * d.y);
  const loc = toLocal(f, pAt(sMid));
  const locMin = toLocal(f, pAt(box.minX));
  const locMax = toLocal(f, pAt(box.maxX));
  const normAtT = normalAt(f, loc.t);
  const dotExt = (nx * normAtT.x + ny * normAtT.y) * f.sign;
  const layerThick = Math.abs(sLayerExt - sLayerInt);
  const sTol = Math.min(0.012, Math.max(0.001, layerThick * 0.45));
  const minDist = (target: number): number =>
    Math.min(Math.abs(loc.s - target), Math.abs(locMin.s - target), Math.abs(locMax.s - target));
  if (dotExt > 0.82 && minDist(sLayerExt) < sTol) return 'sideExt';
  if (dotExt < -0.82 && minDist(sLayerInt) < sTol) return 'sideInt';
  const tang = tangentAt(f, loc.t);
  const dotT = nx * tang.x + ny * tang.y;
  if (dotT < -0.9 && Math.abs(loc.t) < 0.06) return 'endA';
  if (dotT > 0.9 && Math.abs(loc.t - f.length) < 0.06) return 'endB';
  if (Math.abs(dotT) > 0.9 && w.facePaints?.some((e) => e.face.startsWith('opening:'))) {
    for (const o of openingsOfWall(p, w.id)) {
      const g = openingGeometry(p, o, f);
      if (zMid < baseZ + g.sill - 0.01 || zMid > baseZ + g.sill + g.roughHeight + 0.01) continue;
      if (dotT > 0.9 && Math.abs(loc.t - (o.offset - g.roughWidth / 2)) < 0.03) return `opening:${o.id}:jambLeft`;
      if (dotT < -0.9 && Math.abs(loc.t - (o.offset + g.roughWidth / 2)) < 0.03) return `opening:${o.id}:jambRight`;
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
  getBatch: (mat: Id) => SolidBatch,
  wallId: Id,
  polyUV: MultiPolygon,
  part: PartitionedFaceEntry,
  uvToLocal: (uv: Vec2) => Vec2,
  to3: (x: number, y: number) => [number, number, number],
  normal: [number, number, number],
): void {
  if (polyUV.length === 0) return;
  let rem = polyUV;
  for (const piece of part.explicit) {
    const vis = intersection(rem, piece.poly);
    if (multiArea(vis) <= MIN_AREA) continue;
    rem = difference(rem, vis);
    const b = getBatch(piece.materialId);
    ofElement(b, wallId, () => emitFace(b, mapMulti(vis, uvToLocal), to3, normal));
    if (multiArea(rem) <= MIN_AREA) break;
  }
  if (multiArea(rem) > MIN_AREA) {
    const b = getBatch(part.baseMat);
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
  extLayerIdx?: number,
  intLayerIdx?: number,
): void {
  const w = p.elements[rw.wallId];
  const f = isWall(w) ? frameOfWall(p, w.id) : null;
  if (!isWall(w) || !f || !w.facePaints?.length) return;

  const [defaultExtIdx, defaultIntIdx] = wallBoundaryLayerIndices(rw);
  const extIdx = extLayerIdx ?? defaultExtIdx;
  const intIdx = intLayerIdx ?? defaultIntIdx;
  const span = layerSpans(f.type).find((sp) => sp.index === l.layerIndex);
  const sLayerExt = span ? f.sign * (f.extOffset - span.from) : f.sExt;
  const sLayerInt = span ? f.sign * (f.extOffset - span.to) : f.sInt;

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
  const glass = buildWallGlassPassThrough(p, w, f);
  const singleGlass = layerSingleSideGlassCutTV(p, w, f, l.layerIndex, sLayerExt, sLayerInt);
  const defaultMat = glass.allTransBaseMat ?? l.materialId;
  const getPartition = makeWallPartitionLookup(p, w, l.layerIndex, defaultMat, l.layerIndex === extIdx, l.layerIndex === intIdx);
  const touched = new Map<SolidBatch, { firstTri: number; firstVert: number; firstIds: number }>();
  const getBatch = (mat: Id): SolidBatch => {
    const b = batchOf(byMat, mat, 'wall');
    if (!touched.has(b)) touched.set(b, { firstTri: b.indices.length, firstVert: b.positions.length / 3, firstIds: b.ids.length });
    return b;
  };
  const emitSimple = (mat: Id, poly: MultiPolygon, to3: (u: number, v: number) => [number, number, number], n: [number, number, number]): void => {
    if (poly.length === 0) return;
    const b = getBatch(mat);
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
      emitSimple(getPartition('top')?.baseMat ?? defaultMat, band.poly, (x, y) => [x, y, zTop(x, y)], [-gx / len, -gy / len, 1 / len]);
    } else {
      flatTops.push({ z: flatTop, poly: band.poly });
      addZ(flatTop);
    }
    collectBandLines(band.poly, z0, zTop, lines);
  }

  const thick = f.thickness;
  for (const ln of lines) {
    const pl = unionAll(ln.plus);
    const mi = unionAll(ln.minus);
    const d: Vec2 = { x: -ln.m.y, y: ln.m.x };
    const to3 = (s: number, z: number): [number, number, number] => [ln.c * ln.m.x + s * d.x, ln.c * ln.m.y + s * d.y, z];
    const emitMapped = (part: PartitionedFaceEntry | null, mapping: SideUVMapping | null, polySZ: MultiPolygon, n: [number, number, number]): void => {
      if (!part || part.explicit.length === 0) return emitSimple(part?.baseMat ?? defaultMat, polySZ, to3, n);
      if (!mapping) return emitSimple(part.baseMat, polySZ, to3, n);
      emitPartitioned2D(getBatch, rw.wallId, mapping.polyUV, part, mapping.uvToSZ, to3, n);
    };
    const emitSide = (polySZ: MultiPolygon, sgn: 1 | -1): void => {
      if (polySZ.length === 0) return;
      const n: [number, number, number] = [ln.m.x * sgn, ln.m.y * sgn, 0];
      const slot = classifyWallLateralSlot(p, w, f, rw.baseZ, ln, n[0], n[1], polySZ, sLayerExt, sLayerInt);
      if (slot !== 'sideExt' && slot !== 'sideInt') {
        const part = slot ? getPartition(slot) : null;
        if (!part || part.explicit.length === 0) return emitSimple(part?.baseMat ?? defaultMat, polySZ, to3, n);
        return emitMapped(part, wallOtherToUVMapping(f, rw.baseZ, ln, polySZ, thick), polySZ, n);
      }

      const isInternalLateral = (slot === 'sideExt' && l.layerIndex !== extIdx) || (slot === 'sideInt' && l.layerIndex !== intIdx);
      const sFace = slot === 'sideExt' ? sLayerExt : sLayerInt;
      const mapping = wallSideToUVMapping(f, rw.baseZ, ln, polySZ, sFace);
      if (isInternalLateral) {
        const part = getPartition(slot);
        const cutTV = unionAll([glass.transCutTV, slot === 'sideExt' ? singleGlass.intCutTV : singleGlass.extCutTV]);
        if (cutTV.length === 0 || !mapping) return emitMapped(part, mapping, polySZ, n);
        const cutPolyUV = difference(mapping.polyUV, scaleMultiU(cutTV, mapping.scaleU));
        if (multiArea(cutPolyUV) <= MIN_AREA) return;
        if (!part || part.explicit.length === 0) return emitSimple(part?.baseMat ?? defaultMat, mapMulti(cutPolyUV, mapping.uvToSZ), to3, n);
        return emitPartitioned2D(getBatch, rw.wallId, cutPolyUV, part, mapping.uvToSZ, to3, n);
      }

      const basePart = getPartition(slot);
      if (glass.transPiecesTV.length === 0 || !mapping) return emitMapped(basePart, mapping, polySZ, n);
      emitMapped(mergeOuterGlassPartition(basePart, glass, l.materialId, mapping.scaleU), mapping, polySZ, n);
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
      emitSimple(part?.baseMat ?? defaultMat, vis, (x, y) => [x, y, Z], [0, 0, isTop ? 1 : -1]);
    }
  }
  for (const [batch, info] of touched) {
    splitTJunctions(batch, info.firstTri, info.firstVert);
    batch.ids.length = info.firstIds;
    if (batch.indices.length > info.firstTri) {
      batch.ids.push({ id: rw.wallId, start: info.firstTri, count: batch.indices.length - info.firstTri });
    }
  }
}

/** Builds level wall solids (with painted layers and extrusions) when any wall on the level has face paints. */
export function buildPaintedLevelSolids(r: ResolvedLevel, jl: JunctionLevel | undefined, p: Project): LevelSolids {
  const byMat = new Map<Id, SolidBatch>();
  for (const rw of Object.values(r.walls)) {
    const w = p.elements[rw.wallId];
    const hasPaint = isWall(w) && Boolean(w.facePaints?.length);
    const [extLayerIdx, intLayerIdx] = wallBoundaryLayerIndices(rw);
    for (const l of rw.layers) {
      if (hasPaint && wallLayerHasFacePaint(w, l.layerIndex, extLayerIdx, intLayerIdx, p)) {
        appendPaintedWallLayer(byMat, rw, l, p, jl, extLayerIdx, intLayerIdx);
      } else {
        appendSolid(batchOf(byMat, l.materialId, 'wall'), wallLayerSolid(rw, l, jl, p));
      }
    }
  }
  appendFaceExtrusionSolids(byMat, p, r.levelId, new Set(Object.keys(r.walls)));
  return { batches: [...byMat.values()] };
}
