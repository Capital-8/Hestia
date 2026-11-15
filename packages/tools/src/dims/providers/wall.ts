import { mul, type Vec2 } from '@hestia/geom';
import { frameOfWall, pointAt, wallPlaneAt, wallPlanes, type WallFrame } from '@hestia/engine';
import {
  WALL_DIM_REFS,
  isWall,
  type Id,
  type Project,
} from '@hestia/model';
import {
  applyCustomTargetToGap,
  customTargetOf,
  customTargetTranslation,
  dimOverrideRef,
  type DimCustomTarget,
} from '../customRef.ts';
import { matchDimRef, tempRefs } from '../permanent.ts';
import { translateWallsJoined } from '../../wallFollow.ts';
import { axisGaps } from './wallAxisGaps.ts';
import { wallLateralGaps } from './wallLateral.ts';
import { NON_POSITIVE_MSG, gapTranslation } from '../parallel.ts';
import type { DimContext, DimEditResult, DimEnd, DimProvider, TempDim } from '../types.ts';

/** Parede a cotar: distância lateral até as paralelas vizinhas (ou, sem elas, vão axial até a perpendicular). */
export interface WallDimSubject {
  wallId: Id;
}

const PROVIDER_ID = 'wall';
const DIM_OFFSET = 0.25;

/** Chave global (troca rápida): vale para todas as pontas de parede. */
export const WALL_REF_KEY = `${PROVIDER_ID}:wall`;

const customRefs = (project: Project, a: Vec2, hostId: Id, custom: DimCustomTarget): Pick<TempDim, 'refs'> => {
  const hostRef = matchDimRef(project, a, [hostId]);
  const bRef = custom.kind === 'element' ? custom.ref : undefined;
  return tempRefs(hostRef, bRef);
};

const lengthEnd = (at: Vec2, slot: string): DimEnd => ({
  at,
  slot,
  kind: 'wall',
  current: 'axis',
  options: WALL_DIM_REFS,
});

/** Cota da ponta da parede até a perpendicular mais próxima: editar translada a parede ao longo do eixo (hospedados acompanham). */
function axisDimForEnd(ctx: DimContext, frame: WallFrame, end: 'a' | 'b'): TempDim | null {
  const project = ctx.project;
  const slot = end === 'b' ? 'axisB' : 'axisA';
  const key = `${PROVIDER_ID}:${frame.wall.id}:${slot}`;
  const targetRef = dimOverrideRef(ctx, key, slot, [WALL_REF_KEY], ctx.settings.wallRef);
  const atEnd = end === 'b' ? frame.length : 0;
  const a = pointAt(frame, atEnd, frame.sMid);
  const custom = customTargetOf(ctx, key);
  if (custom) {
    const res = applyCustomTargetToGap(project, custom, a, frame.u);
    if (res) {
      return {
        key,
        a,
        b: res.b,
        offset: DIM_OFFSET,
        value: res.distance,
        ends: [
          { at: a, slot: `${slot}Self`, kind: 'wall', current: targetRef, options: [targetRef] },
          { at: res.b, slot, kind: 'wall', current: targetRef, options: [targetRef], targetRef: true },
        ],
        ...customRefs(project, a, frame.wall.id, custom),
        edit: (value: number): DimEditResult => {
          if (!(value > 0)) return { error: NON_POSITIVE_MSG };
          return translateWallsJoined(project, frame.wall.levelId, [frame.wall.id], customTargetTranslation(frame.u, res.signedDelta, value));
        },
      };
    }
  }
  const gap = axisGaps(project, frame, targetRef).find((g) => g.end === end);
  if (!gap) return null;
  const b = pointAt(frame, gap.targetT, frame.sMid);
  const edit = (value: number): DimEditResult => {
    if (!(value > 0)) return { error: NON_POSITIVE_MSG };
    // A ponta b se afasta do alvo recuando para −u; a ponta a, avançando para +u.
    const shift = (gap.end === 'b' ? 1 : -1) * (gap.distance - value);
    return translateWallsJoined(project, frame.wall.levelId, [frame.wall.id], mul(frame.u, shift));
  };
  return {
    key,
    a,
    b,
    offset: DIM_OFFSET,
    value: gap.distance,
    // A ponta da parede cotada não depende da referência: só o plano da perpendicular a usa.
    ends: [
      { at: a, slot: `${slot}Self`, kind: 'wall', current: targetRef, options: [targetRef] },
      { at: b, slot, kind: 'wall', current: targetRef, options: WALL_DIM_REFS, targetRef: true },
    ],
    ...tempRefs(matchDimRef(project, a, [frame.wall.id]), matchDimRef(project, b, [gap.ownerId])),
    edit,
  };
}

