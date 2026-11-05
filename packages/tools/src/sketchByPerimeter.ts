import { arcFromSagitta, arcSample, asMulti, boxOf, closeGapsSafe, dist, intersectSegments, ringArea, sagFromThreePoints, union, type Box, type Ring, type SketchSeg, type Vec2 } from '@hestia/geom';
import { levelFrames, wallFacesCached } from '@hestia/engine';
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

/** Circunferências da face externa das paredes curvas da seleção (a face externa fica em `sExt`). */
function exteriorCircles(ctx: SketchCtx, walls: Wall[]): Circle[] {
  const p = ctx.project();
  const levelId = ctx.levelId();
  const ids = new Set(walls.map((w) => w.id));
  return levelFrames(p, levelId)
    .filter((f) => ids.has(f.wall.id) && f.arc)
    .map((f) => ({ c: f.arc!.center, r: f.arc!.radius + f.arc!.k * f.sExt }));
}

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
  const ring = cleanRing(ring0);
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
    const h = Math.floor(n / 2);
    const pts = ring.map((_, i) => at(i));
    out.push(arcThrough(pts.slice(0, h + 1)), arcThrough([...pts.slice(h), pts[0]!]));
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
export function perimeterFromBox(ctx: SketchCtx, boxMin: Vec2, boxMax: Vec2): PerimeterResult {
  const p = ctx.project();
  const levelId = ctx.levelId();
  const lang = ctx.lang?.() ?? 'pt';
  const vis = visibleIn(ctx);
  const box = boxOf([boxMin, boxMax]);
  const walls = wallsOnLevel(p, levelId).filter((w) => vis(w.id) && axisTouchesBox(w, box));
  if (walls.length === 0) return { segs: [], warnings: [translate(lang, 'tl_msg_no_wall_in_box')] };

  const ids = new Set(walls.map((w) => w.id));
  const outlines = wallFacesCached(p, levelId).filter((w) => ids.has(w.wallId));
  const shape = closeGapsSafe(union(...outlines.map((w) => asMulti(w.outline))));
  if (shape.length === 0) return { segs: [], warnings: [translate(lang, 'tl_msg_box_walls_no_geom')] };

  const warnings: string[] = [];
  const area = (poly: (typeof shape)[number]): number => Math.abs(ringArea(poly[0]!));
  const best = shape.reduce((a, b) => (area(b) > area(a) ? b : a));
  if (shape.length > 1) warnings.push(translate(lang, 'tl_msg_box_multi_loops', { n: shape.length }));
  if (!shape.some((poly) => poly.length > 1)) warnings.push(translate(lang, 'tl_msg_box_open_loop'));

  const segs = ringToSegs(best[0]!, exteriorCircles(ctx, walls));
  if (segs.length === 0) warnings.push(translate(lang, 'tl_msg_box_no_area'));
  return { segs, warnings };
}
