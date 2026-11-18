import * as THREE from 'three';
import { dist, v2, type Vec2 } from '@hestia/geom';
import {
  frameOfWall,
  normalAt,
  openingGeometry,
  slabRiseAt,
  tangentAt,
  toLocal,
  unwrapElementFace,
  wallZRange,
} from '@hestia/engine';
import {
  isFloor,
  isMembraneLayer,
  isSlab,
  isWall,
  layerSpans,
  levelElevation,
  openingsOfWall,
  totalThickness,
  wallType,
  type FaceSlot,
  type Floor,
  type Id,
  type Project,
  type Slab,
  type Wall,
} from '@hestia/model';
import type { ElementRange } from './solids.ts';
import { buildTriBvh, raycastTriBvh, type TriBvh } from './triBvh.ts';
export { faceHighlightMesh } from './faceHighlight.ts';

export interface FaceHit {
  elementId: Id;
  kind: 'wall' | 'floor' | 'slab';
  face: FaceSlot;
  layerIndex: number;
  point: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
  uv: Vec2;
}

const rc = new THREE.Raycaster();
const inv = new THREE.Matrix4();
const localRay = new THREE.Ray();
const normMat = new THREE.Matrix3();
const bvhs = new WeakMap<THREE.BufferGeometry, { bvh: TriBvh | null; versao: number }>();

function getBvh(m: THREE.Mesh): TriBvh | null {
  const g = m.geometry;
  const versao = Number(g.userData.versao ?? 0);
  const hit = bvhs.get(g);
  if (hit && hit.versao === versao) return hit.bvh;
  const pos = g.getAttribute('position');
  const idx = g.getIndex();
  const limit = Number.isFinite(g.drawRange.count) ? Math.min(g.drawRange.count, idx?.count ?? 0) : (idx?.count ?? 0);
  let bvh: TriBvh | null = null;
  if (pos && idx && !(pos instanceof THREE.InterleavedBufferAttribute) && limit > 0) {
    const all = idx.array as Uint16Array | Uint32Array;
    const sub = limit === all.length ? all : all.subarray(0, limit);
    bvh = buildTriBvh(pos.array, sub);
  }
  bvhs.set(g, { bvh, versao });
  return bvh;
}

function rangeAt(ranges: readonly ElementRange[], face: number): ElementRange | undefined {
  const at = face * 3;
  for (const r of ranges) {
    if (at >= r.start && at < r.start + r.count) return r;
  }
  return undefined;
}

function triWorldNormal(m: THREE.Mesh, faceIndex: number): THREE.Vector3 {
  const pos = m.geometry.getAttribute('position');
  const idx = m.geometry.getIndex();
  if (!pos || !idx) return new THREE.Vector3(0, 0, 1);
  const ia = idx.getX(faceIndex * 3);
  const ib = idx.getX(faceIndex * 3 + 1);
  const ic = idx.getX(faceIndex * 3 + 2);
  const a = new THREE.Vector3().fromBufferAttribute(pos, ia);
  const b = new THREE.Vector3().fromBufferAttribute(pos, ib);
  const c = new THREE.Vector3().fromBufferAttribute(pos, ic);
  const n = b.sub(a).cross(c.sub(a));
  if (n.lengthSq() < 1e-18) return new THREE.Vector3(0, 0, 1);
  normMat.getNormalMatrix(m.matrixWorld);
  return n.applyMatrix3(normMat).normalize();
}

