import { add, dot, mul, norm, sub, type Vec2 } from '@hestia/geom';
import { frameOfWall, toLocal, wallPlaneAt, wallPlanes } from '@hestia/engine';
import {
  WALL_DIM_REFS,
  beamJustifyOffsets,
  beamLength,
  beamPolygon,
  beamsOnLevel,
  columnPolygon,
  columnsOnLevel,
  findBeamType,
  findColumnType,
  findFootingType,
  isBeam,
  isColumn,
  isFooting,
  isWallDimRef,
  projectGrids,
  wallsOnLevel,
  type Beam,
  type Column,
  type Footing,
  type Id,
  type WallDimRef,
} from '@hestia/model';
import {
  NON_POSITIVE_MSG,
  gapTranslation,
  segFrame,
  segLocal,
  segPoint,
  type ParallelGap,
  type SegFrame,
} from '../parallel.ts';
import {
  applyCustomTargetToGap,
  customTargetOf,
  customTargetTranslation,
  dimOverrideRef,
} from '../customRef.ts';
import { matchDimRef, tempRefs } from '../permanent.ts';
import type { DimContext, DimEditResult, DimEnd, DimProvider, TempDim } from '../types.ts';
import { neighborPlanes, polygonBoundsInFrame, type NeighborLocalPlane } from './structuralPlanes.ts';

export interface ColumnDimSubject {
  columnId: Id;
}

export interface BeamDimSubject {
  beamId: Id;
}

export interface FootingDimSubject {
  footingId: Id;
}

const DIM_OFFSET = 0.25;
const epsZero = 1e-6;

function structuralRefFor(ctx: DimContext, dimKey: string, slot: string, fallbacks: readonly string[]): WallDimRef {
  const base = isWallDimRef(ctx.settings.wallRef) && ctx.settings.wallRef === 'axis' ? 'axis' : 'finish';
  const r = dimOverrideRef(ctx, dimKey, slot, fallbacks, base);
  return r === 'axis' ? 'axis' : 'finish';
}

function makeEnd(at: Vec2, slot: string, current: WallDimRef, allowToggle = true, targetRef = false): DimEnd {
  return {
    at,
    slot,
    kind: 'wall',
    current,
    options: allowToggle ? (['axis', 'finish'] as const) : WALL_DIM_REFS,
    ...(targetRef ? { targetRef: true } : {}),
  };
}

function planeOverlapsHostS(pl: NeighborLocalPlane, loS: number, hiS: number, hostLength: number): boolean {
  if (pl.sMin === undefined || pl.sMax === undefined) return false;
  const overlapT = Math.min(hostLength, pl.t1) - Math.max(0, pl.t0) > epsZero;
  if (!overlapT) return false;
  return Math.min(hiS, pl.sMax) - Math.max(loS, pl.sMin) > epsZero;
}

function closestParallelGapOnSide(
  planes: readonly NeighborLocalPlane[],
  side: 1 | -1,
  hostS: number,
  hostLoS: number,
  hostHiS: number,
  hostLength: number,
  allowNonOverlappingFallback: boolean,
): ParallelGap | null {
  let overlapBest: ParallelGap | null = null;
  let fallbackBest: ParallelGap | null = null;
  for (const pl of planes) {
    if (planeOverlapsHostS(pl, hostLoS, hostHiS, hostLength)) continue;
    const signed = (pl.s - hostS) * side;
    if (signed <= epsZero) continue;
    const lo = Math.max(0, pl.t0);
    const hi = Math.min(hostLength, pl.t1);
    if (hi - lo > epsZero) {
      const gap: ParallelGap = { side, id: pl.id, s: pl.s, hostS, distance: signed, t: (lo + hi) / 2 };
      if (!overlapBest || signed < overlapBest.distance) overlapBest = gap;
    } else if (allowNonOverlappingFallback) {
      const gap: ParallelGap = { side, id: pl.id, s: pl.s, hostS, distance: signed, t: hostLength / 2 };
      if (!fallbackBest || signed < fallbackBest.distance) fallbackBest = gap;
    }
  }
  return overlapBest ?? fallbackBest;
}

