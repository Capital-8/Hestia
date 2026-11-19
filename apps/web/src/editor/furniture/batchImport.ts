import type { FurnitureAsset } from '@hestia/model';
import { classifyError, precheckFile, type FlowError, type FlowFile, type ImportFn } from './importFlow.ts';
import { initialMaterialEdits, summarizeModel, UNIT_FACTOR, type BuildOptions, type FileUnit, type UpChoice } from './importModel.ts';
import type { FurnitureImportedModel } from '@hestia/io';

export type BatchStatus = 'wait' | 'reading' | 'importing' | 'building' | 'done' | 'error' | 'skipped';

export interface BatchItem {
  name: string;
  status: BatchStatus;
  fraction: number;
  error: FlowError | null;
  /** Dimensões finais em metros (X, Y, Z) quando o bloco foi criado. */
  dims: [number, number, number] | null;
  triangles: number;
}

export interface BatchState {
  running: boolean;
  items: BatchItem[];
}

export const BATCH_IDLE: BatchState = { running: false, items: [] };

export type BuildFn = (model: FurnitureImportedModel, o: BuildOptions) => Promise<FurnitureAsset>;

/**
 * Importação de vários arquivos de uma vez (sem React): um por vez, em sequência, pelo mesmo Worker do arquivo único.
 * Cada arquivo vira UM bloco no projeto (`add`, uma entrada de desfazer por arquivo); um erro fica no item e não aborta
 * os outros. Unidade e eixo valem para o lote todo (o tamanho de cada bloco aparece na lista, e dá para ajustar o móvel
 * colocado depois pela escala nas propriedades). Cancelar encerra o arquivo em curso e pula os que faltam.
 */
export class BatchImport {
  state: BatchState = BATCH_IDLE;
  private listeners = new Set<() => void>();
  private abort: AbortController | null = null;
  private run = 0;

  constructor(private readonly importFn: ImportFn, private readonly build: BuildFn, private readonly add: (a: FurnitureAsset) => void) {}

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  getState = (): BatchState => this.state;

  private emit(state: BatchState): void {
    this.state = state;
    for (const l of this.listeners) l();
  }

  private patch(i: number, p: Partial<BatchItem>): void {
    this.emit({ ...this.state, items: this.state.items.map((it, k) => (k === i ? { ...it, ...p } : it)) });
  }

  async start(files: FlowFile[], o: { unit: FileUnit; up: UpChoice }): Promise<void> {
    if (files.length === 0 || this.state.running) return;
    const id = ++this.run;
    this.abort = new AbortController();
    const ac = this.abort;
    this.emit({ running: true, items: files.map((f) => ({ name: f.name, status: 'wait', fraction: 0, error: null, dims: null, triangles: 0 })) });
    for (let i = 0; i < files.length; i++) {
      if (id !== this.run || ac.signal.aborted) {
        this.patch(i, { status: 'skipped' });
        continue;
      }
      const file = files[i]!;
      const bad = precheckFile(file);
      if (bad) {
        this.patch(i, { status: 'error', error: bad });
        continue;
      }
      try {
        this.patch(i, { status: 'reading' });
        const bytes = new Uint8Array(await file.arrayBuffer());
        this.patch(i, { status: 'importing' });
        const model = await this.importFn({ name: file.name, bytes }, { signal: ac.signal, transferInput: true, onProgress: (fraction) => { if (id === this.run) this.patch(i, { fraction }); } });
        this.patch(i, { status: 'building', fraction: 1 });
        const asset = await this.build(model, { name: model.name, factor: UNIT_FACTOR[o.unit], up: o.up, materials: initialMaterialEdits(model) });
        if (id !== this.run || ac.signal.aborted) {
          this.patch(i, { status: 'skipped' });
          continue;
        }
        this.add(asset);
        this.patch(i, { status: 'done', dims: summarizeModel(model, UNIT_FACTOR[o.unit], o.up).dims, triangles: model.stats.triangles });
      } catch (e) {
        const err = classifyError(e);
        this.patch(i, err.kind === 'cancelled' ? { status: 'skipped' } : { status: 'error', error: err });
      }
    }
    if (id === this.run) this.emit({ ...this.state, running: false });
  }

  cancel(): void {
    this.abort?.abort();
  }

  reset(): void {
    this.run++;
    this.abort?.abort();
    this.emit(BATCH_IDLE);
  }

  dispose(): void {
    this.run++;
    this.abort?.abort();
    this.listeners.clear();
  }
}
