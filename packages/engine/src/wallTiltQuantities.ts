/**
 * Quantitativos de parede inclinada pela face real (F2.7). As faixas do sólido seguem verticais, então o volume vertical
 * (planta × altura) é escalado pelo fator da face: reta 1/cosθ; arco (1/cosθ)·(1 + s·H·tanθ/(2R)), com R do eixo.
 * Fórmulas: docs/parede-formas/METODOLOGIA.md 4.1. Limite: camada deslocada do eixo usa o fator do eixo.
 */
import { arcFromSagitta, multiArea, type MultiPolygon } from '@hestia/geom';
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
  /**
   * Fator de volume de UMA camada. Reta: o mesmo `volume`. Arco: usa o raio médio ρ da camada (vértices do fragmento, que
   * ficam sobre os círculos) e corrige a facetagem da poligonal (área do setor ÷ área do polígono) quando só ela explica a
   * diferença (< 0,1%); com ponta cortada por junção mantém só o fator de raio.
   */
  layer: (fragment: MultiPolygon) => number;
}

/** Fatores da parede inclinada; null para parede vertical (tilt ausente ou 0): os números ficam idênticos. */
export function tiltFactors(w: Wall, rw: ResolvedWall, H: number, L: number): TiltFactors | null {
  const tilt = rw.tilt;
  if (!tilt || !(H > 0)) return null;
  const c = 1 / Math.cos(rad(tilt));
  const arc = (rw.sag ?? w.sag) !== 0 ? arcFromSagitta(w.a, w.b, rw.sag ?? w.sag) : null;
  if (!arc) return { volume: c, face: c, grossFace: faceAreaStraight({ L, H, t: 0, tiltDeg: tilt }), layer: () => c };
  const s = arcTiltSide(rw.sag ?? w.sag, tilt);
  const m = 1 + (s * H * Math.tan(rad(Math.abs(tilt)))) / (2 * arc.radius);
  const grossFace = faceAreaArc({ R: arc.radius, phi: Math.abs(arc.sweep), H, tiltDeg: tilt, s });
  const phi = Math.abs(arc.sweep);
  const R = arc.radius;
  const tanA = Math.tan(rad(Math.abs(tilt)));
  const layer = (fragment: MultiPolygon): number => {
    let lo = Infinity, hi = 0;
    for (const poly of fragment) for (const ring of poly) for (const v of ring) {
      const d = Math.hypot(v.x - arc.center.x, v.y - arc.center.y);
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
    }
    if (!(hi > lo)) return c * m;
    const rm = (lo + hi) / 2;
    const f = (c * (R + (s * H * tanA) / 2 + (rm - R) * c)) / rm;
    const poligono = multiArea(fragment);
    const setor = (phi / 2) * (hi * hi - lo * lo);
    return Math.abs(setor / poligono - 1) < 1e-3 ? f * (setor / poligono) : f;
  };
  return { volume: c * m, face: c * m, grossFace, layer };
}

/** O vão é cortado perpendicular às faces (F2.8): plano inclinado efetivo (arco largo cai no vertical e não tem corte). */
export function openingIsTilted(p: Project, rw: ResolvedWall, o: Opening, width: number): boolean {
  void p;
  return openingPlaneOf(o) === 'inclinado' && !!rw.tiltCuts?.some((c) => Math.abs(2 * c.halfW - width) < 1e-6);
}
