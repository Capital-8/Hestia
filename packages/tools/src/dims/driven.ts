import { add, dist, dot, len, mul, norm, sub, type Vec2 } from '@hestia/geom';
import { frameOfWall, openingExtents, type WallFrame } from '@hestia/engine';
import {
  applyCommand,
  isOpening,
  isWall,
  openingTypeById,
  openingsOfWall,
  type Command,
  type Dimension,
  type DrivenEdit,
  type Element,
  type Id,
  type Opening,
  type Project,
  type Wall,
} from '@hestia/model';
import { occupiedRanges } from '../infer.ts';
import { overlapsPerpendicular, perpendicularNeighbors } from '../openingPlacement.ts';
import { followingEnds, MIN_WALL_LENGTH } from '../pick.ts';
import { t as translate, type Lang } from '../i18n.ts';
import { translateWallsJoined } from '../wallFollow.ts';

/**
 * COTA DIRIGIDA: editar o valor de uma cota permanente move os elementos a que ela está associada (como no Revit).
 * `drivenEditCommands(project, dim, novoValor)` é PURA (não toca o store): devolve um único `batch` (um passo de
 * desfazer) ou `{ ok:false, reason }` sem alterar nada. O resultado é simulado numa cópia e a cota relida: se não
 * der exatamente `novoValor`, a edição é recusada.
 *
 * Qual ponta se move: `fixed` ('a' | 'b') escolhe a ponta que FICA; sem `fixed`, move-se a esquadria (se só uma das
 * pontas for esquadria), senão a ponta B, e a A se B não estiver associada. Uma ponta sem referência é fixa.
 * A ponta movida desloca-se ao longo da direção da cota (modo horizontal/vertical respeitado) por (novo - atual).
 *
 * Regras por feição da ponta móvel:
 *  1. Esquadria (opening-*): altera o `offset` na parede (cota paralela ao eixo); valida limites da parede,
 *     colisão com outras esquadrias e parede perpendicular (mesma validação da cota temporária).
 *  2. Parede (face, ou eixo com cota fora do eixo): transladada com as ligadas esticando (translateWallsJoined);
 *     as esquadrias hospedadas acompanham. Em faces a cota deve ser perpendicular à parede.
 *  3. Ponta de parede (wall-axis-a/b, ou ref antiga) com cota paralela ao eixo: estica a ponta; paredes ligadas ali
 *     acompanham (como resizeWallCommands, mas valendo para as duas pontas).
 *  4. Vértice/aresta (vertex/edge) com `boundary` (piso, laje, forro, telhado): move o vértice (ou os dois da aresta,
 *     se a cota é perpendicular a ela). Contorno ligado às paredes, escada, rampa e demais: recusado.
 *  5. Cota angular: recusada (fora de escopo). Cadeias: um passo por cota, sem propagação.
 */

const EPS = 1e-6;
const END_GAP = 0.01;
/** Paralelismo aceito entre a direção da cota e um eixo (seno do ângulo). */
const PAR_TOL = 1e-3;
/** Tolerância da conferência final do valor (m): a cota exibe 1 mm. */
const CHECK_TOL = 5e-4;

type Boundaried = Element & { boundary: Vec2[]; outlineSource?: { linked: boolean } };

type Mover =
  | { t: 'opening'; o: Opening }
  | { t: 'wallEnd'; w: Wall; end: 'a' | 'b' }
  | { t: 'wallFace'; w: Wall }
  | { t: 'vertex'; el: Boundaried; index: number }
  | { t: 'edge'; el: Boundaried; index: number }
  | { t: 'other'; el: Element };

interface EndInfo {
  point: Vec2;
  mover: Mover | null;
  /** Elemento referenciado (para detectar as duas pontas no mesmo elemento). */
  elementId?: Id;
}

interface LooseRef {
  elementId?: Id;
  feature?: string;
  index?: number;
  wallId?: Id;
  end?: 'a' | 'b';
  axis?: 'x' | 'y';
}

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

/** Põe a coordenada de `p` ao longo de `u` em `t` (medida a partir de `origin`), mantendo a perpendicular. */
const withAlong = (p: Vec2, origin: Vec2, u: Vec2, t: number): Vec2 => add(p, mul(u, t - dot(sub(p, origin), u)));

/** Projeta `p` na reta (origem, direção unitária u). */
const projectOnLine = (p: Vec2, origin: Vec2, u: Vec2): Vec2 => add(origin, mul(u, dot(sub(p, origin), u)));

