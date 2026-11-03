import type { Polygon, Vec2 } from '@hestia/geom';
import { ceilingIssues, ceilingOutline, outerPerimeter, resolveRooms } from '@hestia/engine';
import {
  DEFAULT_CEILING_HEIGHT,
  ceilingsOnLevel,
  followsRoom,
  isCeiling,
  isFloor,
  isSlab,
  makeCeiling,
  makeFloor,
  makeSlab,
  newId,
  validateProject,
  type Ceiling,
  type Command,
  type Floor,
  type Id,
  type OutlineSource,
  type Project,
  type Slab,
  type ValidationIssue,
unitsOf,
} from '@hestia/model';
import { OUTLINE_LOCKED_MSG } from './outlineEdit.ts';
import { areaText, keepOrder, longestSideMid, newError, pickTypeId, refuse as refuseBase, sameRing, sameRings, withElement } from './perimeterCommitShared.ts';
import type { CommitPerimeterOptions, CommitPerimeterResult } from './perimeterCommitTypes.ts';
import { roomPolygon } from './sketchPickRoom.ts';
import { t as translate, type DictKey, type Lang } from './i18n.ts';

/** Alvos de contorno simples: piso, laje e forro (contorno e furos, sem arestas). */
export type AreaTarget = 'floor' | 'slab' | 'ceiling';
export type AreaElement = Floor | Slab | Ceiling;

const NAME_KEYS: Record<AreaTarget, DictKey> = { floor: 'tl_name_floor', slab: 'tl_name_slab', ceiling: 'tl_name_ceiling' };
const NAME = (target: AreaTarget, lang: Lang): string => translate(lang, NAME_KEYS[target]);

const LINK_CORE_MSG = 'tl_msg_link_core';
const LINK_NO_WALLS_MSG = 'tl_msg_link_no_walls';
const LINK_MISMATCH_MSG = 'tl_msg_link_mismatch';
const ROOM_NONE_MSG = 'tl_msg_room_none';
const ROOM_MISMATCH_MSG = 'tl_msg_room_mismatch';
// Um ambiente tem um forro só: o segundo não empilha (regra do "Forro no ambiente" antigo, decisão 0021).
const ROOM_HAS_CEILING_MSG = 'tl_msg_room_has_ceiling';

/** Contorno e furos de um piso, laje ou forro para o rascunho. O forro que acompanha o ambiente usa o contorno do ambiente. */
export function areaSides(p: Project, el: AreaElement): { outer: Vec2[]; holes: Vec2[][] } {
  if (isCeiling(el)) {
    const o = ceilingOutline(p, el);
    return { outer: o.boundary, holes: o.holes };
  }
  return { outer: el.boundary, holes: el.holes };
}

/** Origem de contorno de "estender até o núcleo": perímetro com a face do núcleo, estático (não vinculado às paredes). */
const coreOutline = (): OutlineSource => ({ mode: 'perimeter', linked: false, extend: 'core' });

/**
 * Liga ou desliga "estender até o núcleo" na origem do contorno. Ligar põe o modo perímetro com a face do núcleo;
 * desligar devolve a face de acabamento. Sem origem e desligado, não há o que mudar (undefined).
 */
function outlineWithExtend(src: OutlineSource | undefined, extend: boolean): OutlineSource | undefined {
  if (extend) return { ...src, mode: 'perimeter', linked: false, extend: 'core' };
  return src ? { ...src, extend: 'finish' } : undefined;
}

/** Vínculo às paredes pedido: a origem do contorno e o contorno que as paredes dão agora. */
interface WallLink {
  outline: OutlineSource;
  boundary: Vec2[];
}

/**
 * "Vincular às paredes" com o esboço de "Por perímetro" (`origin.walls`): a origem é `perimeter` (face externa, com a
 * semente no lado maior do contorno, como a ferramenta antiga), e o contorno é o que as paredes dão. O esboço tem de
 * coincidir com esse contorno; senão recusa, pois o vínculo redesenharia o piso. Null quando não se pede vínculo (ou o
 * esboço não veio de "Por perímetro"); texto da recusa quando o pedido não cabe.
 */
