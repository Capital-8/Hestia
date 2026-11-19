import { cross, dist, dot, norm, perp, sub, type Vec2 } from './vec.ts';
import { ringArea, pointInRing } from './polygon.ts';
import { SkeletonFail, linkCorners, mkCorner, newSim, pushNode, type Sim } from './skeletonCore.ts';
import { type LeaderInfo } from './skeletonFaces.ts';

/** Entrada do esqueleto (contrato público; ver skeleton.ts). */
export interface SkeletonInput {
  outer: Vec2[];
  holes: Vec2[][];
  weights: number[][];
}

const EPS_LEN = 1e-9;

function segmentsTouch(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o1 = cross(sub(b, a), sub(c, a));
  const o2 = cross(sub(b, a), sub(d, a));
  const o3 = cross(sub(d, c), sub(a, c));
  const o4 = cross(sub(d, c), sub(b, c));
  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  const onSeg = (p: Vec2, q: Vec2, r: Vec2): boolean =>
    Math.abs(cross(sub(q, p), sub(r, p))) <= 1e-9 && dot(sub(r, p), sub(r, q)) <= 1e-9;
  return onSeg(a, b, c) || onSeg(a, b, d) || onSeg(c, d, a) || onSeg(c, d, b);
}

function checkShape(input: SkeletonInput): Vec2[][] {
  if (!Array.isArray(input.holes)) throw new SkeletonFail('furos inválidos: esperado um array');
  const rings = [input.outer, ...input.holes];
  if (!Array.isArray(input.weights) || input.weights.length !== rings.length) {
    throw new SkeletonFail('pesos: deve haver um vetor de pesos por anel (externo e furos)');
  }
  rings.forEach((R, r) => {
    const nome = r === 0 ? 'contorno externo' : `furo ${r}`;
    if (!Array.isArray(R) || R.length < 3) throw new SkeletonFail(`${nome} com menos de 3 vértices`);
    for (const p of R) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) throw new SkeletonFail(`${nome} com coordenada inválida`);
    }
    const m = R.length;
    for (let k = 0; k < m; k++) {
      if (dist(R[k]!, R[(k + 1) % m]!) <= EPS_LEN) throw new SkeletonFail(`${nome} com vértices repetidos`);
    }
    if (Math.abs(ringArea(R)) <= 1e-9) throw new SkeletonFail(`${nome} com área zero`);
    const ws = input.weights[r];
    if (!Array.isArray(ws) || ws.length !== m) throw new SkeletonFail(`${nome}: um peso por aresta`);
    for (const w of ws) {
      if (!Number.isFinite(w) || w < 0) throw new SkeletonFail(`${nome}: pesos devem ser finitos e não negativos`);
    }
  });
  if (input.weights.every((ws) => ws.every((w) => w === 0))) {
    throw new SkeletonFail('nenhuma aresta define inclinação');
  }
  return rings;
}

function checkTopology(rings: Vec2[][]): void {
  rings.forEach((R, r) => {
    const m = R.length;
    for (let i = 0; i < m; i++) {
      for (let j = i + 2; j < m; j++) {
        if (i === 0 && j === m - 1) continue;
        if (segmentsTouch(R[i]!, R[(i + 1) % m]!, R[j]!, R[(j + 1) % m]!)) {
          throw new SkeletonFail(
            r === 0 ? 'contorno com auto-interseção' : `furo ${r} com auto-interseção`,
          );
        }
      }
    }
  });
  for (let a = 0; a < rings.length; a++) {
    for (let b = a + 1; b < rings.length; b++) {
      const A = rings[a]!;
      const B = rings[b]!;
      for (let i = 0; i < A.length; i++) {
        for (let j = 0; j < B.length; j++) {
          if (segmentsTouch(A[i]!, A[(i + 1) % A.length]!, B[j]!, B[(j + 1) % B.length]!)) {
            throw new SkeletonFail('furo encosta ou cruza o contorno (ou outro furo)');
          }
        }
      }
    }
  }
  const outer = rings[0]!;
  for (let r = 1; r < rings.length; r++) {
    if (!pointInRing(rings[r]![0]!, outer)) throw new SkeletonFail(`furo ${r} fora do contorno externo`);
  }
}

