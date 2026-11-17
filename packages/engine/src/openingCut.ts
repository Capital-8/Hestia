import { arcSample, orientedRect, type MultiPolygon, type Ring } from '@hestia/geom';
import type { WallFrame } from './frame.ts';
import { openingPlaneOf, type Opening } from '@hestia/model';
import { inclinedFitsArc, type TiltCut } from './openingTilt.ts';
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

/** Anel da abertura (setor curvo em parede curva, retângulo na parede reta), com meia-largura/meia-profundidade informadas. */
export function openingBandRing(g: OpeningGeometry, halfWidth = g.width / 2, halfDepth = g.thickness / 2 + CUT_MARGIN): Ring {
  if (g.curve) {
    return [
      ...arcSample(g.curve.arc, g.offset - halfWidth, g.offset + halfWidth, g.curve.sMid + halfDepth, 0.005),
      ...arcSample(g.curve.arc, g.offset + halfWidth, g.offset - halfWidth, g.curve.sMid - halfDepth, 0.005),
    ];
  }
  return orientedRect(g.center.x, g.center.y, g.u.x, g.u.y, halfWidth, halfDepth);
}

/** Furo real que recorta as camadas da parede: setor radial em paredes curvas para acompanhar o batente/alizar. */
export const openingHole = (g: OpeningGeometry): MultiPolygon => [[openingBandRing(g, g.roughWidth / 2, g.thickness / 2 + CUT_MARGIN)]];

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

/** Plano efetivo do vão na parede inclinada (F2.8): `{ tiltPlane: 'inclinado' }` só quando vale o corte inclinado e ele cabe. */
export function openingTiltPlane(o: Opening, f: WallFrame, roughWidth: number): { tiltPlane?: 'inclinado' } {
  return f.wall.tilt && openingPlaneOf(o) === 'inclinado' && inclinedFitsArc(roughWidth, f.arc?.radius) ? { tiltPlane: 'inclinado' } : {};
}

/** Vãos 'inclinado' da parede inclinada para o sólido; objeto vazio quando não há. */
export function openingTiltCuts(opens: OpeningGeometry[], wallId: string, tilt: number | undefined): { tiltCuts?: TiltCut[] } {
  if (!tilt) return {};
  const cuts = opens.filter((g) => g.hostId === wallId && g.tiltPlane).map((g) => openingTiltCut(g, tilt));
  return cuts.length ? { tiltCuts: cuts } : {};
}
