import { closestOnSegment, type Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeRoof, type Project, type Roof } from '@hestia/model';
import { LIGHT } from '../../render/src/plan/types.ts';
import { buildSectionDrawList } from '../../render/src/section/build.ts';
import { resolveRoofs, planeZ, type ResolvedRoof, type ResolvedRoofPlane } from './roofs.ts';
import { computeSection } from './section.ts';
import { lineIntervals, sectionFrame, type SectionLine } from './sectionGeom.ts';

export const v = (x: number, y: number): Vec2 => ({ x, y });
export const TOL = 0.02;

export function roofsOf(p: Project): ResolvedRoof[] {
  return p.levels.flatMap((l) => resolveRoofs(p, l.id));
}

export function projectWith(roof: Omit<Roof, 'order'>): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addRoof', roof });
  return s.project;
}

export const mk = (id: string, boundary: Vec2[], shape: Roof['shape'], extra: Partial<Roof> = {}): Omit<Roof, 'order'> =>
  makeRoof({ id, typeId: 'rt_ceramica', levelId: 'lv_0', boundary, shape, heightOffset: 3, ...extra });

/** 4 elevações em volta da caixa dos pontos (mesma convenção do projeto real). */
export function elevationsAround(pts: Vec2[], m = 1): Array<{ name: string; line: SectionLine }> {
  const x0 = Math.min(...pts.map((q) => q.x)) - m, x1 = Math.max(...pts.map((q) => q.x)) + m;
  const y0 = Math.min(...pts.map((q) => q.y)) - m, y1 = Math.max(...pts.map((q) => q.y)) + m;
  const dx = x1 - x0, dy = y1 - y0;
  return [
    { name: 'Norte', line: { a: v(x1, y1), b: v(x0, y1), depth: dy } },
    { name: 'Sul', line: { a: v(x0, y0), b: v(x1, y0), depth: dy } },
    { name: 'Leste', line: { a: v(x1, y0), b: v(x1, y1), depth: dx } },
    { name: 'Oeste', line: { a: v(x0, y1), b: v(x0, y0), depth: dx } },
  ];
}

function distToPoly(q: Vec2, poly: Vec2[][]): number {
  // 0 se dentro ou na borda
  let inside = false;
  let dmin = Infinity;
  for (const ring of poly) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
      const c = closestOnSegment(q, a, b);
      dmin = Math.min(dmin, Math.hypot(c.x - q.x, c.y - q.y));
      if (a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
  }
  return inside ? 0 : dmin;
}
const distToPlane = (q: Vec2, pl: ResolvedRoofPlane): number => Math.min(...pl.polygon.map((poly) => distToPoly(q, poly)));

export interface Sample { t: number; z: number; visible: boolean }
export interface LineReport { kind: string; roofId: string; a: Vec2; b: Vec2; proj: [Vec2, Vec2]; samples: Sample[]; visibleLen: number; uncoveredLen: number; uncovered: Array<[number, number]> }

/** Todos os segmentos dos traços (fechados e abertos) como pares (t, z). */
export function segmentsOf(strokes: Array<{ pts: Vec2[]; closed: boolean }>): Array<[Vec2, Vec2]> {
  const out: Array<[Vec2, Vec2]> = [];
  for (const s of strokes) {
    const n = s.pts.length;
    for (let i = 0; i < (s.closed ? n : n - 1); i++) out.push([s.pts[i]!, s.pts[(i + 1) % n]!]);
  }
  return out;
}
const near = (q: Vec2, segs: Array<[Vec2, Vec2]>, tol: number): boolean =>
  segs.some(([a, b]) => { const c = closestOnSegment(q, a, b); return Math.hypot(c.x - q.x, c.y - q.y) <= tol; });

export const soTelhados = (p: Project): Project => ({ ...p, elements: Object.fromEntries(Object.entries(p.elements).filter(([, e]) => e.kind === 'roof')) as Project['elements'] });

