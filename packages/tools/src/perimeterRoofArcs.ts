import { add, arcFromSagitta, arcPointAt, arcTangentAt, cross, dist, equal, intersectCircleLine, intersectCircles, len, mul, norm, ringArea, sub, type SketchSeg, type Vec2 } from '@hestia/geom';
import type { Roof } from '@hestia/model';
import { eaveProblem } from './roofGeom.ts';
import { t as translate, type Lang } from './i18n.ts';

/** Flecha menor que isto (m) é reta: o ajuste de arcos também não enxerga abaulamento abaixo de ~3 mm. */
const MIN_SAG = 1e-3;
/** Erro de corda (m) ao amostrar um arco de volta para o esboço; abaixo de `ARC_TOL` de perimeterArcFit. */
const SAMPLE_TOL = 0.002;

/** Contorno lógico: só os cantos, com a flecha de cada aresta (0 = reta) e o índice, no anel amostrado, de cada aresta. */
export interface LogicalRing {
  outer: Vec2[];
  sag: number[];
  /** Para cada aresta lógica, os índices das arestas amostradas que ela agrupa. */
  groups: number[][];
}

/**
 * Colapsa os arcos amostrados do anel externo do esboço em arestas lógicas: arestas seguidas do mesmo `segId` cuja linha
 * tem flecha viram uma só, com a flecha no sentido do anel. Null quando não há arco ou sobrariam menos de 3 cantos
 * (círculo de duas metades): então o telhado segue com o contorno amostrado, como antes.
 */
export function collapseSketchArcs(outer: Vec2[], segIds: string[], segs: SketchSeg[]): LogicalRing | null {
  const n = outer.length;
  if (n < 4 || segIds.length !== n) return null;
  const byId = new Map(segs.map((s) => [s.id, s] as const));
  const isArc = (id: string): boolean => Math.abs(byId.get(id)?.sag ?? 0) >= MIN_SAG;
  if (!segIds.some(isArc)) return null;
  const start = segIds.findIndex((id, i) => id !== segIds[(i + n - 1) % n]);
  if (start < 0) return null;
  const groups: number[][] = [];
  for (let k = 0; k < n; ) {
    const i = (start + k) % n;
    const id = segIds[i]!;
    const g = [i];
    k++;
    while (isArc(id) && k < n && segIds[(start + k) % n] === id) {
      g.push((start + k) % n);
      k++;
    }
    groups.push(g);
  }
  if (groups.length < 3) return null;
  const pts = groups.map((g) => outer[g[0]!]!);
  const sag = groups.map((g, gi) => {
    const seg = byId.get(segIds[g[0]!]!);
    if (!seg || !isArc(seg.id) || g.length < 2) return 0;
    // Se a linha foi desenhada no sentido contrário ao do anel, a flecha troca de sinal.
    return equal(seg.a, pts[gi]!) ? seg.sag! : -seg.sag!;
  });
  return { outer: pts, sag, groups };
}

/**
 * Pontos de cada aresta do anel: o canto e, se a aresta tem flecha, os pontos do arco (erro de corda de 2 mm). `counts`
 * força quantos trechos cada aresta ganha (para amostrar pegada e beiral com a mesma contagem). `edgeOf[k]` é a aresta
 * lógica do ponto k; o ponto k vai ao k+1 (o último fecha no primeiro).
 */
export function sampleSagRing(ring: Vec2[], sag: number[], counts?: number[]): { pts: Vec2[]; edgeOf: number[]; counts: number[] } {
  const pts: Vec2[] = [];
  const edgeOf: number[] = [];
  const used: number[] = [];
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    const arc = arcFromSagitta(a, b, sag[i] ?? 0);
    pts.push(a);
    edgeOf.push(i);
    if (!arc) {
      used.push(1);
      return;
    }
    const step = 2 * Math.acos(Math.max(0, 1 - SAMPLE_TOL / arc.radius));
    const m = counts?.[i] ?? Math.max(4, Math.min(720, Math.ceil(Math.abs(arc.sweep) / Math.max(step, 1e-3))));
    used.push(m);
    for (let j = 1; j < m; j++) {
      pts.push(arcPointAt(arc, (arc.length * j) / m));
      edgeOf.push(i);
    }
  });
  return { pts, edgeOf, counts: used };
}

/** Normal para fora de cada aresta na ponta de partida e na de chegada (tangente do arco, ou normal da corda se reta). */
function arcEndNormals(ring: Vec2[], sag: number[]): Array<{ start: Vec2; end: Vec2 }> {
  const n = ring.length;
  const ccw = isCcw(ring);
  // Normal para fora na ponta da aresta: à direita do percurso no anel anti-horário, à esquerda no horário.
  const outward = (t: Vec2): Vec2 => (ccw ? { x: t.y, y: -t.x } : { x: -t.y, y: t.x });
  return ring.map((a, i) => {
    const b = ring[(i + 1) % n]!;
    const arc = arcFromSagitta(a, b, sag[i] ?? 0);
    if (!arc) {
      const nv = outward(norm(sub(b, a)));
      return { start: nv, end: nv };
    }
    return { start: outward(arcTangentAt(arc, 0)), end: outward(arcTangentAt(arc, arc.length)) };
  });
}