/** Ponto de partida do grupo de arestas colineares de mesmo peso: arestas de uma mesma reta se juntam. */
function joinFlags(R: Vec2[], ws: number[]): boolean[] {
  const m = R.length;
  const dirs = R.map((p, k) => norm(sub(R[(k + 1) % m]!, p)));
  return dirs.map((d, k) => {
    const k1 = (k + 1) % m;
    const d2 = dirs[k1]!;
    const cr = cross(d, d2);
    const dt = dot(d, d2);
    if (Math.abs(cr) < 1e-9 && dt > 0) {
      if (ws[k] !== ws[k1]) throw new SkeletonFail('vértice colinear entre arestas de pesos diferentes');
      return true;
    }
    if (Math.abs(cr) < 1e-9 && dt < 0) throw new SkeletonFail('espinho: aresta consecutiva invertida');
    return false;
  });
}

/** Índice no anel original da aresta `k` quando o anel foi invertido. */
const reversedIndex = (k: number, m: number): number => (((m - 2 - k) % m) + m) % m;

/** Constrói o estado inicial: anel externo anti-horário, furos horários, arestas, vértices e líderes. */
export function setup(input: SkeletonInput): { sim: Sim; leaders: LeaderInfo[] } {
  const rawRings = checkShape(input);
  checkTopology(rawRings);
  const outer = rawRings[0]!;
  const size = outer.reduce((mx, p) => Math.max(mx, dist(p, outer[0]!)), 0);
  const sim = newSim(Math.max(1e-9, size * 1e-7));
  const leaders: LeaderInfo[] = [];

  rawRings.forEach((rawR, r) => {
    const m = rawR.length;
    const rawW = input.weights[r]!;
    const wantCCW = r === 0;
    const isCCW = ringArea(rawR) > 0;
    const flip = isCCW !== wantCCW;
    const R = flip ? [...rawR].reverse() : rawR;
    const origOf = (k: number): number => (flip ? reversedIndex(k, m) : k);
    const ws = R.map((_, k) => rawW[origOf(k)]!);
    const join = joinFlags(R, ws);
    const dirs = R.map((p, k) => norm(sub(R[(k + 1) % m]!, p)));

    // Vértices não-colineares que abrem um grupo de arestas.
    const starts: number[] = [];
    for (let k = 0; k < m; k++) {
      if (!join[(k - 1 + m) % m]) starts.push(k);
    }
    if (starts.length < 3) throw new SkeletonFail('contorno inteiro colinear');

    const g = starts.length;
    const nodes = starts.map((k) => pushNode(sim, R[k]!, 0));
    const edgeIds: number[] = [];
    for (let q = 0; q < g; q++) {
      const k = starts[q]!;
      const id = sim.edges.length;
      const w = ws[k]!;
      const dir = dirs[k]!;
      sim.edges.push({
        id,
        a: R[k]!,
        dir,
        n: perp(dir),
        speed: w > 0 ? 1 / w : 0,
        w,
      });
      edgeIds.push(id);
      leaders.push({
        id,
        ring: r,
        edge: origOf(k),
        w,
        startNode: nodes[q]!,
        endNode: nodes[(q + 1) % g]!,
      });
    }

    const ringCorners: number[] = [];
    for (let q = 0; q < g; q++) {
      const prevEdge = edgeIds[(q - 1 + g) % g]!;
      const nextEdge = edgeIds[q]!;
      ringCorners.push(mkCorner(sim, R[starts[q]!]!, 0, prevEdge, nextEdge, nodes[q]!));
    }
    for (let q = 0; q < g; q++) {
      linkCorners(sim, ringCorners[(q - 1 + g) % g]!, ringCorners[q]!, ringCorners[(q + 1) % g]!);
    }
  });

  return { sim, leaders };
}
