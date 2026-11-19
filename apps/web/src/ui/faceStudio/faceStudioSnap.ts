import { boxOf, closestOnSegment, dist, multiPoints, v2, type Vec2 } from '@hestia/geom';
import type { UnwrappedFace } from '@hestia/engine';

export interface FaceCamera {
  cu: number;
  cv: number;
  zoom: number;
}

export interface SnapTargets {
  points: Vec2[];
  edges: Array<[Vec2, Vec2]>;
}

export interface FaceSnapResult {
  uv: Vec2;
  kind: 'none' | 'point' | 'edge' | 'grid';
}

const GRID_STEPS = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5];

/** Chooses a readable metric grid step in meters for the current zoom (px/m). */
export function chooseGridStep(zoom: number): number {
  const minPx = 28;
  for (const step of GRID_STEPS) {
    if (step * zoom >= minPx) return step;
  }
  return 5;
}

/** Converts screen CSS coordinates inside the canvas to face `(u, v)` meters. */
export function screenToFace(sx: number, sy: number, width: number, height: number, cam: FaceCamera): Vec2 {
  return v2(cam.cu + (sx - width / 2) / cam.zoom, cam.cv - (sy - height / 2) / cam.zoom);
}

/** Converts face `(u, v)` meters to screen CSS coordinates inside the canvas. */
export function faceToScreen(uv: Vec2, width: number, height: number, cam: FaceCamera): Vec2 {
  return v2(width / 2 + (uv.x - cam.cu) * cam.zoom, height / 2 - (uv.y - cam.cv) * cam.zoom);
}

/** Computes a centered camera fitting the unwrapped face with padding. */
export function fitFaceCamera(face: UnwrappedFace, width: number, height: number): FaceCamera {
  const pts = multiPoints(face.boundary);
  const box = pts.length > 0
    ? boxOf(pts)
    : { minX: 0, minY: 0, maxX: Math.max(0.2, face.width), maxY: Math.max(0.2, face.height) };
  const spanU = Math.max(0.1, box.maxX - box.minX);
  const spanV = Math.max(0.1, box.maxY - box.minY);
  const pad = 0.82;
  const zoom = Math.max(15, Math.min(2000, Math.min((width * pad) / spanU, (height * pad) / spanV)));
  return {
    cu: (box.minX + box.maxX) / 2,
    cv: (box.minY + box.maxY) / 2,
    zoom,
  };
}

/** Zooms camera keeping the point under `(sx, sy)` anchored. */
export function zoomFaceCamera(
  cam: FaceCamera,
  sx: number,
  sy: number,
  width: number,
  height: number,
  factor: number,
): FaceCamera {
  const nextZoom = Math.max(10, Math.min(5000, cam.zoom * factor));
  const before = screenToFace(sx, sy, width, height, cam);
  return {
    zoom: nextZoom,
    cu: before.x - (sx - width / 2) / nextZoom,
    cv: before.y + (sy - height / 2) / nextZoom,
  };
}

function pushRectTargets(out: SnapTargets, u0: number, v0: number, u1: number, v1: number, withCenter: boolean): void {
  const c00 = v2(u0, v0);
  const c10 = v2(u1, v0);
  const c11 = v2(u1, v1);
  const c01 = v2(u0, v1);
  out.points.push(c00, c10, c11, c01);
  out.points.push(
    v2((u0 + u1) / 2, v0),
    v2((u0 + u1) / 2, v1),
    v2(u0, (v0 + v1) / 2),
    v2(u1, (v0 + v1) / 2),
  );
  if (withCenter) out.points.push(v2((u0 + u1) / 2, (v0 + v1) / 2));
  out.edges.push([c00, c10], [c10, c11], [c11, c01], [c01, c00]);
}

/** Collects magnetic snap points and edges from face boundary, openings, dividers, and cross walls. */
export function collectSnapTargets(face: UnwrappedFace): SnapTargets {
  const out: SnapTargets = { points: [], edges: [] };
  pushRectTargets(out, 0, 0, face.width, face.height, true);

  for (const poly of face.boundary) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % ring.length]!;
        out.points.push(a, v2((a.x + b.x) / 2, (a.y + b.y) / 2));
        out.edges.push([a, b]);
      }
    }
  }

  for (const op of face.openings) {
    pushRectTargets(out, op.rect.u0, op.rect.v0, op.rect.u1, op.rect.v1, true);
  }

  for (const dv of face.layerDividers) {
    pushRectTargets(out, dv.u0, dv.v0, dv.u1, dv.v1, false);
  }

  for (const cw of face.crossWalls) {
    pushRectTargets(out, cw.u0, cw.v0, cw.u1, cw.v1, false);
  }

  return out;
}

/** Applies magnetic snap to points, edges, and fine metric grid. */
export function snapFacePoint(
  rawUv: Vec2,
  targets: SnapTargets,
  zoom: number,
  snapGrid: boolean,
  gridStep = 0.05,
): FaceSnapResult {
  const ptTol = 10 / zoom;
  let bestPt: Vec2 | null = null;
  let bestPtDist = ptTol;
  for (const p of targets.points) {
    const d = dist(rawUv, p);
    if (d < bestPtDist) {
      bestPtDist = d;
      bestPt = p;
    }
  }
  if (bestPt) return { uv: bestPt, kind: 'point' };

  const edgeTol = 7 / zoom;
  let bestEdgePt: Vec2 | null = null;
  let bestEdgeDist = edgeTol;
  for (const [a, b] of targets.edges) {
    const q = closestOnSegment(rawUv, a, b);
    const d = dist(rawUv, q);
    if (d < bestEdgeDist) {
      bestEdgeDist = d;
      bestEdgePt = q;
    }
  }
  if (bestEdgePt) return { uv: bestEdgePt, kind: 'edge' };

  if (snapGrid) {
    const step = gridStep > 0 ? gridStep : 0.05;
    return {
      uv: v2(Math.round(rawUv.x / step) * step, Math.round(rawUv.y / step) * step),
      kind: 'grid',
    };
  }

  return { uv: rawUv, kind: 'none' };
}
