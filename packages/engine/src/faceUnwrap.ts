import {
  boxOf,
  difference,
  dist,
  dot,
  multiArea,
  multiPoints,
  transformDxfPaths,
  v2,
  type FaceArtItemInput,
  type MultiPolygon,
  type Ring,
  type Vec2,
} from '@hestia/geom';
import {
  isFloor,
  isMembraneLayer,
  isSlab,
  isWall,
  layerSpans,
  openingsOfWall,
  profileHeightAt,
  totalThickness,
  wallType,
  wallsOnLevel,
  type FaceLayerTarget,
  type FacePaintEntry,
  type FaceSlot,
  type Floor,
  type Id,
  type Layer,
  type ProfilePoint,
  type Project,
  type Slab,
  type Wall,
  type WallType,
} from '@hestia/model';
import { resolveFloors } from './floors.ts';
import { tangentAt, toLocal, type WallFrame } from './frame.ts';
import { frameOfWall, openingGeometry } from './resolve.ts';
import { resolveSlabs } from './slabs.ts';
import { wallZRange, type WallZ } from './wallZ.ts';

export interface UnwrappedOpening {
  openingId: Id;
  kind: 'door' | 'window';
  rect: { u0: number; v0: number; u1: number; v1: number };
  label: string;
}

export interface UnwrappedLayerDivider {
  layerIndex: number;
  label: string;
  materialId: Id;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export interface UnwrappedCrossWall {
  wallId: Id;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

export interface UnwrappedFace {
  elementId: Id;
  elementKind: 'wall' | 'floor' | 'slab';
  face: FaceSlot;
  layer: FaceLayerTarget;
  width: number;
  height: number;
  isCurved: boolean;
  curveRadius: number | null;
  concave: boolean;
  boundary: MultiPolygon;
  openings: UnwrappedOpening[];
  layerDividers: UnwrappedLayerDivider[];
  crossWalls: UnwrappedCrossWall[];
  defaultMaterialId: Id;
  /** World origin/basis metadata when planar (for floor/slab top/bottom normalization). */
  origin2d?: Vec2;
}

const EPS = 1e-7;
const MIN_AREA = 1e-9;

function rectMulti(u0: number, v0: number, u1: number, v1: number): MultiPolygon {
  if (u1 - u0 <= EPS || v1 - v0 <= EPS) return [];
  return [[[v2(u0, v0), v2(u1, v0), v2(u1, v1), v2(u0, v1)]]];
}

function defaultLayerMaterial(layers: readonly Layer[], side: 'first' | 'last', layer: FaceLayerTarget): Id {
  if (typeof layer === 'number' && layers[layer]) return layers[layer]!.materialId;
  const nonMembrane = layers.filter((l) => !isMembraneLayer(l));
  if (side === 'first') return (nonMembrane[0] ?? layers[0])?.materialId ?? '';
  return (nonMembrane[nonMembrane.length - 1] ?? layers[layers.length - 1])?.materialId ?? '';
}

function sampleProfileChain(pts: ProfilePoint[], length: number): ProfilePoint[] {
  const inside = pts
    .filter((q) => q.t >= -EPS && q.t <= length + EPS)
    .map((q) => ({ t: Math.min(length, Math.max(0, q.t)), h: q.h }));
  const out: ProfilePoint[] = [];
  if (inside.length === 0 || inside[0]!.t > EPS) out.push({ t: 0, h: profileHeightAt(pts, 0) });
  out.push(...inside);
  const last = out[out.length - 1];
  if (!last || last.t < length - EPS) out.push({ t: length, h: profileHeightAt(pts, Math.max(0, length - 1e-9)) });
  return out;
}

function buildWallSideOutline(
  length: number,
  width: number,
  height: number,
  topProf: ProfilePoint[] | null,
  botProf: ProfilePoint[] | null,
): MultiPolygon {
  if (!topProf && !botProf) return rectMulti(0, 0, width, height);
  const scaleU = length > EPS ? width / length : 1;
  const botPts = botProf && botProf.length >= 2 ? sampleProfileChain(botProf, length) : [{ t: 0, h: 0 }, { t: length, h: 0 }];
  const topPts = (topProf && topProf.length >= 2 ? sampleProfileChain(topProf, length) : [{ t: 0, h: height }, { t: length, h: height }]).reverse();
  const ring: Ring = [];
  for (const q of [...botPts, ...topPts]) {
    const pt = v2(q.t * scaleU, q.h);
    const prev = ring[ring.length - 1];
    if (!prev || dist(prev, pt) > EPS) ring.push(pt);
  }
  if (ring.length > 2 && dist(ring[0]!, ring[ring.length - 1]!) <= EPS) ring.pop();
  return ring.length >= 3 && multiArea([[ring]]) > MIN_AREA ? [[ring]] : [];
}

function collectCrossWalls(
  p: Project,
  w: Wall,
  wt: WallType,
  f: WallFrame,
  wz: WallZ,
  scaleU: number,
  width: number,
): UnwrappedCrossWall[] {
  const out: UnwrappedCrossWall[] = [];
  const reach = totalThickness(wt) + 0.3;
  for (const other of wallsOnLevel(p, w.levelId)) {
    if (other.id === w.id) continue;
    const otherWt = p.wallTypes[other.typeId];
    const halfT = ((otherWt ? totalThickness(otherWt) : 0.14) / 2) * scaleU;
    const oLen = dist(other.a, other.b);
    if (oLen < EPS) continue;
    const oDir = v2((other.b.x - other.a.x) / oLen, (other.b.y - other.a.y) / oLen);
    const otherZ = wallZRange(p, other);
    const v0 = Math.max(0, otherZ.z0 - wz.z0);
    const v1 = Math.min(wz.height, otherZ.z0 + otherZ.height - wz.z0);
    if (v1 - v0 <= EPS) continue;
    for (const pt of [other.a, other.b]) {
      const loc = toLocal(f, pt);
      if (Math.abs(loc.s - f.sMid) > reach || loc.t < -0.1 || loc.t > f.length + 0.1) continue;
      if (Math.abs(dot(tangentAt(f, Math.min(f.length, Math.max(0, loc.t))), oDir)) > 0.95) continue;
      const u0 = Math.max(0, loc.t * scaleU - halfT);
      const u1 = Math.min(width, loc.t * scaleU + halfT);
      if (u1 - u0 > EPS) {
        out.push({ wallId: other.id, u0, u1, v0, v1 });
        break;
      }
    }
  }
  return out;
}

function unwrapWallSide(
  p: Project,
  w: Wall,
  wt: WallType,
  f: WallFrame,
  wz: WallZ,
  face: 'sideExt' | 'sideInt',
  layer: FaceLayerTarget,
): UnwrappedFace {
  const sFace = face === 'sideExt' ? f.sExt : f.sInt;
  const isCurved = f.arc !== null;
  const curveRadius = f.arc ? Math.max(0.01, f.arc.radius + f.arc.k * sFace) : null;
  const width = f.arc && curveRadius !== null ? f.length * (curveRadius / f.arc.radius) : f.length;
  const outwardSign = face === 'sideExt' ? f.sign : -f.sign;
  const concave = f.arc ? outwardSign * f.arc.k < 0 : false;
  const scaleU = f.length > EPS ? width / f.length : 1;
  const topProf = wz.profile ?? (w.sag === 0 ? w.topProfile : null);
  let boundary = buildWallSideOutline(f.length, width, wz.height, topProf, wz.bottomProfile ?? null);

  const openings: UnwrappedOpening[] = [];
  const openRects: MultiPolygon[] = [];
  for (const o of openingsOfWall(p, w.id)) {
    const g = openingGeometry(p, o, f);
    const uCenter = o.offset * scaleU;
    const halfW = (g.roughWidth / 2) * scaleU;
    const u0 = Math.max(0, uCenter - halfW);
    const u1 = Math.min(width, uCenter + halfW);
    const v0 = Math.max(0, g.sill);
    const v1 = Math.min(wz.height, g.sill + g.roughHeight);
    if (u1 - u0 <= EPS || v1 - v0 <= EPS) continue;
    openings.push({ openingId: o.id, kind: o.kind, rect: { u0, v0, u1, v1 }, label: o.mark || o.id });
    openRects.push(rectMulti(u0, v0, u1, v1));
  }
  if (boundary.length > 0 && openRects.length > 0) boundary = difference(boundary, ...openRects);

  return {
    elementId: w.id,
    elementKind: 'wall',
    face,
    layer,
    width,
    height: wz.height,
    isCurved,
    curveRadius,
    concave,
    boundary,
    openings,
    layerDividers: [],
    crossWalls: collectCrossWalls(p, w, wt, f, wz, scaleU, width),
    defaultMaterialId: defaultLayerMaterial(wt.layers, face === 'sideExt' ? 'first' : 'last', layer),
  };
}

function makeDividers(
  spans: ReturnType<typeof layerSpans>,
  horizontal: boolean,
  spanLen: number,
): UnwrappedLayerDivider[] {
  return spans
    .filter((sp) => sp.layer.thickness >= 1e-6)
    .map((sp) =>
      horizontal
        ? { layerIndex: sp.index, label: sp.layer.function, materialId: sp.layer.materialId, u0: 0, v0: sp.from, u1: spanLen, v1: sp.to }
        : { layerIndex: sp.index, label: sp.layer.function, materialId: sp.layer.materialId, u0: sp.from, v0: 0, u1: sp.to, v1: spanLen },
    );
}

function unwrapWall(p: Project, w: Wall, face: FaceSlot, layer: FaceLayerTarget): UnwrappedFace | null {
  const f = frameOfWall(p, w.id);
  if (!f) return null;
  const wt = wallType(p, w);
  const wz = wallZRange(p, w);
  if (face === 'sideExt' || face === 'sideInt') return unwrapWallSide(p, w, wt, f, wz, face, layer);

  const thick = totalThickness(wt);
  const spans = layerSpans(wt);
  const targetSpan = typeof layer === 'number' ? spans[layer] : undefined;
  const defaultMaterialId = defaultLayerMaterial(wt.layers, 'first', layer);
  const mkBase = (width: number, height: number, isCurved: boolean, curveRadius: number | null, boundary: MultiPolygon, layerDividers: UnwrappedLayerDivider[]): UnwrappedFace => ({
    elementId: w.id,
    elementKind: 'wall',
    face,
    layer,
    width,
    height,
    isCurved,
    curveRadius,
    concave: false,
    boundary,
    openings: [],
    layerDividers,
    crossWalls: [],
    defaultMaterialId,
  });

  if (face === 'endA' || face === 'endB') {
    const boundary = targetSpan ? rectMulti(targetSpan.from, 0, targetSpan.to, wz.height) : rectMulti(0, 0, thick, wz.height);
    return mkBase(thick, wz.height, false, null, boundary, makeDividers(spans, false, wz.height));
  }
  if (face === 'top' || face === 'bottom') {
    const boundary = targetSpan ? rectMulti(0, targetSpan.from, f.length, targetSpan.to) : rectMulti(0, 0, f.length, thick);
    return mkBase(f.length, thick, f.arc !== null, f.arc?.radius ?? null, boundary, makeDividers(spans, true, f.length));
  }
  if (face.startsWith('opening:')) {
    const [, openingId, part] = face.split(':');
    const o = openingsOfWall(p, w.id).find((x) => x.id === openingId);
    if (!o) return null;
    const g = openingGeometry(p, o, f);
    const isHoriz = part === 'sill' || part === 'head';
    const width = isHoriz ? g.roughWidth : thick;
    const height = isHoriz ? thick : g.roughHeight;
    const boundary = targetSpan
      ? (isHoriz ? rectMulti(0, targetSpan.from, width, targetSpan.to) : rectMulti(targetSpan.from, 0, targetSpan.to, height))
      : rectMulti(0, 0, width, height);
    return mkBase(width, height, false, null, boundary, makeDividers(spans, isHoriz, isHoriz ? width : height));
  }
  return null;
}

function unwrapPlanar(p: Project, el: Floor | Slab, face: FaceSlot, layer: FaceLayerTarget): UnwrappedFace | null {
  const type = isFloor(el) ? p.floorTypes[el.typeId] : p.slabTypes[el.typeId];
  if (!type) return null;
  const resolvedPoly: MultiPolygon = isFloor(el)
    ? resolveFloors(p, el.levelId).find((rf) => rf.floorId === el.id)?.polygon ?? [[el.boundary, ...el.holes]]
    : resolveSlabs(p, el.levelId).find((rs) => rs.slabId === el.id)?.polygon ?? [[el.boundary, ...el.holes]];

  if (face === 'top' || face === 'bottom') {
    const pts = multiPoints(resolvedPoly);
    if (pts.length === 0) return null;
    const box = boxOf(pts);
    const boundary: MultiPolygon = resolvedPoly.map((pl) => pl.map((ring) => ring.map((pt) => v2(pt.x - box.minX, pt.y - box.minY))));
    return {
      elementId: el.id,
      elementKind: el.kind,
      face,
      layer,
      width: Math.max(0, box.maxX - box.minX),
      height: Math.max(0, box.maxY - box.minY),
      isCurved: false,
      curveRadius: null,
      concave: false,
      boundary,
      openings: [],
      layerDividers: [],
      crossWalls: [],
      defaultMaterialId: defaultLayerMaterial(type.layers, face === 'top' ? 'first' : 'last', layer),
      origin2d: v2(box.minX, box.minY),
    };
  }

  if (face.startsWith('edge:')) {
    const [, rStr, eStr] = face.split(':');
    const ringIdx = Number(rStr);
    const edgeIdx = Number(eStr);
    const ring = ringIdx === 0 ? el.boundary : el.holes[ringIdx - 1];
    if (!ring || !Number.isInteger(edgeIdx) || edgeIdx < 0 || edgeIdx >= ring.length) return null;
    const width = dist(ring[edgeIdx]!, ring[(edgeIdx + 1) % ring.length]!);
    const height = totalThickness(type);
    const spans = layerSpans(type);
    // Floor/slab layers are ordered top-to-bottom; v=0 is bottom and v=height is top.
    const layerDividers: UnwrappedLayerDivider[] = spans
      .filter((sp) => sp.layer.thickness >= 1e-6)
      .map((sp) => ({
        layerIndex: sp.index,
        label: sp.layer.function,
        materialId: sp.layer.materialId,
        u0: 0,
        v0: height - sp.to,
        u1: width,
        v1: height - sp.from,
      }));
    const targetSpan = typeof layer === 'number' ? spans[layer] : undefined;
    const boundary = targetSpan ? rectMulti(0, height - targetSpan.to, width, height - targetSpan.from) : rectMulti(0, 0, width, height);
    return {
      elementId: el.id,
      elementKind: el.kind,
      face,
      layer,
      width,
      height,
      isCurved: false,
      curveRadius: null,
      concave: false,
      boundary,
      openings: [],
      layerDividers,
      crossWalls: [],
      defaultMaterialId: defaultLayerMaterial(type.layers, 'first', layer),
    };
  }
  return null;
}

/** Unwraps an element face (`Wall`, `Floor`, or `Slab`) into 2D `(u, v)` coordinates with openings and layer dividers. */
export function unwrapElementFace(
  p: Project,
  elementId: Id,
  face: FaceSlot,
  layer: FaceLayerTarget = 'all',
): UnwrappedFace | null {
  const el = p.elements[elementId];
  if (!el) return null;
  if (isWall(el)) return unwrapWall(p, el, face, layer);
  if (isFloor(el) || isSlab(el)) return unwrapPlanar(p, el, face, layer);
  return null;
}

/** Converts a `FacePaintEntry` (regions and DXF overlays) into `FaceArtItemInput[]` for `partitionFacePaint`. */
export function faceEntryToArtItems(entry: FacePaintEntry, defaultMatId: Id): FaceArtItemInput[] {
  const items: FaceArtItemInput[] = [];
  for (const r of entry.regions ?? []) {
    items.push({
      id: r.id,
      shape: r.shape,
      materialId: r.materialId,
      order: r.order,
      ...(r.baseOffset !== undefined ? { baseOffset: r.baseOffset } : {}),
      ...(r.thickness !== undefined ? { thickness: r.thickness } : {}),
      ...(r.cutMode !== undefined ? { cutMode: r.cutMode } : {}),
      ...(r.slats !== undefined ? { slats: r.slats } : {}),
    });
  }
  let dxfOrder = 1000;
  for (const ov of entry.dxfOverlays ?? []) {
    const transformed = transformDxfPaths(ov.paths, ov.offset, ov.rotationDeg, ov.scale);
    transformed.forEach((path, idx) => {
      if (path.pts.length < 2) return;
      items.push({
        id: `${ov.id}:${idx}`,
        shape: { kind: 'lineBand', pts: path.pts, width: Math.max(0.004, ov.separatorWidth), closed: path.closed },
        materialId: ov.materialId ?? entry.materialId ?? defaultMatId,
        order: dxfOrder++,
        ...(ov.baseOffset !== undefined ? { baseOffset: ov.baseOffset } : {}),
        ...(ov.thickness !== undefined ? { thickness: ov.thickness } : {}),
      });
    });
  }
  return items;
}
