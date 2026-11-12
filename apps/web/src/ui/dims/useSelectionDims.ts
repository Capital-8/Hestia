import { useMemo } from 'react';
import { dimensionSettingsOf } from '@hestia/model';
import { registerBuiltinDimProviders, selectionDims, type DimContext, type TempDim } from '@hestia/tools';
import { editor, useProject } from '../../editor/controller.ts';
import { hiddenInActiveView } from '../../editor/viewVisibility.ts';
import { useUi } from '../../editor/state.ts';
import { selectionDimsSuspended } from './dimsActions.ts';

// Inicialização do editor: liga os provedores que acompanham o Hestia (idempotente).
registerBuiltinDimProviders();

/** Contexto de cotas do nível atual com as trocas de referência da sessão. */
export function useDimContext(): DimContext {
  const project = useProject();
  const levelId = useUi((s) => s.levelId);
  const overrides = useUi((s) => s.dimOverrides);
  const viewTemp = useUi((s) => s.viewTemp);
  // `hidden`: o que a vista não mostra não é oferecido como referência de cota (regra 4.5); `viewTemp` (ocultar temporário)
  // só invalida a memória: o conjunto em si é lido do estado.
  return useMemo(
    () => ({ project, levelId, settings: dimensionSettingsOf(project), overrides, hidden: hiddenInActiveView(project, useUi.getState()) }),
    [project, levelId, overrides, viewTemp],
  );
}

/**
 * Cotas dinâmicas do que está selecionado: um elemento de `project.elements` com provedor registrado, ou um sujeito
 * fora dele (`'detailLine'`, `'perimeterLine'`, `'grid'`). Recalcula quando o projeto, a seleção, as trocas de
 * referência ou a configuração mudam.
 */
export function useSelectionDims(): TempDim[] {
  const ctx = useDimContext();
  const selection = useUi((s) => s.selection);
  const suspendedVersion = useUi((s) => s.dimsSuspendedVersion);
  // `useDimContext` assina a versão do projeto; ler aqui mantém a memo coerente com o desfazer/alteração.
  const version = editor.store.version;
  return useMemo(
    () => (selectionDimsSuspended(suspendedVersion, version) ? [] : selectionDims(ctx, selection)),
    [ctx, selection, suspendedVersion, version],
  );
}

/** Cotas da prévia da ferramenta ativa (vazio para Selecionar ou ferramenta sem `tempDims`). */
export function toolDims(overrides: DimContext['overrides']): TempDim[] {
  const tool = editor.activeTool;
  return tool.id === 'select' || !tool.tempDims ? [] : tool.tempDims(overrides);
}
