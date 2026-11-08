import type { Id, Project } from '@hestia/model';
import { wallType, wallsOnLevel } from '@hestia/model';
import { buildFrame, type WallFrame } from './frame.ts';
import { withWallZ } from './wallFrameZ.ts';

/** Quadro (`WallFrame`) de uma parede do projeto, ou `null` se o id não é de parede. */
export function frameOfWall(p: Project, wallId: Id): WallFrame | null {
  const w = p.elements[wallId];
  if (!w || w.kind !== 'wall') return null;
  return buildFrame(w, wallType(p, w));
}

/** Quadros das paredes de um nível, já com a cota (`withWallZ`). */
export function levelFrames(p: Project, levelId: Id): WallFrame[] {
  const frames = wallsOnLevel(p, levelId).map((w) => buildFrame(w, wallType(p, w))).filter((f): f is WallFrame => f !== null);
  return withWallZ(p, frames);
}
