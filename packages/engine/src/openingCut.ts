import { orientedRect, type MultiPolygon } from '@hestia/geom';
import type { WallFrame } from './frame.ts';
import type { TiltCut } from './openingTilt.ts';
import type { OpeningGeometry } from './types.ts';

/** Folga do furo além das faces (m). */
const CUT_MARGIN = 0.02;

/**
 * Meia profundidade do furo numa parede curva: o retângulo é reto (tangente no centro do vão, o mesmo do batente, da folha e
 * do retorno) e as faces se afastam dele até R − √(R² − h²) nas ombreiras (h = meia largura do furo).
 */
export function cutHalfOf(f: WallFrame, half: number): number {
  const R = f.arc!.radius;
  const drift = R - Math.sqrt(Math.max(0, R * R - half * half));
  return f.thickness / 2 + CUT_MARGIN + drift;
}

/** Meia profundidade do retângulo do furo (m). */
export const openingCutHalf = (g: OpeningGeometry): number => g.cutHalf ?? g.thickness / 2 + CUT_MARGIN;

export const openingRect = (g: OpeningGeometry): MultiPolygon => [
  [orientedRect(g.center.x, g.center.y, g.u.x, g.u.y, g.roughWidth / 2, openingCutHalf(g))],
];

/**
 * Vão cortado perpendicular às faces numa parede inclinada de `tiltDeg` graus (F2.8): o mesmo retângulo de planta de
 * `openingRect`, com topo e peitoril deslocados pelo sólido (ver `tiltCutZ`). Cotas relativas à base da parede.
 */
export function openingTiltCut(g: OpeningGeometry, tiltDeg: number): TiltCut {
  const th = (tiltDeg * Math.PI) / 180;
  return {
    cx: g.center.x, cy: g.center.y, ux: g.u.x, uy: g.u.y, nx: g.n.x, ny: g.n.y,
    halfW: g.roughWidth / 2, halfD: openingCutHalf(g),
    z0: g.sill, z1: g.sill + g.roughHeight, sn: Math.sin(th), cs: Math.cos(th),
  };
}