function wallLink(p: Project, levelId: Id, outer: Vec2[], opts: CommitPerimeterOptions): WallLink | DictKey | null {
  if (!opts.linkToWalls || !opts.origin?.walls) return null;
  if (opts.extendToCore) return LINK_CORE_MSG;
  const seed = longestSideMid(outer);
  const ring = outerPerimeter(p, levelId, seed);
  if (!ring) return LINK_NO_WALLS_MSG;
  if (!sameRing(outer, ring)) return LINK_MISMATCH_MSG;
  return { outline: { mode: 'perimeter', linked: true, seed }, boundary: ring };
}

/** Nota da mensagem: vínculo pedido e não feito, quando o esboço não veio de "Por perímetro". */
const unlinkedNote = (opts: CommitPerimeterOptions, lang: Lang): string => (opts.linkToWalls && !opts.origin?.walls ? translate(lang, 'tl_msg_unlinked_note') : '');

/**
 * Ambiente que o forro acompanha: o contorno e os furos do esboço têm de ser os do ambiente `roomId`. Devolve o contorno
 * do ambiente (externo e furos) quando coincide; null quando não há ambiente ou o contorno difere.
 */
function roomMatch(p: Project, levelId: Id, outer: Vec2[], holes: Vec2[][], roomId: Id | undefined): Polygon | null {
  if (!roomId) return null;
  const poly = roomPolygon(p, levelId, roomId);
  return poly && sameRings([outer, ...holes], poly) ? poly : null;
}

/** Piso, laje ou forro a partir do contorno do esboço: cria (`addFloor`, `addSlab`, `addCeiling`) ou altera. */
export function commitArea(
  p: Project,
  s: { target: AreaTarget; editing?: string },
  outer: Vec2[],
  holes: Vec2[][],
  opts: CommitPerimeterOptions,
  lang: Lang = 'pt',
): CommitPerimeterResult {
  return s.editing ? editArea(p, s.target, s.editing, outer, holes, opts, lang) : createArea(p, s.target, outer, holes, opts, lang);
}

function createArea(p: Project, target: AreaTarget, outer: Vec2[], holes: Vec2[][], opts: CommitPerimeterOptions, lang: Lang): CommitPerimeterResult {
  const levelId = opts.levelId;
  if (!levelId) return refuseBase(translate(lang, 'tl_msg_no_level'));
  if (!p.levels.some((l) => l.id === levelId)) return refuseBase(translate(lang, 'tl_msg_level_missing'));
  if (target === 'ceiling') return createCeiling(p, levelId, outer, holes, opts, lang);
  const link = wallLink(p, levelId, outer, opts);
  if (typeof link === 'string') return refuseBase(translate(lang, link));
  const id = newId(target === 'slab' ? 'l' : 'f');
  const boundary = link ? link.boundary : outer;
  const common = { id, levelId, boundary, holes, mark: opts.mark ?? '', comments: opts.comments ?? '' };
  const origin = link ? { outlineSource: link.outline } : opts.extendToCore ? { outlineSource: coreOutline() } : {};
  const message = translate(lang, 'tl_msg_area_created', { name: NAME(target, lang), area: areaText(unitsOf(p), boundary, holes), note: unlinkedNote(opts, lang) });
  if (target === 'floor') {
    const typeId = pickTypeId(p.floorTypes, opts.typeId);
    if (!typeId) return refuseBase(translate(lang, 'tl_msg_no_floor_type'));
    const floor = makeFloor({ ...common, typeId, heightOffset: opts.heightOffset ?? 0, ...origin });
    return checked(p, id, { type: 'addFloor', floor }, { ...floor, order: p.nextOrder }, validateProject, message, lang);
  }
  const typeId = pickTypeId(p.slabTypes, opts.typeId);
  if (!typeId) return refuseBase(translate(lang, 'tl_msg_no_slab_type'));
  const slab = makeSlab({ ...common, typeId, heightOffset: opts.heightOffset ?? 0, ...origin });
  return checked(p, id, { type: 'addSlab', slab }, { ...slab, order: p.nextOrder }, validateProject, message, lang);
}

/**
 * Forro novo. Com "Acompanhar o ambiente", o forro leva o `roomId` e o contorno do ambiente (que tem de ser o do esboço),
 * e o pé-direito e o número do ambiente (como o "Forro no ambiente" antigo). Ambiente que já tem forro no nível recusa.
 */
