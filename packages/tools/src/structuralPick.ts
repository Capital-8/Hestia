import { add, boxOf, boxesOverlap, dist, intersectSegments, pointInRing, sagFromThreePoints, sub, type Vec2 } from '@hestia/geom';
import {
  beamAxisPolyline,
  beamMidPoint,
  beamPolygon,
  beamsOnLevel,
  columnPolygon,
  columnsOnLevel,
  findBeamType,
  findColumnType,
  findFootingType,
  footingPolygon,
  footingsOnLevel,
  isBeam,
  isColumn,
  isFooting,
  type Beam,
  type Column,
  type Footing,
  type Id,
  type Project,
} from '@hestia/model';
import type { GripHold, GripProvider } from './selectGrips.ts';
import type { ToolEnv, PreviewItem } from './types.ts';

/** Distância de um ponto a um segmento de reta. */
function distToSegment(q: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / l2));
  return dist(q, { x: a.x + dx * t, y: a.y + dy * t });
}

/** Ponto dentro do polígono ou a até `tol` de qualquer uma das arestas. */
function polyNear(poly: readonly Vec2[], at: Vec2, tol: number): boolean {
  if (poly.length < 3) return false;
  if (pointInRing(at, poly as Vec2[])) return true;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    if (distToSegment(at, poly[i]!, poly[(i + 1) % n]!) <= tol) return true;
  }
  return false;
}

/** Pilar sob o cursor no nível ativo (o mais recente vence). */
export function pickColumnAt(p: Project, levelId: Id, at: Vec2, mpp: number): Id | null {
  const tol = 4 * mpp;
  const columns = columnsOnLevel(p, levelId);
  for (let i = columns.length - 1; i >= 0; i--) {
    const c = columns[i]!;
    const type = findColumnType(p, c.typeId);
    if (type?.shape === 'round') {
      const r = (type.width ?? 0.2) / 2;
      if (dist(at, c.at) <= r + tol) return c.id;
    }
    const poly = columnPolygon(c, type);
    if (polyNear(poly, at, tol)) return c.id;
  }
  return null;
}

/** Viga sob o cursor no nível ativo (a mais recente vence). */
export function pickBeamAt(p: Project, levelId: Id, at: Vec2, mpp: number): Id | null {
  const tol = 4 * mpp;
  const beams = beamsOnLevel(p, levelId);
  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i]!;
    const type = findBeamType(p, b.typeId);
    const poly = beamPolygon(b, type);
    if (polyNear(poly, at, tol)) return b.id;
  }
  return null;
}

/** Sapata sob o cursor no nível ativo (a mais recente vence). */
export function pickFootingAt(p: Project, levelId: Id, at: Vec2, mpp: number): Id | null {
  const tol = 4 * mpp;
  const footings = footingsOnLevel(p, levelId);
  for (let i = footings.length - 1; i >= 0; i--) {
    const f = footings[i]!;
    const type = findFootingType(p, f.typeId);
    const poly = footingPolygon(f, type);
    if (polyNear(poly, at, tol)) return f.id;
  }
  return null;
}

/** Verifica se um anel está contido na janela (esq→dir) ou a cruza (dir→esq). */
function ringInBox(ring: readonly Vec2[], a: Vec2, b: Vec2): boolean {
  if (ring.length === 0) return false;
  const box = boxOf([a, b]);
  const crossing = b.x < a.x;
  const inside = (q: Vec2): boolean => q.x >= box.minX && q.x <= box.maxX && q.y >= box.minY && q.y <= box.maxY;
  const allInside = ring.every(inside);
  if (allInside) return true;
  if (!crossing) return false;
  if (!boxesOverlap(boxOf(ring as Vec2[]), box)) return false;
  const anyInside = ring.some(inside);
  if (anyInside) return true;
  const corners: Vec2[] = [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ];
  if (corners.some((c) => pointInRing(c, ring as Vec2[]))) return true;
  return corners.some((c, i) => {
    const next = corners[(i + 1) % 4]!;
    return ring.some((v, j) => intersectSegments(c, next, v, ring[(j + 1) % ring.length]!) !== null);
  });
}

/** Pilares dentro da janela ou cruzados por ela. */
export function columnIdsInBox(p: Project, levelId: Id, a: Vec2, b: Vec2): Id[] {
  const ids: Id[] = [];
  for (const c of columnsOnLevel(p, levelId)) {
    const poly = columnPolygon(c, findColumnType(p, c.typeId));
    if (ringInBox(poly, a, b)) ids.push(c.id);
  }
  return ids;
}

