import { add, mul, norm, perp, ringArea, sub, type Ring, type Vec2 } from '@hestia/geom';
import { pieceBottomZ, sampleChain, stairBodyForDrawing, stairFinishModel, type ResolvedStair, type ResolvedStairRiser, type ResolvedStairStep, type StairBodyPiece } from '@hestia/engine';
import type { Id, StairLanding, StairRun, StairType } from '@hestia/model';
import { riserPoints } from '../stairRisers.ts';
import { extrudeCaps, ofElement, pushWall, type SolidBatch } from './solids.ts';

/** Tolerância (m) para reconhecer a cota de um degrau igual à de um espelho. */
const Z_TOL = 1e-9;

/** Tolerância (em comprimento e em área) das comparações de cota e de área (sinal de diferenças e sobreposições). */
const EPS = 1e-9;

/** Espessura mínima (m) de uma peça monolítica: o fundo nunca alcança o topo (decisão 0012 §2). */
const MIN_PIECE_THICKNESS = 1e-4;

/** Espessura (m) do corpo-placeholder da escada sem degraus: fino, mas visível e pegável no picking. */
const PLACEHOLDER_THICKNESS = 0.2;

/** Distância (m) para dois vértices serem o mesmo, ou para um vértice cair sobre uma aresta (T-junction). */
const VERTEX_TOL = 1e-6;

/** Lado (m) da célula da grade de vértices que acha os vértices sobre cada aresta. */
const GRID_CELL = 0.25;

/** Centroide simples (média dos vértices): basta para degraus, que são polígonos quase convexos. */
const centroid = (r: Ring): Vec2 => ({ x: r.reduce((s, p) => s + p.x, 0) / r.length, y: r.reduce((s, p) => s + p.y, 0) / r.length });

/** Normal à esquerda em cada vértice da polilinha (tangente pela diferença central; unilateral nas pontas). */
function leftNormals(pts: Vec2[]): Vec2[] {
  return pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    return perp(norm(sub(b, a)));
  });
}

/**
 * Lado para o qual a espessura do espelho cresce: para trás, onde fica o degrau de cota z0 (o anterior, mais baixo).
 * Sem degrau de cota z0 (primeiro espelho), vai para o lado oposto ao degrau de cota z1. Retorna +1 (esquerda) ou −1.
 */
function behindSide(s: ResolvedStair, r: ResolvedStairRiser, mid: Vec2, n: Vec2): 1 | -1 {
  const stepAt = (z: number): ResolvedStairStep | undefined => s.steps.find((st) => Math.abs(st.z - z) < Z_TOL);
  const below = stepAt(r.z0);
  if (below) return dotSign(n, sub(centroid(below.polygon), mid)) >= 0 ? 1 : -1;
  const above = stepAt(r.z1);
  if (above) return dotSign(n, sub(centroid(above.polygon), mid)) >= 0 ? -1 : 1;
  return 1;
}

const dotSign = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

/**
 * Seção do espelho com espessura `t` atrás da linha (para o lado do degrau anterior): a polilinha da linha do espelho
 * seguida da mesma polilinha deslocada. Assim o espelho não invade o degrau de cota superior nem o de baixo.
 */
export function riserSlab(s: ResolvedStair, r: ResolvedStairRiser, t: number): Ring {
  const pts = riserPoints(r);
  const ns = leftNormals(pts);
  const n0 = ns[Math.floor(ns.length / 2)]!;
  const mid = pts[Math.floor(pts.length / 2)]!;
  const side = behindSide(s, r, mid, n0);
  const off = pts.map((p, i) => add(p, mul(ns[i]!, side * t)));
  return [...pts, ...off.reverse()];
}

/** Lote do material `m` dentro do mapa, criado na primeira vez. */
function batchOf(byMat: Map<Id, SolidBatch>, m: Id): SolidBatch {
  let b = byMat.get(m);
  if (!b) {
    b = { materialId: m, category: 'stair', positions: [], normals: [], indices: [], ids: [] };
    byMat.set(m, b);
  }
  return b;
}

