import {
  boxOf,
  dist,
  intersection,
  multiPoints,
  partitionFacePaint,
  ringArea,
  triangulate,
  v2,
  type ExtrudedFacePiece,
  type Polygon,
  type Ring,
  type Vec2,
} from '@hestia/geom';
import {
  faceEntryToArtItems,
  frameOfWall,
  openingGeometry,
  slabRiseAt,
  unwrapElementFace,
  wallZRange,
  type UnwrappedFace,
} from '@hestia/engine';
import {
  isFloor,
  isSlab,
  isWall,
  levelElevation,
  openingsOfWall,
  totalThickness,
  type Floor,
  type GraphicsCategory,
  type Id,
  type Project,
  type Slab,
  type SlabSlope,
  type Wall,
} from '@hestia/model';
import { batchOf, ofElement, type SolidBatch } from './solids.ts';

type Vec3 = [number, number, number];

interface FaceMapper {
  to3: (u: number, v: number, w: number) => Vec3;
  normalAt: (u: number, v: number) => Vec3;
  dirUAt: (u: number, v: number) => Vec3;
  dirVAt: (u: number, v: number) => Vec3;
  clampW: (w: number) => number;
  curved: boolean;
}

function oriented(r: Ring, ccw: boolean): Ring {
  return (ringArea(r) > 0) === ccw ? r : [...r].reverse();
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function pushOrientedTri(b: SolidBatch, p0: Vec3, p1: Vec3, p2: Vec3, expectedNormal: Vec3): void {
  const e1 = sub3(p1, p0);
  const e2 = sub3(p2, p0);
  let cr = cross(e1, e2);
  const len = Math.hypot(cr[0], cr[1], cr[2]);
  if (!Number.isFinite(len) || len < 1e-12) return;
  let a = p1;
  let c = p2;
  if (dot3(cr, expectedNormal) < 0) {
    a = p2;
    c = p1;
    cr = [-cr[0], -cr[1], -cr[2]];
  }
  const n: Vec3 = [cr[0] / len, cr[1] / len, cr[2] / len];
  const base = b.positions.length / 3;
  b.positions.push(p0[0], p0[1], p0[2], a[0], a[1], a[2], c[0], c[1], c[2]);
  b.normals.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
  b.indices.push(base, base + 1, base + 2);
}

function makeWallMapper(p: Project, w: Wall, unwrapped: UnwrappedFace): FaceMapper | null {
  const f = frameOfWall(p, w.id);
  if (!f) return null;
  const wz = wallZRange(p, w);
  const outExt: Vec2 = { x: f.n.x * f.sign, y: f.n.y * f.sign };
  const face = unwrapped.face;

  if ((face === 'sideExt' || face === 'sideInt') && f.arc) {
    const sFace = face === 'sideExt' ? f.sExt : f.sInt;
    const outwardSign = face === 'sideExt' ? f.sign : -f.sign;
    const radius = unwrapped.curveRadius ?? Math.max(0.01, f.arc.radius + f.arc.k * sFace);
    const scaleT = unwrapped.width > 1e-9 ? f.length / unwrapped.width : 1;
    const arc = f.arc;
    const dirSign = arc.sweep < 0 ? -1 : 1;
    const arcPt = (u: number, wOff: number): Vec2 => {
      const th = arc.a0 + dirSign * ((u * scaleT) / arc.radius);
      const rho = arc.radius + arc.k * (sFace + outwardSign * wOff);
      return { x: arc.center.x + rho * Math.cos(th), y: arc.center.y + rho * Math.sin(th) };
    };
    const arcTan = (u: number): Vec2 => {
      const th = arc.a0 + dirSign * ((u * scaleT) / arc.radius);
      return { x: -Math.sin(th) * dirSign, y: Math.cos(th) * dirSign };
    };
    return {
      curved: true,
      clampW: (val) => (unwrapped.concave && val > radius - 0.005 ? radius - 0.005 : val),
      to3: (u, v, wOff) => {
        const pt = arcPt(u, wOff);
        return [pt.x, pt.y, wz.z0 + v];
      },
      normalAt: (u) => {
        const tan = arcTan(u);
        return [-tan.y * outwardSign, tan.x * outwardSign, 0];
      },
      dirUAt: (u) => {
        const tan = arcTan(u);
        return [tan.x, tan.y, 0];
      },
      dirVAt: () => [0, 0, 1],
    };
  }

  let origin: Vec3;
  let dirU: Vec3;
  let dirV: Vec3;
  let normal: Vec3;

  if (face === 'sideExt' || face === 'sideInt') {
    const sFace = face === 'sideExt' ? f.sExt : f.sInt;
    const sgn = face === 'sideExt' ? 1 : -1;
    origin = [f.a.x + f.n.x * sFace, f.a.y + f.n.y * sFace, wz.z0];
    dirU = [f.u.x, f.u.y, 0];
    dirV = [0, 0, 1];
    normal = [outExt.x * sgn, outExt.y * sgn, 0];
  } else if (face === 'endA' || face === 'endB') {
    const pt = face === 'endA' ? f.a : f.b;
    const sgn = face === 'endA' ? -1 : 1;
    origin = [pt.x + f.n.x * f.sExt, pt.y + f.n.y * f.sExt, wz.z0];
    dirU = [-outExt.x, -outExt.y, 0];
    dirV = [0, 0, 1];
    normal = [f.u.x * sgn, f.u.y * sgn, 0];
  } else if (face === 'top' || face === 'bottom') {
    const isTop = face === 'top';
    origin = [f.a.x + f.n.x * f.sExt, f.a.y + f.n.y * f.sExt, isTop ? wz.z0 + wz.height : wz.z0];
    dirU = [f.u.x, f.u.y, 0];
    dirV = [-outExt.x, -outExt.y, 0];
    normal = [0, 0, isTop ? 1 : -1];
  } else if (face.startsWith('opening:')) {
    const [, openingId, part] = face.split(':');
    const o = openingsOfWall(p, w.id).find((x) => x.id === openingId);
    if (!o) return null;
    const g = openingGeometry(p, o, f);
    const t0 = o.offset - g.roughWidth / 2;
    const t1 = o.offset + g.roughWidth / 2;
    if (part === 'sill' || part === 'head') {
      const isSill = part === 'sill';
      origin = [
        f.a.x + f.u.x * t0 + f.n.x * f.sExt,
        f.a.y + f.u.y * t0 + f.n.y * f.sExt,
        wz.z0 + g.sill + (isSill ? 0 : g.roughHeight),
      ];
      dirU = [f.u.x, f.u.y, 0];
      dirV = [-outExt.x, -outExt.y, 0];
      normal = [0, 0, isSill ? 1 : -1];
    } else {
      const isLeft = part === 'jambLeft';
      const tPos = isLeft ? t0 : t1;
      origin = [f.a.x + f.u.x * tPos + f.n.x * f.sExt, f.a.y + f.u.y * tPos + f.n.y * f.sExt, wz.z0 + g.sill];
      dirU = [-outExt.x, -outExt.y, 0];
      dirV = [0, 0, 1];
      normal = [f.u.x * (isLeft ? 1 : -1), f.u.y * (isLeft ? 1 : -1), 0];
    }
  } else {
    return null;
  }

  return makePlanarMapper(origin, dirU, dirV, normal);
}

function makePlanarMapper(origin: Vec3, dirU: Vec3, dirV: Vec3, normal: Vec3, slopeRise?: (x: number, y: number) => number): FaceMapper {
  return {
    curved: false,
    clampW: (w) => w,
    to3: (u, v, w) => {
      const x = origin[0] + u * dirU[0] + v * dirV[0] + w * normal[0];
      const y = origin[1] + u * dirU[1] + v * dirV[1] + w * normal[1];
      const zSlope = slopeRise ? slopeRise(x, y) : 0;
      const z = origin[2] + u * dirU[2] + v * dirV[2] + w * normal[2] + zSlope;
      return [x, y, z];
    },
    normalAt: () => normal,
    dirUAt: () => dirU,
    dirVAt: () => dirV,
  };
}

function makeFloorOrSlabMapper(p: Project, el: Floor | Slab, unwrapped: UnwrappedFace): FaceMapper | null {
  const type = isFloor(el) ? p.floorTypes[el.typeId] : p.slabTypes[el.typeId];
  if (!type) return null;
  const topZ = levelElevation(p, el.levelId) + el.heightOffset;
  const thick = totalThickness(type);
  const bottomZ = topZ - thick;
  const slope: SlabSlope | null = isSlab(el) ? el.slope : null;
  const rise = slope ? (x: number, y: number): number => slabRiseAt(slope, { x, y }) : undefined;
  const face = unwrapped.face;

  if (face === 'top' || face === 'bottom') {
    const ox = unwrapped.origin2d?.x ?? 0;
    const oy = unwrapped.origin2d?.y ?? 0;
    const isTop = face === 'top';
    let normal: Vec3 = [0, 0, isTop ? 1 : -1];
    if (slope) {
      const gx = (slope.percent / 100) * slope.dir.x;
      const gy = (slope.percent / 100) * slope.dir.y;
      const l = Math.hypot(gx, gy, 1);
      normal = isTop ? [-gx / l, -gy / l, 1 / l] : [gx / l, gy / l, -1 / l];
    }
    return makePlanarMapper([ox, oy, isTop ? topZ : bottomZ], [1, 0, 0], [0, 1, 0], normal, rise);
  }

  if (face.startsWith('edge:')) {
    const [, rStr, eStr] = face.split(':');
    const ringIdx = Number(rStr);
    const edgeIdx = Number(eStr);
    const ring = ringIdx === 0 ? el.boundary : el.holes[ringIdx - 1];
    if (!ring || edgeIdx < 0 || edgeIdx >= ring.length) return null;
    const p0 = ring[edgeIdx]!;
    const p1 = ring[(edgeIdx + 1) % ring.length]!;
    const len = dist(p0, p1);
    if (len < 1e-9) return null;
    const ux = (p1.x - p0.x) / len;
    const uy = (p1.y - p0.y) / len;
    const ccw = ringArea(ring) > 0;
    const outRight = ccw === (ringIdx === 0);
    const nx = outRight ? uy : -uy;
    const ny = outRight ? -ux : ux;
    return makePlanarMapper([p0.x, p0.y, bottomZ], [ux, uy, 0], [0, 0, 1], [nx, ny, 0], rise);
  }

  return null;
}

function slicePolyAlongU(poly: Polygon): Polygon[] {
  const box = boxOf(multiPoints([poly]));
  const span = box.maxX - box.minX;
  if (!Number.isFinite(span) || span <= 0.05) return [poly];
  const step = Math.max(0.05, span / 160);
  const count = Math.ceil(span / step);
  const out: Polygon[] = [];
  const vMin = box.minY - 0.1;
  const vMax = box.maxY + 0.1;
  for (let i = 0; i < count; i++) {
    const ua = box.minX + i * step;
    const ub = i === count - 1 ? box.maxX + 1e-5 : box.minX + (i + 1) * step;
    const strip: Ring = [v2(ua, vMin), v2(ub, vMin), v2(ub, vMax), v2(ua, vMax)];
    for (const p of intersection([poly], [[strip]])) out.push(p);
  }
  return out;
}

function subdivideRingByU(ring: Ring, step = 0.05): Ring {
  const out: Ring = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    out.push(a);
    const du = Math.abs(b.x - a.x);
    if (du > step) {
      const n = Math.min(160, Math.ceil(du / step));
      for (let k = 1; k < n; k++) {
        const t = k / n;
        out.push(v2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t));
      }
    }
  }
  return out;
}

