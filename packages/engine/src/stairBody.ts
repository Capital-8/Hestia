import { add, asMulti, difference, dist, dot, intersection, mid, mul, perp, ringArea, sub, type Ring, type Vec2 } from '@hestia/geom';
import { stairFinishOf, type StairType } from '@hestia/model';
import type { ResolvedStair, ResolvedStairRiser, ResolvedStairStep } from './stairs.ts';
import { clipByLevel, ringMoments, type BottomPlane } from './stairBodyGeom.ts';
import { stairFinishModel } from './stairFinish.ts';

/**
 * Peça do corpo da escada (decisão 0012 §2). `bottom` é o fundo plano: cota z = a·x + b·y + c. Degrau de escada
 * escalonada e patamar têm fundo plano (a = b = 0). Degraus divididos pelo piso base repetem `kind`, `componentIndex`
 * e `index`. `post` é o poste central do caracol de estilo poste (decisão 0014 §8): cilindro de `rInner`, do piso base
 * até o topo do último degrau, em polígono de 24 lados (`index` 0).
 */
export interface StairBodyPiece {
  kind: 'tread' | 'landing' | 'arrival' | 'post';
  componentIndex: number;
  index: number;
  polygon: Ring;
  zTop: number;
  bottom: { a: number; b: number; c: number };
}

/** Comprimento máximo da chegada, atrás do último espelho (m). */
export const STAIR_ARRIVAL_MAX_LENGTH = 0.3;
/** Espessura da laje de cima usada quando `stairBody` é chamado sem `arrivalTopZ` (m): topo = topZ − este valor. O 3D/corte sempre passam a cota. */
export const STAIR_ARRIVAL_SLAB_DEFAULT = 0.15;

const EPS = 1e-9;
/** Tolerância (m) para reconhecer a cota de um degrau igual à de outro. */
const Z_TOL = 1e-9;
/** Lados do polígono do poste central (decisão 0014 §8). Inscrito no raio interno: área 1,1% menor que π·r². */
export const SPIRAL_POST_SIDES = 24;

/** Frente da chegada (decisão 0012 §2): o último espelho `a`→`b` e o sentido de subida `u` (unitário). */
export interface StairArrivalFrame {
  a: Vec2;
  b: Vec2;
  u: Vec2;
  /** Comprimento da chegada atrás do último espelho: min(p, 0,30 m). */
  length: number;
}

/** Cota do fundo da peça no ponto (x, y). */
export function pieceBottomZ(piece: StairBodyPiece, x: number, y: number): number {
  return piece.bottom.a * x + piece.bottom.b * y + piece.bottom.c;
}

/** Volume da peça = área × (topo − fundo no centróide). Exato porque o fundo é um plano. */
export function pieceVolume(piece: StairBodyPiece): number {
  const { area, cx, cy } = ringMoments(piece.polygon);
  return area * Math.max(0, piece.zTop - pieceBottomZ(piece, cx, cy));
}

/**
 * Corpo da escada resolvida. Monolítico: fundo liso (rampa) ou escalonado (dente de serra), conforme `undersideStyle`
 * do tipo (padrão liso); nenhuma peça desce abaixo do piso base. Piso e espelho: degraus com espessura `treadThickness`
 * e patamares com `landingThickness`, sem chegada. Escada com erro: sem peças.
 *
 * Chegada (monolítico): o topo é `opts.arrivalTopZ` (cota absoluta). O 3D e o corte passam `stairArrivalTop(...).top`: a
 * face inferior da laje/piso que cobre o último espelho ou, sem cobertura, o próprio `topZ` (chegada flush com o nível).
 * Sem `arrivalTopZ`, vale o recuo antigo `topZ − opts.slabThickness` (padrão 0,15 m), só para chamadas isoladas. Com
 * `arrivalTopZ`, a parte da chegada cujo fundo fica acima desse topo é cortada, então a peça nunca tem espessura negativa.
 */
export function stairBody(stair: ResolvedStair, opts: { slabThickness?: number; arrivalTopZ?: number } = {}): { pieces: StairBodyPiece[] } {
  if (stair.issues.some((i) => i.severity === 'error')) return { pieces: [] };
  const type = stair.type as StairType & { undersideStyle?: 'smooth' | 'stepped' };
  if (type.runStyle === 'post') return { pieces: postPieces(stair, type) };
  if (type.runStyle !== 'monolithic') return { pieces: assembledPieces(stair) };
  const arrivalTop = opts.arrivalTopZ ?? stair.topZ - (opts.slabThickness ?? STAIR_ARRIVAL_SLAB_DEFAULT);
  return { pieces: monolithicPieces(stair, type, arrivalTop) };
}

