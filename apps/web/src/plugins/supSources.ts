/**
 * De onde vem um suplemento a instalar: arquivo `.hestiapkg` ou pasta de desenvolvimento (spec 08 §8). No navegador
 * usa o seletor nativo (`<input type="file">`); no desktop a pasta vem do comando Tauri `suplementos_ler_pasta`
 * (`desktop/src-tauri/src/suplementos.rs`), que também limita contagem e tamanho. Aqui só se LÊ bytes: a validação
 * do conteúdo é do instalador. Tamanhos em bytes.
 */
import type { ZipEntryData } from '@hestia/io';
import type { InstallSource } from './supRuntime.ts';

/** Mesmos tetos do leitor de pacote (8 MiB por arquivo, 200 arquivos): corta antes de ler para não encher a memória. */
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 200;
const MAX_PKG_BYTES = 16 * 1024 * 1024;

export class SourceError extends Error {
  constructor(readonly code: 'no_support' | 'too_big' | 'too_many_files', message: string) {
    super(message);
    this.name = 'SourceError';
  }
}

type Invoke = (comando: string, args?: Record<string, unknown>) => Promise<unknown>;

/** `invoke` do Tauri (mesma detecção de `editor/biblioteca/portaTauri.ts`); `null` no navegador. */
function tauriInvoke(): Invoke | null {
  const w = globalThis as { __TAURI__?: { core?: { invoke?: Invoke } }; __TAURI_INTERNALS__?: { invoke?: Invoke } };
  const f = w.__TAURI__?.core?.invoke ?? w.__TAURI_INTERNALS__?.invoke;
  return typeof f === 'function' ? f : null;
}

export const emDesktop = (): boolean => tauriInvoke() !== null;

/** Abre o seletor nativo e devolve os arquivos escolhidos (`null` se o usuário cancelar). */
function escolher(opts: { accept?: string; folder?: boolean }): Promise<File[] | null> {
  if (typeof document === 'undefined') return Promise.reject(new SourceError('no_support', 'sem documento'));
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (opts.accept) input.accept = opts.accept;
    if (opts.folder) input.setAttribute('webkitdirectory', '');
    input.style.display = 'none';
    const fim = (r: File[] | null): void => {
      input.remove();
      resolve(r);
    };
    input.addEventListener('change', () => fim(input.files && input.files.length > 0 ? [...input.files] : null));
    input.addEventListener('cancel', () => fim(null));
    document.body.appendChild(input);
    input.click();
  });
}

/** Escolhe um `.hestiapkg` (ou `.zip`) e lê os bytes. */
export async function pickPackage(): Promise<InstallSource | null> {
  const files = await escolher({ accept: '.hestiapkg,.zip,application/zip' });
  const f = files?.[0];
  if (!f) return null;
  if (f.size > MAX_PKG_BYTES) throw new SourceError('too_big', 'pacote acima de 16 MiB');
  return { kind: 'package', bytes: new Uint8Array(await f.arrayBuffer()) };
}

/** Escolhe uma pasta de desenvolvimento: no desktop pelo Rust, no navegador pelo seletor de pasta. */
export async function pickFolder(): Promise<InstallSource | null> {
  const invoke = tauriInvoke();
  if (invoke) {
    const r = await invoke('suplementos_ler_pasta');
    if (r === null || r === undefined) return null;
    if (!Array.isArray(r)) throw new SourceError('no_support', 'resposta inesperada do desktop');
    const files: ZipEntryData[] = (r as Array<{ caminho: string; bytes: number[] }>).map((a) => ({ path: String(a.caminho), data: Uint8Array.from(a.bytes) }));
    return { kind: 'folder', files };
  }
  const picked = await escolher({ folder: true });
  if (!picked) return null;
  if (picked.length > MAX_FILES) throw new SourceError('too_many_files', 'mais de 200 arquivos');
  const files: ZipEntryData[] = [];
  for (const f of picked) {
    if (f.size > MAX_FILE_BYTES) throw new SourceError('too_big', `arquivo grande demais: ${f.name}`);
    // `webkitRelativePath` = "pasta/sub/arquivo": o primeiro trecho é a própria pasta e sai do caminho.
    const rel = (f.webkitRelativePath || f.name).split('/').slice(1).join('/');
    if (rel) files.push({ path: rel, data: new Uint8Array(await f.arrayBuffer()) });
  }
  return { kind: 'folder', files };
}