export function analyze(p0: Project, line: SectionLine, kinds = ['ridge', 'hip', 'valley', 'eave'], roofOnly = true, pick: (st: Array<{ pts: Vec2[]; closed: boolean }>) => Array<{ pts: Vec2[]; closed: boolean }> = (x) => x) {
  const p = roofOnly ? soTelhados(p0) : p0;
  const roofs = roofsOf(p);
  const { d, n, length } = sectionFrame(line);
  const along = (q: Vec2): number => (q.x - line.a.x) * d.x + (q.y - line.a.y) * d.y;
  const dist = (q: Vec2): number => (q.x - line.a.x) * n.x + (q.y - line.a.y) * n.y;
  const section = computeSection(p, line);
  const draw = buildSectionDrawList({ project: p, section, viewport: { cx: length / 2, cy: 4, zoom: 60, width: 1200, height: 800 }, theme: LIGHT, dark: false, showGrid: false });
  const segs = segmentsOf(pick(draw.strokes));
  const allPlanes = roofs.flatMap((r) => r.planes);
  const zAt = (r: ResolvedRoof, q: Vec2): number | undefined => {
    const c = r.planes.filter((pl) => distToPlane(q, pl) < 1e-3).map((pl) => planeZ(pl, q));
    return c.length ? Math.max(...c) : undefined;
  };
  const hidden = (q: Vec2, z: number): boolean => {
    const t = along(q), dq = dist(q);
    const o = { x: line.a.x + d.x * t, y: line.a.y + d.y * t };
    for (const pl of allPlanes) {
      for (const poly of pl.polygon) {
        for (const [s0, s1] of lineIntervals(poly, o, n, { x: -n.y, y: n.x })) {
          if (s0 >= dq - 0.01) continue;
          for (const s of [s0, Math.min(s1, dq - 0.01)]) {
            const Q = { x: o.x + n.x * s, y: o.y + n.y * s };
            if (planeZ(pl, Q) > z + 0.005) return true;
          }
        }
      }
    }
    return false;
  };
  const reports: LineReport[] = [];
  for (const r of roofs) {
    const thick = r.layers.reduce((s, l) => s + l.thickness, 0);
    for (const l of r.lines.filter((x) => kinds.includes(x.kind))) {
      const len = Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);
      const N = Math.max(4, Math.ceil(len / 0.1));
      const step = len / N;
      const samples: Sample[] = [];
      let zA = 0, zB = 0;
      for (let i = 0; i < N; i++) {
        const f = (i + 0.5) / N;
        const q = { x: l.a.x + (l.b.x - l.a.x) * f, y: l.a.y + (l.b.y - l.a.y) * f };
        const z = zAt(r, q);
        const t = along(q);
        if (z === undefined || t < 0.01 || t > length - 0.01 || dist(q) < 0 || dist(q) > line.depth) continue;
        if (i === 0) zA = z;
        zB = z;
        samples.push({ t, z, visible: !hidden(q, z) });
      }
      const za = zAt(r, { x: l.a.x + (l.b.x - l.a.x) * 0.5 / N, y: l.a.y + (l.b.y - l.a.y) * 0.5 / N }) ?? zA;
      void za; void zB;
      let visibleLen = 0, uncoveredLen = 0;
      const uncovered: Array<[number, number]> = [];
      for (const s of samples) {
        if (!s.visible) continue;
        visibleLen += step;
        // beiral: a linha de cima da água ou o fundo do conjunto de camadas contam
        const ok = near({ x: s.t, y: s.z }, segs, TOL) || (l.kind === 'eave' && near({ x: s.t, y: s.z - thick }, segs, TOL));
        if (!ok) { uncoveredLen += step; uncovered.push([s.t, s.z]); }
      }
      const pa = samples[0], pb = samples[samples.length - 1];
      reports.push({ kind: l.kind, roofId: r.roofId, a: l.a, b: l.b, proj: [v(pa?.t ?? 0, pa?.z ?? 0), v(pb?.t ?? 0, pb?.z ?? 0)], samples, visibleLen, uncoveredLen, uncovered });
    }
  }
  return { draw, reports, segs, section };
}

export function summary(reports: LineReport[]): string {
  return reports
    .filter((r) => r.visibleLen > 0.05)
    .map((r) => `${r.kind} ${r.roofId} (${r.a.x.toFixed(2)},${r.a.y.toFixed(2)})-(${r.b.x.toFixed(2)},${r.b.y.toFixed(2)}) visível ${r.visibleLen.toFixed(2)} m, sem traço ${r.uncoveredLen.toFixed(2)} m` + (r.uncovered.length ? ` ex t=${r.uncovered[0]![0].toFixed(2)} z=${r.uncovered[0]![1].toFixed(2)}` : ''))
    .join('\n');
}
