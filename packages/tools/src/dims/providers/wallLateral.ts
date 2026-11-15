import { frameOfWall, pointAt, toLocal, wallPlaneAt, wallPlanes, type WallFrame } from '@hestia/engine';
import {
  beamLength,
  beamPolygon,
  beamsOnLevel,
  columnPolygon,
  columnsOnLevel,
  findBeamType,
  findColumnType,
  isWall,
  type Project,
  type WallDimRef,
} from '@hestia/model';
import { dot, norm, sub, type Vec2 } from '@hestia/geom';
import { PARALLEL_TOL, areParallel, nearestParallelGaps, type LocalPlane, type ParallelGap } from '../parallel.ts';

function boundsInWall(host: WallFrame, pts: readonly Vec2[]): { sMin: number; sMax: number; tMin: number; tMax: number } {
  let sMin = Infinity;
  let sMax = -Infinity;
  let tMin = Infinity;
  let tMax = -Infinity;
  for (const pt of pts) {
    const l = toLocal(host, pt);
    if (l.s < sMin) sMin = l.s;
    if (l.s > sMax) sMax = l.s;
    if (l.t < tMin) tMin = l.t;
    if (l.t > tMax) tMax = l.t;
  }
  return { sMin, sMax, tMin, tMax };
}

/**
 * Cotas laterais de uma parede reta: a paralela mais próxima de cada lado (sobreposta a ela ao longo do eixo), medida
 * entre os planos da referência `ref` (face acabada, núcleo, eixo...) pela face de cada uma voltada para a outra.
 */
export function wallLateralGaps(
  project: Project,
  host: WallFrame,
  ref: WallDimRef,
  targetRef: WallDimRef = ref,
): ParallelGap[] {
  if (host.arc) return [];
  const planes: LocalPlane[] = [];
  const mid = pointAt(host, host.length / 2, host.sMid);
  const hostPlanes = wallPlanes(host);
  const hostLo = wallPlaneAt(hostPlanes, ref, -1);
  const hostHi = wallPlaneAt(hostPlanes, ref, 1);

  for (const e of Object.values(project.elements)) {
    if (!isWall(e) || e.id === host.wall.id || e.levelId !== host.wall.levelId) continue;
    const other = frameOfWall(project, e.id);
    if (!other || other.arc || !areParallel(host.a, host.b, other.a, other.b)) continue;
    // A face da vizinha voltada para a hospedeira.
    const towardHost = toLocal(other, mid).s >= other.sMid ? 1 : -1;
    const plane = wallPlaneAt(wallPlanes(other), targetRef, towardHost);
    const t0 = toLocal(host, pointAt(other, 0, plane));
    const t1 = toLocal(host, pointAt(other, other.length, plane));
    planes.push({ id: e.id, s: t0.s, t0: Math.min(t0.t, t1.t), t1: Math.max(t0.t, t1.t) });
  }

  for (const col of columnsOnLevel(project, host.wall.levelId)) {
    const { sMin, sMax, tMin, tMax } = boundsInWall(host, columnPolygon(col, findColumnType(project, col.typeId)));
    // Ignora pilar inserido dentro da espessura da própria parede.
    if (Math.min(hostHi, sMax) - Math.max(hostLo, sMin) > 1e-6) continue;
    const sCenter = toLocal(host, col.at).s;
    const s = targetRef === 'axis' ? sCenter : (sCenter >= host.sMid ? sMin : sMax);
    planes.push({ id: col.id, s, t0: tMin, t1: tMax });
  }

  for (const b of beamsOnLevel(project, host.wall.levelId)) {
    if (beamLength(b) < 1e-6) continue;
    const bu = norm(sub(b.b, b.a));
    if (Math.abs(dot(host.u, bu)) < PARALLEL_TOL) continue;
    const { sMin, sMax, tMin, tMax } = boundsInWall(host, beamPolygon(b, findBeamType(project, b.typeId)));
    if (Math.min(hostHi, sMax) - Math.max(hostLo, sMin) > 1e-6) continue;
    const sAxis = (toLocal(host, b.a).s + toLocal(host, b.b).s) / 2;
    const s = targetRef === 'axis' ? sAxis : (sAxis >= host.sMid ? sMin : sMax);
    planes.push({ id: b.id, s, t0: tMin, t1: tMax });
  }

  return nearestParallelGaps((side) => wallPlaneAt(hostPlanes, ref, side), host.sMid, host.length, planes);
}