/** Anel no sentido anti-horário (interior à esquerda), para a normal de cada aresta apontar para fora. */
const counterClockwise = (r: Ring): Ring => (ringArea(r) > 0 ? r : [...r].reverse());

/** Chave de vértice na planta (1e-6 m): duas peças que dividem uma aresta a têm com a mesma chave. */
const planKey = (p: Vec2): string => `${Math.round(p.x * 1e6)},${Math.round(p.y * 1e6)}`;

/** Sinal de uma diferença de cotas, com a tolerância EPS: 1, −1 ou 0 (coincidentes). */
const sgn = (v: number): number => (v > EPS ? 1 : v < -EPS ? -1 : 0);

/** Fundo da peça por ponto: o plano, limitado a `topo − 1e-4` para a espessura nunca ser nula ou negativa. */
function bottomOf(piece: StairBodyPiece): (x: number, y: number) => number {
  return (x, y) => Math.min(pieceBottomZ(piece, x, y), piece.zTop - MIN_PIECE_THICKNESS);
}

/** Corpo da escada para a extrusão: polígono da planta, fundo por ponto, topo (constante) e material da peça. */
interface Body {
  polygon: Ring;
  bot: (x: number, y: number) => number;
  top: number;
  materialId: Id;
}

/**
 * Faixas da parede de `a` na aresta p→q que ficam expostas: a parede inteira menos o trecho que coincide com a parede
 * da peça vizinha `b` (a mesma aresta, no sentido oposto). Cada faixa tem a cota de fundo e de topo em p e em q. Em cada
 * ponta, o que sobra é o trecho de baixo (do fundo de `a` até o fundo de `b`) e o de cima (do topo de `b` até o topo de
 * `a`), cada um com altura zero quando `b` cobre até a borda de `a`; assim as faixas viram quadriláteros, ou triângulos
 * quando as faces se tocam numa ponta (ex.: dois fundos que se encontram exatamente na aresta). Se a ordem das cotas
 * muda de verdade entre p e q (as superfícies se cruzam), nada é cortado e as duas paredes ficam inteiras.
 */
function exposedSpans(a: Body, b: Body | undefined, p: Vec2, q: Vec2): Array<{ p: [number, number]; q: [number, number] }> {
  const loP = a.bot(p.x, p.y);
  const loQ = a.bot(q.x, q.y);
  if (!b) return [{ p: [loP, a.top], q: [loQ, a.top] }];
  const bP = b.bot(p.x, p.y);
  const bQ = b.bot(q.x, q.y);
  const sp = [loP - a.top, loP - bP, loP - b.top, a.top - bP, a.top - b.top, bP - b.top].map(sgn);
  const sq = [loQ - a.top, loQ - bQ, loQ - b.top, a.top - bQ, a.top - b.top, bQ - b.top].map(sgn);
  if (sp.some((s, i) => s * sq[i]! < 0)) return [{ p: [loP, a.top], q: [loQ, a.top] }];
  const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
  const out: Array<{ p: [number, number]; q: [number, number] }> = [];
  // Baixo: do fundo de `a` até o fundo de `b` (limitado ao topo de `a`); cima: do topo de `b` (limitado ao fundo de `a`) até o topo de `a`.
  const lowP = clamp(bP, loP, a.top);
  const lowQ = clamp(bQ, loQ, a.top);
  if (lowP - loP > EPS || lowQ - loQ > EPS) out.push({ p: [loP, lowP], q: [loQ, lowQ] });
  const upP = clamp(b.top, loP, a.top);
  const upQ = clamp(b.top, loQ, a.top);
  if (a.top - upP > EPS || a.top - upQ > EPS) out.push({ p: [upP, a.top], q: [upQ, a.top] });
  return out;
}