/**
 * Contorno do beiral com balanço por aresta, com arestas em arco: como `eaveOutlinePerEdge`, mas o canto usa a tangente
 * do arco na ponta (e não a corda), então um arco tangente às retas vizinhas tem o beiral concêntrico (raio R ± d).
 */
export function eaveOutlineArcs(ring: Vec2[], sag: number[], overhangs: number[]): Vec2[] {
  const n = ring.length;
  const ends = arcEndNormals(ring, sag);
  const ccw = isCcw(ring);
  const curves = ring.map((a, i) => offsetCurve(a, ring[(i + 1) % n]!, sag[i] ?? 0, overhangs[i] ?? 0, ccw));
  return ring.map((p, j) => {
    const i1 = (j - 1 + n) % n;
    const n1 = ends[i1]!.end;
    const n2 = ends[j]!.start;
    const d1 = overhangs[i1] ?? 0;
    const d2 = overhangs[j] ?? 0;
    const det = cross(n1, n2);
    if (Math.abs(det) < 1e-9) {
      const d = (d1 + d2) / 2;
      return { x: p.x + ((n1.x + n2.x) / 2) * d, y: p.y + ((n1.y + n2.y) / 2) * d };
    }
    // Esquadria pelas tangentes (exata quando as duas arestas são retas ou tangentes entre si).
    const miter = { x: p.x + (n2.y * d1 - n1.y * d2) / det, y: p.y + (n1.x * d2 - n2.x * d1) / det };
    const c1 = curves[i1]!;
    const c2 = curves[j]!;
    if (c1.kind === 'line' && c2.kind === 'line') return miter;
    // Com arco, o canto é a interseção das curvas deslocadas (reta ou círculo concêntrico); a mais próxima da esquadria.
    const cand = crossCurves(c1, c2);
    if (cand.length === 0) return miter;
    return cand.reduce((best, q) => (dist(q, miter) < dist(best, miter) ? q : best));
  });
}

/** Aresta deslocada `d` para fora: reta (ponto e direção) ou círculo concêntrico (centro e raio). */
type Offset = { kind: 'line'; p: Vec2; u: Vec2 } | { kind: 'circle'; c: Vec2; r: number };

function offsetCurve(a: Vec2, b: Vec2, sag: number, d: number, ccw: boolean): Offset {
  const arc = arcFromSagitta(a, b, sag);
  const u = norm(sub(b, a));
  if (!arc) {
    const nv = ccw ? { x: u.y, y: -u.x } : { x: -u.y, y: u.x };
    return { kind: 'line', p: add(a, mul(nv, d)), u };
  }
  // O abaulado para fora afasta do centro com o balanço; para dentro (côncavo), aproxima.
  const bulgesOut = sag > 0 !== ccw;
  return { kind: 'circle', c: arc.center, r: arc.radius + (bulgesOut ? d : -d) };
}

function crossCurves(x: Offset, y: Offset): Vec2[] {
  if (x.kind === 'circle' && y.kind === 'circle') return intersectCircles(x.c, x.r, y.c, y.r);
  if (x.kind === 'circle' && y.kind === 'line') return intersectCircleLine(x.c, x.r, y.p, y.u);
  if (x.kind === 'line' && y.kind === 'circle') return intersectCircleLine(y.c, y.r, x.p, x.u);
  return [];
}

/**
 * Flecha do arco deslocado: o beiral (ou a pegada, com `d` negativo) de um arco é concêntrico, com raio R ± d. Entre as
 * novas pontas `a2`→`b2` (que estão nesse círculo), a flecha sai do raio e da corda; limitada a metade da corda e com o
 * sinal do arco original.
 */
export function offsetSag(a: Vec2, b: Vec2, sag: number, a2: Vec2, b2: Vec2, d: number, ccw: boolean): number {
  if (Math.abs(sag) < MIN_SAG) return 0;
  const arc = arcFromSagitta(a, b, sag);
  if (!arc) return 0;
  const bulgesOut = sag > 0 !== ccw;
  const r2 = arc.radius + (bulgesOut ? d : -d);
  const half = len(sub(b2, a2)) / 2;
  if (r2 <= half) return Math.sign(sag) * half;
  return Math.sign(sag) * Math.min(half, r2 - Math.sqrt(r2 * r2 - half * half));
}

