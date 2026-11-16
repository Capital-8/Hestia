import type { Vec2 } from '@hestia/geom';
import type { Id, Project } from '@hestia/model';
import { levelFrames } from './resolveFrames.ts';
import { pointAt } from './frame.ts';

/** Afastamento (m) da face da parede ao CENTRO da etiqueta: deixa folga para o contorno (círculo, hexágono). */
export const TAG_PLACE_GAP = 0.34;

/**
 * Posição inicial inteligente da etiqueta de uma porta ou janela (Revit: Tag on Placement): na linha do vão, do lado
 * oposto ao arco de abertura da porta e do lado externo da parede na janela, para nunca cair sobre o símbolo de giro.
 * Devolve null se o vão não estiver numa parede de nível conhecido.
 */
export function openingTagPoint(p: Project, openingId: Id, gap = TAG_PLACE_GAP): Vec2 | null {
  const o = p.elements[openingId];
  if (!o || (o.kind !== 'door' && o.kind !== 'window')) return null;
  const host = p.elements[o.hostId];
  if (!host || host.kind !== 'wall') return null;
  const f = levelFrames(p, host.levelId).find((x) => x.wall.id === host.id);
  if (!f) return null;
  const s = o.kind === 'window' ? f.sExt + f.sign * gap : f.sMid - (o.flipFacing ? -1 : 1) * (f.thickness / 2 + gap);
  return pointAt(f, o.offset, s);
}