function createCeiling(p: Project, levelId: Id, outer: Vec2[], holes: Vec2[][], opts: CommitPerimeterOptions, lang: Lang): CommitPerimeterResult {
  const typeId = pickTypeId(p.ceilingTypes, opts.typeId);
  if (!typeId) return refuseBase(translate(lang, 'tl_msg_no_ceiling_type'));
  const roomId = opts.followRoom ? opts.origin?.roomId : undefined;
  let shape = { boundary: outer, holes };
  if (opts.followRoom) {
    const poly = roomMatch(p, levelId, outer, holes, roomId);
    if (!poly) return refuseBase(translate(lang, roomId ? ROOM_MISMATCH_MSG : ROOM_NONE_MSG));
    shape = { boundary: poly[0]!, holes: poly.slice(1) };
  }
  if (roomId && ceilingsOnLevel(p, levelId).some((c) => c.roomId === roomId)) return refuseBase(translate(lang, ROOM_HAS_CEILING_MSG));
  const room = roomId ? resolveRooms(p, levelId).find((r) => r.roomId === roomId) : undefined;
  const id = newId('f');
  const ceiling = makeCeiling({
    id,
    levelId,
    typeId,
    ...shape,
    heightOffset: room ? room.ceilingHeight : (opts.heightOffset ?? DEFAULT_CEILING_HEIGHT),
    mark: opts.mark ?? room?.number ?? '',
    comments: opts.comments ?? '',
    ...(roomId ? { roomId, roomLinked: true } : {}),
  });
  const message = translate(lang, 'tl_msg_ceiling_created', { area: areaText(unitsOf(p), shape.boundary, shape.holes), room: roomId ? translate(lang, 'tl_msg_follows_room') : '' });
  return checked(p, id, { type: 'addCeiling', ceiling }, { ...ceiling, order: p.nextOrder }, ceilingIssues, message, lang);
}

/** Confere o elemento novo com o validador do alvo; sem erro novo, devolve o comando de criação. */
function checked(
  p: Project,
  id: string,
  cmd: Command,
  el: Floor | Slab | Ceiling,
  check: (q: Project) => ValidationIssue[],
  message: string,
  lang: Lang,
): CommitPerimeterResult {
  const problem = newError(p, withElement(p, el), id, check);
  if (problem) return refuseBase(translate(lang, 'tl_msg_cannot_create', { problem }));
  return { ok: true, id, commands: [cmd], message };
}

function editArea(p: Project, target: AreaTarget, id: string, outer: Vec2[], holes: Vec2[][], opts: CommitPerimeterOptions, lang: Lang): CommitPerimeterResult {
  const el = p.elements[id];
  if (target === 'ceiling') return isCeiling(el) ? editCeiling(p, el, outer, holes, opts, lang) : refuseBase(translate(lang, 'tl_msg_not_found', { name: NAME(target, lang) }));
  if (target === 'floor') return isFloor(el) ? editPlate(p, el, outer, holes, opts, lang) : refuseBase(translate(lang, 'tl_msg_not_found', { name: NAME(target, lang) }));
  return isSlab(el) ? editPlate(p, el, outer, holes, opts, lang) : refuseBase(translate(lang, 'tl_msg_not_found', { name: NAME(target, lang) }));
}