/**
 * Peças da escada para DESENHAR (corte, elevação e 3D): como `stairBody`, mas sem apagar a escada por causa de erro de
 * validação (ex.: espelho acima do máximo da norma). O erro continua no painel e no validador; o desenho não é o lugar de
 * sumir com a estrutura enquanto os acabamentos (que não dependem disso) continuam aparecendo.
 */
export function stairBodyForDrawing(stair: ResolvedStair, opts: { slabThickness?: number; arrivalTopZ?: number } = {}): { pieces: StairBodyPiece[] } {
  return stairBody({ ...stair, issues: stair.issues.filter((i) => i.severity !== 'error') }, opts);
}

/**
 * Frente da chegada a partir dos dois últimos espelhos, na ordem de subida (`last` = espelho N, `prev` = N − 1): a linha
 * do último espelho, o sentido da subida e o comprimento até a próxima linha (limitado a `STAIR_ARRIVAL_MAX_LENGTH`).
 * Função pura: serve ao corpo (3D/corte) e à prévia da ferramenta, que ainda não tem uma escada resolvida.
 */
export function arrivalFrameFrom(last: { a: Vec2; b: Vec2 }, prev: { a: Vec2; b: Vec2 }): StairArrivalFrame | null {
  const dv = sub(mid(last.a, last.b), mid(prev.a, prev.b));
  const pl = Math.hypot(dv.x, dv.y);
  if (!(pl > EPS)) return null;
  return { a: last.a, b: last.b, u: mul(dv, 1 / pl), length: Math.min(pl, STAIR_ARRIVAL_MAX_LENGTH) };
}

/**
 * Frente da chegada (decisão 0012 §2): o último espelho e o sentido de subida. Só existe quando o último degrau é de um
 * lance monolítico que sobe até o espelho de topo (nº N) e o espelho N − 1 também existe; caso contrário, null.
 */
export function stairArrivalFrame(stair: ResolvedStair): StairArrivalFrame | null {
  const h = stair.riserHeight;
  const N = stair.riserCount;
  if (stair.type.runStyle !== 'monolithic' || !(h > 0) || stair.steps.length === 0) return null;
  const lastStep = stair.steps[stair.steps.length - 1]!;
  if (lastStep.kind !== 'tread' || Math.round((lastStep.z - stair.baseZ) / h) !== N - 1) return null;
  const byNumber = riserByNumber(stair, h);
  const top = byNumber.get(N);
  const prevTop = byNumber.get(N - 1);
  if (!top || !prevTop) return null;
  return arrivalFrameFrom(top, prevTop);
}

/** Espelhos pelo nº global, derivado da cota da base do espelho (z0 = base + (nº − 1)·h): cada linha de emenda existe uma vez. */
function riserByNumber(stair: ResolvedStair, h: number): Map<number, ResolvedStairRiser> {
  return new Map<number, ResolvedStairRiser>(stair.risers.map((r) => [Math.round((r.z0 - stair.baseZ) / h) + 1, r]));
}

function assembledPieces(stair: ResolvedStair): StairBodyPiece[] {
  const { treadThickness, landingThickness } = stair.type;
  return stair.steps.map((st) => ({
    kind: st.kind,
    componentIndex: st.componentIndex,
    index: st.index,
    polygon: st.polygon,
    zTop: st.z,
    bottom: { a: 0, b: 0, c: st.z - (st.kind === 'tread' ? treadThickness : landingThickness) },
  }));
}

/** Centróide simples (média dos vértices), para decidir o lado de um espelho. */
const centroidOf = (r: Ring): Vec2 => ({ x: r.reduce((s, p) => s + p.x, 0) / r.length, y: r.reduce((s, p) => s + p.y, 0) / r.length });

/** Anel no sentido anti-horário (a área é positiva). */
const counterClockwise = (r: Ring): Ring => (ringArea(r) > 0 ? r : [...r].reverse());

/**
 * Dois vértices são o mesmo ponto (1 µm). A operação booleana arredonda para 1e-7 m, então o vértice do espelho que volta
 * do recorte não é idêntico ao original: a comparação exata falharia.
 */
const sameVertex = (p: Vec2, q: Vec2): boolean => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6;