/** Parede de uma faixa: quadrilátero, ou triângulo quando a altura é zero numa das pontas (sem triângulo degenerado). */
function pushSpan(b: SolidBatch, p: Vec2, q: Vec2, s: { p: [number, number]; q: [number, number] }): void {
  const hp = s.p[1] - s.p[0];
  const hq = s.q[1] - s.q[0];
  if (hp > EPS && hq > EPS) return pushWall(b, p, q, s.p[0], s.q[0], s.p[1], s.q[1]);
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const L = Math.hypot(dx, dy);
  if (L < EPS) return;
  const pts = hp > EPS ? [p.x, p.y, s.p[0], q.x, q.y, s.q[0], p.x, p.y, s.p[1]] : [p.x, p.y, s.p[0], q.x, q.y, s.q[0], q.x, q.y, s.q[1]];
  const at = b.positions.length / 3;
  b.positions.push(...pts);
  for (let i = 0; i < 3; i++) b.normals.push(dy / L, -dx / L, 0);
  b.indices.push(at, at + 1, at + 2);
}

/**
 * Insere em cada aresta dos anéis os vértices de OUTROS anéis que caem sobre ela (T-junction na planta). Dois corpos que
 * dividem só parte de uma aresta (ex.: o patamar e o degrau vizinho, com a faixa do acabamento no meio) passam a ter
 * arestas idênticas nos trechos em comum, e a parede coplanar entre eles é cancelada em vez de virar face interna com
 * aresta desenhada. O contorno do corpo não muda.
 */
function splitRingEdges(rings: Ring[]): Ring[] {
  const all = rings.flatMap((r, i) => r.map((p) => ({ p, i })));
  return rings.map((r, i) => {
    const out: Ring = [];
    r.forEach((p, e) => {
      out.push(p);
      const q = r[(e + 1) % r.length]!;
      const d = sub(q, p);
      const L = Math.hypot(d.x, d.y);
      if (L < VERTEX_TOL) return;
      const found: Array<{ t: number; v: Vec2 }> = [];
      for (const o of all) {
        if (o.i === i) continue;
        const w = sub(o.p, p);
        const t = (w.x * d.x + w.y * d.y) / L;
        if (t <= VERTEX_TOL || t >= L - VERTEX_TOL) continue;
        if (Math.abs(w.x * d.y - w.y * d.x) / L < VERTEX_TOL && !found.some((f) => Math.abs(f.t - t) < VERTEX_TOL)) found.push({ t, v: o.p });
      }
      found.sort((a, b) => a.t - b.t);
      for (const f of found) out.push(f.v);
    });
    return out;
  });
}

/**
 * Extrusão dos corpos de uma escada: topo e fundo de cada um, e a parede só onde a face fica exposta. Uma aresta da
 * planta que dois corpos dividem (espelho entre degraus, corte pelo piso base) não tem parede nessa parte: as duas
 * paredes coincidentes são internas e se cancelam no volume. Assim o desenho de arestas não marca emendas.
 */
function extrudeBodies(b: SolidBatch, input: Body[]): void {
  // Corpo sem espessura não entra: não deve cortar a parede de vizinho.
  const bodies = input.filter((c) => c.top - Math.min(...c.polygon.map((p) => c.bot(p.x, p.y))) > 1e-6);
  const rings = splitRingEdges(bodies.map((c) => counterClockwise(c.polygon)));
  // Aresta p→q de cada corpo; a do corpo vizinho aparece no sentido oposto, q→p.
  const owner = new Map<string, number>();
  rings.forEach((r, i) => r.forEach((p, e) => owner.set(`${planKey(p)}>${planKey(r[(e + 1) % r.length]!)}`, i)));
  bodies.forEach((c, i) => {
    const zMin = Math.min(...c.polygon.map((p) => c.bot(p.x, p.y)));
    extrudeCaps(b, [c.polygon], zMin, c.top, undefined, c.bot);
    const r = rings[i]!;
    r.forEach((p, e) => {
      const q = r[(e + 1) % r.length]!;
      const j = owner.get(`${planKey(q)}>${planKey(p)}`);
      for (const s of exposedSpans(c, j === undefined ? undefined : bodies[j], p, q)) pushSpan(b, p, q, s);
    });
  });
}

