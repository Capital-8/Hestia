import { applyLevelElevation } from './levelActions.ts';
import { editor } from './controller.ts';
import { useUi } from './state.ts';

/**
 * Edita a cota de um nível a partir da interface (painel, tabela de níveis e cota 3D): grava, ou abre o diálogo de
 * conflito de escada/rampa, e sempre escreve na barra de status (sucesso ou erro). Devolve se deu certo.
 */
export function commitLevelElevation(levelId: string, elevation: number): boolean {
  const r = applyLevelElevation(editor.store, levelId, elevation);
  if (r.conflictArg) {
    useUi.setState({ dialog: 'levelMoveConflict', dialogArg: r.conflictArg, status: r.message });
    return true;
  }
  useUi.setState({ status: r.message });
  return r.ok;
}
