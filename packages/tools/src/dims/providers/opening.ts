import { frameOfWall, openingEdge, openingExtents, pointAt, type OpeningExtents, type WallFrame } from '@hestia/engine';
import {
  OPENING_DIM_REFS,
  WALL_DIM_REFS,
  isOpeningDimRef,
  isWallDimRef,
  isOpening,
  openingTypeById,
  openingsOfWall,
  type Id,
  type Opening,
  type OpeningDimRef,
  type Project,
  type WallDimRef,
} from '@hestia/model';
import { occupiedRanges } from '../../infer.ts';
import { overlapsPerpendicular, perpendicularNeighbors } from '../../openingPlacement.ts';
import { matchDimRef, tempRefs } from '../permanent.ts';
import { hostTargets, type HostTarget } from '../refs.ts';
import { neighborOpeningTargets } from './openingNeighbors.ts';
import type { DimContext, DimEditResult, DimEnd, DimProvider, TempDim } from '../types.ts';

/** Esquadria a cotar: a já colocada (com `id`) ou a prévia da colocação (sem `id`, cotas só de leitura). */
export interface OpeningDimSubject {
  hostId: Id;
  /** Posição do centro ao longo da hospedeira. */
  offset: number;
  typeId: Id;
  flipFacing: boolean;
  flipHand?: boolean;
  /** Ausente na colocação. */
  id?: Id;
  /** Lado da planta em que as cotas são desenhadas (+1 = lado de `n` da hospedeira). */
  side: 1 | -1;
}

const PROVIDER_ID = 'opening';
/** Folga das pontas da parede (a mesma do posicionamento da ferramenta). */
const END_GAP = 0.01;
const EPS = 1e-6;
/** Afastamento da linha de cota em relação à face da parede (m). */
const DIM_OFFSET = 0.25;

/** Chave global (troca rápida): vale para as duas pontas de parede / de esquadria. */
export const OPENING_WALL_KEY = `${PROVIDER_ID}:wall`;
export const OPENING_SELF_KEY = `${PROVIDER_ID}:opening`;

const slotKey = (slot: string): string => `${PROVIDER_ID}:${slot}`;

function wallRefFor(ctx: DimContext, slot: string): WallDimRef {
  const v = ctx.overrides[slotKey(slot)] ?? ctx.overrides[OPENING_WALL_KEY];
  return isWallDimRef(v) ? v : ctx.settings.wallRef;
}

function selfRefFor(ctx: DimContext, slot: string): OpeningDimRef {
  const v = ctx.overrides[slotKey(slot)] ?? ctx.overrides[OPENING_SELF_KEY];
  return isOpeningDimRef(v) ? v : ctx.settings.openingRef;
}

function asOpening(p: Project, s: OpeningDimSubject): Opening | null {
  const t = openingTypeById(p, s.typeId);
  if (!t) return null;
  return { id: s.id ?? 'preview', kind: t.kind, typeId: s.typeId, hostId: s.hostId, offset: s.offset, flipHand: s.flipHand ?? false, flipFacing: s.flipFacing, sillOverride: null, mark: '' };
}

