// Worker que monta o asset (base64 + SHA-256 de todas as malhas) fora da thread da interface.
import type { FurnitureImportedModel } from '@hestia/io';
import { buildAssetFromModel, type BuildOptions } from './importModel.ts';

export interface BuildRequest {
  id: number;
  model: FurnitureImportedModel;
  opts: BuildOptions;
}
export type BuildResponse =
  | { id: number; ok: true; asset: ReturnType<typeof buildAssetFromModel> }
  | { id: number; ok: false; message: string };

const g = globalThis as unknown as {
  WorkerGlobalScope?: new () => unknown;
  self?: { onmessage: ((e: { data: BuildRequest }) => void) | null; postMessage: (m: BuildResponse) => void };
};
if (typeof g.WorkerGlobalScope !== 'undefined' && g.self instanceof (g.WorkerGlobalScope as never)) {
  const scope = g.self!;
  scope.onmessage = (e) => {
    const { id, model, opts } = e.data;
    try {
      scope.postMessage({ id, ok: true, asset: buildAssetFromModel(model, opts) });
    } catch (err) {
      scope.postMessage({ id, ok: false, message: err instanceof Error ? err.message : String(err) });
    }
  };
}