/**
 * Peças do lance monolítico (decisão 0012) e do poste (decisão 0014 §8) como corpos: topo plano e fundo em rampa ou plano.
 * O poste central (`post`) vai no material `postMaterialId`; os degraus e patamares, no material do tipo.
 */
const monolithicBodies = (pieces: StairBodyPiece[], type: StairType): Body[] =>
  pieces.map((p) => ({ polygon: p.polygon, bot: bottomOf(p), top: p.zTop, materialId: p.kind === 'post' ? type.postMaterialId : type.materialId }));

/**
 * Corpos do lance montado: cada degrau e patamar é um prisma de topo em `z` e base `treadThickness` (ou
 * `landingThickness`) abaixo; cada espelho é o prisma de `riserThickness` atrás da linha, de `z0` a `z1`.
 */
function assembledBodies(s: ResolvedStair): Body[] {
  const { treadThickness, landingThickness, riserThickness, materialId } = s.type;
  const bodies: Body[] = s.steps.map((st) => {
    const z0 = st.z - (st.kind === 'landing' ? landingThickness : treadThickness);
    return { polygon: st.polygon, bot: () => z0, top: st.z, materialId };
  });
  if (riserThickness > 0) for (const r of s.risers) bodies.push({ polygon: riserSlab(s, r, riserThickness), bot: () => r.z0, top: r.z1, materialId });
  return bodies;
}

/**
 * Escada resolvida com o croqui em planta. O motor expõe a caixa do croqui (`sketchBounds`, mesmo sem degraus) e/ou os
 * componentes; os campos são lidos como opcionais para a malha não quebrar com escadas resolvidas sem croqui (sem
 * curvas não há retângulo de onde tirar o placeholder).
 */
type StairWithSketch = ResolvedStair & {
  components?: Array<StairRun | StairLanding>;
  sketchBounds?: { minX: number; minY: number; maxX: number; maxY: number };
};

/** Retângulo envolvente do croqui: a caixa do motor quando existe; senão, os pontos de todas as curvas dos componentes. */
function sketchBoundsOf(s: ResolvedStair): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const sketch = s as StairWithSketch;
  if (sketch.sketchBounds) return sketch.sketchBounds;
  const pts = (sketch.components ?? []).flatMap((c) =>
    sampleChain(c.kind === 'run' ? [...c.boundaryLeft, ...c.boundaryRight, ...c.risers, ...c.path] : c.boundary),
  );
  if (pts.length === 0) return null;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/**
 * Corpo-placeholder da escada sem degraus (topo ≤ base, `stair-top-not-above`, croqui sem espelhos): prisma fino do
 * retângulo envolvente do croqui, apoiado na cota da base. Mantém a escada visível e selecionável no 3D; o erro continua
 * no painel/validador — o render não decide validade. `null` sem pontos de onde tirar o retângulo.
 */
function placeholderBody(s: ResolvedStair): Body | null {
  const bounds = sketchBoundsOf(s);
  if (!bounds) return null;
  const { minX, minY, maxX, maxY } = bounds;
  if (maxX - minX < EPS || maxY - minY < EPS) return null;
  return {
    polygon: [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ],
    bot: () => s.baseZ,
    top: s.baseZ + PLACEHOLDER_THICKNESS,
    materialId: s.type.materialId,
  };
}

/**
 * Insere, nas arestas dos triângulos, os vértices de outras faces que caem sobre elas (T-junction). Assim cada aresta
 * real casa com a da face vizinha e o desenho de arestas não marca emendas. Só divide triângulos: a superfície não muda.
 */
