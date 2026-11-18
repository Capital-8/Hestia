/**
 * Formas retas do vão: empena (`gable`), trapézio (`trapezoid`) e polígono livre (`polygon`). Arquivo novo; docs/estudo-esquadrias/32.
 *
 * - Empena: base `width`, ombreiras retas até `height - rise` e dois planos até a cumeeira central em `height` (`rise` é a
 *   altura da cumeeira acima do beiral). `rise = height` dá o triângulo.
 * - Trapézio simétrico: base `baseWidth` (padrão `width`) e topo `topWidth`. A caixa envolvente é `width`, então um dos dois
 *   é igual a `width` (topo menor que a base é o comum; topo maior: `baseWidth` menor e `topWidth = width`).
 * - Polígono: pontos (u, v) em 0..width, 0..height (u a partir da borda esquerda, v a partir da base); o anel tem que ser simples
 *   (sem auto-interseção) e anti-horário, e tocar as quatro bordas da caixa. Côncavo simples vale.
 * Mesmo sistema do contorno de `openingShape.ts`: x = u - width / 2, z = v; anel aberto, anti-horário, metros.
 */
import type { OPt, OpeningShape, OpeningShapeIssue } from './openingShape.ts';

export type PolygonFormShape = Extract<OpeningShape, { kind: 'gable' | 'trapezoid' | 'polygon' }>;

/** Máximo de pontos de um polígono (o do contorno na ABI do furo: `LIMITE_PONTOS_POR_VAO`). */
export const MAX_POLYGON_POINTS = 4096;

const EPS = 1e-12;
const TOL = 1e-6;
const pos = (v: number): boolean => Number.isFinite(v) && v > 0;
const cross = (a: OPt, b: OPt, c: OPt): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Área com sinal (positiva no sentido anti-horário). */
function areaOf(r: readonly OPt[]): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i]!;
    const q = r[(i + 1) % r.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Tira vértices repetidos e os colineares no meio de uma reta (não tira a espícula de ida e volta). */
export function cleanRing(pts: readonly OPt[]): OPt[] {
  let r: OPt[] = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1]![0], p[1] - pts[i - 1]![1]) > 1e-9);
  while (r.length > 1 && Math.hypot(r[0]![0] - r[r.length - 1]![0], r[0]![1] - r[r.length - 1]![1]) <= 1e-9) r.pop();
  for (let again = true; again && r.length >= 3; ) {
    again = false;
    const keep: OPt[] = [];
    for (let i = 0; i < r.length; i++) {
      const a = r[(i + r.length - 1) % r.length]!;
      const b = r[i]!;
      const c = r[(i + 1) % r.length]!;
      const reto = Math.abs(cross(a, b, c)) <= EPS && (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]) > 0;
      if (reto) again = true;
      else keep.push(b);
    }
    if (again) r = keep;
  }
  return r;
}

const onSeg = (a: OPt, b: OPt, p: OPt): boolean =>
  p[0] >= Math.min(a[0], b[0]) - 1e-9 && p[0] <= Math.max(a[0], b[0]) + 1e-9 && p[1] >= Math.min(a[1], b[1]) - 1e-9 && p[1] <= Math.max(a[1], b[1]) + 1e-9;

/** Os segmentos ab e cd se cruzam ou se tocam (inclusive vértice sobre aresta)? */
function tocam(a: OPt, b: OPt, c: OPt, d: OPt): boolean {
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) return true;
  return (Math.abs(d1) <= EPS && onSeg(a, b, c)) || (Math.abs(d2) <= EPS && onSeg(a, b, d)) || (Math.abs(d3) <= EPS && onSeg(c, d, a)) || (Math.abs(d4) <= EPS && onSeg(c, d, b));
}

