/**
 * Ponto de entrada do Worker de suplemento de script (carregado como `new Worker(new URL('./scriptWorker.ts', import.meta.url),
 * { type: 'module' })` pelo bundler, tanto no navegador quanto no Tauri). Não importe este arquivo fora de um Worker.
 */
import { hardenWorkerScope, installWorkerRuntime, loadModuleFromBlob, type WorkerScopeLike } from './workerRuntime.ts';

const scope = self as unknown as WorkerScopeLike;
installWorkerRuntime(scope, { loadModule: loadModuleFromBlob, harden: () => hardenWorkerScope(self) });
