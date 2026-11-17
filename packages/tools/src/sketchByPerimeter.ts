import { arcFromSagitta, arcSample, asMulti, boxOf, closeGapsSafe, closestOnSegment, dist, intersectSegments, ringArea, sagFromThreePoints, union, type Box, type Ring, type SketchSeg, type Vec2 } from '@hestia/geom';
import { cleanOutlineRing, levelFrames, wallFacesCached, wallTopFacesCached, type WallTopFaces } from '@hestia/engine';
import { newId, wallsOnLevel, type Wall } from '@hestia/model';
import { circleIndexOf, makeSeg, sameDirection, visibleIn, type Circle, type SketchCtx } from './sketchPickFaceGeom.ts';
import { t as translate } from './i18n.ts';

/** Resultado do contorno pela caixa: linhas do anel externo (fechado) e avisos para a barra de status. */
export interface PerimeterResult {
  segs: SketchSeg[];
  warnings: string[];
}

/** Dois pontos do anel com distância abaixo disto são o mesmo ponto (ruído de união). */
const SAME_POINT = 1e-7;

/** O eixo da parede (reta ou arco) entra na caixa ou a cruza. Arcos são amostrados para o teste de cruzamento. */
function axisTouchesBox(w: Wall, box: Box): boolean {
  const arc = arcFromSagitta(w.a, w.b, w.sag);
  const pts = arc ? arcSample(arc, 0, arc.length, 0, 0.002) : [w.a, w.b];
  const inside = (q: Vec2): boolean => q.x >= box.minX && q.x <= box.maxX && q.y >= box.minY && q.y <= box.maxY;
  if (pts.some(inside)) return true;
  const corners: Vec2[] = [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ];
  return pts.some((q, i) => i > 0 && corners.some((c, k) => intersectSegments(pts[i - 1]!, q, c, corners[(k + 1) % 4]!) !== null));
}

/** Circunferências da face externa das paredes curvas da seleção (a face externa fica em `sExt`; no topo, a da aresta superior). */
function exteriorCircles(ctx: SketchCtx, walls: Wall[], tops: Map<string, WallTopFaces>): Circle[] {
  const p = ctx.project();
  const levelId = ctx.levelId();
  const ids = new Set(walls.map((w) => w.id));
  return levelFrames(p, levelId)
    .filter((f) => ids.has(f.wall.id) && f.arc)
    .map((f): Circle => {
      const tf = tops.get(f.wall.id);
      const pts = tf?.exterior;
      if (pts && pts.length >= 3) {
        const a = pts[0]!, b = pts[pts.length - 1]!, m = pts[Math.floor(pts.length / 2)]!;
        const sag = sagFromThreePoints(a, m, b);
        const arc = arcFromSagitta(a, b, sag);
        if (arc) return { c: arc.center, r: arc.radius };
      }
      return { c: f.arc!.center, r: f.arc!.radius + f.arc!.k * f.sExt };
    });
}

/** Distância de `q` à polilinha fechada `ring`. */
function distToRing(q: Vec2, ring: Vec2[]): number {
  let m = Infinity;
  for (let i = 0; i < ring.length; i++) m = Math.min(m, dist(q, closestOnSegment(q, ring[i]!, ring[(i + 1) % ring.length]!)));
  return m;
}

/** O contorno superior da parede difere do da base em planta (inclinação, ou junção inclinada vizinha): mais de 0,1 mm. */
function topDiffers(top: Vec2[], base: Vec2[]): boolean {
  return top.some((q) => distToRing(q, base) > 1e-4);
}

/** Anel em sentido anti-horário (o contorno de `wallFaces` já vem assim). */
const ccw = (ring: Vec2[]): Vec2[] => (ringArea(ring) < 0 ? [...ring].reverse() : ring);

/** Remove pontos repetidos seguidos e o fechamento repetido no fim. */
function cleanRing(ring: Ring): Ring {
  const out: Ring = [];
  for (const q of ring) if (out.length === 0 || dist(out[out.length - 1]!, q) > SAME_POINT) out.push(q);
  while (out.length > 1 && dist(out[0]!, out[out.length - 1]!) <= SAME_POINT) out.pop();
  return out;
}

/** Arco de uma sequência de pontos sobre a mesma circunferência (pontas e um ponto do meio). */
function arcThrough(pts: Vec2[]): SketchSeg {
  const a = pts[0]!;
  const b = pts[pts.length - 1]!;
  const sag = sagFromThreePoints(a, pts[Math.floor(pts.length / 2)]!, b);
  return makeSeg(newId('sk'), a, b, sag);
}

/**
 * Anel do contorno em linhas e arcos. Uma aresta é de arco quando as duas pontas caem sobre a mesma circunferência de
 * face curva; uma sequência dessas arestas vira um arco só. As demais arestas são retas, com as colineares seguidas
 * fundidas.
 */
