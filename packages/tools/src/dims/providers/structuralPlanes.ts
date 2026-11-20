import { add, dot, mul, norm, sub, type Vec2 } from '@hestia/geom';
import { frameOfWall, pointAt, toLocal, wallPlaneAt, wallPlanes } from '@hestia/engine';
import {
  beamLength,
  beamPolygon,
  beamsOnLevel,
  columnPolygon,
  columnsOnLevel,
  findBeamType,
  findColumnType,
  findFootingType,
  footingPolygon,
  footingsOnLevel,
  isFooting,
  projectGrids,
  wallsOfPlan,
  type Id,
  type Project,
  type WallDimRef,
} from '@hestia/model';
import { PARALLEL_TOL, segLocal, segPoint, type LocalPlane, type SegFrame } from '../parallel.ts';

const epsZero = 1e-6;

export interface NeighborLocalPlane extends LocalPlane {
  /** S-bounds do polígono no referencial de `host`, para ignorar vizinhos que contêm/atravessam o hospedeiro. */
  sMin?: number;
  sMax?: number;
}

export function polygonBoundsInFrame(frame: SegFrame, pts: readonly Vec2[]): {
  sMin: number;
  sMax: number;
  tMin: number;
  tMax: number;
} {
  let sMin = Infinity;
  let sMax = -Infinity;
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const pt of pts) {
    const loc = segLocal(frame, pt);
    if (loc.s < sMin) sMin = loc.s;
    if (loc.s > sMax) sMax = loc.s;
    if (loc.t < tMin) tMin = loc.t;
    if (loc.t > tMax) tMax = loc.t;
  }
  return { sMin, sMax, tMin, tMax };
}

/**
 * Coleta todos os planos vizinhos (paredes, eixos/grades, vigas, pilares e sapatas) paralelos a `host.u`
 * no pavimento `levelId`, medidos em coordenadas locais `(t, s)` de `host`.
 */
export function neighborPlanes(
  p: Project,
  levelId: Id,
  excludeId: Id,
  host: SegFrame,
  wallRef: WallDimRef,
  hostCenterS = 0,
): NeighborLocalPlane[] {
  const planes: NeighborLocalPlane[] = [];
  const hostMid = segPoint(host, host.length / 2, hostCenterS);

  for (const w of wallsOfPlan(p, levelId)) {
    if (w.id === excludeId) continue;
    const f = frameOfWall(p, w.id);
    if (!f || f.arc || Math.abs(dot(host.u, f.u)) < PARALLEL_TOL) continue;
    const towardHost = toLocal(f, hostMid).s >= f.sMid ? 1 : -1;
    const plane = wallPlaneAt(wallPlanes(f), wallRef, towardHost);
    const l0 = segLocal(host, pointAt(f, 0, plane));
    const l1 = segLocal(host, pointAt(f, f.length, plane));
    const s = (l0.s + l1.s) / 2;
    const lo = segLocal(host, pointAt(f, 0, wallPlaneAt(wallPlanes(f), wallRef, -1))).s;
    const hi = segLocal(host, pointAt(f, 0, wallPlaneAt(wallPlanes(f), wallRef, 1))).s;
    planes.push({
      id: w.id,
      s,
      t0: Math.min(l0.t, l1.t),
      t1: Math.max(l0.t, l1.t),
      sMin: Math.min(lo, hi),
      sMax: Math.max(lo, hi),
    });
  }

  for (const b of beamsOnLevel(p, levelId)) {
    if (b.id === excludeId || beamLength(b) < epsZero) continue;
    const bu = norm(sub(b.b, b.a));
    if (Math.abs(dot(host.u, bu)) < PARALLEL_TOL) continue;
    const ring = beamPolygon(b, findBeamType(p, b.typeId));
    const { sMin, sMax, tMin, tMax } = polygonBoundsInFrame(host, ring);
    const sAxis = (segLocal(host, b.a).s + segLocal(host, b.b).s) / 2;
    const s = wallRef === 'axis' ? sAxis : (sAxis >= hostCenterS ? sMin : sMax);
    planes.push({ id: b.id, s, t0: tMin, t1: tMax, sMin, sMax });
  }

  const hostEl = p.elements[excludeId];
  const hostLinkedColId = isFooting(hostEl) ? hostEl.columnId : null;

  for (const col of columnsOnLevel(p, levelId)) {
    if (col.id === excludeId || col.id === hostLinkedColId) continue;
    const ct = findColumnType(p, col.typeId);
    const { sMin, sMax, tMin, tMax } = polygonBoundsInFrame(host, columnPolygon(col, ct));
    const sCenter = segLocal(host, col.at).s;
    const s = wallRef === 'axis' ? sCenter : (sCenter >= hostCenterS ? sMin : sMax);
    planes.push({ id: col.id, s, t0: tMin, t1: tMax, sMin, sMax });
  }

  for (const ft of footingsOnLevel(p, levelId)) {
    if (ft.id === excludeId || ft.columnId === excludeId) continue;
    const ftt = findFootingType(p, ft.typeId);
    const { sMin, sMax, tMin, tMax } = polygonBoundsInFrame(host, footingPolygon(ft, ftt));
    const sCenter = (sMin + sMax) / 2;
    const s = wallRef === 'axis' ? segLocal(host, ft.at).s : (sCenter >= hostCenterS ? sMin : sMax);
    planes.push({ id: ft.id, s, t0: tMin, t1: tMax, sMin, sMax });
  }

  for (const g of projectGrids(p)) {
    if (g.sag !== 0 || g.points.length < 2) continue;
    const ga = g.points[0]!;
    const gb = g.points[g.points.length - 1]!;
    if (Math.hypot(gb.x - ga.x, gb.y - ga.y) < epsZero) continue;
    const gu = norm(sub(gb, ga));
    if (Math.abs(dot(host.u, gu)) < PARALLEL_TOL) continue;
    const gm = mul(add(ga, gb), 0.5);
    planes.push({ id: g.id, s: segLocal(host, gm).s, t0: -Infinity, t1: Infinity });
  }

  return planes;
}
