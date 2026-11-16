import { usePanes } from './paneStore.ts';
import type { PaneId } from './panes.ts';

/**
 * Ativa um painel por ação do usuário (clique no painel, atalho). É o ÚNICO ponto de entrada da UI para trocar o painel
 * ativo. Hoje só marca o painel; a navegação do app para a vista dele (respeitando o modo de perímetro, que recusa
 * trocar de vista) entra na onda 2D.
 */
export function activatePane(id: PaneId): void {
  usePanes.getState().activate(id);
}