/** Vigas dentro da janela ou cruzadas por ela. */
export function beamIdsInBox(p: Project, levelId: Id, a: Vec2, b: Vec2): Id[] {
  const ids: Id[] = [];
  for (const bm of beamsOnLevel(p, levelId)) {
    const poly = beamPolygon(bm, findBeamType(p, bm.typeId));
    if (ringInBox(poly, a, b)) ids.push(bm.id);
  }
  return ids;
}

/** Sapatas dentro da janela ou cruzadas por ela. */
export function footingIdsInBox(p: Project, levelId: Id, a: Vec2, b: Vec2): Id[] {
  const ids: Id[] = [];
  for (const ft of footingsOnLevel(p, levelId)) {
    const poly = footingPolygon(ft, findFootingType(p, ft.typeId));
    if (ringInBox(poly, a, b)) ids.push(ft.id);
  }
  return ids;
}

export const selectedColumns = (p: Project, ids: readonly Id[]): Id[] => ids.filter((id) => isColumn(p.elements[id]));
export const selectedBeams = (p: Project, ids: readonly Id[]): Id[] => ids.filter((id) => isBeam(p.elements[id]));
export const selectedFootings = (p: Project, ids: readonly Id[]): Id[] => ids.filter((id) => isFooting(p.elements[id]));

export const columnRotationHandle = (c: Column, r: number): Vec2 => ({ x: c.at.x + r * Math.cos(c.rotation), y: c.at.y + r * Math.sin(c.rotation) });

function columnGripHold(env: ToolEnv, c: Column, kind: 'center' | 'rotate', gripPt: Vec2, r: number): GripHold {
  let finalAt = c.at;
  let finalRot = c.rotation;
  const type = findColumnType(env.project(), c.typeId);
  return {
    at: gripPt,
    keepsFocus: false,
    drag(p, snap) {
      if (kind === 'center') {
        finalAt = snap({ from: c.at, ignore: new Set([c.id]) });
        const poly = columnPolygon({ ...c, at: finalAt, rotation: c.rotation }, type);
        return [{ kind: 'polygon', ring: poly, dashed: true }, { kind: 'line', a: c.at, b: finalAt, dashed: true }];
      }
      finalRot = Math.atan2(p.raw.y - c.at.y, p.raw.x - c.at.x);
      const poly = columnPolygon({ ...c, at: c.at, rotation: finalRot }, type);
      const rotHandle = columnRotationHandle({ ...c, at: c.at, rotation: finalRot }, r);
      return [{ kind: 'polygon', ring: poly, dashed: true }, { kind: 'line', a: c.at, b: rotHandle, dashed: true }, { kind: 'point', at: rotHandle }];
    },
    release() {
      if (kind === 'center') {
        if (dist(finalAt, c.at) > 1e-6) env.exec({ type: 'updateElements', ids: [c.id], patch: { at: finalAt } });
      } else if (Math.abs(finalRot - c.rotation) > 1e-6) {
        env.exec({ type: 'updateElements', ids: [c.id], patch: { rotation: finalRot } });
      }
    },
  };
}

export const columnGrip: GripProvider = (env, at) => {
  const p = env.project();
  const tol = 9 * env.metersPerPixel();
  for (const id of env.selection()) {
    const el = p.elements[id];
    if (!isColumn(el)) continue;
    const type = findColumnType(p, el.typeId);
    const r = Math.max(0.4, ((type?.depth ?? 0.4) / 2) + 0.3);
    const rotPt = columnRotationHandle(el, r);
    if (dist(at, rotPt) <= tol) return columnGripHold(env, el, 'rotate', rotPt, r);
    if (dist(at, el.at) <= tol) return columnGripHold(env, el, 'center', el.at, r);
  }
  return null;
};

function beamPreviewItems(b: Pick<Beam, 'a' | 'b' | 'justify' | 'sag'>, type: ReturnType<typeof findBeamType>): PreviewItem[] {
  const poly = beamPolygon(b, type);
  const axis = beamAxisPolyline(b, 0);
  const items: PreviewItem[] = [{ kind: 'polygon', ring: poly, dashed: true }];
  for (let i = 1; i < axis.length; i++) {
    items.push({ kind: 'line', a: axis[i - 1]!, b: axis[i]!, dashed: true });
  }
  return items;
}