/** Ponto sobre o segmento a→b (tolerância de 1 µm na distância à reta e nas pontas). */
function onSegment(v: Vec2, a: Vec2, b: Vec2): boolean {
  const d = sub(b, a);
  const L2 = d.x * d.x + d.y * d.y;
  const w = sub(v, a);
  const t = (w.x * d.x + w.y * d.y) / L2;
  const off = Math.abs(w.x * d.y - w.y * d.x) / Math.sqrt(L2);
  return off < 1e-6 && t > -1e-9 && t < 1 + 1e-9;
}

/**
 * Junta dois anéis anti-horários pela aresta compartilhada: o anel 1 tem X→Y; o anel 2 tem a mesma aresta de Y a X, com
 * pontos colineares entre as pontas (a operação de recorte pode deixar um vértice no meio do espelho). Sem booleana, pois
 * os vértices da aresta são os do espelho aparado. Null se não há a aresta.
 */
function joinAlongEdge(r1: Ring, r2: Ring): Ring | null {
  const n1 = r1.length;
  const n2 = r2.length;
  for (let i = 0; i < n1; i++) {
    const X = r1[i]!;
    const Y = r1[(i + 1) % n1]!;
    for (let s = 0; s < n2; s++) {
      if (!sameVertex(r2[s]!, Y)) continue;
      // Do vértice Y de r2 (s) para a frente, pontos sobre a aresta até X (t).
      let t = (s + 1) % n2;
      let found = false;
      for (let steps = 1; steps < n2; steps++) {
        if (sameVertex(r2[t]!, X)) {
          found = true;
          break;
        }
        if (!onSegment(r2[t]!, Y, X)) break;
        t = (t + 1) % n2;
      }
      if (!found) continue;
      // r1 de Y (i+1) até X (i); depois o resto de r2, de depois de X (t+1) até antes de Y (s).
      const out: Ring = [];
      for (let k = 0; k < n1; k++) out.push(r1[(i + 1 + k) % n1]!);
      for (let u = (t + 1) % n2; u !== s; u = (u + 1) % n2) out.push(r2[u]!);
      return out;
    }
  }
  return null;
}

/**
 * Degrau k do estilo poste estendido sobre o seguinte (decisão 0014 §8): o degrau k ocupa também a faixa de `ov` atrás do
 * espelho k+1, do lado do degrau k+1, cortada pelo degrau k+1 (portanto pelos limites do lance). A faixa mede-se
 * perpendicular ao espelho k+1, então em caracol vale `ov` no raio da caminhada. Sem degrau seguinte, o polígono é o próprio.
 */
function overlappedTread(stair: ResolvedStair, st: ResolvedStairStep, byNumber: Map<number, ResolvedStairRiser>, num: number, ov: number): Ring {
  const h = stair.riserHeight;
  const front = byNumber.get(num + 1);
  const next = stair.steps.find((x) => x.kind === 'tread' && Math.abs(x.z - (st.z + h)) < Z_TOL);
  if (!(ov > EPS) || !front || !next) return st.polygon;
  const L = dist(front.a, front.b);
  if (!(L > EPS)) return st.polygon;
  const dir = mul(sub(front.b, front.a), 1 / L);
  let n = perp(dir);
  if (dot(n, sub(centroidOf(next.polygon), mid(front.a, front.b))) < 0) n = mul(n, -1);
  // Faixa de largura ov a partir do espelho, com margem de um comprimento de espelho ao longo dele (o degrau a corta).
  const ext = mul(dir, L);
  const band: Ring = [sub(front.a, ext), add(front.b, ext), add(add(front.b, ext), mul(n, ov)), add(sub(front.a, ext), mul(n, ov))];
  // A parte do degrau seguinte dentro da faixa encosta no espelho k+1: junta-se pela aresta, sem booleana.
  let ring = counterClockwise(st.polygon);
  for (const poly of intersection(asMulti(next.polygon), asMulti(band))) {
    const outer = poly[0];
    if (!outer) continue;
    ring = joinAlongEdge(ring, counterClockwise(outer)) ?? ring;
  }
  return ring;
}

/** Cilindro do poste central em polígono de `SPIRAL_POST_SIDES` lados, inscrito no raio `r` (sentido anti-horário). */
function postRing(center: Vec2, r: number): Ring {
  return Array.from({ length: SPIRAL_POST_SIDES }, (_, i) => {
    const a = (2 * Math.PI * i) / SPIRAL_POST_SIDES;
    return { x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) };
  });
}