function classifyWallHit(
  p: Project,
  w: Wall,
  pt: { x: number; y: number; z: number },
  n: { x: number; y: number; z: number },
): Omit<FaceHit, 'point' | 'normal'> | null {
  const f = frameOfWall(p, w.id);
  if (!f) return null;
  const wt = wallType(p, w);
  const wz = wallZRange(p, w);
  const spans = layerSpans(wt);
  const loc = toLocal(f, { x: pt.x, y: pt.y });
  const depth = Math.min(f.thickness, Math.max(0, f.extOffset - f.sign * loc.s));
  const layerAtDepth = (d: number): number => {
    const found = spans.find((sp) => !isMembraneLayer(sp.layer) && d >= sp.from - 1e-4 && d <= sp.to + 1e-4);
    if (found) return found.index;
    return spans.find((sp) => !isMembraneLayer(sp.layer))?.index ?? 0;
  };
  const firstLayerIdx = spans.find((sp) => !isMembraneLayer(sp.layer))?.index ?? 0;
  const lastLayerIdx = [...spans].reverse().find((sp) => !isMembraneLayer(sp.layer))?.index ?? Math.max(0, wt.layers.length - 1);

  if (Math.abs(n.z) > 0.7) {
    for (const o of openingsOfWall(p, w.id)) {
      const g = openingGeometry(p, o, f);
      if (Math.abs(loc.t - o.offset) > g.roughWidth / 2 + 0.03) continue;
      if (n.z > 0.7 && Math.abs(pt.z - (wz.z0 + g.sill)) < 0.03) {
        return {
          elementId: w.id,
          kind: 'wall',
          face: `opening:${o.id}:sill`,
          layerIndex: layerAtDepth(depth),
          uv: v2(loc.t - (o.offset - g.roughWidth / 2), depth),
        };
      }
      if (n.z < -0.7 && Math.abs(pt.z - (wz.z0 + g.sill + g.roughHeight)) < 0.03) {
        return {
          elementId: w.id,
          kind: 'wall',
          face: `opening:${o.id}:head`,
          layerIndex: layerAtDepth(depth),
          uv: v2(loc.t - (o.offset - g.roughWidth / 2), depth),
        };
      }
    }
    return {
      elementId: w.id,
      kind: 'wall',
      face: n.z > 0 ? 'top' : 'bottom',
      layerIndex: layerAtDepth(depth),
      uv: v2(loc.t, depth),
    };
  }

  const tan = tangentAt(f, loc.t);
  const nrm = normalAt(f, loc.t);
  const dotExt = (n.x * nrm.x + n.y * nrm.y) * f.sign;
  const dotU = n.x * tan.x + n.y * tan.y;

  if (dotExt > 0.7) {
    const rad = f.arc ? Math.max(0.01, f.arc.radius + f.arc.k * f.sExt) : 1;
    const scaleU = f.arc ? rad / f.arc.radius : 1;
    return {
      elementId: w.id,
      kind: 'wall',
      face: 'sideExt',
      layerIndex: firstLayerIdx,
      uv: v2(loc.t * scaleU, pt.z - wz.z0),
    };
  }
  if (dotExt < -0.7) {
    const rad = f.arc ? Math.max(0.01, f.arc.radius + f.arc.k * f.sInt) : 1;
    const scaleU = f.arc ? rad / f.arc.radius : 1;
    return {
      elementId: w.id,
      kind: 'wall',
      face: 'sideInt',
      layerIndex: lastLayerIdx,
      uv: v2(loc.t * scaleU, pt.z - wz.z0),
    };
  }

  const vRel = pt.z - wz.z0;
  for (const o of openingsOfWall(p, w.id)) {
    const g = openingGeometry(p, o, f);
    if (vRel < g.sill - 0.03 || vRel > g.sill + g.roughHeight + 0.03) continue;
    if (dotU > 0.5 && Math.abs(loc.t - (o.offset - g.roughWidth / 2)) < 0.05) {
      return {
        elementId: w.id,
        kind: 'wall',
        face: `opening:${o.id}:jambLeft`,
        layerIndex: layerAtDepth(depth),
        uv: v2(depth, vRel - g.sill),
      };
    }
    if (dotU < -0.5 && Math.abs(loc.t - (o.offset + g.roughWidth / 2)) < 0.05) {
      return {
        elementId: w.id,
        kind: 'wall',
        face: `opening:${o.id}:jambRight`,
        layerIndex: layerAtDepth(depth),
        uv: v2(depth, vRel - g.sill),
      };
    }
  }

  if (loc.t <= 0.15 || (dotU < -0.5 && loc.t < f.length / 2)) {
    return { elementId: w.id, kind: 'wall', face: 'endA', layerIndex: layerAtDepth(depth), uv: v2(depth, vRel) };
  }
  if (loc.t >= f.length - 0.15 || (dotU > 0.5 && loc.t >= f.length / 2)) {
    return { elementId: w.id, kind: 'wall', face: 'endB', layerIndex: layerAtDepth(depth), uv: v2(depth, vRel) };
  }

  const sideFace: FaceSlot = dotExt >= 0 ? 'sideExt' : 'sideInt';
  return {
    elementId: w.id,
    kind: 'wall',
    face: sideFace,
    layerIndex: sideFace === 'sideExt' ? firstLayerIdx : lastLayerIdx,
    uv: v2(loc.t, vRel),
  };
}

