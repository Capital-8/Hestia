import { asMulti, boxOf, boxesOverlap, difference, dot, intersection, multiArea, ringArea, sub, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import { clipHalfPlane, perpOf, sanitizeMulti, unitOf, WATER_MIN_AREA } from './roofGeom.ts';
import type { ResolvedRoofPlane } from './roofs.ts';
import type { WaterSolution } from './roofSkeleton.ts';

/** Fração do contorno que pode ficar sem água por arredondamento (acima disso, há região sem aresta que a cubra). */
const UNCOVERED_TOL = 1e-6;

/** Motivo quando nenhuma aresta inclinada cobre uma parte do contorno. */
export const UNCOVERED_PROBLEM = 'o contorno tem uma região sem nenhuma aresta inclinada que a cubra';

/** Aresta que define inclinação: plano z = eaveZ + s · d(p), com d a distância assinada à reta da aresta (positiva para dentro). */
interface EdgePlane {
  j: number;
  /** Inclinação em fração (percentual / 100). */
  s: number;
  /** Normal unitária para dentro do contorno. */
  up: Vec2;
  /** Ponto da aresta (origem do plano). */
  a: Vec2;
  /** up · a, para d(p) = up · p − k. */
  k: number;
}

/** Duas arestas com o mesmo plano (mesma reta, mesmo lado e mesma inclinação): a água é uma só. */
const samePlane = (e: EdgePlane, f: EdgePlane): boolean =>
  Math.abs(e.up.x - f.up.x) < 1e-12 && Math.abs(e.up.y - f.up.y) < 1e-12 && Math.abs(e.s - f.s) < 1e-12 && Math.abs(e.k - f.k) < 1e-9;

/** Semiplano {p : A·x + B·y ≤ C} como polígono, recortado de uma caixa convexa grande o bastante para o contorno. */
const halfPlane = (box: Ring, A: number, B: number, C: number): MultiPolygon => {
  const ring = clipHalfPlane(box, A, B, C);
  return ring.length >= 3 ? asMulti(ring) : [];
};

/** Caixa quadrada, em anel anti-horário, que cobre os pontos com folga. */
function boxAround(pts: Vec2[]): Ring {
  const m = 2 * Math.max(1, ...pts.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)])) + 10;
  return [
    { x: -m, y: -m },
    { x: m, y: -m },
    { x: m, y: m },
    { x: -m, y: m },
  ];
}

/**
 * Envoltória inferior dos planos das arestas inclinadas (como o Revit: cada aresta com inclinação gera o plano dela,
 * estendido até encontrar os outros, e o telhado é o mais baixo deles). Só vale onde o ponto está do lado de dentro da
 * aresta (d ≥ 0): um plano atrás da sua aresta não conta. A água de cada aresta é o contorno recortado pelas
 * desigualdades lineares "esta água é a mais baixa" (z_e ≤ z_f para cada f que se aplica), por diferença de polígonos,
 * então funciona em contorno côncavo. Arestas sem inclinação ficam como empenas (sem água).
 *
 * Devolve `problem` quando uma parte do contorno não é coberta por nenhuma aresta inclinada: esse é o único caso de
 * recusa do telhado por forma. Chamada pelo esqueleto só quando ele não entrega as águas (roofSkeleton.ts).
 */
export function envelopePlanes(boundary: Vec2[], edgeSlopes: Array<number | null>, eaveZ: number): WaterSolution {
  const n = boundary.length;
  const ccw = ringArea(boundary) >= 0;
  const contour: MultiPolygon = asMulti(ccw ? boundary : [...boundary].reverse());
  const contourArea = multiArea(contour);
  const box = boxAround(boundary);
  const edges: EdgePlane[] = [];
  edgeSlopes.forEach((sl, j) => {
    if (sl === null || sl === undefined || !(sl > 0)) return;
    const a = boundary[j]!;
    const u = unitOf(sub(boundary[(j + 1) % n]!, a));
    if (!u) return;
    const left = perpOf(u);
    const up = ccw ? left : { x: -left.x, y: -left.y };
    edges.push({ j, s: sl / 100, up, a, k: dot(up, a) });
  });
  if (edges.length === 0) return { planes: [], problem: 'nenhuma aresta define inclinação' };

  const planes: ResolvedRoofPlane[] = [];
  for (const e of edges) {
    let region = intersection(contour, halfPlane(box, -e.up.x, -e.up.y, -e.k));
    const cuts: MultiPolygon[] = [];
    for (const f of edges) {
      if (f === e || region.length === 0) continue;
      const applies = halfPlane(box, -f.up.x, -f.up.y, -f.k);
      // Planos idênticos (arestas colineares de mesmo lado): o de menor índice fica com a região; senão os dois se anulam.
      if (samePlane(e, f)) {
        if (f.j < e.j) cuts.push(applies);
        continue;
      }
      // f vence em p onde d_f(p) ≥ 0 e z_f < z_e, ou seja s_f·d_f < s_e·d_e: meio-plano linear em p.
      const lower = halfPlane(box, f.s * f.up.x - e.s * e.up.x, f.s * f.up.y - e.s * e.up.y, f.s * f.k - e.s * e.k);
      const cut = intersection(applies, lower);
      if (cut.length && boxesOverlap(boxOf(region.flat(2)), boxOf(cut.flat(2)))) cuts.push(cut);
    }
    if (cuts.length) region = difference(region, ...cuts);
    region = sanitizeMulti(region);
    if (multiArea(region) > WATER_MIN_AREA) {
      planes.push({ polygon: region, origin: e.a, up: e.up, percent: edgeSlopes[e.j]!, z0: eaveZ });
    }
  }

  const uncovered = multiArea(difference(contour, ...planes.map((pl) => pl.polygon)));
  if (uncovered > UNCOVERED_TOL * contourArea + WATER_MIN_AREA) return { planes: [], problem: UNCOVERED_PROBLEM };
  return { planes };
}
