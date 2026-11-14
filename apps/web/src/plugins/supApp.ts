/**
 * Ligação do núcleo de suplementos (`supRuntime.ts`) ao app real: registro global, portas do editor, IndexedDB,
 * Worker embutido e avisos na barra de estado. `startSupplements` roda DEPOIS da primeira pintura e nunca lança.
 */
import type { WorkerLike } from '@hestia/plugin-api';
import { pluginRegistry } from './registry.ts';
import { appDataPort, appModelPort, setPluginInfoResolver } from './appModelPort.ts';
import { pluginLog } from './pluginLog.ts';
import { setPluginResult } from './pluginResult.ts';
import { createAppPackageStore } from './supStore.ts';
import { SupplementRuntime, type SupNotice } from './supRuntime.ts';
import { useUi } from '../editor/state.ts';
import { runPluginCheckAction } from './pluginChecks.ts';
import { setCheckHandlerRunner } from './pluginChecksRun.ts';
// O Worker de script vai embutido no arquivo único do app (sem rede, sem DOM; ver `workerRuntime.ts`).
import ScriptWorker from '@hestia/plugin-api/src/scriptWorker.ts?worker&inline';

const AVISO: Record<SupNotice['kind'], 'sup_status_handler_error' | 'sup_status_failed' | 'sup_status_action_unsupported'> = {
  'handler-error': 'sup_status_handler_error',
  failed: 'sup_status_failed',
  unsupported: 'sup_status_action_unsupported',
};

let runtime: SupplementRuntime | null = null;

/** Núcleo único do app (criado na primeira vez que a abertura do app ou a tela de suplementos o pedir). */
export function supplementRuntime(): SupplementRuntime {
  runtime ??= new SupplementRuntime({
    store: createAppPackageStore((reason) => pluginLog.append('hestia', 'warn', reason)),
    // `Worker` real cumpre `WorkerLike` em tempo de execução; só os tipos de evento do DOM são mais largos.
    createWorker: () => new ScriptWorker() as unknown as WorkerLike,
    registry: pluginRegistry,
    model: appModelPort,
    data: appDataPort,
    log: pluginLog,
    setInfoResolver: setPluginInfoResolver,
    // Fora do caminho crítico: espera a primeira pintura e um intervalo ocioso (no máximo 2000 ms).
    defer: (fn) => {
      const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) ric(fn, { timeout: 2000 });
      else setTimeout(fn, 200);
    },
    showResult: (r) => {
      setPluginResult(r);
      useUi.setState({ dialog: 'pluginResult', dialogArg: null });
    },
    runCheck: runPluginCheckAction,
    notify: (n) => useUi.setState({ status: { key: AVISO[n.kind], args: { name: n.pluginName ?? '' } } }),
  });
  return runtime;
}

let started = false;

/** Abertura do app: liga o executor de ações e carrega os suplementos habilitados (cada um com try/catch). */
export function startSupplements(): void {
  if (started) return;
  started = true;
  try {
    const rt = supplementRuntime();
    rt.attachExecutor();
    setCheckHandlerRunner((id, handler) => rt.loader.call(id, handler, []));
    void rt.boot().catch((e) => pluginLog.append('hestia', 'error', `carga dos suplementos falhou: ${e instanceof Error ? e.message : String(e)}`));
  } catch (e) {
    pluginLog.append('hestia', 'error', `suplementos indisponíveis: ${e instanceof Error ? e.message : String(e)}`);
  }
}
