import { arcLocal, arcPointAt, sagFromThreePoints, type SketchSeg, type Vec2 } from '@hestia/geom';
import { levelFrames, wallFacesCached, type WallFaces, type WallFrame } from '@hestia/engine';
import { ceilingsOnLevel, floorsOnLevel, isWall, newId, slabsOnLevel, type Id, type Wall } from '@hestia/model';
import { makeSeg, onCircle, segDistance, visibleIn, type SketchCtx } from './sketchPickFaceGeom.ts';
import { t as translate } from './i18n.ts';

export type { SketchCtx } from './sketchPickFaceGeom.ts';

/**
 * O que o esboço pede: face externa ou interna de uma parede, eixo de uma parede, ou uma aresta de anel de piso, laje
 * ou forro (`ring` 0 = contorno, 1+ = furo; `edge` omitido = todas as arestas daquele anel).
 */
export type SketchWhich = 'ext' | 'int' | 'axis' | { ring: number; edge?: number };

/** Referência sob o cursor, já pronta para virar linha no rascunho. */
export interface SketchPick {
  kind: 'face' | 'axis' | 'edge';
  hostId: Id;
  seg: SketchSeg;
  label: string;
  which: SketchWhich;
}

type Scored = SketchPick & { d: number };

/** Desempate de mesma distância: face antes de eixo, eixo antes de borda. */
const KIND_ORDER: Record<SketchPick['kind'], number> = { face: 0, axis: 1, edge: 2 };

const wallName = (w: Wall): string => (w.mark ? `parede ${w.mark}` : 'parede');

/** Linha ou arco de uma face de parede. Reta: as faces já vêm esquadrejadas de `wallFaces`. Arco: pontas no contorno. */
function wallFaceSeg(f: WallFrame, wf: WallFaces, side: 'ext' | 'int'): SketchSeg | null {
  const s = side === 'ext' ? f.sExt : f.sInt;
  if (!f.arc) {
    // `faces` de parede reta: [face em sHi, face em sLo, ponta a, ponta b].
    const pair = wf.faces[Math.abs(s - f.sHi) < 1e-12 ? 0 : 1];
    return pair ? makeSeg(newId('sk'), pair[0], pair[1]) : null;
  }
  const arc = f.arc;
  const k = { c: arc.center, r: arc.radius + arc.k * s };
  // Pontos do contorno sobre a circunferência da face: as pontas do arco são os extremos ao longo do eixo.
  const hits = wf.outline
    .filter((q) => onCircle(q, k))
    .map((q) => ({ q, t: arcLocal(arc, q).t }))
    .sort((x, y) => x.t - y.t);
  if (hits.length < 2) return null;
  const a = hits[0]!;
  const b = hits[hits.length - 1]!;
  const m = arcPointAt(arc, (a.t + b.t) / 2, s);
  return makeSeg(newId('sk'), a.q, b.q, sagFromThreePoints(a.q, m, b.q));
}

/** Aresta `i` de um anel (de ring[i] a ring[i+1]). */
function edgeSeg(ring: Vec2[], i: number): SketchSeg {
  return makeSeg(newId('sk'), ring[i]!, ring[(i + 1) % ring.length]!);
}

interface Host {
  id: Id;
  name: string;
  rings: Vec2[][];
}

/** Pisos, lajes e forros do nível, com contorno e furos. */
function hostsOf(ctx: SketchCtx): Host[] {
  const p = ctx.project();
  const levelId = ctx.levelId();
  return [
    ...floorsOnLevel(p, levelId).map((f) => ({ id: f.id, name: 'piso', rings: [f.boundary, ...f.holes] })),
    ...slabsOnLevel(p, levelId).map((s) => ({ id: s.id, name: 'laje', rings: [s.boundary, ...s.holes] })),
    ...ceilingsOnLevel(p, levelId).map((c) => ({ id: c.id, name: 'forro', rings: [c.boundary, ...c.holes] })),
  ];
}

