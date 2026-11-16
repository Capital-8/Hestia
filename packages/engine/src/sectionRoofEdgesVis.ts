import { pointInMulti, type MultiPolygon, type Vec2 } from '@hestia/geom';
import type { RoofEdgeCandidate } from './sectionRoofs.ts';
import type { SectionBeyond, SectionOpening, SectionRegion, SectionRoofEdge } from './section.ts';

/** Passo (m) da amostragem de uma aresta contra o que está na frente dela. */
const EDGE_OCCLUDE_STEP = 0.03;

/**
 * Arestas 3D dos telhados no que se vê: de cada candidato (já sem o que as outras águas do telhado cobrem) sai o que não cai dentro da
 * parte visível de um item MAIS PERTO do plano (parede, piso, laje, escada, vão ou o próprio corte). Os trechos contínuos viram segmentos.
 * O telhado não conta como oclusor aqui: as águas já foram vistas entre si na hora de projetar a aresta.
 */
export function visibleRoofEdges(cands: readonly RoofEdgeCandidate[], cut: readonly SectionRegion[], beyond: readonly SectionBeyond[], openings: readonly SectionOpening[]): SectionRoofEdge[] {
  if (cands.length === 0) return [];
  const front: Array<{ depth: number; polygons: MultiPolygon; box: { minX: number; minY: number; maxX: number; maxY: number } }> = [];
  const add = (depth: number, polygons: MultiPolygon): void => {
    if (polygons.length === 0) return;
    const pts = polygons.flat(2);
    front.push({ depth, polygons, box: { minX: Math.min(...pts.map((q) => q.x)), minY: Math.min(...pts.map((q) => q.y)), maxX: Math.max(...pts.map((q) => q.x)), maxY: Math.max(...pts.map((q) => q.y)) } });
  };
  for (const c of cut) add(0, c.polygons);
  for (const b of beyond) if (b.roofId === undefined && !b.passive) add(b.depth, b.polygons);
  for (const o of openings) add(o.depth, o.polygons);
  const out: SectionRoofEdge[] = [];
  for (const c of cands) {
    for (const [s0, s1] of c.spans) {
      const lerp = (u: number): Vec2 => ({ x: c.a.x + (c.b.x - c.a.x) * u, y: c.a.y + (c.b.y - c.a.y) * u });
      const len = Math.hypot((c.b.x - c.a.x) * (s1 - s0), (c.b.y - c.a.y) * (s1 - s0));
      const steps = Math.max(2, Math.ceil(len / EDGE_OCCLUDE_STEP));
      let start = -1;
      for (let k = 0; k <= steps; k++) {
        const u = s0 + ((s1 - s0) * k) / steps;
        const p = lerp(u);
        const dp = c.da + (c.db - c.da) * u;
        const hidden = front.some((f) => f.depth < dp - 0.02 && p.x >= f.box.minX && p.x <= f.box.maxX && p.y >= f.box.minY && p.y <= f.box.maxY && pointInMulti(p, f.polygons));
        if (!hidden && start < 0) start = k;
        if ((hidden || k === steps) && start >= 0) {
          const end = hidden ? k - 1 : k;
          if (end > start) {
            const ua = s0 + ((s1 - s0) * start) / steps;
            const ub = s0 + ((s1 - s0) * end) / steps;
            out.push({ roofId: c.roofId, kind: c.kind, a: lerp(ua), b: lerp(ub), depth: c.da + (c.db - c.da) * ((ua + ub) / 2) });
          }
          start = -1;
        }
      }
    }
  }
  return out;
}