function closestGap(gaps: readonly ParallelGap[]): ParallelGap | null {
  if (gaps.length === 0) return null;
  let best = gaps[0]!;
  for (let i = 1; i < gaps.length; i++) {
    if (gaps[i]!.distance < best.distance) best = gaps[i]!;
  }
  return best;
}

function pointElementOrthogonalDims(
  ctx: DimContext,
  providerId: 'column' | 'footing',
  el: { id: Id; levelId: Id; at: Vec2; rotation: number },
  boxCenter: Vec2,
  halfW: number,
  halfD: number,
  centerBiasX = 0,
  centerBiasY = 0,
): TempDim[] {
  const dims: TempDim[] = [];
  const ux = { x: Math.cos(el.rotation), y: Math.sin(el.rotation) };
  const uy = { x: -Math.sin(el.rotation), y: Math.cos(el.rotation) };

  const axes: Array<{ slot: string; u: Vec2; n: Vec2; halfSpanT: number; halfExtentS: number; biasS: number; offsetSign: number }> = [
    { slot: 'axisX', u: uy, n: ux, halfSpanT: halfD, halfExtentS: halfW, biasS: centerBiasX, offsetSign: 1 },
    { slot: 'axisY', u: ux, n: uy, halfSpanT: halfW, halfExtentS: halfD, biasS: centerBiasY, offsetSign: -1 },
  ];

  for (const ax of axes) {
    const dimKey = `${providerId}:${el.id}:${ax.slot}`;
    const hostSlot = `${ax.slot}Self`;
    const targetSlot = `${ax.slot}Ref`;
    const legacy = [`${providerId}:${ax.slot}`, `${providerId}:ref`];
    const hostRef = structuralRefFor(ctx, dimKey, hostSlot, legacy);
    const targetRef = structuralRefFor(ctx, dimKey, targetSlot, legacy);
    const frame: SegFrame = {
      origin: sub(boxCenter, mul(ax.u, ax.halfSpanT)),
      u: ax.u,
      n: ax.n,
      length: Math.max(0.2, 2 * ax.halfSpanT),
    };
    const pointEdit = (shiftFn: (value: number) => Vec2) => (value: number): DimEditResult => {
      if (!(value > 0)) return { error: NON_POSITIVE_MSG };
      return { commands: [{ type: 'updateElements', ids: [el.id], patch: { at: add(el.at, shiftFn(value)) } }] };
    };
    const custom = customTargetOf(ctx, dimKey);
    if (custom) {
      const rough = applyCustomTargetToGap(ctx.project, custom, boxCenter, ax.n);
      const side = rough && rough.signedDelta < 0 ? -1 : 1;
      const a = segPoint(frame, frame.length / 2, hostRef === 'axis' ? -ax.biasS : side * ax.halfExtentS);
      const res = applyCustomTargetToGap(ctx.project, custom, a, ax.n);
      if (res) {
        dims.push({
          key: dimKey,
          a,
          b: res.b,
          offset: DIM_OFFSET * ax.offsetSign,
          value: res.distance,
          ends: [makeEnd(a, hostSlot, hostRef), { ...makeEnd(res.b, targetSlot, targetRef, false, true), options: [targetRef] }],
          ...tempRefs(matchDimRef(ctx.project, a, [el.id]), custom.kind === 'element' ? custom.ref : undefined),
          edit: pointEdit((v) => customTargetTranslation(ax.n, res.signedDelta, v)),
        });
        continue;
      }
    }
    const hostCenterS = hostRef === 'axis' ? -ax.biasS : 0;
    const planes = neighborPlanes(ctx.project, el.levelId, el.id, frame, targetRef, hostCenterS);
    const gaps = ([1, -1] as const)
      .map((side) => closestParallelGapOnSide(
        planes,
        side,
        hostRef === 'axis' ? -ax.biasS : side * ax.halfExtentS,
        -ax.halfExtentS,
        ax.halfExtentS,
        frame.length,
        true,
      ))
      .filter((g): g is ParallelGap => g !== null);
    const gap = closestGap(gaps);
    if (!gap) continue;
    const a = segPoint(frame, gap.t, gap.hostS);
    const b = segPoint(frame, gap.t, gap.s);
    dims.push({
      key: dimKey,
      a,
      b,
      offset: DIM_OFFSET * ax.offsetSign,
      value: gap.distance,
      ends: [makeEnd(a, hostSlot, hostRef), makeEnd(b, targetSlot, targetRef, true, true)],
      ...tempRefs(matchDimRef(ctx.project, a, [el.id]), matchDimRef(ctx.project, b, [gap.id])),
      edit: pointEdit((v) => gapTranslation(frame.n, gap, v)),
    });
  }
  return dims;
}