function emitExtrudedPiece(b: SolidBatch, mapper: FaceMapper, ext: ExtrudedFacePiece): void {
  const w0 = mapper.clampW(ext.baseOffset);
  const w1 = mapper.clampW(ext.baseOffset + ext.thickness);
  const wLo = Math.min(w0, w1);
  const wHi = Math.max(w0, w1);
  if (wHi - wLo < 1e-6) return;

  for (const poly of ext.poly) {
    if (!poly[0]) continue;
    const capPolys = mapper.curved ? slicePolyAlongU(poly) : [poly];
    for (const cp of capPolys) {
      const normRings = cp.map((r, i) => oriented(r, i === 0));
      const m = triangulate(normRings);
      for (let i = 0; i < m.indices.length; i += 3) {
        const ia = m.indices[i]!;
        const ib = m.indices[i + 1]!;
        const ic = m.indices[i + 2]!;
        const ua = m.positions[ia * 2]!;
        const va = m.positions[ia * 2 + 1]!;
        const ub = m.positions[ib * 2]!;
        const vb = m.positions[ib * 2 + 1]!;
        const uc = m.positions[ic * 2]!;
        const vc = m.positions[ic * 2 + 1]!;
        const nFront = mapper.normalAt((ua + ub + uc) / 3, (va + vb + vc) / 3);
        const nBack: Vec3 = [-nFront[0], -nFront[1], -nFront[2]];
        pushOrientedTri(b, mapper.to3(ua, va, wHi), mapper.to3(ub, vb, wHi), mapper.to3(uc, vc, wHi), nFront);
        pushOrientedTri(b, mapper.to3(ua, va, wLo), mapper.to3(uc, vc, wLo), mapper.to3(ub, vb, wLo), nBack);
      }
    }

    for (const rawRing of poly.map((r, i) => oriented(r, i === 0))) {
      const ring = mapper.curved ? subdivideRingByU(rawRing) : rawRing;
      for (let i = 0; i < ring.length; i++) {
        const p0 = ring[i]!;
        const p1 = ring[(i + 1) % ring.length]!;
        const du = p1.x - p0.x;
        const dv = p1.y - p0.y;
        if (Math.hypot(du, dv) < 1e-9) continue;
        const uMid = (p0.x + p1.x) / 2;
        const vMid = (p0.y + p1.y) / 2;
        const du3 = mapper.dirUAt(uMid, vMid);
        const dv3 = mapper.dirVAt(uMid, vMid);
        // Outward normal for CCW ring in (u, v): dv * dirU - du * dirV.
        const sideN: Vec3 = [
          dv * du3[0] - du * dv3[0],
          dv * du3[1] - du * dv3[1],
          dv * du3[2] - du * dv3[2],
        ];
        const aLo = mapper.to3(p0.x, p0.y, wLo);
        const bLo = mapper.to3(p1.x, p1.y, wLo);
        const bHi = mapper.to3(p1.x, p1.y, wHi);
        const aHi = mapper.to3(p0.x, p0.y, wHi);
        pushOrientedTri(b, aLo, bLo, bHi, sideN);
        pushOrientedTri(b, aLo, bHi, aHi, sideN);
      }
    }
  }
}