/** Piso ou laje editados. Contorno travado nas paredes recusa a edição (decisão 0031): é preciso desvincular antes. */
function editPlate(p: Project, el: Floor | Slab, outer: Vec2[], holes: Vec2[][], opts: CommitPerimeterOptions, lang: Lang): CommitPerimeterResult {
  if (el.outlineSource?.linked) return refuseBase(OUTLINE_LOCKED_MSG);
  const link = wallLink(p, el.levelId, outer, opts);
  if (typeof link === 'string') return refuseBase(translate(lang, link));
  const patch: Partial<Floor> & Partial<Slab> = { boundary: link ? link.boundary : outer, holes: keepOrder(el.holes, holes) };
  if (opts.heightOffset !== undefined) patch.heightOffset = opts.heightOffset;
  if (opts.mark !== undefined) patch.mark = opts.mark;
  if (opts.comments !== undefined) patch.comments = opts.comments;
  if (link) patch.outlineSource = link.outline;
  else if (opts.extendToCore !== undefined) {
    const src = outlineWithExtend(el.outlineSource, opts.extendToCore);
    if (src) patch.outlineSource = src;
  }
  const next = { ...el, ...patch } as Floor | Slab;
  const problem = newError(p, withElement(p, next), el.id, validateProject);
  if (problem) return refuseBase(translate(lang, 'tl_msg_change_not_applied', { problem }));
  const label = NAME(el.kind, lang);
  const message = translate(lang, 'tl_msg_area_updated', {
    label,
    area: areaText(unitsOf(p), patch.boundary ?? outer, patch.holes ?? holes),
    link: link ? translate(lang, 'tl_msg_linked_walls') : unlinkedNote(opts, lang),
  });
  return { ok: true, id: el.id, commands: [{ type: 'updateElements', ids: [el.id], patch }], message };
}

/**
 * Forro editado. Com "Acompanhar o ambiente" e o contorno do ambiente (o do esboço, ou o que o forro já segue), o forro
 * volta a seguir o ambiente (`relinkCeilingRoom`). Sem isso, um forro que acompanhava o ambiente se solta no mesmo
 * passo, como o contorno editado à mão.
 */
function editCeiling(p: Project, el: Ceiling, outer: Vec2[], holes: Vec2[][], opts: CommitPerimeterOptions, lang: Lang): CommitPerimeterResult {
  // Ausente = o forro guarda o seu valor: um que acompanha continua acompanhando; `false` solta.
  const want = opts.followRoom === false ? undefined : (opts.origin?.roomId ?? (followsRoom(el) ? el.roomId ?? undefined : undefined));
  const poly = roomMatch(p, el.levelId, outer, holes, want);
  if (poly && want) {
    const relink = !followsRoom(el) || el.roomId !== want;
    if (relink && ceilingsOnLevel(p, el.levelId).some((c) => c.id !== el.id && c.roomId === want)) return refuseBase(translate(lang, ROOM_HAS_CEILING_MSG));
    const patch: Partial<Ceiling> = { boundary: poly[0]!, holes: poly.slice(1) };
    if (opts.heightOffset !== undefined) patch.heightOffset = opts.heightOffset;
    if (opts.mark !== undefined) patch.mark = opts.mark;
    if (opts.comments !== undefined) patch.comments = opts.comments;
    const next: Ceiling = { ...el, ...patch, roomId: want, roomLinked: true };
    const problem = newError(p, withElement(p, next), el.id, ceilingIssues);
    if (problem) return refuseBase(translate(lang, 'tl_msg_change_not_applied', { problem }));
    const update: Command = { type: 'updateElements', ids: [el.id], patch };
    const commands: Command[] = relink ? [{ type: 'relinkCeilingRoom', id: el.id, roomId: want }, update] : [update];
    return { ok: true, id: el.id, commands, message: translate(lang, 'tl_msg_ceiling_updated_room', { area: areaText(unitsOf(p), poly[0]!, poly.slice(1)) }) };
  }
  const patch: Partial<Ceiling> = { boundary: outer, holes: keepOrder(areaSides(p, el).holes, holes) };
  if (opts.heightOffset !== undefined) patch.heightOffset = opts.heightOffset;
  if (opts.mark !== undefined) patch.mark = opts.mark;
  if (opts.comments !== undefined) patch.comments = opts.comments;
  const detach = followsRoom(el);
  const next: Ceiling = { ...el, ...patch, ...(detach ? { roomLinked: false } : {}) };
  const problem = newError(p, withElement(p, next), el.id, ceilingIssues);
  if (problem) return refuseBase(translate(lang, 'tl_msg_change_not_applied', { problem }));
  const update: Command = { type: 'updateElements', ids: [el.id], patch };
  const commands: Command[] = detach ? [{ type: 'detachCeilingRoom', id: el.id }, update] : [update];
  return { ok: true, id: el.id, commands, message: translate(lang, 'tl_msg_ceiling_updated', { area: areaText(unitsOf(p), outer, patch.holes ?? holes) }) };
}