function splitTJunctions(b: SolidBatch): void {
  type V = [number, number, number];
  const corner = (k: number): V => [b.positions[k * 3]!, b.positions[k * 3 + 1]!, b.positions[k * 3 + 2]!];
  const cellOf = (v: V): string => `${Math.floor(v[0] / GRID_CELL)},${Math.floor(v[1] / GRID_CELL)},${Math.floor(v[2] / GRID_CELL)}`;
  const grid = new Map<string, V[]>();
  const seen = new Set<string>();
  for (let k = 0; k < b.positions.length / 3; k++) {
    const v = corner(k);
    const key = v.map((c) => Math.round(c * 1e6)).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const cell = cellOf(v);
    const list = grid.get(cell);
    if (list) list.push(v);
    else grid.set(cell, [v]);
  }
  /** Vértices da grade sobre o segmento a→c (sem os extremos), de a para c. */
  const onEdge = (a: V, c: V): V[] => {
    const d = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const L = Math.hypot(d[0]!, d[1]!, d[2]!);
    if (L < VERTEX_TOL) return [];
    const u = [d[0]! / L, d[1]! / L, d[2]! / L];
    const lo = [0, 1, 2].map((k) => Math.floor((Math.min(a[k]!, c[k]!) - VERTEX_TOL) / GRID_CELL));
    const hi = [0, 1, 2].map((k) => Math.floor((Math.max(a[k]!, c[k]!) + VERTEX_TOL) / GRID_CELL));
    const found: Array<{ t: number; v: V }> = [];
    for (let i = lo[0]!; i <= hi[0]!; i++)
      for (let j = lo[1]!; j <= hi[1]!; j++)
        for (let k = lo[2]!; k <= hi[2]!; k++)
          for (const v of grid.get(`${i},${j},${k}`) ?? []) {
            const w = [v[0] - a[0], v[1] - a[1], v[2] - a[2]];
            const t = w[0]! * u[0]! + w[1]! * u[1]! + w[2]! * u[2]!;
            if (t <= VERTEX_TOL || t >= L - VERTEX_TOL) continue;
            const off = Math.hypot(w[0]! - t * u[0]!, w[1]! - t * u[1]!, w[2]! - t * u[2]!);
            if (off < VERTEX_TOL) found.push({ t, v });
          }
    return found.sort((x, y) => x.t - y.t).map((f) => f.v);
  };
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  /** Índice de saída de cada triângulo de entrada (as faixas dos elementos se remapeiam por ele). */
  const firstOut: number[] = [];
  const emit = (tri: [V, V, V], n: number[]): void => {
    for (const v of tri) {
      indices.push(positions.length / 3);
      positions.push(v[0], v[1], v[2]);
      normals.push(n[0]!, n[1]!, n[2]!);
    }
  };
  for (let i = 0; i < b.indices.length; i += 3) {
    firstOut.push(indices.length);
    const [i0, i1, i2] = [b.indices[i]!, b.indices[i + 1]!, b.indices[i + 2]!];
    const n = [b.normals[i0 * 3]!, b.normals[i0 * 3 + 1]!, b.normals[i0 * 3 + 2]!];
    const [A, B, C] = [corner(i0), corner(i1), corner(i2)];
    const poly: V[] = [A, ...onEdge(A, B), B, ...onEdge(B, C), C, ...onEdge(C, A)];
    if (poly.length === 3) {
      emit([A, B, C], n);
      continue;
    }
    // Leque a partir do centroide do triângulo: ele não cai sobre nenhum lado, então todo trecho de lado vira aresta.
    const O: V = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3];
    for (let k = 0; k < poly.length; k++) emit([O, poly[k]!, poly[(k + 1) % poly.length]!], n);
  }
  firstOut.push(indices.length);
  b.ids = b.ids.map((r) => {
    const start = firstOut[r.start / 3]!;
    return { id: r.id, start, count: firstOut[(r.start + r.count) / 3]! - start };
  });
  b.positions = positions;
  b.normals = normals;
  b.indices = indices;
}

