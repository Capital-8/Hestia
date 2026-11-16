import * as THREE from 'three';
import type { OpeningGeometry } from '@hestia/engine';
import type { Project } from '@hestia/model';
import { caixaDaPeca, deslocamentoDaPeca } from './geometriaPeca3d.ts';
import type { OpeningPiece } from './openingParts.ts';

/**
 * Referencial da esquadria numa parede inclinada (C3, decisões E1/E11). O vão 3D vive no sistema local do vão
 * (x = ao longo, y = normal à esquerda, z = altura a partir do peitoril, origem no eixo da base em z = peitoril). Esta
 * matriz leva esse sistema ao lugar certo da parede de inclinação θ (+ = topo para +y):
 *  - plano 'inclinado' (g.tiltPlane): todo o conjunto no plano da face: rotação −θ em torno de x e deslocamento
 *    y = peitoril·tanθ (a altura é medida na face; ocupação vertical h·cosθ);
 *  - plano 'vertical' (porta, ou janela cujo arco não comporta o inclinado): caixilho em prumo, ANCORADO na face de
 *    ancoragem em z = peitoril (a face para a qual a parede se afasta do prumo): a face externa da peça mais saliente
 *    fica nela e o resto recua para dentro (recuo ≥ 0 nas quatro bordas).
 * Parede vertical (sem tilt) ou sem hospedeiro parede: null (a esquadria fica como sempre foi).
 */
export function referencialDaEsquadria(p: Project, g: OpeningGeometry, pecas: readonly OpeningPiece[]): THREE.Matrix4 | null {
  const w = p.elements[g.hostId];
  const tilt = w && w.kind === 'wall' ? w.tilt : undefined;
  if (!tilt) return null;
  const th = (tilt * Math.PI) / 180;
  const tn = Math.tan(th);
  const cs = Math.cos(th);
  if (g.tiltPlane === 'inclinado') {
    return new THREE.Matrix4().makeTranslation(0, g.sill * tn, 0).multiply(new THREE.Matrix4().makeRotationX(-th));
  }
  const sgn = th >= 0 ? 1 : -1;
  // Ponta da peça rumo à face de ancoragem (maior sgn·y + d/2): é ela que encosta na face.
  let ponta = 0;
  for (const piece of pecas) {
    const b = caixaDaPeca(piece);
    const dy = deslocamentoDaPeca(piece).dy;
    ponta = Math.max(ponta, sgn > 0 ? b.s1 + dy : -(b.s0 + dy));
  }
  return new THREE.Matrix4().makeTranslation(0, g.sill * tn + sgn * (g.thickness / (2 * cs) - ponta), 0);
}
