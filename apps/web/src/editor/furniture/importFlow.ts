import type { FurnitureImportedModel, ImportInWorkerOptions } from '@hestia/io';
import { fileTooBig } from './importModel.ts';

/** Extensões aceitas pelo seletor e pela área de soltar. */
export const FURNITURE_ACCEPT = ['.skp', '.glb', '.gltf', '.obj', '.dae', '.fbx', '.zip'] as const;

export type ImportFn = (file: { name: string; bytes: Uint8Array }, opts?: ImportInWorkerOptions) => Promise<FurnitureImportedModel>;

/** Arquivo como o navegador entrega (`File`); só o que o fluxo usa. */
export interface FlowFile {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type FlowPhase = 'idle' | 'reading' | 'importing' | 'ready' | 'adding';

/** Por que a importação não seguiu; a interface traduz. */
export type FlowError =
  | { kind: 'format'; ext: string }
  | { kind: 'too_big'; mb: number }
  | { kind: 'refused' }
  | { kind: 'cancelled' }
  | { kind: 'generic'; msg: string };

export interface FlowState {
  phase: FlowPhase;
  progress: { fraction: number; label: string };
  model: FurnitureImportedModel | null;
  error: FlowError | null;
}

export const FLOW_IDLE: FlowState = { phase: 'idle', progress: { fraction: 0, label: '' }, model: null, error: null };

const extOf = (n: string): string => /\.([a-z0-9]+)$/i.exec(n)?.[1]?.toLowerCase() ?? '';

/** Recusa antes de ler: extensão não aceita ou arquivo grande demais (`null` = segue). */
export function precheckFile(file: { name: string; size: number }): FlowError | null {
  const ext = extOf(file.name);
  if (!FURNITURE_ACCEPT.includes(`.${ext}` as (typeof FURNITURE_ACCEPT)[number])) return { kind: 'format', ext: ext || '?' };
  if (fileTooBig(file.size)) return { kind: 'too_big', mb: Math.round(file.size / 1048576) }; // units-ok: MB de arquivo
  return null;
}

/** Traduz uma exceção da importação no motivo mostrado ao usuário. */
export function classifyError(e: unknown): FlowError {
  if (e instanceof Error && e.name === 'AbortError') return { kind: 'cancelled' };
  const msg = e instanceof Error ? e.message : String(e);
  return /modo leve/i.test(msg) ? { kind: 'refused' } : { kind: 'generic', msg };
}

/**
 * Fluxo da importação (sem React): lê os bytes, importa no Worker com progresso e cancelamento e guarda o resultado.
 * A interface só desenha o estado e chama `start`/`cancel`. Um arquivo novo cancela o anterior; resultado de uma
 * importação cancelada nunca chega ao estado.
 */
export class ImportFlow {
  state: FlowState = FLOW_IDLE;
  private listeners = new Set<() => void>();
  private abort: AbortController | null = null;
  private run = 0;

  constructor(private readonly importFn: ImportFn) {}

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getState = (): FlowState => this.state;

  private set(patch: Partial<FlowState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  async start(file: FlowFile | null | undefined): Promise<void> {
    if (!file) return;
    this.abort?.abort();
    const id = ++this.run;
    const bad = precheckFile(file);
    if (bad) {
      this.set({ ...FLOW_IDLE, error: bad });
      return;
    }
    const ac = new AbortController();
    this.abort = ac;
    this.set({ ...FLOW_IDLE, phase: 'reading' });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (id !== this.run) return;
      this.set({ phase: 'importing', progress: { fraction: 0, label: '' } });
      const model = await this.importFn(
        { name: file.name, bytes },
        {
          signal: ac.signal,
          transferInput: true,
          onProgress: (fraction, label) => {
            if (id === this.run) this.set({ progress: { fraction, label } });
          },
        },
      );
      if (id !== this.run) return;
      this.set({ phase: 'ready', model, error: null });
    } catch (e) {
      if (id !== this.run) return;
      this.set({ ...FLOW_IDLE, error: classifyError(e) });
    }
  }

  /** Cancela a leitura/importação em andamento (encerra o Worker). */
  cancel(): void {
    this.abort?.abort();
    this.run++;
    this.set({ ...FLOW_IDLE, error: { kind: 'cancelled' } });
  }

  setAdding(): void {
    this.set({ phase: 'adding' });
  }

  /** Volta ao estado de revisão (falha ao adicionar) com a mensagem. */
  failAdding(msg: string): void {
    this.set({ phase: 'ready', error: { kind: 'generic', msg } });
  }

  /** Limpa tudo (depois de adicionar). */
  reset(): void {
    this.run++;
    this.set({ ...FLOW_IDLE });
  }

  dispose(): void {
    this.run++;
    this.abort?.abort();
    this.listeners.clear();
  }
}
