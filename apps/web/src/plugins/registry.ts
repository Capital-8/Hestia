import { useSyncExternalStore } from 'react';
import { ContributionRegistry, type PluginAction } from '@hestia/plugin-api';
import { useUi } from '../editor/state.ts';

/**
 * Registro de contribuições do app (spec 08 §4, fase B). Uma instância só: o carregador (fase D) chama
 * `pluginRegistry.register(manifesto, concessões)` ao ativar um suplemento e `unregister` ao desativar; a faixa, a busca
 * de comandos e o diálogo de suplemento leem daqui. Este arquivo não executa código de suplemento.
 */
export const pluginRegistry = new ContributionRegistry();

/** Quem sabe EXECUTAR ações que não são diálogo (ferramenta, importador, exportador, handler): ligado pelas fases C a H. */
export type PluginActionExecutor = (req: { pluginId: string; action: PluginAction; values?: Record<string, unknown> }) => void;

let executor: PluginActionExecutor | null = null;

/** Liga (ou, com `null`, desliga) o executor de ações. Devolve o anterior, para quem precisar encadear. */
export function setPluginActionExecutor(fn: PluginActionExecutor | null): PluginActionExecutor | null {
  const antes = executor;
  executor = fn;
  return antes;
}

/** Id do diálogo aberto por `dialogArg` do `DialogKind` 'pluginDialog': o id qualificado `<pluginId>:<dialogId>`. */
const qid = (pluginId: string, id: string): string => `${pluginId}:${id}`;

/**
 * Roda uma ação declarada. `dialog` abre o diálogo do suplemento; as demais vão ao executor. Erro do executor NUNCA
 * propaga ao editor (spec 08 §7): vira aviso na barra de estado. Sem executor, avisa que a ação ainda não está disponível.
 */
export function runPluginAction(pluginId: string, action: PluginAction, values?: Record<string, unknown>): void {
  if (action.type === 'dialog') {
    useUi.setState({ dialog: 'pluginDialog', dialogArg: qid(pluginId, action.ref) });
    return;
  }
  if (!executor) {
    useUi.setState({ status: 'Suplemento: esta ação ainda não está disponível / This add-in action is not available yet' });
    return;
  }
  try {
    executor({ pluginId, action, ...(values ? { values } : {}) });
  } catch (e) {
    useUi.setState({ status: `Suplemento ${pluginId}: ${e instanceof Error ? e.message : 'erro'}` });
  }
}

/** Executa um comando pelo id qualificado (botão da faixa ou busca de comandos). */
export function runPluginCommand(commandQid: string): void {
  const c = pluginRegistry.command(commandQid);
  if (c) runPluginAction(c.pluginId, c.run);
}

/** Número que muda a cada alteração do registro; faz o componente que o lê redesenhar. */
export function usePluginRegistryVersion(): number {
  return useSyncExternalStore((cb) => pluginRegistry.subscribe(cb), () => pluginRegistry.version(), () => 0);
}