/**
 * Estilo poste (decisão 0014 §8): cada degrau é uma fatia de `treadThickness` (topo em zk, fundo plano em zk − t), estendida
 * sobre o seguinte por `treadOverlap` (`overlappedTread`), sem espelho. O poste central é a peça `post` (cilindro de
 * `rInner`, do piso base ao topo do último degrau). Sem chegada. Sem caracol (`spiral`), não há poste, só os degraus.
 */
function postPieces(stair: ResolvedStair, type: StairType): StairBodyPiece[] {
  const h = stair.riserHeight;
  const t = type.treadThickness;
  const ov = type.treadOverlap;
  const baseZ = stair.baseZ;
  const treads = stair.steps.filter((st) => st.kind === 'tread');
  if (!(h > 0) || !(t > 0) || treads.length === 0) return [];
  const byNumber = riserByNumber(stair, h);
  // Acabamento do piso: a estrutura perde a espessura dele no topo (o fundo fica onde estava).
  const tp = stairFinishOf(type).treadThickness;
  const pieces: StairBodyPiece[] = [];
  for (const st of treads) {
    const num = Math.round((st.z - baseZ) / h);
    const polygon = overlappedTread(stair, st, byNumber, num, ov);
    pieces.push(...fit('tread', st.componentIndex, st.index, polygon, st.z - tp, { a: 0, b: 0, c: st.z - t }, baseZ));
  }
  if (stair.spiral) {
    const top = Math.max(...treads.map((st) => st.z)) - tp;
    pieces.push({
      kind: 'post',
      componentIndex: stair.spiral.componentIndex,
      index: 0,
      polygon: postRing(stair.spiral.center, stair.spiral.rInner),
      zTop: top,
      bottom: { a: 0, b: 0, c: baseZ },
    });
  }
  return pieces;
}

/** Degrau de escada monolítica antes do corte pelo piso base: fundo sem limite inferior, espessura T e nº do espelho de trás. */
interface Tread {
  ci: number;
  polygon: Ring;
  zTop: number;
  T: number;
  plane: BottomPlane;
  /** Nº global do espelho de trás: o topo do degrau é num·h acima da base; o da frente é num + 1. */
  num: number;
}

function monolithicPieces(stair: ResolvedStair, type: StairType & { undersideStyle?: 'smooth' | 'stepped' }, arrivalTop: number): StairBodyPiece[] {
  const h = stair.riserHeight;
  const sd = type.structuralDepth;
  const stepped = type.undersideStyle === 'stepped';
  const baseZ = stair.baseZ;
  if (!(h > 0) || stair.steps.length === 0) return [];

  // Degraus de lances vizinhos usam a mesma linha de espelho (pelo nº global).
  const byNumber = riserByNumber(stair, h);
  const built = stair.steps.map((st) => (st.kind === 'tread' ? treadOf(st, byNumber, h, sd, stepped, baseZ) : null));
  const treads = built.filter((t): t is Tread => t !== null);

  // T da rampa anterior (decisão 0012 §2); sem rampa anterior, o da rampa seguinte.
  const rampT = (ci: number): number => {
    const prev = treads.filter((t) => t.ci < ci);
    const next = treads.filter((t) => t.ci > ci);
    return prev.length ? prev[prev.length - 1]!.T : next.length ? next[0]!.T : sd;
  };

  // Corte pelo piso base vale para todo degrau e patamar: só corta quando o fundo fica abaixo de baseZ (nunca acima).
  // Acabamentos (piso e espelho): a estrutura perde `tp` no topo (o fundo fica onde estava) e a faixa do espelho de trás
  // passa ao acabamento do espelho; a planta estrutural de cada degrau vem do modelo dos acabamentos.
  const finish = stairFinishModel(stair);
  const tp = stairFinishOf(type).treadThickness;
  const planOf = (st: ResolvedStairStep): Ring[] => finish?.structure.get(st) ?? [st.polygon];
  const pieces: StairBodyPiece[] = [];
  stair.steps.forEach((st, i) => {
    if (st.kind === 'tread') {
      const t = built[i];
      if (t) for (const ring of planOf(st)) pieces.push(...fit('tread', st.componentIndex, st.index, ring, t.zTop - tp, t.plane, baseZ));
      return;
    }
    const plane = { a: 0, b: 0, c: st.z - h - rampT(st.componentIndex) };
    for (const ring of planOf(st)) pieces.push(...fit('landing', st.componentIndex, st.index, ring, st.z - tp, plane, baseZ));
  });

  // Chegada: faixa atrás do último espelho, sob o último degrau (mesmo plano). O topo é `arrivalTop` (decisão 0012 §2);
  // a parte cujo fundo fica acima dele é cortada (a laje cobre). Sem último degrau de lance que sobe até o espelho N, não há.
  const lastStep = stair.steps[stair.steps.length - 1]!;
  const lastTread = lastStep.kind === 'tread' ? built[stair.steps.length - 1] : null;
  const frame = stairArrivalFrame(stair);
  if (lastTread && frame && arrivalTop > baseZ + EPS) {
    const { a, b, u, length } = frame;
    // O acabamento do último espelho ocupa a faixa logo atrás dele (a própria faixa do modelo, medida na normal da face):
    // a chegada é o que sobra dela, sem vão nem sobreposição em espelho oblíquo ou radial.
    const ring: Ring = [a, b, add(b, mul(u, length)), add(a, mul(u, length))];
    const polygon = ringArea(ring) < 0 ? ring.reverse() : ring;
    const topBand = finish?.bands.get(stair.riserCount);
    const regions = topBand ? difference(asMulti(polygon), asMulti(topBand)).map((poly) => poly[0]!) : [polygon];
    for (const region of regions) {
      for (const part of partBelow(region, lastTread.plane, arrivalTop)) {
        pieces.push(...fit('arrival', lastStep.componentIndex, 1, part, arrivalTop, lastTread.plane, baseZ));
      }
    }
  }
  return pieces;
}

