import * as THREE from 'three';
import {
  boxOf,
  dist,
  intersection,
  multiPoints,
  ringArea,
  triangulate,
  v2,
  type Polygon,
  type Ring,
} from '@hestia/geom';
import {
  frameOfWall,
  pointAt,
  slabRiseAt,
  unwrapElementFace,
  wallZRange,
} from '@hestia/engine';
import {
  floorTypeThickness,
  isFloor,
  isSlab,
  isWall,
  levelElevation,
  slabTypeThickness,
  type Project,
} from '@hestia/model';
import type { FaceHit } from './facePick3d.ts';

function sliceAlongU(poly: Polygon): Polygon[] {
  const box = boxOf(multiPoints([poly]));
  const span = box.maxX - box.minX;
  if (!Number.isFinite(span) || span <= 0.05) return [poly];
  const step = Math.max(0.05, span / 120);
  const count = Math.ceil(span / step);
  const out: Polygon[] = [];
  for (let i = 0; i < count; i++) {
    const ua = box.minX + i * step;
    const ub = i === count - 1 ? box.maxX + 1e-5 : box.minX + (i + 1) * step;
    const strip: Ring = [v2(ua, box.minY - 0.1), v2(ub, box.minY - 0.1), v2(ub, box.maxY + 0.1), v2(ua, box.maxY + 0.1)];
    for (const p of intersection([poly], [[strip]])) out.push(p);
  }
  return out;
}

/** Builds a lightweight semi-transparent hover highlight mesh for the picked face/layer. */
export function faceHighlightMesh(
  p: Project,
  hit: FaceHit,
  layerMode: 'all' | 'layer',
  color = 0x3b82f6,
): THREE.Mesh | null {
  const el = p.elements[hit.elementId];
  if (!el) return null;
  const unwrapped = unwrapElementFace(p, hit.elementId, hit.face, layerMode === 'layer' ? hit.layerIndex : 'all');
  if (!unwrapped || unwrapped.boundary.length === 0) return null;

  const EPS = 0.002;
  let to3: ((u: number, v: number) => [number, number, number]) | null = null;

  if (isWall(el)) {
    const f = frameOfWall(p, el.id);
    if (!f) return null;
    const wz = wallZRange(p, el);
    const outExt = { x: f.n.x * f.sign, y: f.n.y * f.sign };
    if (hit.face === 'sideExt' || hit.face === 'sideInt') {
      const sFace = hit.face === 'sideExt' ? f.sExt : f.sInt;
      const outSign = hit.face === 'sideExt' ? f.sign : -f.sign;
      const scaleT = unwrapped.width > 1e-9 ? f.length / unwrapped.width : 1;
      to3 = (u, v) => {
        const pt = pointAt(f, u * scaleT, sFace + outSign * EPS);
        return [pt.x, pt.y, wz.z0 + v];
      };
    } else if (hit.face === 'endA' || hit.face === 'endB') {
      const basePt = hit.face === 'endA' ? f.a : f.b;
      const sgn = hit.face === 'endA' ? -1 : 1;
      to3 = (u, v) => [
        basePt.x + f.n.x * f.sExt - outExt.x * u + f.u.x * sgn * EPS,
        basePt.y + f.n.y * f.sExt - outExt.y * u + f.u.y * sgn * EPS,
        wz.z0 + v,
      ];
    } else if (hit.face === 'top' || hit.face === 'bottom') {
      const z = hit.face === 'top' ? wz.z0 + wz.height + EPS : wz.z0 - EPS;
      to3 = (u, v) => {
        const pt = pointAt(f, u, f.sExt - f.sign * v);
        return [pt.x, pt.y, z];
      };
    }
  } else if (isFloor(el) || isSlab(el)) {
    const thick = isFloor(el)
      ? (p.floorTypes[el.typeId] ? floorTypeThickness(p.floorTypes[el.typeId]!) : null)
      : (p.slabTypes[el.typeId] ? slabTypeThickness(p.slabTypes[el.typeId]!) : null);
    if (thick === null) return null;
    const topZ = levelElevation(p, el.levelId) + el.heightOffset;
    const bottomZ = topZ - thick;
    const slope = isSlab(el) ? el.slope : null;
    if (hit.face === 'top' || hit.face === 'bottom') {
      const ox = unwrapped.origin2d?.x ?? 0;
      const oy = unwrapped.origin2d?.y ?? 0;
      const isTop = hit.face === 'top';
      to3 = (u, v) => {
        const x = ox + u;
        const y = oy + v;
        return [x, y, (isTop ? topZ + EPS : bottomZ - EPS) + (slope ? slabRiseAt(slope, { x, y }) : 0)];
      };
    } else if (hit.face.startsWith('edge:')) {
      const [, rStr, eStr] = hit.face.split(':');
      const ringIdx = Number(rStr);
      const edgeIdx = Number(eStr);
      const ring = ringIdx === 0 ? el.boundary : el.holes[ringIdx - 1];
      if (!ring || !ring[edgeIdx]) return null;
      const p0 = ring[edgeIdx]!;
      const p1 = ring[(edgeIdx + 1) % ring.length]!;
      const len = dist(p0, p1);
      if (len < 1e-9) return null;
      const ux = (p1.x - p0.x) / len;
      const uy = (p1.y - p0.y) / len;
      const outRight = (ringArea(ring) > 0) === (ringIdx === 0);
      const nx = outRight ? uy : -uy;
      const ny = outRight ? -ux : ux;
      to3 = (u, v) => {
        const x = p0.x + ux * u + nx * EPS;
        const y = p0.y + uy * u + ny * EPS;
        return [x, y, bottomZ + v + (slope ? slabRiseAt(slope, { x, y }) : 0)];
      };
    }
  }

  if (!to3) return null;
  const positions: number[] = [];
  const indices: number[] = [];
  let vBase = 0;
  for (const poly of unwrapped.boundary) {
    for (const cp of unwrapped.isCurved ? sliceAlongU(poly) : [poly]) {
      const m = triangulate(cp);
      for (let i = 0; i < m.positions.length; i += 2) {
        const [x, y, z] = to3(m.positions[i]!, m.positions[i + 1]!);
        positions.push(x, y, z);
      }
      for (const idx of m.indices) indices.push(vBase + idx);
      vBase += m.positions.length / 2;
    }
  }
  if (indices.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
}
