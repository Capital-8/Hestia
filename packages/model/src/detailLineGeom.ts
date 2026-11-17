import { arcFromSagitta, arcPointAt, len, sub, type Vec2 } from '@hestia/geom';
import type { DetailLine } from './types.ts';

/** Segmentos mínimos por semicírculo ao aproximar o arco de uma linha de detalhe. */
export const DETAIL_ARC_SEGMENTS_PER_HALF_TURN = 8;

/** Flecha efetiva: |sag| limitado a metade da corda; 0 se ausente ou desprezível. */
export function detailLineSag(l: Pick<DetailLine, 'a' | 'b' | 'sag'>): number {
  const sag = l.sag ?? 0;
  const chord = len(sub(l.b, l.a));
  if (!Number.isFinite(sag) || Math.abs(sag) < 1e-6 || chord < 1e-6) return 0;
  return Math.sign(sag) * Math.min(Math.abs(sag), chord / 2);
}

/**
 * Segmentos que desenham a linha de detalhe: 1 segmento (a→b) se reta; senão o arco aproximado,
 * com ao menos 8 segmentos por semicírculo (proporcional ao ângulo) e, se `maxSegLen` for dado,
 * nenhum segmento mais longo que ele. Os extremos são exatamente a e b.
 */
export function detailLineSegments(l: DetailLine, maxSegLen?: number): Array<[Vec2, Vec2]> {
  const sag = detailLineSag(l);
  const arc = sag === 0 ? null : arcFromSagitta(l.a, l.b, sag);
  if (!arc) return [[l.a, l.b]];
  let n = Math.max(2, Math.ceil((Math.abs(arc.sweep) / Math.PI) * DETAIL_ARC_SEGMENTS_PER_HALF_TURN));
  if (maxSegLen && maxSegLen > 0) n = Math.max(n, Math.ceil(arc.length / maxSegLen));
  const pts: Vec2[] = [l.a];
  for (let i = 1; i < n; i++) pts.push(arcPointAt(arc, (arc.length * i) / n));
  pts.push(l.b);
  const out: Array<[Vec2, Vec2]> = [];
  for (let i = 0; i < n; i++) out.push([pts[i]!, pts[i + 1]!]);
  return out;
}

/** Comprimento da linha de detalhe: corda se reta, comprimento do arco se tiver flecha. */
export function detailLineLength(l: DetailLine): number {
  const sag = detailLineSag(l);
  const arc = sag === 0 ? null : arcFromSagitta(l.a, l.b, sag);
  return arc ? arc.length : len(sub(l.b, l.a));
}

/** Polilinha (a, ..., b) da linha de detalhe, para traço contínuo (tracejado sem quebra entre segmentos). */
export function detailLinePoints(l: DetailLine, maxSegLen?: number): Vec2[] {
  const segs = detailLineSegments(l, maxSegLen);
  return [segs[0]![0], ...segs.map((s) => s[1])];
}
