import { describe, expect, it } from 'vitest';
import type { FurnitureImportedModel, ImportInWorkerOptions } from '@hestia/io';
import { FLOW_IDLE, ImportFlow, type FlowFile, type FlowState, type ImportFn } from './importFlow.ts';
import { boxModel } from './testFixtures.ts';

const file = (name: string, size = 1000): FlowFile => ({ name, size, arrayBuffer: async () => new ArrayBuffer(8) });
const abortError = (): Error => Object.assign(new Error('cancelado'), { name: 'AbortError' });

/** Importador falso controlável: guarda a opção de progresso e deixa o teste decidir quando termina. */
function fake() {
  let opts: ImportInWorkerOptions | undefined;
  let resolve!: (m: FurnitureImportedModel) => void;
  let reject!: (e: Error) => void;
  const fn: ImportFn = (_f, o) => {
    opts = o;
    return new Promise((res, rej) => {
      resolve = res;
      reject = rej;
      o?.signal?.addEventListener('abort', () => rej(abortError()));
    });
  };
  return { fn, progress: (f: number, l: string) => opts?.onProgress?.(f, l), resolve: (m: FurnitureImportedModel) => resolve(m), reject: (e: Error) => reject(e), signal: () => opts?.signal };
}
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('fluxo de importação de móvel', () => {
  it('lendo -> importando com progresso -> pronto', async () => {
    const f = fake();
    const flow = new ImportFlow(f.fn);
    const seen: FlowState[] = [];
    flow.subscribe(() => seen.push(flow.state));
    const p = flow.start(file('mesa.glb'));
    expect(flow.state.phase).toBe('reading');
    await tick();
    expect(flow.state.phase).toBe('importing');
    f.progress(0.4, 'Lendo malhas');
    expect(flow.state.progress).toEqual({ fraction: 0.4, label: 'Lendo malhas' });
    f.resolve(boxModel());
    await p;
    expect(flow.state.phase).toBe('ready');
    expect(flow.state.model?.name).toBe('Caixa');
    expect(seen.map((s) => s.phase)).toEqual(['reading', 'importing', 'importing', 'ready']);
  });

  it('formato desconhecido: erro de formato, sem chamar o importador', async () => {
    let chamou = false;
    const flow = new ImportFlow(async () => {
      chamou = true;
      return boxModel();
    });
    await flow.start(file('foto.png'));
    expect(flow.state).toEqual({ ...FLOW_IDLE, error: { kind: 'format', ext: 'png' } });
    expect(chamou).toBe(false);
  });

  it('arquivo acima de 50 MB é recusado antes de ler', async () => {
    let leu = false;
    const flow = new ImportFlow(async () => boxModel());
    await flow.start({
      name: 'grande.skp',
      size: 60 * 1048576,
      arrayBuffer: async () => {
        leu = true;
        return new ArrayBuffer(0);
      },
    });
    expect(flow.state.error).toEqual({ kind: 'too_big', mb: 60 });
    expect(leu).toBe(false);
  });

  it('recusa do importador por vértices (modo leve) vira erro "refused"; outro erro vira "generic"', async () => {
    const f = fake();
    const flow = new ImportFlow(f.fn);
    let p = flow.start(file('a.obj'));
    await tick();
    f.reject(new Error('Bloco com 700.000 vértices. Use o modo leve (versão simplificada).'));
    await p;
    expect(flow.state.error).toEqual({ kind: 'refused' });
    p = flow.start(file('b.obj'));
    await tick();
    f.reject(new Error('Arquivo corrompido'));
    await p;
    expect(flow.state.error).toEqual({ kind: 'generic', msg: 'Arquivo corrompido' });
  });

  it('cancelar aborta o Worker, volta a ocioso e ignora o resultado tardio', async () => {
    const f = fake();
    const flow = new ImportFlow(f.fn);
    const p = flow.start(file('mesa.glb'));
    await tick();
    flow.cancel();
    expect(f.signal()?.aborted).toBe(true);
    expect(flow.state).toEqual({ ...FLOW_IDLE, error: { kind: 'cancelled' } });
    f.resolve(boxModel());
    await p;
    expect(flow.state.model).toBeNull();
    expect(flow.state.phase).toBe('idle');
  });

  it('um arquivo novo cancela o anterior', async () => {
    const f = fake();
    const flow = new ImportFlow(f.fn);
    const p1 = flow.start(file('um.glb'));
    await tick();
    const first = f.signal();
    const p2 = flow.start(file('dois.glb'));
    await tick();
    expect(first?.aborted).toBe(true);
    f.resolve(boxModel({ name: 'Dois' }));
    await Promise.all([p1, p2]);
    expect(flow.state.model?.name).toBe('Dois');
  });
});
