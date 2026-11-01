import type { Patch } from 'immer';
import type { Command } from './commands.ts';
import type { Id, Project } from './types.ts';

/** O que um comando (ou transação) alterou: ids de elementos mudados e removidos. */
export interface StoreChange { changed: Set<Id>; removed: Set<Id> }
/**
 * Gancho de restrições (cotas travadas, EQ, cotas órfãs): roda depois de cada comando/transação e devolve comandos
 * extras que entram no MESMO passo de desfazer. Lança `Error` para recusar a mudança (nada é gravado).
 */
export type StorePostHook = (project: Project, change: StoreChange) => Command[];
let postHook: StorePostHook | null = null;
export function setStorePostHook(h: StorePostHook | null): void { postHook = h; }
export const postHookOf = (): StorePostHook | null => postHook;

export function summarize(patches: Patch[]): StoreChange {
  const changed = new Set<Id>();
  const removed = new Set<Id>();
  for (const p of patches) {
    if (p.path[0] !== 'elements' || p.path.length < 2) continue;
    const id = String(p.path[1]);
    if (p.op === 'remove' && p.path.length === 2) removed.add(id); else changed.add(id);
  }
  return { changed, removed };
}