export const columnDimProvider: DimProvider<ColumnDimSubject> = {
  id: 'column',
  compute(ctx, subject) {
    const col = ctx.project.elements[subject.columnId];
    if (!isColumn(col)) return [];
    const type = findColumnType(ctx.project, col.typeId);
    return pointElementOrthogonalDims(ctx, 'column', col, col.at, type.width / 2, type.depth / 2);
  },
  selectionSubject(project, id) {
    const e = project.elements[id];
    return isColumn(e) ? { columnId: e.id } : null;
  },
};

export const footingDimProvider: DimProvider<FootingDimSubject> = {
  id: 'footing',
  compute(ctx, subject) {
    const ft = ctx.project.elements[subject.footingId];
    if (!isFooting(ft)) return [];
    const type = findFootingType(ctx.project, ft.typeId);
    const ex = ft.eccentricityX ?? 0;
    const ey = ft.eccentricityY ?? 0;
    const cos = Math.cos(ft.rotation);
    const sin = Math.sin(ft.rotation);
    const boxCenter = { x: ft.at.x + ex * cos - ey * sin, y: ft.at.y + ex * sin + ey * cos };
    return pointElementOrthogonalDims(ctx, 'footing', ft, boxCenter, type.width / 2, type.length / 2, ex, ey);
  },
  selectionSubject(project, id) {
    const e = project.elements[id];
    return isFooting(e) ? { footingId: e.id } : null;
  },
};

