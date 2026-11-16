import { arcSample, orientedRect, type MultiPolygon, type Ring } from '@hestia/geom';
import type { WallFrame } from './frame.ts';
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

export const openingRect = (g: OpeningGeometry): MultiPolygon => [
  [orientedRect(g.center.x, g.center.y, g.u.x, g.u.y, g.roughWidth / 2, g.cutHalf ?? g.thickness / 2 + CUT_MARGIN)],
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