/** Cota lateral (perpendicular ao eixo) de um dos lados (`right` ou `left`) da parede. */
function gapDimForSide(ctx: DimContext, frame: WallFrame, side: 1 | -1): TempDim | null {
  const project = ctx.project;
  const sideName = side > 0 ? 'right' : 'left';
  const key = `${PROVIDER_ID}:${frame.wall.id}:${sideName}`;
  const hostSlot = side > 0 ? 'gapRightA' : 'gapLeftA';
  const targetSlot = side > 0 ? 'gapRightB' : 'gapLeftB';
  const hostRef = dimOverrideRef(ctx, key, hostSlot, [WALL_REF_KEY], ctx.settings.wallRef);
  const targetRef = dimOverrideRef(ctx, key, targetSlot, [WALL_REF_KEY], ctx.settings.wallRef);
  const custom = customTargetOf(ctx, key);
  if (custom) {
    const a = pointAt(frame, frame.length / 2, wallPlaneAt(wallPlanes(frame), hostRef, side));
    const res = applyCustomTargetToGap(project, custom, a, frame.n);
    if (res) {
      return {
        key,
        a,
        b: res.b,
        offset: DIM_OFFSET * side,
        value: res.distance,
        ends: [
          { at: a, slot: hostSlot, kind: 'wall', current: hostRef, options: WALL_DIM_REFS },
          { at: res.b, slot: targetSlot, kind: 'wall', current: targetRef, options: [targetRef], targetRef: true },
        ],
        ...customRefs(project, a, frame.wall.id, custom),
        edit: (value: number): DimEditResult => {
          if (!(value > 0)) return { error: NON_POSITIVE_MSG };
          return translateWallsJoined(project, frame.wall.levelId, [frame.wall.id], customTargetTranslation(frame.n, res.signedDelta, value));
        },
      };
    }
  }
  const gap = wallLateralGaps(project, frame, hostRef, targetRef).find((g) => g.side === side);
  if (!gap) return null;
  const a = pointAt(frame, gap.t, gap.hostS);
  const b = pointAt(frame, gap.t, gap.s);
  const edit = (value: number): DimEditResult => {
    if (!(value > 0)) return { error: NON_POSITIVE_MSG };
    return translateWallsJoined(project, frame.wall.levelId, [frame.wall.id], gapTranslation(frame.n, gap, value));
  };
  return {
    key,
    a,
    b,
    offset: DIM_OFFSET * side,
    value: gap.distance,
    ends: [
      { at: a, slot: hostSlot, kind: 'wall', current: hostRef, options: WALL_DIM_REFS },
      { at: b, slot: targetSlot, kind: 'wall', current: targetRef, options: WALL_DIM_REFS, targetRef: true },
    ],
    ...tempRefs(matchDimRef(project, a, [frame.wall.id]), matchDimRef(project, b, [gap.id])),
    edit,
  };
}

/**
 * Cotas de uma parede selecionada: a distância lateral (perpendicular ao eixo) até a paralela mais próxima de cada
 * lado. Só quando não há nenhuma paralela surge a cota axial da ponta até a perpendicular mais próxima. O comprimento
 * da própria parede nunca é cota temporária.
 */
export const wallDimProvider: DimProvider<WallDimSubject> = {
  id: PROVIDER_ID,
  compute(ctx, subject) {
    const frame = frameOfWall(ctx.project, subject.wallId);
    if (!frame) return [];
    const lateral = ([1, -1] as const)
      .map((side) => gapDimForSide(ctx, frame, side))
      .filter((d): d is TempDim => d !== null);
    if (lateral.length > 0) return lateral;
    return (['b', 'a'] as const)
      .map((end) => axisDimForEnd(ctx, frame, end))
      .filter((d): d is TempDim => d !== null);
  },
  selectionSubject(project, id) {
    const w = project.elements[id];
    return w && isWall(w) ? { wallId: w.id } : null;
  },
};

/** Cota de leitura do segmento em desenho (comprimento da parede antes de criar). */
export function segmentLengthDim(a: Vec2, b: Vec2): TempDim {
  const value = Math.hypot(b.x - a.x, b.y - a.y);
  return {
    key: `${PROVIDER_ID}:draft:length`,
    a,
    b,
    offset: DIM_OFFSET,
    value,
    ends: [lengthEnd(a, 'draftA'), lengthEnd(b, 'draftB')],
  };
}
