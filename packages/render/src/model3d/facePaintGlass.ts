import {
  boxOf,
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
import { faceEntryToArtItems, toLocal, unwrapElementFace, type WallFrame } from '@hestia/engine';
import { findExactFacePaint, type FacePaintEntry, type Id, type Project, type Wall } from '@hestia/model';

export interface WallGlassPassThrough {
  allTransBaseMat: Id | null;
  transPiecesTV: CoplanarFacePiece[];
  transCutTV: MultiPolygon;
}

export interface SideUVMapping {
  scaleU: number;
  polyUV: MultiPolygon;
  uvToSZ: (uv: Vec2) => Vec2;
}

export interface PartitionedFaceEntry {
  baseMat: Id;
  explicit: CoplanarFacePiece[];
}

export function oriented(r: Ring, ccw: boolean): Ring {
  return (ringArea(r) > 0) === ccw ? r : [...r].reverse();
}

export function unionAll(ms: readonly MultiPolygon[]): MultiPolygon {
  const parts = ms.filter((m) => m.length > 0);
  if (parts.length === 0) return [];
  return parts.length === 1 ? parts[0]! : union(...parts);
}

export function mapMulti(m: MultiPolygon, fn: (pt: Vec2) => Vec2): MultiPolygon {
  return m.map((pl) => pl.map((r) => r.map(fn)));
}

/** Returns `true` if `matId` resolves to a material with opacity `< 0.999`. */
export function isMaterialTransparent(p: Project | undefined, matId: Id | undefined): boolean {
  if (!p || !matId) return false;
  const m = p.materials[matId];
  if (!m) return false;
  const op = m.aparencia?.opacidade ?? m.opacity;
  return Number.isFinite(op) && op < 0.999;
}

/** Returns `true` if `entry` uses a transparent material on its base or any coplanar region or overlay. */
export function entryHasTransparentMaterial(p: Project | undefined, entry: FacePaintEntry | undefined): boolean {
  if (!entry) return false;
  if (isMaterialTransparent(p, entry.materialId)) return true;
  if (entry.regions?.some((r) => Math.abs(r.thickness ?? 0) <= 1e-6 && !r.slats && isMaterialTransparent(p, r.materialId))) {
    return true;
  }
  if (entry.dxfOverlays?.some((d) => Math.abs(d.thickness ?? 0) <= 1e-6 && isMaterialTransparent(p, d.materialId))) {
    return true;
  }
  return false;
}

/** Returns `true` if `w` has a `layer: 'all'` face paint on `sideExt` or `sideInt` with a transparent material. */
export function wallHasAllLayerTransparency(p: Project | undefined, w: Wall): boolean {
  if (!w.facePaints?.length) return false;
  return w.facePaints.some(
    (e) => e.layer === 'all' && (e.face === 'sideExt' || e.face === 'sideInt') && entryHasTransparentMaterial(p, e),
  );
}

/** Scales `.x` coordinates of a `MultiPolygon` by `scaleU`, leaving `.y` unchanged. */
export function scaleMultiU(poly: MultiPolygon, scaleU: number): MultiPolygon {
  if (Math.abs(scaleU - 1) <= 1e-9) return poly;
  return poly.map((pl) => pl.map((r) => r.map((pt) => v2(pt.x * scaleU, pt.y))));
}

/** Scales `.x` coordinates of each `CoplanarFacePiece` by `scaleU`, leaving `.y` unchanged. */
export function scalePiecesU(pieces: readonly CoplanarFacePiece[], scaleU: number): CoplanarFacePiece[] {
  if (Math.abs(scaleU - 1) <= 1e-9) return [...pieces];
  return pieces.map((c) => ({ ...c, poly: scaleMultiU(c.poly, scaleU) }));
}

function extractEntryGlassPiecesTV(
  p: Project,
  w: Wall,
  f: WallFrame,
  face: 'sideExt' | 'sideInt',
  entry: FacePaintEntry,
): { piecesTV: CoplanarFacePiece[]; cutPartsTV: MultiPolygon[] } {
  if (!entryHasTransparentMaterial(p, entry)) return { piecesTV: [], cutPartsTV: [] };
  const sFace = face === 'sideExt' ? f.sExt : f.sInt;
  const scaleU = f.arc ? Math.max(0.01, f.arc.radius + f.arc.k * sFace) / f.arc.radius : 1;
  const unwrapped = unwrapElementFace(p, w.id, face, entry.layer);
  if (!unwrapped) return { piecesTV: [], cutPartsTV: [] };
  const baseMat = entry.materialId ?? unwrapped.defaultMaterialId;
  const piecesTV: CoplanarFacePiece[] = [];
  const cutPartsTV: MultiPolygon[] = [];
  if (!entry.regions?.length && !entry.dxfOverlays?.length) {
    if (isMaterialTransparent(p, baseMat)) {
      const polyTV = scaleMultiU(unwrapped.boundary, 1 / scaleU);
      piecesTV.push({ materialId: baseMat, poly: polyTV });
      cutPartsTV.push(polyTV);
    }
  } else {
    const part = partitionFacePaint(unwrapped.boundary, baseMat, faceEntryToArtItems(entry, unwrapped.defaultMaterialId));
    for (const c of part.coplanar) {
      if (!isMaterialTransparent(p, c.materialId)) continue;
      const polyTV = scaleMultiU(c.poly, 1 / scaleU);
      piecesTV.push({ materialId: c.materialId, poly: polyTV });
      cutPartsTV.push(polyTV);
    }
  }
  return { piecesTV, cutPartsTV };
}

/** Collects normalized `(t, v)` transparent pieces and cut polygons across `sideExt` and `sideInt` with `layer: 'all'`. */
export function buildWallGlassPassThrough(p: Project, w: Wall, f: WallFrame): WallGlassPassThrough {
  const extAll = findExactFacePaint(w.facePaints, 'sideExt', 'all');
  const intAll = findExactFacePaint(w.facePaints, 'sideInt', 'all');
  const allTransBaseMat = isMaterialTransparent(p, extAll?.materialId)
    ? extAll!.materialId!
    : isMaterialTransparent(p, intAll?.materialId)
      ? intAll!.materialId!
      : null;

  const transPiecesTV: CoplanarFacePiece[] = [];
  const cutPartsTV: MultiPolygon[] = [];
  for (const [face, entry] of [['sideExt', extAll], ['sideInt', intAll]] as const) {
    if (!entry) continue;
    const { piecesTV, cutPartsTV: cuts } = extractEntryGlassPiecesTV(p, w, f, face, entry);
    transPiecesTV.push(...piecesTV);
    cutPartsTV.push(...cuts);
  }
  return { allTransBaseMat, transPiecesTV, transCutTV: unionAll(cutPartsTV) };
}

/** Collects normalized `(t, v)` transparent cut polygons for a single wall layer's `sideExt` and `sideInt` entries. */
export function layerSingleSideGlassCutTV(
  p: Project,
  w: Wall,
  f: WallFrame,
  layerIndex: number,
  _sLayerExt: number,
  _sLayerInt: number,
): { extCutTV: MultiPolygon; intCutTV: MultiPolygon } {
  const extEntry = findExactFacePaint(w.facePaints, 'sideExt', layerIndex);
  const intEntry = findExactFacePaint(w.facePaints, 'sideInt', layerIndex);
  const extCutTV = extEntry ? unionAll(extractEntryGlassPiecesTV(p, w, f, 'sideExt', extEntry).cutPartsTV) : [];
  const intCutTV = intEntry ? unionAll(extractEntryGlassPiecesTV(p, w, f, 'sideInt', intEntry).cutPartsTV) : [];
  return { extCutTV, intCutTV };
}

/** Maps a wall lateral facet `(s, z)` polygon to unwrapped `(u, v)` coordinates and provides its inverse `uvToSZ`. */
export function wallSideToUVMapping(
  f: WallFrame,
  baseZ: number,
  ln: { m: Vec2; c: number },
  polySZ: MultiPolygon,
  sFace: number,
): SideUVMapping | null {
  const pts = multiPoints(polySZ);
  if (pts.length === 0) return null;
  const box = boxOf(pts);
  const sMin = box.minX;
  const sMax = box.maxX;
  if (sMax - sMin < 1e-9) return null;
  const d: Vec2 = { x: -ln.m.y, y: ln.m.x };
  const pA = v2(ln.c * ln.m.x + sMin * d.x, ln.c * ln.m.y + sMin * d.y);
  const pB = v2(ln.c * ln.m.x + sMax * d.x, ln.c * ln.m.y + sMax * d.y);
  const scaleU = f.arc ? Math.max(0.01, f.arc.radius + f.arc.k * sFace) / f.arc.radius : 1;
  const tA = toLocal(f, pA).t;
  let tB = toLocal(f, pB).t;
  if (f.arc) {
    const perim = 2 * Math.PI * f.arc.radius;
    if (tB - tA > perim / 2) tB -= perim;
    else if (tA - tB > perim / 2) tB += perim;
  }
  const uA = tA * scaleU;
  const uB = tB * scaleU;
  if (Math.abs(uB - uA) < 1e-9) return null;
  const polyUV = polySZ.map((pl) =>
    pl
      .map((ring) => ring.map((pt) => v2(uA + ((pt.x - sMin) / (sMax - sMin)) * (uB - uA), pt.y - baseZ)))
      .map((r, i) => oriented(r, i === 0)),
  );
  const uvToSZ = (uv: Vec2): Vec2 => v2(sMin + ((uv.x - uA) / (uB - uA)) * (sMax - sMin), baseZ + uv.y);
  return { scaleU, polyUV, uvToSZ };
}

/** Maps a non-side wall lateral facet (`endA`/`endB`/`opening:...`) from `(s, z)` to `(u, v)`. */
export function wallOtherToUVMapping(
  f: WallFrame,
  baseZ: number,
  ln: { m: Vec2; c: number },
  polySZ: MultiPolygon,
  thick: number,
): SideUVMapping | null {
  const pts = multiPoints(polySZ);
  if (pts.length === 0) return null;
  const box = boxOf(pts);
  const sMin = box.minX;
  const sMax = box.maxX;
  if (sMax - sMin < 1e-9) return null;
  const d: Vec2 = { x: -ln.m.y, y: ln.m.x };
  const pA = v2(ln.c * ln.m.x + sMin * d.x, ln.c * ln.m.y + sMin * d.y);
  const pB = v2(ln.c * ln.m.x + sMax * d.x, ln.c * ln.m.y + sMax * d.y);
  const uA = Math.min(thick, Math.max(0, f.extOffset - f.sign * toLocal(f, pA).s));
  const uB = Math.min(thick, Math.max(0, f.extOffset - f.sign * toLocal(f, pB).s));
  if (Math.abs(uB - uA) < 1e-9) return null;
  const polyUV = mapMulti(polySZ, (pt) => v2(uA + ((pt.x - sMin) / (sMax - sMin)) * (uB - uA), pt.y - baseZ)).map((poly) =>
    poly.map((r, i) => oriented(r, i === 0)),
  );
  const uvToSZ = (uv: Vec2): Vec2 => v2(sMin + ((uv.x - uA) / (uB - uA)) * (sMax - sMin), baseZ + uv.y);
  return { scaleU: 1, polyUV, uvToSZ };
}

/** Merges `layer: 'all'` transparent pieces into an outer lateral face partition. */
export function mergeOuterGlassPartition(
  basePart: PartitionedFaceEntry | null,
  glass: WallGlassPassThrough,
  layerMatId: Id,
  scaleU: number,
): PartitionedFaceEntry {
  const scaledTrans = scalePiecesU(glass.transPiecesTV, scaleU);
  const baseMat = basePart ? basePart.baseMat : (glass.allTransBaseMat ?? layerMatId);
  return {
    baseMat,
    explicit: [...(basePart?.explicit ?? []), ...scaledTrans.filter((c) => c.materialId !== baseMat)],
  };
}
