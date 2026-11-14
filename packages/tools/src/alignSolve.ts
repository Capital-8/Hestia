import { add, cross, dist, dot, intersectLines, mul, norm, perp, sub, type Vec2 } from '@hestia/geom';
import { frameOfWall } from '@hestia/engine';
import { isGuardaCorpo, openingsOfWall, openingType, type Id, type Project } from '@hestia/model';
import type { AlignFeature, AlignLine } from './alignFeatures.ts';
import type { EdgeRef } from './ringEdge.ts';
import { ringOps } from './ringOps.ts';
import { ringOfRef } from './ringTarget.ts';
import { t as translate, type Lang } from './i18n.ts';

/** Deslocamento calculado pelo Alinhar. `nada` = já alinhado; `erro` = recusa com a explicação em português. */
export type AlignSolution =
  | { kind: 'transladar'; target: 'parede' | 'escada' | 'rampa' | 'grade' | 'guardaCorpo' | 'massa'; id: Id; d: Vec2; distance: number }
  | { kind: 'ponta'; wallId: Id; end: 'a' | 'b'; to: Vec2; distance: number }
  | { kind: 'abertura'; openingId: Id; offset: number; distance: number }
  | { kind: 'anel'; ref: EdgeRef; ring: Vec2[]; distance: number }
  | { kind: 'esboco'; segId: string; a: Vec2; b: Vec2; distance: number }
  | { kind: 'nada' }
  | { kind: 'erro'; mensagem: string };

const EPS = 1e-7;
const PARALLEL_TOL = 1e-3;
const MIN_WALL = 0.01;

const parallel = (a: Vec2, b: Vec2): boolean => Math.abs(cross(norm(a), norm(b))) <= PARALLEL_TOL;
const perpendicularDelta = (from: Vec2, ref: AlignLine): Vec2 => {
  const n = norm(perp(ref.d));
  return mul(n, dot(sub(ref.p, from), n));
};
const projectOnLine = (p: Vec2, ref: AlignLine): Vec2 => {
  const t = dot(sub(p, ref.p), ref.d) / dot(ref.d, ref.d);
  return add(ref.p, mul(ref.d, t));
};
const sameRing = (a: Vec2[], b: Vec2[]): boolean =>
  a.length === b.length && a.every((v, i) => Math.abs(v.x - b[i]!.x) <= EPS && Math.abs(v.y - b[i]!.y) <= EPS);

/** Novo `offset` da abertura para a âncora (ombreira/centro) coincidir com `targetT` na hospedeira. */
const offsetForAnchor = (targetT: number, width: number, anchor: 'inicio' | 'fim' | 'centro'): number => {
  const delta = anchor === 'inicio' ? -width / 2 : anchor === 'fim' ? width / 2 : 0;
  return targetT - delta;
};

/** Uma abertura (fora ela mesma) ocuparia o mesmo trecho na hospedeira? */
function openingCollides(project: Project, hostId: Id, openingId: Id, offset: number, width: number): boolean {
  const lo = offset - width / 2;
  const hi = offset + width / 2;
  for (const other of openingsOfWall(project, hostId)) {
    if (other.id === openingId) continue;
    const w = openingType(project, other).width;
    if (lo < other.offset + w / 2 - EPS && hi > other.offset - w / 2 + EPS) return true;
  }
  return false;
}

/**
 * Resolve o Alinhar de uma feição `feature` (a que se move) contra a referência `ref` (a reta fixa). Função pura: só
 * lê o projeto. A política de movimento da feição decide entre translação, esticar/encurtar a ponta, deslizar a
 * abertura, mover a aresta do anel ou mover a linha do esboço.
 */
