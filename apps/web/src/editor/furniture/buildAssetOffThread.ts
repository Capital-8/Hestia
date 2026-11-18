import type { FurnitureImportedModel } from '@hestia/io';
import type { FurnitureAsset } from '@hestia/model';
import type { BuildRequest, BuildResponse } from './buildAssetWorker.ts';
import { buildAssetFromModel, type BuildOptions } from './importModel.ts';

/** Subconjunto de `Worker` usado aqui (facilita o teste com um Worker falso). */
export interface BuildWorkerLike {
  postMessage(m: BuildRequest): void;
  terminate(): void;
  onmessage: ((e: { data: BuildResponse }) => void) | null;
  onerror: ((e: { message?: string }) => void) | null;
}

let nextId = 1;

/**
 * Monta o asset num Web Worker (a conversão em base64 e o SHA-256 de blocos grandes levam centenas de ms e travariam a
 * tela). Sem Worker no ambiente (testes em Node), roda na própria thread.
 */
export function buildAssetOffThread(
  model: FurnitureImportedModel,
  opts: BuildOptions,
  factory: (() => BuildWorkerLike) | null = typeof Worker === 'undefined' ? null : () => new Worker(new URL('./buildAssetWorker.ts', import.meta.url), { type: 'module' }) as unknown as BuildWorkerLike,
): Promise<FurnitureAsset> {
  if (!factory) return Promise.resolve().then(() => buildAssetFromModel(model, opts));
  return new Promise<FurnitureAsset>((resolve, reject) => {
    const w = factory();
    const id = nextId++;
    const end = (fn: () => void): void => {
      w.onmessage = null;
      w.onerror = null;
      w.terminate();
      fn();
    };
    w.onmessage = (e) => {
      if (e.data.id !== id) return;
      const d = e.data;
      end(() => (d.ok ? resolve(d.asset) : reject(new Error(d.message))));
    };
    w.onerror = (e) => end(() => reject(new Error(e.message || 'Falha no Worker de montagem do bloco.')));
    w.postMessage({ id, model, opts });
  });
}
