import { asMulti, dot, intersection, type Vec2 } from '@hestia/geom';
import { defaultUnits, type ResolvedUnits, type Roof, type RoofPlaneDef } from '@hestia/model';
import { extrusionEdgeKinds, extrusionPlanes } from './roofExtrusion.ts';
import { unitOf } from './roofGeom.ts';
import { applyMansard } from './roofMansard.ts';
import { skeletonPlanes, type WaterSolution } from './roofSkeleton.ts';
import type { ResolvedRoofPlane, RoofLine } from './roofs.ts';

/**
 * Inclinação por aresta de cada forma (decisão 0008, item 9; mesma regra da migração 9→10): 'hip' = todas as arestas;
 * 'gable' = as que fazem até 45° com `dir` (cos > 0,7, beiradas), as demais são empenas; se nenhuma aresta é paralela a
 * `dir`, a cumeeira segue as arestas e validateRoofs avisa (roof-ridge-off-edges); 'shed' = só a aresta mais baixa em
 * relação a `dir`; 'edges' = o vetor guardado. Nulo = a aresta não define inclinação. Águas livres e extrusão não usam esta lista.
 */
export function edgeSlopesOf(r: Roof): Array<number | null> {
  const b = r.boundary;
  const n = b.length;
  const pct = r.slopePercent;
  const dir = r.dir;
  switch (r.shape) {
    case 'hip':
      return b.map(() => pct);
    case 'gable':
      return b.map((a, i) => {
        const c = b[(i + 1) % n]!;
        const l = Math.hypot(c.x - a.x, c.y - a.y) || 1;
        const along = Math.abs(((c.x - a.x) * dir.x + (c.y - a.y) * dir.y) / l);
        return along > 0.7 ? pct : null;
      });
    case 'shed': {
      const proj = (i: number): number => {
        const a = b[i]!;
        const c = b[(i + 1) % n]!;
        return dot({ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }, dir);
      };
      let low = 0;
      for (let i = 1; i < n; i++) if (proj(i) < proj(low)) low = i;
      return b.map((_, i) => (i === low ? pct : null));
    }
    // A lista guardada vai como está: se o tamanho não bate com o contorno, o cálculo devolve o motivo.
    case 'edges':
      return [...r.edgeSlopes];
    default:
      return b.map(() => null);
  }
}

/**
 * Tipo de cada aresta do contorno: 'eave' (beiral, com água) ou 'gable' (empena). Águas livres: todas beiral. Extrusão:
 * as extremidades com seção acima do beiral são empenas (`extrusionEdgeKinds`).
 */
export function boundaryKindsOf(r: Roof): Array<Extract<RoofLine['kind'], 'eave' | 'gable'>> {
  if (r.shape === 'free') return r.boundary.map(() => 'eave');
  if (r.shape === 'extrusion') return extrusionEdgeKinds(r);
  const slopes = edgeSlopesOf(r);
  // Telhado plano (nenhuma aresta com inclinação): a água chega a todo o contorno na cota do beiral, então é beiral.
  if (!hasSlope(slopes)) return r.boundary.map(() => 'eave');
  return r.boundary.map((_, i) => {
    const s = slopes[i];
    return s !== null && s !== undefined && s > 0 ? 'eave' : 'gable';
  });
}

/** Alguma aresta define inclinação (com percentual positivo). */
const hasSlope = (slopes: Array<number | null>): boolean => slopes.some((s) => s !== null && s !== undefined && s > 0);

/** Águas livres: cada polígono recortado pelo contorno do beiral; a cota é eaveZ + z0 do plano. */
export function freePlanes(boundary: Vec2[], defs: RoofPlaneDef[], eaveZ: number): ResolvedRoofPlane[] {
  const bm = asMulti(boundary);
  return defs.flatMap((d): ResolvedRoofPlane[] => {
    const up = unitOf(d.up);
    if (d.polygon.length < 3 || !up) return [];
    const polygon = intersection(asMulti(d.polygon), bm);
    return polygon.length ? [{ polygon, origin: d.origin, up, percent: d.percent, z0: eaveZ + d.z0 }] : [];
  });
}

/** Águas de um telhado antes dos furos: pelo esqueleto reto (todas as formas de contorno), livres ou extrusão. */
export function waterPlanesOf(r: Roof, eaveZ: number, units: ResolvedUnits = defaultUnits()): WaterSolution {
  switch (r.shape) {
    case 'free':
      return { planes: freePlanes(r.boundary, r.planes, eaveZ) };
    case 'extrusion':
      return { planes: extrusionPlanes(r, eaveZ) };
    default: {
      const slopes = edgeSlopesOf(r);
      const hasHoleSlope = (r.holeSlopes ?? []).some((hs) => hs.some((s) => s !== null && s !== undefined && s > 0));
      // Telhado plano não tem desnível para a mansarda cortar: a água fica plana, como sem mansarda.
      if (!r.mansard || (!hasSlope(slopes) && !hasHoleSlope)) return skeletonPlanes(r.boundary, r.holes, slopes, eaveZ, r.holeSlopes);
      // Mansarda: pesos iguais nas arestas com água (a altura passa a depender só da distância), depois o corte por faixa.
      const uniform = slopes.map((s) => (s !== null && s !== undefined && s > 0 ? 100 : null));
      const holeUniform = r.holeSlopes?.map((hs) => hs.map((s) => (s !== null && s !== undefined && s > 0 ? 100 : null)));
      return applyMansard(skeletonPlanes(r.boundary, r.holes, uniform, eaveZ, holeUniform), r.mansard, units);
    }
  }
}
