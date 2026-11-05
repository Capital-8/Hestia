import type { AnimationSequence } from '@hestia/render';
import { useUi } from './state.ts';

/** Metadados de uma imagem ou vídeo renderizado. Os bytes ficam no IndexedDB (ou na memória). */
export interface RenderAsset {
  id: string;
  projectName: string;
  kind: 'image' | 'video';
  name: string;
  createdAt: number;
  width: number;
  height: number;
  fps?: number;
  duration?: number;
  mime: string;
  sequence?: AnimationSequence;
  thumbnail?: string;
}

interface Registro extends RenderAsset {
  blob: Blob;
}

const DB = 'hestia-renders';
const LOJA = 'renders';

const memoria = new Map<string, Registro>();
let banco: Promise<IDBDatabase | null> | null = null;
let idbQuebrou = false;

function abrir(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined' || idbQuebrou) return Promise.resolve(null);
  banco ??= new Promise<IDBDatabase | null>((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(LOJA)) db.createObjectStore(LOJA, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  }).then((db) => {
    if (!db) idbQuebrou = true;
    return db;
  });
  return banco;
}

function transacao<T>(modo: IDBTransactionMode, fn: (loja: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return abrir().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      try {
        const tx = db.transaction(LOJA, modo);
        const req = fn(tx.objectStore(LOJA));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => resolve(null);
        tx.onabort = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  });
}

export async function saveRender(asset: RenderAsset, blob: Blob): Promise<void> {
  const reg: Registro = { ...asset, blob };
  memoria.set(asset.id, reg);
  await transacao('readwrite', (loja) => loja.put(reg));
}

export async function listRenders(): Promise<RenderAsset[]> {
  const doBanco = await transacao<Registro[]>('readonly', (loja) => loja.getAll());
  const todos = doBanco && doBanco.length > 0 ? doBanco : [...memoria.values()];
  return todos
    .map(({ blob: _blob, ...meta }) => meta)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getRenderBlob(id: string): Promise<Blob | null> {
  const doBanco = await transacao<Registro | undefined>('readonly', (loja) => loja.get(id));
  const reg = doBanco ?? memoria.get(id);
  return reg?.blob ?? null;
}

export async function deleteRender(id: string): Promise<void> {
  memoria.delete(id);
  await transacao('readwrite', (loja) => loja.delete(id));
}

export function openRenderGalleryDialog(): void {
  useUi.setState({ dialog: 'renderGallery', dialogArg: null });
}