/** Appends 3D extrusion and slat solids for painted elements on a level into `byMat`. */
export function appendFaceExtrusionSolids(
  byMat: Map<Id, SolidBatch>,
  p: Project,
  levelId: Id,
  elementIds?: ReadonlySet<Id>,
): void {
  for (const el of Object.values(p.elements)) {
    if (!isWall(el) && !isFloor(el) && !isSlab(el)) continue;
    if (el.levelId !== levelId) continue;
    if (elementIds && !elementIds.has(el.id)) continue;
    if (!el.facePaints || el.facePaints.length === 0) continue;

    const cat: GraphicsCategory = el.kind;
    for (const entry of el.facePaints) {
      const hasExtrusion =
        entry.regions?.some(
          (r) =>
            (r.thickness !== undefined && Math.abs(r.thickness) > 1e-6) ||
            (r.slats !== undefined && Math.abs(r.slats.depth) > 1e-6),
        ) ||
        entry.dxfOverlays?.some((ov) => ov.thickness !== undefined && Math.abs(ov.thickness) > 1e-6);
      if (!hasExtrusion) continue;

      const unwrapped = unwrapElementFace(p, el.id, entry.face, entry.layer);
      if (!unwrapped || unwrapped.boundary.length === 0) continue;

      const items = faceEntryToArtItems(entry, unwrapped.defaultMaterialId);
      const part = partitionFacePaint(unwrapped.boundary, entry.materialId ?? unwrapped.defaultMaterialId, items);
      if (part.extrusions.length === 0) continue;

      const mapper = isWall(el) ? makeWallMapper(p, el, unwrapped) : makeFloorOrSlabMapper(p, el, unwrapped);
      if (!mapper) continue;

      for (const ext of part.extrusions) {
        const b = batchOf(byMat, ext.materialId, cat);
        ofElement(b, el.id, () => emitExtrudedPiece(b, mapper, ext));
      }
    }
  }
}

/** Builds standalone `SolidBatch[]` for face extrusions and slats on a level. */
export function buildFaceExtrusionSolids(
  p: Project,
  levelId: Id,
  elementIds?: ReadonlySet<Id>,
): SolidBatch[] {
  const byMat = new Map<Id, SolidBatch>();
  appendFaceExtrusionSolids(byMat, p, levelId, elementIds);
  return [...byMat.values()];
}