export function solveAlign(ref: AlignLine, feature: AlignFeature, project: Project, lang: Lang = 'pt'): AlignSolution {
  const move = feature.move;
  if (move.policy === 'nenhum' && isGuardaCorpo(project.elements[feature.ownerId])) return { kind: 'erro', mensagem: translate(lang, 'tl_msg_railing_hosted_locked') };
  if (move.policy === 'nenhum') return { kind: 'erro', mensagem: translate(lang, 'tl_msg_align_feature_ref_only') };

  if (move.policy === 'transladar') {
    if (!parallel(feature.line.d, ref.d)) {
      return {
        kind: 'erro',
        mensagem: translate(lang, 'tl_msg_align_not_parallel'),
      };
    }
    const d = perpendicularDelta(feature.line.p, ref);
    if (Math.hypot(d.x, d.y) < EPS) return { kind: 'nada' };
    return { kind: 'transladar', target: move.target, id: move.id, d, distance: Math.hypot(d.x, d.y) };
  }

  if (move.policy === 'ponta') {
    const frame = frameOfWall(project, move.wallId);
    if (!frame) return { kind: 'erro', mensagem: translate(lang, 'tl_msg_wall_end_not_found') };
    if (frame.arc) return { kind: 'erro', mensagem: translate(lang, 'tl_msg_arc_wall_align') };
    if (parallel(frame.u, ref.d)) {
      return { kind: 'erro', mensagem: translate(lang, 'tl_msg_ref_parallel_axis') };
    }
    const hit = intersectLines(frame.a, frame.u, ref.p, ref.d);
    if (!hit) return { kind: 'erro', mensagem: translate(lang, 'tl_msg_ref_no_cross') };
    const current = move.end === 'a' ? frame.wall.a : frame.wall.b;
    const other = move.end === 'a' ? frame.wall.b : frame.wall.a;
    if (dist(current, hit.point) < EPS) return { kind: 'nada' };
    if (dist(other, hit.point) < MIN_WALL) {
      return { kind: 'erro', mensagem: translate(lang, 'tl_msg_wall_zero_length') };
    }
    return { kind: 'ponta', wallId: move.wallId, end: move.end, to: hit.point, distance: dist(current, hit.point) };
  }

  if (move.policy === 'abertura') {
    const frame = frameOfWall(project, move.hostId);
    if (!frame) return { kind: 'erro', mensagem: translate(lang, 'tl_msg_wall_opening_not_found') };
    if (frame.arc) return { kind: 'erro', mensagem: translate(lang, 'tl_msg_opening_curved_wall') };
    if (parallel(frame.u, ref.d)) {
      return { kind: 'erro', mensagem: translate(lang, 'tl_msg_ref_parallel_axis_pos') };
    }
    const hit = intersectLines(frame.a, frame.u, ref.p, ref.d);
    if (!hit) return { kind: 'erro', mensagem: translate(lang, 'tl_msg_ref_no_cross_opening') };
    const targetT = dot(sub(hit.point, frame.a), frame.u);
    const offset = offsetForAnchor(targetT, move.width, move.anchor);
    const half = move.width / 2;
    if (offset - half < 0.01 - EPS || offset + half > frame.length - 0.01 + EPS) {
      return { kind: 'erro', mensagem: translate(lang, 'tl_msg_opening_out_of_span') };
    }
    if (openingCollides(project, move.hostId, move.openingId, offset, move.width)) {
      return { kind: 'erro', mensagem: translate(lang, 'tl_msg_opening_invades') };
    }
    const current = project.elements[move.openingId];
    if (current?.kind === 'door' || current?.kind === 'window') {
      if (Math.abs(current.offset - offset) < EPS) return { kind: 'nada' };
      return { kind: 'abertura', openingId: move.openingId, offset, distance: Math.abs(current.offset - offset) };
    }
    return { kind: 'erro', mensagem: translate(lang, 'tl_msg_opening_not_found') };
  }

  if (move.policy === 'anel') {
    const ring = ringOfRef(project, move.ref);
    if (!ring) return { kind: 'erro', mensagem: translate(lang, 'tl_msg_ring_not_found') };
    const next = ringOps.alignEdgeToLine(ring, move.ref.index, ref.p, add(ref.p, ref.d));
    if (sameRing(ring, next)) return { kind: 'nada' };
    let distance = 0;
    for (let i = 0; i < ring.length; i++) distance = Math.max(distance, dist(ring[i]!, next[i]!));
    return { kind: 'anel', ref: move.ref, ring: next, distance };
  }

  if (move.policy === 'esboco') {
    if (!feature.seg) return { kind: 'erro', mensagem: translate(lang, 'tl_msg_sketch_end_unknown') };
    const a = projectOnLine(feature.seg.a, ref);
    const b = projectOnLine(feature.seg.b, ref);
    if (dist(a, b) < EPS) return { kind: 'erro', mensagem: translate(lang, 'tl_msg_sketch_collapse') };
    if (dist(a, feature.seg.a) < EPS && dist(b, feature.seg.b) < EPS) return { kind: 'nada' };
    return { kind: 'esboco', segId: move.segId, a, b, distance: Math.max(dist(a, feature.seg.a), dist(b, feature.seg.b)) };
  }

  return { kind: 'nada' };
}