function beamGripHold(env: ToolEnv, b: Beam, kind: 'a' | 'b' | 'mid' | 'arc', gripPt: Vec2): GripHold {
  let finalA = b.a;
  let finalB = b.b;
  let finalSag = b.sag ?? 0;
  const type = findBeamType(env.project(), b.typeId);
  const mid = beamMidPoint(b);
  return {
    at: gripPt,
    keepsFocus: false,
    drag(_p, snap) {
      if (kind === 'a') {
        finalA = snap({ from: b.b, ignore: new Set([b.id]) });
        return beamPreviewItems({ a: finalA, b: b.b, justify: b.justify, sag: b.sag }, type);
      }
      if (kind === 'b') {
        finalB = snap({ from: b.a, ignore: new Set([b.id]) });
        return beamPreviewItems({ a: b.a, b: finalB, justify: b.justify, sag: b.sag }, type);
      }
      if (kind === 'arc') {
        const pt = snap({ from: gripPt, ignore: new Set([b.id]) });
        finalSag = sagFromThreePoints(b.a, pt, b.b);
        return beamPreviewItems({ a: b.a, b: b.b, justify: b.justify, sag: finalSag }, type);
      }
      const inf = snap({ from: mid, ignore: new Set([b.id]) });
      const delta = sub(inf, mid);
      finalA = add(b.a, delta);
      finalB = add(b.b, delta);
      return [
        ...beamPreviewItems({ a: finalA, b: finalB, justify: b.justify, sag: b.sag }, type),
        { kind: 'line', a: b.a, b: finalA, dashed: true },
        { kind: 'line', a: b.b, b: finalB, dashed: true },
      ];
    },
    release() {
      if (kind === 'arc') {
        if (Math.abs(finalSag - (b.sag ?? 0)) > 1e-6) {
          env.exec({ type: 'updateElements', ids: [b.id], patch: { sag: finalSag } });
        }
        return;
      }
      if (dist(finalA, finalB) < 0.01) {
        env.say('Comprimento mínimo da viga não atingido.');
        return;
      }
      if (dist(finalA, b.a) > 1e-6 || dist(finalB, b.b) > 1e-6) env.exec({ type: 'updateElements', ids: [b.id], patch: { a: finalA, b: finalB } });
    },
  };
}

export const beamGrip: GripProvider = (env, at) => {
  const p = env.project();
  const tol = 9 * env.metersPerPixel();
  for (const id of env.selection()) {
    const el = p.elements[id];
    if (!isBeam(el)) continue;
    const mid = beamMidPoint(el);
    const isCurved = Boolean(el.sag && Math.abs(el.sag) > 1e-6);
    if (dist(at, el.a) <= tol) return beamGripHold(env, el, 'a', el.a);
    if (dist(at, el.b) <= tol) return beamGripHold(env, el, 'b', el.b);
    if (dist(at, mid) <= tol) return beamGripHold(env, el, isCurved ? 'arc' : 'mid', mid);
  }
  return null;
};

export const footingRotationHandle = (f: Footing, r: number): Vec2 => ({ x: f.at.x + r * Math.cos(f.rotation), y: f.at.y + r * Math.sin(f.rotation) });

function footingGripHold(env: ToolEnv, f: Footing, kind: 'center' | 'rotate', gripPt: Vec2, r: number): GripHold {
  let finalAt = f.at;
  let finalRot = f.rotation;
  const type = findFootingType(env.project(), f.typeId);
  return {
    at: gripPt,
    keepsFocus: false,
    drag(p, snap) {
      if (kind === 'center') {
        finalAt = snap({ from: f.at, ignore: new Set([f.id]) });
        const poly = footingPolygon({ ...f, at: finalAt, rotation: f.rotation }, type);
        return [{ kind: 'polygon', ring: poly, dashed: true }, { kind: 'line', a: f.at, b: finalAt, dashed: true }];
      }
      finalRot = Math.atan2(p.raw.y - f.at.y, p.raw.x - f.at.x);
      const poly = footingPolygon({ ...f, at: f.at, rotation: finalRot }, type);
      const rotHandle = footingRotationHandle({ ...f, at: f.at, rotation: finalRot }, r);
      return [{ kind: 'polygon', ring: poly, dashed: true }, { kind: 'line', a: f.at, b: rotHandle, dashed: true }, { kind: 'point', at: rotHandle }];
    },
    release() {
      if (kind === 'center') {
        if (dist(finalAt, f.at) > 1e-6) env.exec({ type: 'updateElements', ids: [f.id], patch: { at: finalAt } });
      } else if (Math.abs(finalRot - f.rotation) > 1e-6) {
        env.exec({ type: 'updateElements', ids: [f.id], patch: { rotation: finalRot } });
      }
    },
  };
}

export const footingGrip: GripProvider = (env, at) => {
  const p = env.project();
  const tol = 9 * env.metersPerPixel();
  for (const id of env.selection()) {
    const el = p.elements[id];
    if (!isFooting(el)) continue;
    const type = findFootingType(p, el.typeId);
    const r = Math.max(0.6, ((type?.length ?? 1.0) / 2) + 0.3);
    const rotPt = footingRotationHandle(el, r);
    if (dist(at, rotPt) <= tol) return footingGripHold(env, el, 'rotate', rotPt, r);
    if (dist(at, el.at) <= tol) return footingGripHold(env, el, 'center', el.at, r);
  }
  return null;
};