/**
 * Resolve só o que a cota dirigida precisa: qual elemento e o ponto atual da ponta. Pontos de faces/bordas/arestas
 * usam o ponto guardado da cota reprojetado na feição (não precisa de coordenada fina de face).
 */
function featureInfo(p: Project, ref: LooseRef, fallback: Vec2, lang: Lang = 'pt'): EndInfo | { error: string } {
  if (ref.elementId === undefined) {
    // Referência antiga: parede + ponta (+ eixo opcional).
    const w = ref.wallId ? p.elements[ref.wallId] : undefined;
    if (!isWall(w) || !ref.end) return { error: translate(lang, 'tl_msg_dim_element_removed') };
    const pt = ref.end === 'a' ? w.a : w.b;
    const point = ref.axis === 'x' ? { x: pt.x, y: fallback.y } : ref.axis === 'y' ? { x: fallback.x, y: pt.y } : { ...pt };
    return { point, mover: { t: 'wallEnd', w, end: ref.end }, elementId: w.id };
  }
  const el = p.elements[ref.elementId];
  if (!el) return { error: translate(lang, 'tl_msg_dim_element_removed') };
  const f = ref.feature ?? '';
  if (isWall(el)) {
    if (f === 'wall-axis-a' || f === 'wall-axis-b') {
      const end = f === 'wall-axis-a' ? 'a' : 'b';
      return { point: { ...el[end] }, mover: { t: 'wallEnd', w: el, end }, elementId: el.id };
    }
    if (f === 'wall-face-lo' || f === 'wall-face-hi') {
      const fr = frameOfWall(p, el.id);
      if (!fr) return { error: 'Parede inválida.' };
      const s = f === 'wall-face-lo' ? fr.sLo : fr.sHi;
      const point = projectOnLine(fallback, add(fr.a, mul(fr.n, s)), fr.u);
      return { point, mover: { t: 'wallFace', w: el }, elementId: el.id };
    }
    return { error: 'Feição de parede não suportada pela cota dirigida.' };
  }
  if (isOpening(el)) {
    const fr = frameOfWall(p, el.hostId);
    if (!fr) return { error: 'A parede hospedeira da esquadria não existe.' };
    const ext = openingExtents(p, el, fr, el.flipFacing ? -1 : 1);
    const t = f === 'opening-edge-a' ? el.offset - ext.frame : f === 'opening-edge-b' ? el.offset + ext.frame : el.offset;
    return { point: withAlong(fallback, fr.a, fr.u, t), mover: { t: 'opening', o: el }, elementId: el.id };
  }
  const boundary = (el as { boundary?: Vec2[] }).boundary;
  if (Array.isArray(boundary) && (f === 'vertex' || f === 'edge')) {
    const i = ref.index ?? 0;
    if (i < 0 || i >= boundary.length) return { error: 'O vértice referenciado não existe mais.' };
    const typed = el as Boundaried;
    if (f === 'vertex') return { point: { ...boundary[i]! }, mover: { t: 'vertex', el: typed, index: i }, elementId: el.id };
    const q0 = boundary[i]!;
    const q1 = boundary[(i + 1) % boundary.length]!;
    return { point: projectOnLine(fallback, q0, norm(sub(q1, q0))), mover: { t: 'edge', el: typed, index: i }, elementId: el.id };
  }
  return { point: { ...fallback }, mover: { t: 'other', el }, elementId: el.id };
}

function endOf(p: Project, dim: Dimension, which: 'a' | 'b', lang: Lang = 'pt'): EndInfo | { error: string } {
  const ref = (dim.refs as { a?: LooseRef; b?: LooseRef } | undefined)?.[which];
  const fallback = dim[which];
  if (!ref) return { point: { ...fallback }, mover: null };
  return featureInfo(p, ref, fallback, lang);
}