/** Partes do anel onde o fundo `plane` fica em z ≤ `level` (topo da chegada). Fundo horizontal: tudo ou nada. */
function partBelow(ring: Ring, plane: BottomPlane, level: number): Ring[] {
  if (plane.a === 0 && plane.b === 0) return plane.c <= level + EPS ? [ring] : [];
  return clipByLevel(ring, plane, level, 'below');
}

/** Degrau (kind 'tread') com fundo ao longo de `d` entre os espelhos de trás e da frente, `T` abaixo do topo (decisão 0012 §2). */
function treadOf(
  st: ResolvedStairStep,
  byNumber: Map<number, ResolvedStairRiser>,
  h: number,
  sd: number,
  stepped: boolean,
  baseZ: number,
): Tread | null {
  const num = Math.round((st.z - baseZ) / h);
  const rb = byNumber.get(num);
  const rf = byNumber.get(num + 1);
  if (!rb || !rf) return null;
  const back = mid(rb.a, rb.b);
  const d = sub(mid(rf.a, rf.b), back);
  const p = Math.hypot(d.x, d.y);
  // T = profundidade estrutural ÷ cosθ, cosθ = p / √(p² + h²) (decisão 0012 §2, item 2).
  const T = p > EPS ? (sd * Math.hypot(p, h)) / p : sd;
  const zBack = st.z - h - T;
  // Liso: plano que vale zBack em `back` e sobe h ao longo de `d` (gradiente = h·d ÷ p²).
  const a = (h * d.x) / (p * p);
  const b = (h * d.y) / (p * p);
  const plane: BottomPlane = stepped || p <= EPS ? { a: 0, b: 0, c: zBack } : { a, b, c: zBack - a * back.x - b * back.y };
  return { ci: st.componentIndex, polygon: st.polygon, zTop: st.z, T, plane, num };
}

/**
 * Peça com o fundo `plane`, cortada pelo piso base (decisão 0012 §2): plano inteiro abaixo de `baseZ` vira fundo plano em
 * `baseZ`; plano que cruza `baseZ` é dividido em duas peças. Peça acima do piso base sai inalterada.
 */
function fit(
  kind: StairBodyPiece['kind'],
  componentIndex: number,
  index: number,
  polygon: Ring,
  zTop: number,
  plane: BottomPlane,
  baseZ: number,
): StairBodyPiece[] {
  const piece = (poly: Ring, bottom: BottomPlane): StairBodyPiece => ({ kind, componentIndex, index, polygon: poly, zTop, bottom });
  const flat = (): BottomPlane => ({ a: 0, b: 0, c: baseZ });
  const vals = polygon.map((p) => plane.a * p.x + plane.b * p.y + plane.c);
  if (Math.min(...vals) >= baseZ - EPS) return [piece(polygon, plane)];
  if (Math.max(...vals) <= baseZ + EPS) return [piece(polygon, flat())];
  return [
    ...clipByLevel(polygon, plane, baseZ, 'below').map((r) => piece(r, flat())),
    ...clipByLevel(polygon, plane, baseZ, 'above').map((r) => piece(r, plane)),
  ];
}