/**
 * Todas as referências do nível a até `tol` do ponto, da mais perto para a mais longe. Faces e eixos de parede (reta ou
 * arco), e arestas de contorno e de furo de piso, laje e forro. Elementos ocultos na planta ficam de fora.
 */
export function faceCandidates(ctx: SketchCtx, pt: Vec2, tol: number): SketchPick[] {
  const p = ctx.project();
  const levelId = ctx.levelId();
  const lang = ctx.lang?.() ?? 'pt';
  const vis = visibleIn(ctx);
  const faces = new Map(wallFacesCached(p, levelId).map((w) => [w.wallId, w] as const));
  const scored: Scored[] = [];
  const push = (pick: SketchPick): void => {
    const d = segDistance(pick.seg, pt);
    if (d <= tol) scored.push({ ...pick, d });
  };
  for (const f of levelFrames(p, levelId)) {
    const w = f.wall;
    if (!vis(w.id)) continue;
    const wf = faces.get(w.id);
    for (const side of ['ext', 'int'] as const) {
      const seg = wf ? wallFaceSeg(f, wf, side) : null;
      if (seg) push({ kind: 'face', hostId: w.id, seg, which: side, label: translate(lang, side === 'ext' ? 'tl_msg_pick_face_ext' : 'tl_msg_pick_face_int', { wall: wallName(w) }) });
    }
    push({ kind: 'axis', hostId: w.id, seg: makeSeg('sk', w.a, w.b, w.sag), which: 'axis', label: translate(lang, 'tl_msg_pick_axis', { wall: wallName(w), arc: w.sag ? translate(lang, 'tl_msg_pick_axis_arc') : '' }) });
  }
  for (const h of hostsOf(ctx)) {
    if (!vis(h.id)) continue;
    h.rings.forEach((ring, r) => {
      const borda = r === 0 ? translate(lang, 'tl_pick_outline') : translate(lang, 'tl_pick_hole');
      ring.forEach((_, i) => push({ kind: 'edge', hostId: h.id, seg: edgeSeg(ring, i), which: { ring: r, edge: i }, label: translate(lang, 'tl_msg_pick_border', { border: borda, element: h.name }) }));
    });
  }
  return scored
    .sort((x, y) => x.d - y.d || KIND_ORDER[x.kind] - KIND_ORDER[y.kind])
    .map(({ d: _d, ...pick }) => ({ ...pick, seg: { ...pick.seg, id: newId('sk') } }));
}

/**
 * Referência mais próxima do cursor (até `tol`), ou null. `cycle` escolhe entre os candidatos em ordem de distância: Tab
 * avança o índice, e volta ao primeiro depois do último.
 */
export function faceAt(ctx: SketchCtx, pt: Vec2, tol: number, cycle = 0): SketchPick | null {
  const c = faceCandidates(ctx, pt, tol);
  if (c.length === 0) return null;
  const n = c.length;
  return c[((cycle % n) + n) % n]!;
}

/** Linhas prontas para o rascunho para uma referência: vazio se o elemento ou o `which` não existem. */
export function faceSegments(ctx: SketchCtx, hostId: Id, which: SketchWhich): SketchSeg[] {
  const p = ctx.project();
  const el = p.elements[hostId];
  if (isWall(el)) {
    if (typeof which !== 'string') return [];
    if (which === 'axis') return [makeSeg(newId('sk'), el.a, el.b, el.sag)];
    const f = levelFrames(p, el.levelId).find((x) => x.wall.id === hostId);
    const wf = wallFacesCached(p, el.levelId).find((x) => x.wallId === hostId);
    const seg = f && wf ? wallFaceSeg(f, wf, which) : null;
    return seg ? [seg] : [];
  }
  if (typeof which === 'string') return [];
  const host = hostsOf(ctx).find((h) => h.id === hostId);
  const ring = host?.rings[which.ring];
  if (!ring) return [];
  if (which.edge !== undefined) return ring[which.edge] ? [edgeSeg(ring, which.edge)] : [];
  return ring.map((_, i) => edgeSeg(ring, i));
}