/** Pontas medidas (modo horizontal/vertical aplicado) e a direção unitária a→b. */
function measure(p: Project, dim: Dimension, lang: Lang = 'pt'): { a: EndInfo; b: EndInfo; value: number; dir: Vec2 } | { error: string } {
  const a = endOf(p, dim, 'a', lang);
  if ('error' in a) return a;
  const b = endOf(p, dim, 'b', lang);
  if ('error' in b) return b;
  const pa = a.point;
  let pb = b.point;
  if (dim.mode === 'horizontal') pb = { x: pb.x, y: pa.y };
  else if (dim.mode === 'vertical') pb = { x: pa.x, y: pb.y };
  const value = len(sub(pb, pa));
  if (value < 1e-9) return { error: 'A cota tem comprimento zero: a direção de medida é indefinida.' };
  return { a, b, value, dir: norm(sub(pb, pa)) };
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function openingLabel(p: Project, o: Opening): string {
  const t = openingTypeById(p, o.typeId);
  return `${o.kind === 'door' ? 'a porta' : 'a janela'} ${o.mark || t?.code || ''}`.trim();
}

/** Mesma validação da cota temporária de esquadria (providers/opening.ts). */
function openingConflict(p: Project, o: Opening, frame: WallFrame, offset: number, lang: Lang = 'pt'): string | null {
  const ext = openingExtents(p, o, frame, o.flipFacing ? -1 : 1);
  const half = ext.frame;
  if (offset - half < END_GAP - EPS || offset + half > frame.length - END_GAP + EPS) return `${capital(openingLabel(p, o))} sairia da parede.`;
  const lo = offset - half;
  const hi = offset + half;
  const t = openingTypeById(p, o.typeId);
  const sill = o.sillOverride ?? t?.sill ?? 0;
  const busy = occupiedRanges(p, o.hostId, o.id, [sill, sill + (t?.height ?? 2.1)]);
  const others = openingsOfWall(p, o.hostId).filter((x) => x.id !== o.id);
  for (const [a, b] of busy) {
    if (lo < b - EPS && hi > a + EPS) {
      const other = others.find((x) => Math.abs(x.offset - (a + b) / 2) < 1e-4);
      return other ? translate(lang, 'tl_msg_dim_opening_overlap', { opening: openingLabel(p, other) }) : translate(lang, 'tl_msg_dim_opening_overlap_other');
    }
  }
  const host = p.elements[o.hostId];
  if (isWall(host) && overlapsPerpendicular(perpendicularNeighbors(p, o.hostId, host.levelId), offset, half * 2)) return translate(lang, 'tl_msg_dim_cross_wall');
  return null;
}

type Moved = { commands: Command[] } | { error: string };

function moveOpening(p: Project, o: Opening, m: Vec2, dir: Vec2, lang: Lang = 'pt'): Moved {
  const fr = frameOfWall(p, o.hostId);
  if (!fr) return { error: 'A parede hospedeira da esquadria não existe.' };
  if (fr.arc) return { error: 'Cota dirigida de esquadria em parede curva ainda não é suportada.' };
  if (Math.abs(dir.x * fr.u.y - dir.y * fr.u.x) > PAR_TOL) return { error: 'A cota não é paralela à parede da esquadria: não dá para movê-la por ela.' };
  const offset = o.offset + dot(m, fr.u);
  const why = openingConflict(p, o, fr, offset, lang);
  return why ? { error: why } : { commands: [{ type: 'updateElements', ids: [o.id], patch: { offset } }] };
}

function stretchWallEnd(p: Project, w: Wall, end: 'a' | 'b', m: Vec2, lang: Lang = 'pt'): Moved {
  if (w.sag !== 0) return { error: translate(lang, 'tl_msg_dim_arc_wall') };
  const far = end === 'a' ? w.b : w.a;
  const pt = w[end];
  const u = norm(sub(pt, far));
  const to = add(pt, mul(u, dot(m, u)));
  if (!(dist(far, to) >= MIN_WALL_LENGTH) || dot(sub(to, far), u) <= 0) return { error: 'A parede ficaria com comprimento menor que o mínimo.' };
  const commands: Command[] = [{ type: 'setWallEnds', id: w.id, ...(end === 'a' ? { a: to } : { b: to }) }];
  for (const c of followingEnds(p, w.levelId, pt, new Set([w.id]))) {
    commands.push(c.end === 'a' ? { type: 'setWallEnds', id: c.wallId, a: to } : { type: 'setWallEnds', id: c.wallId, b: to });
  }
  return { commands };
}

function moveWall(p: Project, mv: Extract<Mover, { t: 'wallEnd' | 'wallFace' }>, m: Vec2, dir: Vec2, lang: Lang = 'pt'): Moved {
  const w = mv.w;
  if (len(sub(w.b, w.a)) < 1e-9) return { error: 'A parede não tem direção definida.' };
  const axis = norm(sub(w.b, w.a));
  if (mv.t === 'wallEnd' && Math.abs(dir.x * axis.y - dir.y * axis.x) < PAR_TOL) return stretchWallEnd(p, w, mv.end, m, lang);
  if (mv.t === 'wallFace' && Math.abs(dot(dir, axis)) > PAR_TOL) return { error: 'A cota entre faces precisa ser perpendicular à parede.' };
  if (w.sag !== 0) return { error: 'Mover parede curva por cota ainda não é suportado.' };
  return { commands: translateWallsJoined(p, w.levelId, [w.id], m).commands };
}

function moveBoundary(mv: Extract<Mover, { t: 'vertex' | 'edge' }>, m: Vec2, lang: Lang = 'pt'): Moved {
  const el = mv.el;
  if (el.outlineSource?.linked) return { error: translate(lang, 'tl_msg_dim_linked_outline') };
  const n = el.boundary.length;
  const idx = mv.t === 'vertex' ? [mv.index] : [mv.index, (mv.index + 1) % n];
  if (mv.t === 'edge') {
    const e = norm(sub(el.boundary[idx[1]!]!, el.boundary[idx[0]!]!));
    if (Math.abs(dot(norm(m), e)) > PAR_TOL) return { error: 'A cota precisa ser perpendicular à aresta para movê-la.' };
  }
  const boundary = el.boundary.map((q, i) => (idx.includes(i) ? add(q, m) : q));
  for (let i = 0; i < n; i++) {
    if (dist(boundary[i]!, boundary[(i + 1) % n]!) < EPS) return { error: 'O contorno ficaria com um lado de comprimento zero.' };
  }
  return { commands: [{ type: 'updateElements', ids: [el.id], patch: { boundary } as never }] };
}

function moveMover(p: Project, mv: Mover, m: Vec2, dir: Vec2, lang: Lang = 'pt'): Moved {
  switch (mv.t) {
    case 'opening': return moveOpening(p, mv.o, m, dir, lang);
    case 'wallEnd':
    case 'wallFace': return moveWall(p, mv, m, dir, lang);
    case 'vertex':
    case 'edge': return moveBoundary(mv, m, lang);
    default: return { error: `A cota dirigida ainda não move este tipo de elemento (${mv.el.kind}).` };
  }
}

/**
 * Comandos que dão à cota permanente `dim` o valor `novoValor` (m) movendo os elementos associados.
 * `fixed` indica a ponta que não se move; ver regras no topo do arquivo.
 */
export function drivenEditCommands(project: Project, dim: Dimension, novoValor: number, fixed?: 'a' | 'b', lang: Lang = 'pt'): DrivenEdit {
  if (dim.angular) return fail(translate(lang, 'tl_msg_dim_angular_edit'));
  if (dim.locked) return fail('Cota travada: destrave a cota para mudar o valor e mover os elementos.');
  if (!Number.isFinite(novoValor) || !(novoValor > 0)) return fail('Medida inválida: digite uma distância maior que zero.');
  const ms = measure(project, dim, lang);
  if ('error' in ms) return fail(ms.error);
  if (!ms.a.mover && !ms.b.mover) return fail('A cota não está associada a elementos: edite os pontos da cota livre.');

  let moving: 'a' | 'b';
  if (fixed) moving = fixed === 'a' ? 'b' : 'a';
  else if (ms.a.mover?.t === 'opening' && ms.b.mover?.t !== 'opening') moving = 'a';
  else if (ms.b.mover) moving = 'b';
  else moving = 'a';
  const mv = (moving === 'a' ? ms.a : ms.b).mover;
  if (!mv) return fail('A ponta que se moveria não está associada a nenhum elemento.');
  if (ms.a.elementId !== undefined && ms.a.elementId === ms.b.elementId && (mv.t === 'opening' || mv.t === 'wallFace')) {
    return fail('As duas pontas são do mesmo elemento: a medida é uma propriedade dele (largura/espessura), não uma posição.');
  }

  const delta = novoValor - ms.value;
  if (Math.abs(delta) < 1e-9) return { ok: true, commands: [] };
  const m = mul(moving === 'b' ? ms.dir : mul(ms.dir, -1), delta);
  const r = moveMover(project, mv, m, ms.dir, lang);
  if ('error' in r) return fail(r.error);

  // Simula numa cópia e confere que a cota passou a valer o pedido.
  const sim = structuredClone(project) as Project;
  try {
    for (const c of r.commands) applyCommand(sim, c);
  } catch (e) {
    return fail(`Não foi possível aplicar a edição: ${(e as Error).message}`);
  }
  const after = measure(sim, dim, lang);
  if ('error' in after) return fail(after.error);
  if (Math.abs(after.value - novoValor) > CHECK_TOL) return fail(translate(lang, 'tl_msg_dim_result_mismatch'));
  return { ok: true, commands: [{ type: 'batch', commands: r.commands } satisfies Command] };
}
