// Importa um arquivo num Web Worker, com progresso, cancelamento (AbortSignal) e transferencia de buffers.
import type { ImportOptions, ImportedModel } from './types';
import type { ImportRequest, WorkerInbound, WorkerOutbound } from './importWorker';

/** Subconjunto de `Worker` usado aqui (facilita teste com um Worker falso). */
export interface WorkerLike {
  postMessage(msg: WorkerInbound, transfer?: ArrayBuffer[]): void;
  terminate(): void;
  onmessage: ((e: { data: WorkerOutbound }) => void) | null;
  onerror: ((e: { message?: string }) => void) | null;
}

export type WorkerFactory = () => WorkerLike;

const defaultFactory: WorkerFactory = () =>
  new Worker(new URL('./importWorker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

let nextId = 1;

export interface ImportInWorkerOptions extends ImportOptions {
  /**
   * Transfere o buffer de `file.bytes` ao Worker (o chamador perde o acesso, zero copia). Padrao false: envia uma copia,
   * para o chamador manter os bytes (ex.: guardar o arquivo original no projeto).
   */
  transferInput?: boolean;
  /** Fabrica de Worker (para teste). Padrao: o Worker real do Vite. */
  workerFactory?: WorkerFactory;
}

function abortError(): Error {
  const e = new Error('Importacao cancelada.');
  e.name = 'AbortError';
  return e;
}

export function importInWorker(
  file: { name: string; bytes: Uint8Array },
  opts: ImportInWorkerOptions = {},
): Promise<ImportedModel> {
  const { signal, onProgress, scale, transferInput, workerFactory = defaultFactory } = opts;
  return new Promise<ImportedModel>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const worker = workerFactory();
    const id = nextId++;
    let finished = false;
    const finish = (fn: () => void) => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener('abort', onAbort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      fn();
    };
    const onAbort = () => {
      // O leitor roda de forma sincrona; a unica forma de interromper no meio e encerrar o Worker (libera a memoria).
      try {
        worker.postMessage({ type: 'cancel', id });
      } catch {
        /* ignora */
      }
      finish(() => reject(abortError()));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    worker.onmessage = (e) => {
      const m = e.data;
      if (m.id !== id) return;
      if (m.type === 'progress') onProgress?.(m.fraction, m.label);
      else if (m.type === 'done') finish(() => resolve(m.model));
      else {
        const err = new Error(m.message);
        err.name = m.name;
        finish(() => reject(err));
      }
    };
    worker.onerror = (e) => finish(() => reject(new Error(e.message || 'Falha no Worker de importacao.')));

    const bytes = transferInput ? file.bytes : file.bytes.slice();
    const req: ImportRequest = { type: 'import', id, name: file.name, bytes, ...(scale !== undefined ? { scale } : {}) };
    const transfer = bytes.buffer instanceof ArrayBuffer ? [bytes.buffer] : [];
    worker.postMessage(req, transfer);
  });
}