function labelOf(p: Project, o: Opening): string {
  const t = openingTypeById(p, o.typeId);
  return `${o.kind === 'door' ? 'a porta' : 'a janela'} ${o.mark || t?.code || ''}`.trim();
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Valida a nova posição do centro; devolve a mensagem de recusa ou null. */
function conflict(ctx: DimContext, s: OpeningDimSubject, opening: Opening, frame: WallFrame, ext: OpeningExtents, offset: number): string | null {
  const p = ctx.project;
  const half = ext.frame;
  if (offset - half < END_GAP - EPS || offset + half > frame.length - END_GAP + EPS) return `${capital(labelOf(p, opening))} sairia da parede.`;
  const lo = offset - half;
  const hi = offset + half;
  const t = openingTypeById(p, s.typeId);
  const vertical: [number, number] = [opening.sillOverride ?? t?.sill ?? 0, (opening.sillOverride ?? t?.sill ?? 0) + (t?.height ?? 2.1)];
  const busy = occupiedRanges(p, s.hostId, s.id, vertical);
  const others = openingsOfWall(p, s.hostId).filter((o) => o.id !== s.id);
  for (let i = 0; i < busy.length; i++) {
    const [a, b] = busy[i]!;
    if (lo < b - EPS && hi > a + EPS) {
      const other = others.find((o) => Math.abs(o.offset - (a + b) / 2) < 1e-4);
      return other ? `Sobrepõe ${labelOf(p, other)}.` : 'Sobrepõe outra esquadria.';
    }
  }
  if (overlapsPerpendicular(perpendicularNeighbors(p, s.hostId, ctx.levelId), offset, half * 2)) return 'Atravessa a parede perpendicular.';
  return null;
}

interface SideCtx {
  ctx: DimContext;
  subject: OpeningDimSubject;
  opening: Opening;
  frame: WallFrame;
  ext: OpeningExtents;
  faceS: number;
}

function buildDim(c: SideCtx, side: 'left' | 'right', target: HostTarget, wallRef: WallDimRef, selfRef: OpeningDimRef, neighborRef: OpeningDimRef): TempDim {
  const { subject, frame, ext } = c;
  const edge = openingEdge(ext, selfRef);
  const edgeT = side === 'left' ? subject.offset - edge : subject.offset + edge;
  const wallPt = pointAt(frame, target.t, c.faceS);
  const selfPt = pointAt(frame, edgeT, c.faceS);
  const value = Math.max(0, side === 'left' ? edgeT - target.t : target.t - edgeT);
  const wallEnd: DimEnd = target.kind === 'opening'
    ? { at: wallPt, slot: side === 'left' ? 'neighLeft' : 'neighRight', kind: 'opening', current: neighborRef, options: OPENING_DIM_REFS }
    : { at: wallPt, slot: side === 'left' ? 'wallLeft' : 'wallRight', kind: 'wall', current: wallRef, options: WALL_DIM_REFS };
  const selfEnd: DimEnd = { at: selfPt, slot: side === 'left' ? 'openLeft' : 'openRight', kind: 'opening', current: selfRef, options: OPENING_DIM_REFS };
  const edit = subject.id
    ? (v: number): DimEditResult => {
        if (!Number.isFinite(v) || v < 0) return { error: 'Medida inválida: digite uma distância maior ou igual a zero.' };
        const offset = side === 'left' ? target.t + v + edge : target.t - v - edge;
        const why = conflict(c.ctx, subject, c.opening, frame, ext, offset);
        return why ? { error: why } : { commands: [{ type: 'updateElements', ids: [subject.id!], patch: { offset } }] };
      }
    : undefined;
  // O sentido de a→b é sempre da parede para a esquadria: a linha fica do lado da planta onde a cota é desenhada.
  const toward = side === 'left' ? 1 : -1;
  return {
    key: `${PROVIDER_ID}:${subject.id ?? 'preview'}:${side}`,
    a: wallPt,
    b: selfPt,
    offset: toward * subject.side * DIM_OFFSET,
    value,
    ends: [wallEnd, selfEnd],
    ...tempRefs(matchDimRef(c.ctx.project, wallPt, [target.ownerId, subject.hostId]), matchDimRef(c.ctx.project, selfPt, [subject.id])),
    ...(edit ? { edit } : {}),
  };
}

/** As duas cotas laterais de uma porta ou janela: da referência de parede à referência da esquadria. */
export const openingDimProvider: DimProvider<OpeningDimSubject> = {
  id: PROVIDER_ID,
  compute(ctx, subject) {
    const opening = asOpening(ctx.project, subject);
    const frame = frameOfWall(ctx.project, subject.hostId);
    if (!opening || !frame) return [];
    const ext = openingExtents(ctx.project, opening, frame, subject.side);
    const faceS = subject.side > 0 ? frame.sHi : frame.sLo;
    const c: SideCtx = { ctx, subject, opening, frame, ext, faceS };
    const leftRef = wallRefFor(ctx, 'wallLeft');
    const rightRef = wallRefFor(ctx, 'wallRight');
    // Os alvos de cada lado usam a referência daquela ponta: cada lado pode ser trocado sozinho.
    const wallLeft = hostTargets(ctx.project, frame, subject.offset, leftRef).left;
    const wallRight = hostTargets(ctx.project, frame, subject.offset, rightRef).right;
    // Em cada lado vale o alvo mais próximo: a parede (ou a ponta) ou a borda da esquadria vizinha da mesma parede.
    const leftNeighRef = selfRefFor(ctx, 'neighLeft');
    const rightNeighRef = selfRefFor(ctx, 'neighRight');
    const neighLeft = neighborOpeningTargets(ctx.project, frame, subject.offset, subject.id, leftNeighRef, subject.side).left;
    const neighRight = neighborOpeningTargets(ctx.project, frame, subject.offset, subject.id, rightNeighRef, subject.side).right;
    const left = neighLeft && neighLeft.t > wallLeft.t ? neighLeft : wallLeft;
    const right = neighRight && neighRight.t < wallRight.t ? neighRight : wallRight;
    return [
      buildDim(c, 'left', left, leftRef, selfRefFor(ctx, 'openLeft'), leftNeighRef),
      buildDim(c, 'right', right, rightRef, selfRefFor(ctx, 'openRight'), rightNeighRef),
    ];
  },
  selectionSubject(project, id) {
    const o = project.elements[id];
    if (!o || !isOpening(o)) return null;
    return { hostId: o.hostId, offset: o.offset, typeId: o.typeId, flipFacing: o.flipFacing, flipHand: o.flipHand, id: o.id, side: o.flipFacing ? -1 : 1 };
  },
};