function classifyPlanarHit(
  p: Project,
  el: Floor | Slab,
  pt: { x: number; y: number; z: number },
  n: { x: number; y: number; z: number },
): Omit<FaceHit, 'point' | 'normal'> | null {
  const type = isFloor(el) ? p.floorTypes[el.typeId] : p.slabTypes[el.typeId];
  if (!type) return null;
  const topZ = levelElevation(p, el.levelId) + el.heightOffset;
  const thick = totalThickness(type);
  const bottomZ = topZ - thick;
  const slope = isSlab(el) ? el.slope : null;
  const rise = slope ? slabRiseAt(slope, { x: pt.x, y: pt.y }) : 0;
  const spans = layerSpans(type);
  const nonMem = spans.filter((sp) => !isMembraneLayer(sp.layer));

  if (n.z > 0.5 || n.z < -0.5) {
    const face: FaceSlot = n.z > 0 ? 'top' : 'bottom';
    const layerIndex = n.z > 0 ? (nonMem[0]?.index ?? 0) : (nonMem[nonMem.length - 1]?.index ?? 0);
    const origin = unwrapElementFace(p, el.id, face)?.origin2d ?? v2(0, 0);
    return {
      elementId: el.id,
      kind: el.kind,
      face,
      layerIndex,
      uv: v2(pt.x - origin.x, pt.y - origin.y),
    };
  }

  let best = { ringIdx: 0, edgeIdx: 0, u: 0, dist: Infinity };
  const rings: Array<{ ringIdx: number; ring: Vec2[] }> = [{ ringIdx: 0, ring: el.boundary }];
  el.holes.forEach((h, idx) => rings.push({ ringIdx: idx + 1, ring: h }));
  for (const { ringIdx, ring } of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      const len = dist(a, b);
      if (len < 1e-6) continue;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      const proj = Math.min(len, Math.max(0, (pt.x - a.x) * ux + (pt.y - a.y) * uy));
      const cx = a.x + ux * proj;
      const cy = a.y + uy * proj;
      const d = Math.hypot(pt.x - cx, pt.y - cy);
      if (d < best.dist) best = { ringIdx, edgeIdx: i, u: proj, dist: d };
    }
  }
  const zFromTop = topZ + rise - pt.z;
  const layerSpan = nonMem.find((sp) => zFromTop >= sp.from - 1e-4 && zFromTop <= sp.to + 1e-4) ?? nonMem[0];
  return {
    elementId: el.id,
    kind: el.kind,
    face: `edge:${best.ringIdx}:${best.edgeIdx}`,
    layerIndex: layerSpan?.index ?? 0,
    uv: v2(best.u, Math.min(thick, Math.max(0, pt.z - (bottomZ + rise)))),
  };
}

/** Raycasts the 3D scene root to resolve the exact element face, layer index, and local `(u, v)` coordinates. */
export function pickFace(
  root: THREE.Object3D,
  camera: THREE.Camera,
  ndc: { x: number; y: number },
  p: Project,
): FaceHit | null {
  root.updateMatrixWorld(true);
  const targets: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.userData.ranges) return;
    if (m.geometry.type === 'PlaneGeometry' || m.userData.levels === true || m.userData.levelsPlane === true) return;
    targets.push(m);
  });
  if (targets.length === 0) return null;

  rc.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  let best: { id: Id; point: THREE.Vector3; normal: THREE.Vector3; distance: number } | null = null;

  for (const m of targets) {
    const ranges = m.userData.ranges as ElementRange[];
    const bvh = getBvh(m);
    if (bvh) {
      inv.copy(m.matrixWorld).invert();
      localRay.copy(rc.ray).applyMatrix4(inv);
      const side = Array.isArray(m.material) ? THREE.DoubleSide : (m.material?.side ?? THREE.FrontSide);
      const hit = raycastTriBvh(bvh, localRay, Infinity, side, (face) => rangeAt(ranges, face) !== undefined);
      if (!hit) continue;
      const r = rangeAt(ranges, hit.faceIndex);
      if (!r) continue;
      const point = hit.point.applyMatrix4(m.matrixWorld);
      const distance = rc.ray.origin.distanceTo(point);
      if (!best || distance < best.distance) {
        best = { id: r.id, point, normal: triWorldNormal(m, hit.faceIndex), distance };
      }
      continue;
    }
    for (const h of rc.intersectObject(m, false)) {
      if (typeof h.faceIndex !== 'number') continue;
      const r = rangeAt(ranges, h.faceIndex);
      if (!r) continue;
      if (!best || h.distance < best.distance) {
        const n = h.face ? h.face.normal.clone().applyMatrix3(normMat.getNormalMatrix(m.matrixWorld)).normalize() : new THREE.Vector3(0, 0, 1);
        best = { id: r.id, point: h.point.clone(), normal: n, distance: h.distance };
      }
    }
  }

  if (!best) return null;
  const el = p.elements[best.id];
  if (!el || (!isWall(el) && !isFloor(el) && !isSlab(el))) return null;

  const pt = { x: best.point.x, y: best.point.y, z: best.point.z };
  const nrm = { x: best.normal.x, y: best.normal.y, z: best.normal.z };
  const classified = isWall(el) ? classifyWallHit(p, el, pt, nrm) : classifyPlanarHit(p, el, pt, nrm);
  if (!classified) return null;
  return { ...classified, point: pt, normal: nrm };
}