/**
 * Sólidos das escadas (3D), por material (decisão 0011 §1). Lance monolítico (decisão 0012): o corpo são as
 * peças de `stairBody` (degraus, patamares e chegada), cada uma com topo plano e fundo plano ou em rampa; os espelhos
 * são a face de trás das peças, então não há placas. As paredes entre peças vizinhas só existem onde a face está
 * exposta, e os vértices soltos sobre as arestas são inseridos (`extrudeBodies`, `splitTJunctions`). Lance montado:
 * degrau de `z − treadThickness` a `z`; espelho de `riserThickness` atrás da linha; patamar de `landingThickness`.
 * Poste (decisão 0014 §8): degraus soltos (sem espelho) no material do tipo, e o poste central (cilindro de 24 faces) no
 * `postMaterialId`; cada material vai ao seu lote, e cada peça fecha as próprias paredes onde expostas.
 * Erro (`issue` de severidade `error`) não apaga a malha: a geometria dos degraus continua e o erro fica no painel e no
 * validador. Sem degraus (topo ≤ base, `stair-top-not-above`, croqui sem espelhos), sai um corpo-placeholder fino do
 * retângulo do croqui, para a escada continuar visível e selecionável. `arrivalTopOf` dá a cota do topo da chegada de
 * cada escada (`stairArrivalTop`, a face inferior da laje que cobre o último espelho ou o próprio `topZ` quando não há
 * cobertura — a cena sempre passa essa cota). `null` ou sem callback é o recuo padrão antigo (topo − 0,15 m), mantido só
 * para chamadas fora da cena (testes e ferramentas que montam a malha isolada).
 */
export function buildStairSolids(stairs: ResolvedStair[], arrivalTopOf: (s: ResolvedStair) => number | null = () => null): SolidBatch[] {
  const byMat = new Map<Id, SolidBatch>();
  for (const s of stairs) {
    // Escada sem degraus: corpo-placeholder do croqui, para continuar no 3D (e no picking) mesmo sem geometria de degrau.
    if (s.steps.length === 0) {
      const placeholder = placeholderBody(s);
      if (!placeholder) continue;
      const b = batchOf(byMat, placeholder.materialId);
      ofElement(b, s.id, () => extrudeBodies(b, [placeholder]));
      continue;
    }
    const bodies =
      s.type.runStyle === 'monolithic' || s.type.runStyle === 'post'
        ? // `stairBodyForDrawing`: a malha não é o lugar de apagar a escada com erro (o erro continua no painel/validador).
          monolithicBodies(stairBodyForDrawing(s, { arrivalTopZ: arrivalTopOf(s) ?? undefined }).pieces, s.type)
        : assembledBodies(s);
    // Acabamentos (piso+bocel num só sólido, e espelho): sólidos próprios, cada um no seu material.
    for (const f of stairFinishModel(s)?.solids ?? []) bodies.push({ polygon: f.polygon, bot: () => f.z0, top: f.z1, materialId: f.materialId });
    // Um lote por material: cada chamada de `extrudeBodies` só pareia paredes entre peças do mesmo material (cada peça fecha o próprio corpo).
    const byBodyMaterial = new Map<Id, Body[]>();
    for (const body of bodies) byBodyMaterial.set(body.materialId, [...(byBodyMaterial.get(body.materialId) ?? []), body]);
    if (byBodyMaterial.size === 0) batchOf(byMat, s.type.materialId);
    for (const [materialId, list] of byBodyMaterial) {
      const b = batchOf(byMat, materialId);
      ofElement(b, s.id, () => extrudeBodies(b, list));
    }
  }
  const batches = [...byMat.values()];
  for (const b of batches) splitTJunctions(b);
  return batches;
}
