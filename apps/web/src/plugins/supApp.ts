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
import { saveBytes } from '../editor/saveBytes.ts';
import { pickFileForImport } from './ioPick.ts';
import type { IoOutcome } from './ioBridge.ts';
import type { BatchOutcome } from './batchPreview.ts';
import { runPluginCheckAction } from './pluginChecks.ts';
import { setCheckHandlerRunner } from './pluginChecksRun.ts';
import { editor } from '../editor/controller.ts';
import { t as translate, useI18n } from '../editor/i18n.ts';
import { txt } from '../ui/ribbon/model.ts';
// O Worker de script vai embutido no arquivo único do app (sem rede, sem DOM; ver `workerRuntime.ts`).
import ScriptWorker from '@hestia/plugin-api/src/scriptWorker.ts?worker&inline';

const AVISO: Record<SupNotice['kind'], 'sup_status_handler_error' | 'sup_status_failed' | 'sup_status_action_unsupported'> = {
  'handler-error': 'sup_status_handler_error',
  failed: 'sup_status_failed',
  unsupported: 'sup_status_action_unsupported',
};

/** Resultado de importar/exportar na barra de estado (frases em `supio_*`). Importação preparada abre o menu Arquivo para a prévia. */
function ioStatus(o: IoOutcome): void {
  const name = o.pluginName;
  switch (o.kind) {
    case 'exported': useUi.setState({ status: o.text }); return;
    case 'prepared': useUi.setState({ fileMenu: true, status: { key: 'supio_status_prepared', args: { name, n: o.created } } }); return;
    case 'imported': useUi.setState({ status: { key: 'supio_status_imported', args: { name, n: o.created } } }); return;
    case 'cancelled': useUi.setState({ status: { key: 'supio_status_cancelled', args: { name } } }); return;
    case 'error': useUi.setState({ status: { key: 'supio_status_error', args: { name, detail: o.detail } } }); return;
  }
}

/** Prévia confirmável (fase I) na barra de estado; a proposta abre o diálogo de prévia. */
function batchStatus(o: BatchOutcome): void {
  const name = o.pluginName;
  switch (o.kind) {
    case 'proposed': useUi.setState({ dialog: 'pluginBatchPreview', dialogArg: null, status: { key: 'supbp_status_proposed', args: { name, commands: o.commands } } }); return;
    case 'applied': useUi.setState({ status: { key: 'supbp_status_applied', args: { name } } }); return;
    case 'cancelled': useUi.setState({ status: { key: 'supbp_status_cancelled', args: { name } } }); return;
    case 'undone': useUi.setState({ status: { key: 'supbp_status_undone', args: { name } } }); return;
    case 'error': useUi.setState({ dialog: null, status: { key: 'supbp_status_error', args: { name, detail: o.detail } } }); return;
  }
}

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
    deliver: (fileName, bytes) => saveBytes(fileName, bytes),
    pickFile: pickFileForImport,
    onIo: ioStatus,
    batch: { version: () => editor.store.version, undo: () => editor.store.undo(), onOutcome: batchStatus },
    runCheck: runPluginCheckAction,
    // Ferramentas interativas (fase H): o editor ativa `PluginTool`; textos no idioma da interface.
    tools: {
      start: (spec, bridge) => void editor.startPluginTool(spec, bridge),
      text: (t) => txt(t, useI18n.getState().lang),
      message: (key, args) => translate(useI18n.getState().lang, key, args),
    },
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