/** Anel simples? Arestas não consecutivas não se tocam e as consecutivas não se sobrepõem (espícula). O(n²). */
export function ringIsSimple(r: readonly OPt[]): boolean {
  const n = r.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = r[i]!;
    const b = r[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      const c = r[j]!;
      const d = r[(j + 1) % n]!;
      if (j === i + 1 || (i === 0 && j === n - 1)) {
        // Arestas consecutivas: a ponta compartilhada é a de b = c (ou d = a). Sobrepõem-se se são colineares e voltam.
        const [p, q, s] = j === i + 1 ? [a, b, d] : [b, a, c];
        if (Math.abs(cross(p, q, s)) <= EPS && (q[0] - p[0]) * (s[0] - q[0]) + (q[1] - p[1]) * (s[1] - q[1]) < 0) return false;
      } else if (tocam(a, b, c, d)) return false;
    }
  }
  return true;
}

/** Anel do polígono (x = u - width / 2, z = v), com repetidos e colineares tirados. */
export function polygonRing(s: Extract<OpeningShape, { kind: 'polygon' }>): OPt[] {
  return cleanRing(s.points.map((p): OPt => [p.u - s.width / 2, p.v]));
}

function validatePolygon(s: Extract<OpeningShape, { kind: 'polygon' }>): OpeningShapeIssue[] {
  const pts = s.points;
  if (!Array.isArray(pts) || pts.length < 3 || pts.length > MAX_POLYGON_POINTS || pts.some((p) => !p || !Number.isFinite(p.u) || !Number.isFinite(p.v))) {
    return ['polygon-points-invalid'];
  }
  const issues: OpeningShapeIssue[] = [];
  if (pts.some((p) => p.u < -TOL || p.u > s.width + TOL || p.v < -TOL || p.v > s.height + TOL)) issues.push('polygon-out-of-box');
  const ring = polygonRing(s);
  const area = areaOf(ring);
  if (ring.length < 3) return [...issues, 'polygon-degenerate'];
  if (!ringIsSimple(ring)) return [...issues, 'polygon-self-intersecting']; // antes da área: a gravata borboleta tem área nula
  if (Math.abs(area) < 1e-12) return [...issues, 'polygon-degenerate'];
  if (area < 0) issues.push('polygon-clockwise');
  const xs = ring.map((p) => p[0]);
  const zs = ring.map((p) => p[1]);
  if (Math.abs(Math.min(...xs) + s.width / 2) > TOL || Math.abs(Math.max(...xs) - s.width / 2) > TOL || Math.abs(Math.min(...zs)) > TOL || Math.abs(Math.max(...zs) - s.height) > TOL) {
    issues.push('polygon-box-not-filled');
  }
  if (s.symmetric && !ring.every((p) => ring.some((q) => Math.abs(q[0] + p[0]) <= TOL && Math.abs(q[1] - p[1]) <= TOL))) issues.push('polygon-not-symmetric');
  return issues;
}

/** Larguras do trapézio: base e topo. */
export function trapezoidWidths(s: Extract<OpeningShape, { kind: 'trapezoid' }>): { base: number; top: number } {
  return { base: s.baseWidth ?? s.width, top: s.topWidth };
}

/** Problemas das formas retas (dimensões `width` e `height` já validadas por quem chama). */
export function validatePolygonForm(s: PolygonFormShape): OpeningShapeIssue[] {
  switch (s.kind) {
    case 'gable':
      if (!pos(s.rise)) return ['rise-invalid'];
      return s.rise > s.height + EPS ? ['rise-exceeds-height'] : [];
    case 'trapezoid': {
      const { base, top } = trapezoidWidths(s);
      if (!pos(top) || !pos(base)) return ['trapezoid-width-invalid'];
      const biggest = Math.max(base, top);
      return Math.abs(biggest - s.width) > TOL ? ['trapezoid-width-mismatch'] : [];
    }
    case 'polygon':
      return validatePolygon(s);
  }
}

/** Anel das formas retas (forma já validada). */
export function polygonFormRing(s: PolygonFormShape): OPt[] {
  const half = s.width / 2;
  switch (s.kind) {
    case 'gable':
      return cleanRing([[half, 0], [half, s.height - s.rise], [0, s.height], [-half, s.height - s.rise], [-half, 0]]);
    case 'trapezoid': {
      const { base, top } = trapezoidWidths(s);
      return cleanRing([[base / 2, 0], [top / 2, s.height], [-top / 2, s.height], [-base / 2, 0]]);
    }
    case 'polygon':
      return polygonRing(s);
  }
}
