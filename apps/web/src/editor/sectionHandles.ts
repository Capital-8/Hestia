import { isOpening, isWall, openingHeight, openingSill, openingType, wallBaseElevation, type Command, type Id, type Project } from '@hestia/model';
import type { SectionResult } from '@hestia/engine';
import { pickSectionHandle, type SectionHandle } from '@hestia/render';

/** Alça de abertura sob o ponto, restrita à seleção quando ela existe. */
export function sectionHandleAt(result: SectionResult, point: { x: number; y: number }, tolerance: number, selected: readonly Id[]): SectionHandle | null {
  const selectedOpening = selected.find((id) => result.openings.some((o) => o.openingId === id));
  if (!selectedOpening) return null;
  const handle = pickSectionHandle(result, point, tolerance, selectedOpening);
  // As alças laterais ficam para o movimento horizontal (SectionMoveTool); o arraste direto aqui é vertical.
  return handle && (handle.kind === 'sill' || handle.kind === 'head') ? handle : null;
}

/**
 * Converte a posição vertical (z absoluto) da alça em um patch de abertura. Só peitoril/topo; as laterais ficam para o
 * movimento horizontal, que precisa da direção da parede. Devolve null quando a alça não altera o modelo.
 */
export function sectionHandleCommand(p: Project, handle: SectionHandle, z: number): Command | null {
  const opening = p.elements[handle.openingId];
  if (!isOpening(opening)) return null;
  const wall = p.elements[opening.hostId];
  if (!isWall(wall)) return null;
  const type = openingType(p, opening);
  const base = wallBaseElevation(p, wall);
  if (handle.kind === 'sill') {
    if (opening.kind !== 'window') return null;
    return { type: 'updateElements', ids: [opening.id], patch: { sillOverride: Math.max(0, Math.round((z - base) * 1000) / 1000) } };
  }
  if (handle.kind === 'head') {
    const sill = openingSill(type, opening);
    const height = Math.max(0.1, Math.round((z - base - sill) * 1000) / 1000);
    return { type: 'updateElements', ids: [opening.id], patch: { heightOverride: height } };
  }
  return null;
}

/** Altura efetiva e peitoril atuais, para a barra de status/prévia. */
export function sectionOpeningValues(p: Project, openingId: Id): { sill: number; height: number } | null {
  const opening = p.elements[openingId];
  if (!isOpening(opening)) return null;
  const type = openingType(p, opening);
  return { sill: openingSill(type, opening), height: openingHeight(type, opening) };
}
