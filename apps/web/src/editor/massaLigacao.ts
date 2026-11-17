import { MassTool, type Tool } from '@hestia/tools';
import type { Id } from '@hestia/model';
import { useUi } from './state.ts';

/** Abre o diálogo "Seções da massa" sobre a massa `id` (usado pelo loft recém-criado e pelo painel e navegador). */
export function abrirSecoesDaMassa(id: Id): void {
  useUi.setState({ dialog: 'massSecoes', dialogArg: id });
}

/**
 * Liga a ferramenta recém-criada à interface: o `aoCriar` da massa (só o loft o chama, A.6) abre o diálogo "Seções da
 * massa" sobre a massa criada. Outras ferramentas passam como estão. Devolve a mesma ferramenta.
 */
export function ligarMassa<T extends Tool>(tool: T): T {
  if (tool instanceof MassTool) tool.aoCriar = abrirSecoesDaMassa;
  return tool;
}
