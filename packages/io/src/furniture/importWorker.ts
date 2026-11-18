// Executa um `ImportFn` dentro de um Web Worker. A parte pura (`runImportRequest`, `collectTransferables`) roda em Node
// sem Worker, para teste. O ponto de entrada do Worker (no fim do arquivo) so liga quando o codigo roda num Worker.
import type { ImportFn, ImportedModel } from './types';
import { applyAverageTextureColors } from './imageColor';
import { importFurnitureFile } from './readAny';
import { importSkp } from './skp';

export interface ImportRequest {
  type: 'import';
  id: number;
  name: string;
  bytes: Uint8Array;
  scale?: number;
  /** Para testes: nao calcula a cor media das texturas. */
  skipAverageColor?: boolean;
}
export interface CancelRequest {
  type: 'cancel';
  id: number;
}
export type WorkerInbound = ImportRequest | CancelRequest;

export type WorkerOutbound =
  | { type: 'progress'; id: number; fraction: number; label: string }
  | { type: 'done'; id: number; model: ImportedModel }
  | { type: 'error'; id: number; name: string; message: string };

/**
 * Leitores por extensao. Todos os formatos sao registrados aqui; `readAny` despacha os que nao sao .skp por extensao.
 * Importacao ESTATICA de proposito: o app e um arquivo unico (vite-plugin-singlefile) e o Worker sai em formato IIFE, que
 * nao aceita `import()` dinamico (a construcao de producao falha). O Worker so e carregado quando o usuario importa.
 */
const viaReadAny = (): Promise<ImportFn> => Promise.resolve(importFurnitureFile);
export const IMPORTERS: Record<string, () => Promise<ImportFn>> = {
  skp: () => Promise.resolve(importSkp),
  glb: viaReadAny,
  gltf: viaReadAny,
  obj: viaReadAny,
  dae: viaReadAny,
  fbx: viaReadAny,
  zip: viaReadAny,
};

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? (m[1] as string).toLowerCase() : '';
}

/** Todos os ArrayBuffer do modelo, sem repeticao, para transferir sem copiar. */
export function collectTransferables(model: ImportedModel): ArrayBuffer[] {
  const seen = new Set<ArrayBuffer>();
  const add = (v: { buffer: ArrayBufferLike }) => {
    if (v.buffer instanceof ArrayBuffer) seen.add(v.buffer);
  };
  for (const d of model.defs) {
    add(d.positions);
    add(d.normals);
    add(d.uvs);
    add(d.indices);
  }
  for (const t of model.textures) add(t.bytes);
  return [...seen];
}

export type Post = (msg: WorkerOutbound, transfer?: ArrayBuffer[]) => void;

/** Roda uma importacao e envia progresso, resultado ou erro por `post`. Nunca lanca. */
export async function runImportRequest(
  req: ImportRequest,
  importer: ImportFn,
  post: Post,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const model = await importer(
      { name: req.name, bytes: req.bytes },
      {
        ...(signal ? { signal } : {}),
        ...(req.scale !== undefined ? { scale: req.scale } : {}),
        onProgress: (fraction, label) => post({ type: 'progress', id: req.id, fraction, label }),
      },
    );
    if (!req.skipAverageColor) await applyAverageTextureColors(model);
    post({ type: 'done', id: req.id, model }, collectTransferables(model));
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    post({ type: 'error', id: req.id, name: err.name, message: err.message });
  }
}

/** Trata uma mensagem recebida pelo Worker. `controllers` guarda os cancelamentos por id. */
export async function handleWorkerMessage(
  msg: WorkerInbound,
  post: Post,
  controllers: Map<number, AbortController>,
  resolveImporter: (ext: string) => Promise<ImportFn> | null = (ext) => IMPORTERS[ext]?.() ?? null,
): Promise<void> {
  if (msg.type === 'cancel') {
    controllers.get(msg.id)?.abort();
    return;
  }
  const ext = extensionOf(msg.name);
  const pending = resolveImporter(ext);
  if (!pending) {
    post({ type: 'error', id: msg.id, name: 'Error', message: `Formato ".${ext}" nao suportado pelo importador.` });
    return;
  }
  const ctl = new AbortController();
  controllers.set(msg.id, ctl);
  try {
    await runImportRequest(msg, await pending, post, ctl.signal);
  } finally {
    controllers.delete(msg.id);
  }
}

// Ponto de entrada do Worker.
const g = globalThis as unknown as {
  WorkerGlobalScope?: new () => unknown;
  self?: {
    onmessage: ((e: { data: WorkerInbound }) => void) | null;
    postMessage: (msg: unknown, transfer?: ArrayBuffer[]) => void;
  };
};
if (typeof g.WorkerGlobalScope !== 'undefined' && g.self instanceof (g.WorkerGlobalScope as never)) {
  const scope = g.self!;
  const controllers = new Map<number, AbortController>();
  scope.onmessage = (e) => {
    void handleWorkerMessage(e.data, (m, t) => scope.postMessage(m, t), controllers);
  };
}
