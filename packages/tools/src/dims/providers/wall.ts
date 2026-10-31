import { mul, type Vec2 } from '@hestia/geom';
import { frameOfWall, pointAt, type WallFrame } from '@hestia/engine';
import {
  WALL_DIM_REFS,
  isWall,
  isWallDimRef,
  type Id,
  type Project,
  type WallDimRef,
} from '@hestia/model';
import { matchDimRef, tempRefs } from '../permanent.ts';
import { translateWallsJoined } from '../../wallFollow.ts';
import { axisGaps, type AxisGap } from './wallAxisGaps.ts';
import { wallLateralGaps } from './wallLateral.ts';
import { NON_POSITIVE_MSG, gapTranslation, type ParallelGap } from '../parallel.ts';
import type { DimContext, DimEditResult, DimEnd, DimProvider, TempDim } from '../types.ts';

/** Parede a cotar: distância lateral até as paralelas vizinhas (ou, sem elas, vão axial até a perpendicular). */
export interface WallDimSubject {
  wallId: Id;
}

const PROVIDER_ID = 'wall';
const DIM_OFFSET = 0.25;

/** Chave global (troca rápida): vale para todas as pontas de parede. */
export const WALL_REF_KEY = `${PROVIDER_ID}:wall`;

const slotKey = (slot: string): string => `${PROVIDER_ID}:${slot}`;

function wallRefFor(ctx: DimContext, slot: string): WallDimRef {
  const v = ctx.overrides[slotKey(slot)] ?? ctx.overrides[WALL_REF_KEY];
  return isWallDimRef(v) ? v : ctx.settings.wallRef;
}

const lengthEnd = (at: Vec2, slot: string): DimEnd => ({
  at,
  slot,
  kind: 'wall',
  current: 'axis',
  options: WALL_DIM_REFS,
});

/** Cota da ponta da parede até a perpendicular mais próxima: editar translada a parede ao longo do eixo (hospedados acompanham). */
function axisDim(project: Project, frame: WallFrame, gap: AxisGap, ref: WallDimRef): TempDim {
  const atEnd = gap.end === 'b' ? frame.length : 0;
  const a = pointAt(frame, atEnd, frame.sMid);
  const b = pointAt(frame, gap.targetT, frame.sMid);
  const edit = (value: number): DimEditResult => {
    if (!(value > 0)) return { error: NON_POSITIVE_MSG };
    // A ponta b se afasta do alvo recuando para −u; a ponta a, avançando para +u.
    const shift = (gap.end === 'b' ? 1 : -1) * (gap.distance - value);
    return translateWallsJoined(project, frame.wall.levelId, [frame.wall.id], mul(frame.u, shift));
  };
  const slot = gap.end === 'b' ? 'axisB' : 'axisA';
  return {
    key: `${PROVIDER_ID}:${frame.wall.id}:${slot}`,
    a,
    b,
    offset: DIM_OFFSET,
    value: gap.distance,
    // A ponta da parede cotada não depende da referência: só o plano da perpendicular a usa.
    ends: [
      { at: a, slot: `${slot}Self`, kind: 'wall', current: ref, options: [ref] },
      { at: b, slot, kind: 'wall', current: ref, options: WALL_DIM_REFS },
    ],
    ...tempRefs(matchDimRef(project, a, [frame.wall.id]), undefined),
    edit,
  };
}

/** Cota lateral (perpendicular ao eixo) até a paralela vizinha: editar translada a parede (hospedados acompanham). */
function gapDim(project: Project, frame: WallFrame, gap: ParallelGap, ref: WallDimRef): TempDim {
  const a = pointAt(frame, gap.t, gap.hostS);
  const b = pointAt(frame, gap.t, gap.s);
  const edit = (value: number): DimEditResult => {
    if (!(value > 0)) return { error: NON_POSITIVE_MSG };
    return translateWallsJoined(project, frame.wall.levelId, [frame.wall.id], gapTranslation(frame.n, gap, value));
  };
  return {
    key: `${PROVIDER_ID}:${frame.wall.id}:${gap.side > 0 ? 'right' : 'left'}`,
    a,
    b,
    offset: DIM_OFFSET * (gap.side > 0 ? 1 : -1),
    value: gap.distance,
    ends: [
      { at: a, slot: gap.side > 0 ? 'gapRightA' : 'gapLeftA', kind: 'wall', current: ref, options: WALL_DIM_REFS },
      { at: b, slot: gap.side > 0 ? 'gapRightB' : 'gapLeftB', kind: 'wall', current: ref, options: WALL_DIM_REFS },
    ],
    ...tempRefs(matchDimRef(project, a, [frame.wall.id]), matchDimRef(project, b, [frame.wall.id])),
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
    const ref = wallRefFor(ctx, 'wall');
    const lateral = wallLateralGaps(ctx.project, frame, ref);
    if (lateral.length > 0) return lateral.map((g) => gapDim(ctx.project, frame, g, ref));
    return axisGaps(ctx.project, frame, ref).map((g) => axisDim(ctx.project, frame, g, ref));
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
