import { sub, type Vec2 } from './vec.ts';
import { pointInPolygon } from './polygon.ts';

/** Água (face) do esqueleto, na forma usada pela checagem: aresta de origem no anel e região em planta. */
export interface ContinuityFace {
  ring: number;
  edge: number;
  polygon: Vec2[];
  holes?: Vec2[][];
}

/** Degrau da superfície: vértice (planta) onde as águas que se encontram têm cotas diferentes. `dz` em metros. */
export interface SkeletonStep {
  x: number;
  y: number;
  dz: number;
}

/** Tolerância de cota entre águas que se encontram num mesmo ponto de planta (metros). */
const HEIGHT_TOL = 1e-6;
/** Distância máxima para considerar que um ponto está sobre uma fronteira (metros). */
const EDGE_TOL = 1e-7;

/**
 * Cota da água da aresta `edge` do anel `ring` em p: peso × distância à reta da aresta (p fica no lado do material).
 * É o mesmo plano que o engine desenha (`planeZ` de roofs.ts), não a interpolação dos `z` da água.
 */
export function waterHeightAt(rings: Vec2[][], weights: number[][], ring: number, edge: number, p: Vec2): number {
  const R = rings[ring]!;
  const a = R[edge]!;
  const b = R[(edge + 1) % R.length]!;
  const d = sub(b, a);
  const l = Math.hypot(d.x, d.y);
  return weights[ring]![edge]! * Math.abs(((p.x - a.x) * -d.y + (p.y - a.y) * d.x) / l);
}

/** p sobre a fronteira de R (dentro da tolerância de EDGE_TOL). */
function onBoundary(p: Vec2, R: Vec2[]): boolean {
  for (let i = 0; i < R.length; i++) {
    const a = R[i]!;
    const b = R[(i + 1) % R.length]!;
    const d = sub(b, a);
    const len2 = d.x * d.x + d.y * d.y;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / len2)) : 0;
    if (Math.hypot(p.x - (a.x + d.x * t), p.y - (a.y + d.y * t)) <= EDGE_TOL) return true;
  }
  return false;
}

/**
 * Degraus da superfície: em cada vértice de água, as águas que contêm ou tocam o ponto (inclusive T-junção) devem dar
 * a mesma cota. Onde não dão, o vértice vira degrau, com a diferença máxima entre essas cotas. Vértices repetidos
 * (vistos por mais de uma água) aparecem uma vez. Lista vazia = superfície contínua.
 */
export function findSteps(rings: Vec2[][], weights: number[][], faces: ContinuityFace[]): SkeletonStep[] {
  const out: SkeletonStep[] = [];
  const done: Vec2[] = [];
  for (const f of faces) {
    for (const v of f.polygon) {
      if (done.some((q) => Math.hypot(q.x - v.x, q.y - v.y) <= EDGE_TOL)) continue;
      done.push(v);
      let lo = Infinity;
      let hi = -Infinity;
      for (const g of faces) {
        const poly = g.holes?.length ? [g.polygon, ...g.holes] : [g.polygon];
        if (!pointInPolygon(v, poly) && !onBoundary(v, g.polygon) && !(g.holes ?? []).some((h) => onBoundary(v, h))) continue;
        const z = waterHeightAt(rings, weights, g.ring, g.edge, v);
        lo = Math.min(lo, z);
        hi = Math.max(hi, z);
      }
      if (hi - lo > HEIGHT_TOL) out.push({ x: v.x, y: v.y, dz: hi - lo });
    }
  }
  return out;
}
