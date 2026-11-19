/**
 * Preferência de aplicação para o recurso experimental de colaboração em tempo real.
 *
 * Habilitado por padrão como prévia experimental (`'hestia.exp.collab'` no `localStorage`);
 * só `'false'` desativa. Fica fora do projeto `.hestia`.
 */
import { create } from 'zustand';
import { safeGet, safeSet } from './storage.ts';

export const CHAVE_COLLAB_EXPERIMENTAL = 'hestia.exp.collab';

/** Lê o estado atual da colaboração experimental no `localStorage`. Padrão `true`; só `'false'` desativa. */
export function lerCollabExperimental(): boolean {
  return safeGet(CHAVE_COLLAB_EXPERIMENTAL) !== 'false';
}

export interface CollabExperimentalState {
  ativo: boolean;
}

/** Mini-store reativa sincronizada com `'hestia.exp.collab'` no `localStorage`. */
export const useCollabExperimental = create<CollabExperimentalState>(() => ({
  ativo: lerCollabExperimental(),
}));

/** Grava a preferência no `localStorage` e atualiza a store reativa. */
export function gravarCollabExperimental(ativo: boolean): void {
  safeSet(CHAVE_COLLAB_EXPERIMENTAL, ativo ? 'true' : 'false');
  useCollabExperimental.setState({ ativo });
}