function beamAxisGaps(ctx: DimContext, b: Beam, f: SegFrame): TempDim[] {
  const p = ctx.project;
  const out: TempDim[] = [];
  for (const [slot, endPt, sign] of [['axisA', b.a, -1] as const, ['axisB', b.b, 1] as const]) {
    const dimKey = `beam:${b.id}:${slot}`;
    const targetRef = structuralRefFor(ctx, dimKey, slot, ['beam:lateral', 'beam:ref']);
    const custom = customTargetOf(ctx, dimKey);
    if (custom) {
      const res = applyCustomTargetToGap(p, custom, endPt, f.u);
      if (res) {
        out.push({
          key: dimKey,
          a: endPt,
          b: res.b,
          offset: DIM_OFFSET,
          value: res.distance,
          ends: [makeEnd(endPt, `${slot}Self`, targetRef, false), { ...makeEnd(res.b, slot, targetRef, false, true), options: [targetRef] }],
          ...tempRefs(matchDimRef(p, endPt, [b.id]), custom.kind === 'element' ? custom.ref : undefined),
          edit(value: number): DimEditResult {
            if (!(value > 0)) return { error: NON_POSITIVE_MSG };
            const shift = customTargetTranslation(f.u, res.signedDelta, value);
            return { commands: [{ type: 'updateElements', ids: [b.id], patch: { a: add(b.a, shift), b: add(b.b, shift) } }] };
          },
        });
        continue;
      }
    }
    const planes: Array<{ id: Id; t: number }> = [];
    for (const w of wallsOnLevel(p, b.levelId)) {
      const wf = frameOfWall(p, w.id);
      if (!wf || wf.arc || Math.abs(dot(f.u, wf.u)) > 0.02) continue;
      const loc = toLocal(wf, f.origin);
      if (loc.t < -0.5 || loc.t > wf.length + 0.5) continue;
      const k = dot(f.u, wf.n);
      const wp = wallPlanes(wf);
      const tAt = (toward: 1 | -1): number => (wallPlaneAt(wp, targetRef, toward) - loc.s) / k;
      planes.push({ id: w.id, t: tAt(k < 0 ? 1 : -1) }, { id: w.id, t: tAt(k > 0 ? 1 : -1) });
    }
    for (const col of columnsOnLevel(p, b.levelId)) {
      const { sMin, sMax, tMin, tMax } = polygonBoundsInFrame(f, columnPolygon(col, findColumnType(p, col.typeId)));
      if (sMax < -0.5 || sMin > 0.5) continue;
      const tCenter = segLocal(f, col.at).t;
      planes.push({ id: col.id, t: targetRef === 'axis' ? tCenter : tMin }, { id: col.id, t: targetRef === 'axis' ? tCenter : tMax });
    }
    for (const ob of beamsOnLevel(p, b.levelId)) {
      if (ob.id === b.id || beamLength(ob) < epsZero) continue;
      if (Math.abs(dot(f.u, norm(sub(ob.b, ob.a)))) > 0.02) continue;
      const { sMin, sMax, tMin, tMax } = polygonBoundsInFrame(f, beamPolygon(ob, findBeamType(p, ob.typeId)));
      if (sMax < -0.5 || sMin > 0.5) continue;
      const tAxis = (segLocal(f, ob.a).t + segLocal(f, ob.b).t) / 2;
      planes.push({ id: ob.id, t: targetRef === 'axis' ? tAxis : tMin }, { id: ob.id, t: targetRef === 'axis' ? tAxis : tMax });
    }
    for (const g of projectGrids(p)) {
      if (g.sag !== 0 || g.points.length < 2) continue;
      if (Math.abs(dot(f.u, norm(sub(g.points[g.points.length - 1]!, g.points[0]!)))) > 0.02) continue;
      planes.push({ id: g.id, t: segLocal(f, g.points[0]!).t });
    }
    let near: { id: Id; t: number; dist: number } | null = null;
    for (const pl of planes) {
      const d = sign < 0 ? -pl.t : pl.t - f.length;
      if (d > epsZero && (!near || d < near.dist)) near = { id: pl.id, t: pl.t, dist: d };
    }
    if (!near) continue;
    const targetPt = segPoint(f, near.t, 0);
    const dVec = mul(f.u, sign);
    out.push({
      key: dimKey,
      a: endPt,
      b: targetPt,
      offset: DIM_OFFSET,
      value: near.dist,
      ends: [makeEnd(endPt, `${slot}Self`, targetRef, false), makeEnd(targetPt, slot, targetRef, true, true)],
      ...tempRefs(matchDimRef(p, endPt, [b.id]), matchDimRef(p, targetPt, [near.id])),
      edit(value: number): DimEditResult {
        if (!(value > 0)) return { error: NON_POSITIVE_MSG };
        const shift = mul(dVec, near.dist - value);
        return { commands: [{ type: 'updateElements', ids: [b.id], patch: { a: add(b.a, shift), b: add(b.b, shift) } }] };
      },
    });
  }
  return out;
}

