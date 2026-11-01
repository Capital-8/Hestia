import { closestOnSegment, intersection, triangulate, union, type MultiPolygon, type Polygon, type Ring, type Vec2 } from '@hestia/geom';
import type { Id } from '@hestia/model';
import { planeZ, type ResolvedRoof } from './roofs.ts';
import { EPS_T, lineIntervals, sectionFrame, type SectionLine } from './sectionGeom.ts';
import type { SectionBeyond } from './section.ts';

/** Telhado no corte (D3): quadriláteros da linha de corte por material e, além do plano, as faixas por camada. */
export interface RoofSection {
  /** Corte por água e camada, com o telhado de origem (`roofId`). */
  cut: Array<{ materialId: Id; polygon: Polygon; roofId: Id }>;
  beyond: SectionBeyond[];
  /** Cotas extremas (Infinity/-Infinity sem telhado na linha). */
  zMin: number;
  zMax: number;
}

/** Envoltória convexa (cadeia monótona), anel anti-horário; com menos de 3 vértices, pontos colineares. */
function convexHull(pts: Vec2[]): Ring {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Vec2, a: Vec2, b: Vec2): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const chain = (seq: Vec2[]): Vec2[] => {
    const h: Vec2[] = [];
    for (const q of seq) {
      while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, q) <= 0) h.pop();
      h.push(q);
    }
    h.pop();
    return h;
  };
  return [...chain(s), ...chain([...s].reverse())];
}

/**
 * Corte esquadro (Revit: Rafter Cut 'square') no beiral: a base da camada recua ao longo da água, de modo que o corte
 * fica perpendicular ao plano. Com G = % / 100 e T a espessura vertical da camada, o deslocamento ao longo da subida é
 * s = G·T/(1+G²); o comprimento do corte (perpendicular ao plano) é T·cos θ. Para 100 % e T = 10 cm: s = 5,00 cm e
 * corte de 7,07 cm.
 */
export function squareCutRun(percent: number, thickness: number): number {
  return ((percent / 100) * thickness) / (1 + (percent / 100) ** 2);
}

/**
 * Telhados no corte e na elevação (D3), como as lajes. Por água e por camada, a faixa vertical de cada ponto p vai de
 * top(p) − below − thickness a top(p) − below. No corte, a linha dá intervalos de t dentro da água e cada faixa é um
 * quadrilátero (topo e base são lineares em t). Além do plano, cada triângulo da água projeta-se em (t, z) com
 * seis pontos (topo e base); a envoltória convexa de cada um e a união delas é a silhueta da camada (exata para
 * águas convexas, que é o caso das formas predefinidas).
 */
export function sectionOfRoofs(roofs: ResolvedRoof[], line: SectionLine): RoofSection {
  const out: RoofSection = { cut: [], beyond: [], zMin: Infinity, zMax: -Infinity };
  const { length, d, n, slab } = sectionFrame(line);
  if (length < 1e-6) return out;
  const along = (v: Vec2): number => (v.x - line.a.x) * d.x + (v.y - line.a.y) * d.y;
  const dist = (v: Vec2): number => (v.x - line.a.x) * n.x + (v.y - line.a.y) * n.y;
  const at = (t: number): Vec2 => ({ x: line.a.x + d.x * t, y: line.a.y + d.y * t });
  for (const r of roofs) {
    const layers = r.layers.filter((l) => l.thickness > 1e-9);
    // Corte esquadro só nas extremidades sobre uma aresta de beiral (linha 'eave'); prumo (padrão) não muda nada.
    const square = r.rafterCut === 'square';
    const eaves = r.lines.filter((l) => l.kind === 'eave');
    const onEave = (v: Vec2): boolean => square && eaves.some((l) => Math.hypot(closestOnSegment(v, l.a, l.b).x - v.x, closestOnSegment(v, l.a, l.b).y - v.y) < 1e-6);
    for (const pl of r.planes) {
      const cuts = pl.polygon
        .flatMap((poly) => lineIntervals(poly, line.a, d, n))
        .map(([t0, t1]): [number, number] => [Math.max(0, t0), Math.min(length, t1)])
        .filter(([lo, hi]) => hi - lo >= EPS_T);
      const view = intersection(pl.polygon, slab);
      for (const l of layers) {
        const top = (v: Vec2): number => planeZ(pl, v) - l.below;
        const G = pl.percent / 100;
        const run = square ? squareCutRun(pl.percent, l.thickness) : 0;
        // Cosseno entre a seção e a subida da água: no corte esquadro, a base desloca s / cos ao longo da seção.
        const c = d.x * pl.up.x + d.y * pl.up.y;
        for (const [lo, hi] of cuts) {
          const u0 = top(at(lo));
          const u1 = top(at(hi));
          let bl: Vec2 = { x: lo, y: u0 - l.thickness };
          let br: Vec2 = { x: hi, y: u1 - l.thickness };
          if (square && Math.abs(c) > 1e-9) {
            const k = run / c;
            if (c > 0 && lo + k < hi && onEave(at(lo))) bl = { x: lo + k, y: top(at(lo + k)) - l.thickness };
            if (c < 0 && hi + k > lo && onEave(at(hi))) br = { x: hi + k, y: top(at(hi + k)) - l.thickness };
          }
          out.cut.push({ materialId: l.materialId, polygon: [[bl, br, { x: hi, y: u1 }, { x: lo, y: u0 }]], roofId: r.roofId });
          out.zMin = Math.min(out.zMin, u0 - l.thickness, u1 - l.thickness);
          out.zMax = Math.max(out.zMax, u0, u1);
        }
        const parts: MultiPolygon[] = [];
        let depth = Infinity;
        for (const piece of view) {
          const outer = piece[0];
          if (!outer || outer.length < 3) continue;
          depth = Math.min(depth, ...outer.map(dist));
          const mesh = triangulate(piece);
          for (let i = 0; i < mesh.indices.length; i += 3) {
            const pts = [0, 1, 2].flatMap((k) => {
              const j = mesh.indices[i + k]!;
              const v = { x: mesh.positions[2 * j]!, y: mesh.positions[2 * j + 1]! };
              // Corte esquadro no beiral: a base recua s ao longo da subida (projeta-se em s·cos e sobe G·s).
              const base = square && onEave(v) ? { x: along(v) + run * c, y: top(v) + G * run - l.thickness } : { x: along(v), y: top(v) - l.thickness };
              return [{ x: along(v), y: top(v) }, base];
            });
            const hull = convexHull(pts);
            if (hull.length >= 3) parts.push([[hull]]);
          }
        }
        if (!parts.length) continue;
        const polygons = union(...parts);
        out.beyond.push({ roofId: r.roofId, materialId: l.materialId, layerIndex: l.layerIndex, depth: Math.max(0, depth), polygons });
        for (const ring of polygons.flat()) {
          for (const v of ring) {
            out.zMin = Math.min(out.zMin, v.y);
            out.zMax = Math.max(out.zMax, v.y);
          }
        }
      }
    }
  }
  return out;
}
