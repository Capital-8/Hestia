import type { Command, Id, Project } from '@hestia/model';
import type { ClipBuffer, MintId } from '../clipboard.ts';
import type { PasteIds, PasteWarning } from './types.ts';

/** Contexto compartilhado entre o motor (W1) e as categorias extras (W2). */
export interface CategoryContext {
  p: Project;
  /** Nível de destino. */
  levelId: Id;
  /** Nível de origem do buffer (para o delta de Z dos genéricos). */
  srcLevelId: Id;
  mint: MintId;
  /** Parede antiga → parede nova. */
  wallMap: Map<Id, Id>;
}

/** Ids vazios por categoria; evita repetir o literal em cada caminho de erro. */
export function emptyPasteIds(): PasteIds {
  return { walls: [], openings: [], floors: [], slabs: [], ceilings: [], roofs: [], stairs: [], ramps: [], rooms: [], generics: [], cad: [] };
}

/**
 * Clona forros, genéricos/IFC e desenhos CAD para o nível de destino.
 * Implementação: agente W2 (ver docs/colar-niveis/CONTRATO.md).
 */
export function cloneCategories(
  _p: Project,
  _clip: ClipBuffer,
  _levelId: Id,
  _ctx: CategoryContext,
): { commands: Command[]; ids: PasteIds; warnings: PasteWarning[] } {
  return { commands: [], ids: emptyPasteIds(), warnings: [] };
}