function ringToSegs(ring0: Ring, circles: Circle[]): SketchSeg[] {
  // Limpeza do anel da união das paredes: paredes que quase se alinham deixam arestas de milímetros e vértices em reta (ver `ringClean.ts`).
  // Os vértices sobre o arco de uma parede curva ficam como estão.
  const ring = cleanOutlineRing(cleanRing(ring0), undefined, undefined, (q) => circleIndexOf(q, circles) >= 0);
  const n = ring.length;
  if (n < 3) return [];
  const on = ring.map((q) => circleIndexOf(q, circles));
  const arcEdge = (i: number): boolean => {
    const j = ((i % n) + n) % n;
    return on[j]! >= 0 && on[j] === on[(j + 1) % n];
  };
  const at = (i: number): Vec2 => ring[((i % n) + n) % n]!;
  const out: SketchSeg[] = [];
  const pushStraight = (a: Vec2, b: Vec2): void => {
    out.push(makeSeg(newId('sk'), a, b));
  };

  // Ponto de partida numa fronteira (aresta que não é de arco antes dele). Anel inteiro sobre a mesma circunferência: caso à parte.
  let s = -1;
  for (let i = 0; i < n && s < 0; i++) if (!arcEdge((i + n - 1) % n)) s = i;
  if (s < 0) {
    // Círculo inteiro: dois semicírculos entre `at(0)` e o ponto diametralmente oposto, exato sobre a circunferência ajustada.
    // Partir no vértice de índice n/2 não serve: o anel da união começa num vértice qualquer e a corda deixaria de ser o diâmetro
    // (a flecha sairia menor que o raio).
    const { c } = circles[on[0]!]!;
    const a = at(0);
    const b = { x: 2 * c.x - a.x, y: 2 * c.y - a.y };
    out.push(
      makeSeg(newId('sk'), a, b, sagFromThreePoints(a, at(Math.floor(n / 4)), b)),
      makeSeg(newId('sk'), b, a, sagFromThreePoints(b, at(Math.floor((3 * n) / 4)), a)),
    );
    return out;
  }

  let k = 0;
  while (k < n) {
    const i = s + k;
    if (!arcEdge(i)) {
      pushStraight(at(i), at(i + 1));
      k += 1;
      continue;
    }
    let m = k;
    while (m + 1 < n && arcEdge(s + m + 1) && on[(s + m + 1) % n] === on[(s + k) % n]) m += 1;
    const run = m - k + 1;
    if (run >= 2) {
      const pts: Vec2[] = [];
      for (let j = k; j <= m + 1; j++) pts.push(at(s + j));
      out.push(arcThrough(pts));
    } else {
      pushStraight(at(i), at(i + 1));
    }
    k = m + 1;
  }

  // Funde retas colineares e no mesmo sentido, seguidas (vértices de união que não mudam a forma).
  const merged: SketchSeg[] = [];
  for (const seg of out) {
    const last = merged[merged.length - 1];
    if (last && !last.sag && !seg.sag && sameDirection(last, seg)) last.b = seg.b;
    else merged.push(seg);
  }
  return merged;
}

/**
 * Contorno externo das paredes cujo eixo entra na caixa (ou a cruza), como linhas e arcos fechados. Une as faces das
 * paredes selecionadas (o contorno é o de `wallFacesCached`, com esquadria e arcos reais) e devolve o anel externo;
 * furos internos (divisórias e vazios) são ignorados. Avisos: contorno aberto (a seleção não fecha circuito), mais de um
 * contorno separado (usa o maior) e nenhuma parede na caixa.
 */
export function perimeterFromBox(ctx: SketchCtx, boxMin: Vec2, boxMax: Vec2, opts: { top?: boolean } = {}): PerimeterResult {
  const p = ctx.project();
  const levelId = ctx.levelId();
  const lang = ctx.lang?.() ?? 'pt';
  const vis = visibleIn(ctx);
  const box = boxOf([boxMin, boxMax]);
  const walls = wallsOnLevel(p, levelId).filter((w) => vis(w.id) && axisTouchesBox(w, box));
  if (walls.length === 0) return { segs: [], warnings: [translate(lang, 'tl_msg_no_wall_in_box')] };

  const ids = new Set(walls.map((w) => w.id));
  const outlines = wallFacesCached(p, levelId).filter((w) => ids.has(w.wallId));
  // Topo (telhado e forro): cada parede cujo topo difere da base em planta entra pelo contorno superior (`wallTopFaces`).
  const tops = new Map<string, WallTopFaces>();
  if (opts.top) {
    const all = new Map(wallTopFacesCached(p, levelId).map((t) => [t.wallId, t] as const));
    for (const o of outlines) {
      const t = all.get(o.wallId);
      if (t && topDiffers(t.outline, o.outline)) tops.set(o.wallId, t);
    }
  }
  const shape = closeGapsSafe(union(...outlines.map((w) => asMulti(tops.has(w.wallId) ? ccw(tops.get(w.wallId)!.outline.map((q) => ({ x: q.x, y: q.y }))) : w.outline))));
  if (shape.length === 0) return { segs: [], warnings: [translate(lang, 'tl_msg_box_walls_no_geom')] };

  const warnings: string[] = [];
  const area = (poly: (typeof shape)[number]): number => Math.abs(ringArea(poly[0]!));
  const best = shape.reduce((a, b) => (area(b) > area(a) ? b : a));
  if (shape.length > 1) warnings.push(translate(lang, 'tl_msg_box_multi_loops', { n: shape.length }));
  if (!shape.some((poly) => poly.length > 1)) warnings.push(translate(lang, 'tl_msg_box_open_loop'));

  const segs = ringToSegs(best[0]!, exteriorCircles(ctx, walls, tops));
  if (segs.length === 0) warnings.push(translate(lang, 'tl_msg_box_no_area'));
  return { segs, warnings };
}