/** Anel anti-horário? (área com sinal ≥ 0) */
export const isCcw = (ring: Vec2[]): boolean => ringArea(ring) >= 0;

/** Telhado com alguma aresta em arco? */
export const hasRoofArcs = (r: Roof): boolean => (r.edgeSag ?? []).some((v) => Math.abs(v) >= MIN_SAG);

/** Pegada de um telhado com arcos: a guardada ou o beiral com o balanço desfeito (pela tangente dos arcos). */
export function footprintOf(r: Roof): Vec2[] {
  return r.footprint ?? eaveOutlineArcs(r.boundary, r.edgeSag ?? [], r.boundary.map((_, i) => -(r.edgeOverhangs[i] ?? 0)));
}

/** Flecha de cada aresta da pegada, derivada do arco do beiral (o meio do arco volta o balanço pelo raio). */
export function footprintSag(r: Roof, foot: Vec2[]): number[] {
  const n = r.boundary.length;
  const ccw = isCcw(r.boundary);
  return r.boundary.map((a, i) => offsetSag(a, r.boundary[(i + 1) % n]!, r.edgeSag?.[i] ?? 0, foot[i]!, foot[(i + 1) % n]!, -(r.edgeOverhangs[i] ?? 0), ccw));
}

/**
 * Como `eaveProblem`, para um telhado com arcos: pegada e beiral são amostrados com a mesma contagem de trechos por
 * aresta e conferidos ponto a ponto. Null sem arcos, sem pegada ou sem problema.
 */
export function roofEaveArcsProblem(r: Roof): string | null {
  if (!r.footprint || !hasRoofArcs(r)) return null;
  const cusp = arcCuspProblem(r.footprint, footprintSag(r, r.footprint), r.edgeOverhangs);
  if (cusp) return cusp;
  const fs = sampleSagRing(r.footprint, footprintSag(r, r.footprint));
  const es = sampleSagRing(r.boundary, r.edgeSag ?? [], fs.counts);
  return eaveProblem(fs.pts, es.pts, fs.edgeOf.map((e) => r.edgeOverhangs[e] ?? 0));
}

/**
 * Cúspide: uma aresta chega e a seguinte sai pelo mesmo caminho (normais opostas na ponta); com balanço, a esquadria do
 * beiral não existe. Confere o anel com as flechas dadas (pegada). Null quando não há cúspide.
 */
export function arcCuspProblem(ring: Vec2[], sag: number[], overhangs: number[], lang: Lang = 'pt'): string | null {
  const ends = arcEndNormals(ring, sag);
  const n = ends.length;
  for (let j = 0; j < n; j++) {
    const a = ends[(j - 1 + n) % n]!.end;
    const b = ends[j]!.start;
    const d = Math.max(overhangs[j] ?? 0, overhangs[(j - 1 + n) % n] ?? 0);
    if (d > 1e-9 && a.x * b.x + a.y * b.y < -0.999) {
      return translate(lang, 'tl_msg_slope_arc_cusp');
    }
  }
  return null;
}

/**
 * Beiral a partir da pegada com arcos: contorno (cantos em esquadria pelas tangentes) e a flecha de cada aresta,
 * concêntrica à da pegada. É o inverso de `footprintSag`.
 */
export function eaveFromFootprint(foot: Vec2[], footSag: number[], overhangs: number[]): { boundary: Vec2[]; edgeSag: number[] } {
  const n = foot.length;
  const boundary = eaveOutlineArcs(foot, footSag, overhangs);
  const ccw = isCcw(foot);
  const edgeSag = footSag.map((sg, i) => offsetSag(foot[i]!, foot[(i + 1) % n]!, sg, boundary[i]!, boundary[(i + 1) % n]!, overhangs[i] ?? 0, ccw));
  return { boundary, edgeSag };
}

/** Contorno do telhado como polilinha fina: os arcos amostrados (erro de corda de 2 mm); sem arco, o próprio contorno. */
export function roofOutline(r: Roof): Vec2[] {
  return hasRoofArcs(r) ? sampleSagRing(r.boundary, r.edgeSag ?? []).pts : r.boundary;
}

/** Flecha sem o limite de metade da corda, do arco por a, m e b (para recusar o que passa do semicírculo). */
export function rawSag(a: Vec2, m: Vec2, b: Vec2): number {
  const chord = len(sub(b, a));
  const u = norm(sub(b, a));
  const dm = (m.x - a.x) * -u.y + (m.y - a.y) * u.x;
  const tm = (m.x - a.x) * u.x + (m.y - a.y) * u.y;
  if (Math.abs(dm) < 1e-6 || chord < 1e-6) return 0;
  const hc = (tm * (tm - chord) + dm * dm) / (2 * dm);
  return hc + Math.sign(dm) * Math.hypot(chord / 2, hc);
}
