/**
 * Quantitativos de parede inclinada pela face real (F2.7). As faixas do sólido seguem verticais, então o volume vertical
 * (planta × altura) é escalado pelo fator da face: reta 1/cosθ; arco (1/cosθ)·(1 + s·H·tanθ/(2R)), com R do eixo.
 * Fórmulas: docs/parede-formas/METODOLOGIA.md 4.1. Limite: camada deslocada do eixo usa o fator do eixo.
 */
import { arcFromSagitta } from '@hestia/geom';
import { openingPlaneOf, type Opening, type Project, type Wall } from '@hestia/model';
import { arcTiltSide, faceAreaArc, faceAreaStraight } from './wallTilt.ts';
import type { ResolvedWall } from './types.ts';

const rad = (d: number): number => (d * Math.PI) / 180;

export interface TiltFactors {
  /** Volume real ÷ volume vertical. */
  volume: number;
  /** Área real da face bruta (substitui L·H). */
  grossFace: number;
  /** Área de face real ÷ área vertical (para descontar vãos de plano vertical). */
  face: number;
}

/** Fatores da parede inclinada; null para parede vertical (tilt ausente ou 0): os números ficam idênticos. */
export function tiltFactors(w: Wall, rw: ResolvedWall, H: number, L: number): TiltFactors | null {
  const tilt = rw.tilt;
  if (!tilt || !(H > 0)) return null;
  const c = 1 / Math.cos(rad(tilt));
  const arc = (rw.sag ?? w.sag) !== 0 ? arcFromSagitta(w.a, w.b, rw.sag ?? w.sag) : null;
  if (!arc) return { volume: c, face: c, grossFace: faceAreaStraight({ L, H, t: 0, tiltDeg: tilt }) };
  const s = arcTiltSide(rw.sag ?? w.sag, tilt);
  const m = 1 + (s * H * Math.tan(rad(Math.abs(tilt)))) / (2 * arc.radius);
  const grossFace = faceAreaArc({ R: arc.radius, phi: Math.abs(arc.sweep), H, tiltDeg: tilt, s });
  return { volume: c * m, face: c * m, grossFace };
}

/** O vão é cortado perpendicular às faces (F2.8): plano inclinado efetivo (arco largo cai no vertical e não tem corte). */
export function openingIsTilted(p: Project, rw: ResolvedWall, o: Opening, width: number): boolean {
  void p;
  return openingPlaneOf(o) === 'inclinado' && !!rw.tiltCuts?.some((c) => Math.abs(2 * c.halfW - width) < 1e-6);
}