export const beamDimProvider: DimProvider<BeamDimSubject> = {
  id: 'beam',
  compute(ctx, subject) {
    const b = ctx.project.elements[subject.beamId];
    if (!isBeam(b)) return [];
    const f = segFrame(b.a, b.b);
    if (!f) return [];
    const type = findBeamType(ctx.project, b.typeId);
    const { o1, o2, sMid } = beamJustifyOffsets(b, type);
    const hostLoS = Math.min(o1, o2);
    const hostHiS = Math.max(o1, o2);
    const translateBeam = (d: Vec2): DimEditResult => ({
      commands: [{ type: 'updateElements', ids: [b.id], patch: { a: add(b.a, d), b: add(b.b, d) } }],
    });
    const dims: TempDim[] = [];
    for (const side of [1, -1] as const) {
      const dimKey = `beam:${b.id}:${side > 0 ? 'right' : 'left'}`;
      const hostRef = structuralRefFor(ctx, dimKey, 'lateralSelf', ['beam:lateral', 'beam:ref']);
      const targetRef = structuralRefFor(ctx, dimKey, 'lateralRef', ['beam:lateral', 'beam:ref']);
      const custom = customTargetOf(ctx, dimKey);
      if (custom) {
        const rough = applyCustomTargetToGap(ctx.project, custom, segPoint(f, f.length / 2, sMid), f.n);
        const cSide = rough && rough.signedDelta < 0 ? -1 : 1;
        const a = segPoint(f, f.length / 2, hostRef === 'axis' ? sMid : (cSide > 0 ? o2 : o1));
        const res = applyCustomTargetToGap(ctx.project, custom, a, f.n);
        if (res) {
          dims.push({
            key: dimKey,
            a,
            b: res.b,
            offset: DIM_OFFSET * side,
            value: res.distance,
            ends: [makeEnd(a, 'lateralSelf', hostRef), { ...makeEnd(res.b, 'lateralRef', targetRef, false, true), options: [targetRef] }],
            ...tempRefs(matchDimRef(ctx.project, a, [b.id]), custom.kind === 'element' ? custom.ref : undefined),
            edit: (v) => (v > 0 ? translateBeam(customTargetTranslation(f.n, res.signedDelta, v)) : { error: NON_POSITIVE_MSG }),
          });
          continue;
        }
      }
      const planes = neighborPlanes(ctx.project, b.levelId, b.id, f, targetRef, sMid);
      const gap = closestParallelGapOnSide(planes, side, hostRef === 'axis' ? sMid : (side > 0 ? o2 : o1), hostLoS, hostHiS, f.length, false);
      if (!gap) continue;
      const a = segPoint(f, gap.t, gap.hostS);
      const ptB = segPoint(f, gap.t, gap.s);
      dims.push({
        key: dimKey,
        a,
        b: ptB,
        offset: DIM_OFFSET * side,
        value: gap.distance,
        ends: [makeEnd(a, 'lateralSelf', hostRef), makeEnd(ptB, 'lateralRef', targetRef, true, true)],
        ...tempRefs(matchDimRef(ctx.project, a, [b.id]), matchDimRef(ctx.project, ptB, [gap.id])),
        edit: (v) => (v > 0 ? translateBeam(gapTranslation(f.n, gap, v)) : { error: NON_POSITIVE_MSG }),
      });
    }
    dims.push(...beamAxisGaps(ctx, b, f));

    // Comprimento da própria viga (sempre editável na ponta b ao longo do eixo).
    const lengthEdit = (value: number): DimEditResult => {
      if (value < 0.05) return { error: NON_POSITIVE_MSG };
      return { commands: [{ type: 'updateElements', ids: [b.id], patch: { b: add(b.a, mul(f.u, value)) } }] };
    };
    dims.push({
      key: `beam:${b.id}:length`,
      a: b.a,
      b: b.b,
      offset: DIM_OFFSET + type.width / 2,
      value: f.length,
      ends: [makeEnd(b.a, 'lenA', 'axis', false), makeEnd(b.b, 'lenB', 'axis', false)],
      ...tempRefs(matchDimRef(ctx.project, b.a, [b.id]), matchDimRef(ctx.project, b.b, [b.id])),
      edit: lengthEdit,
    });
    return dims;
  },
  selectionSubject(project, id) {
    const e = project.elements[id];
    return isBeam(e) ? { beamId: e.id } : null;
  },
};

export type StructuralElement = Column | Beam | Footing;
