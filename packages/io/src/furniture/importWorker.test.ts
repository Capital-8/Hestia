import { describe, expect, it } from 'vitest';
import { collectTransferables, extensionOf, handleWorkerMessage, runImportRequest, type WorkerInbound, type WorkerOutbound } from './importWorker';
import { importInWorker, type WorkerLike } from './importInWorker';
import { finalizeModel } from './common';
import type { ImportFn, ImportedModel } from './types';

const fakeImport: ImportFn = async (file, opts) => {
  opts?.onProgress?.(0.5, 'metade');
  if (file.name.startsWith('erro')) throw new Error('falhou de proposito');
  return finalizeModel({
    name: 'f',
    sourceFileName: file.name,
    sourceFormat: 'skp',
    defs: [
      {
        id: 'd',
        name: 'd',
        positions: new Float32Array(9),
        normals: new Float32Array(9),
        uvs: new Float32Array(0),
        indices: new Uint32Array([0, 1, 2]),
        groups: [{ start: 0, count: 3, materialIndex: 0 }],
      },
    ],
    instances: [{ defId: 'd', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }],
    materials: [{ name: 'm', color: [1, 1, 1], opacity: 1 }],
    textures: [],
    warnings: [],
  });
};

type Fake = WorkerLike & { terminated: boolean; sent: WorkerInbound[] };

/** Worker falso que roda handleWorkerMessage no mesmo processo. */
function fakeWorker(importer: ImportFn, opts: { hang?: boolean } = {}): Fake {
  const controllers = new Map<number, AbortController>();
  const w: Fake = {
    terminated: false,
    sent: [],
    onmessage: null,
    onerror: null,
    postMessage(msg) {
      w.sent.push(msg);
      if (opts.hang && msg.type === 'import') return;
      queueMicrotask(() => {
        void handleWorkerMessage(
          msg,
          (m: WorkerOutbound) => {
            if (!w.terminated) w.onmessage?.({ data: m });
          },
          controllers,
          () => Promise.resolve(importer),
        );
      });
    },
    terminate() {
      w.terminated = true;
    },
  };
  return w;
}

const bytes8 = () => new Uint8Array(8);

describe('importWorker (parte pura)', () => {
  it('extensionOf', () => {
    expect(extensionOf('Sofa.SKP')).toBe('skp');
    expect(extensionOf('semext')).toBe('');
  });
  it('collectTransferables nao repete buffers', async () => {
    const m = await fakeImport({ name: 'a.skp', bytes: new Uint8Array(4) });
    const t = collectTransferables(m);
    expect(new Set(t).size).toBe(t.length);
    expect(t.length).toBe(4);
  });
  it('runImportRequest envia progresso e resultado', async () => {
    const out: WorkerOutbound[] = [];
    await runImportRequest({ type: 'import', id: 1, name: 'a.skp', bytes: new Uint8Array(4) }, fakeImport, (m) => out.push(m));
    expect(out.map((o) => o.type)).toEqual(['progress', 'done']);
  });
  it('runImportRequest envia erro sem lancar', async () => {
    const out: WorkerOutbound[] = [];
    await runImportRequest({ type: 'import', id: 2, name: 'erro.skp', bytes: new Uint8Array(4) }, fakeImport, (m) => out.push(m));
    expect(out.at(-1)).toMatchObject({ type: 'error', message: 'falhou de proposito' });
  });
  it('formato desconhecido vira erro claro', async () => {
    const out: WorkerOutbound[] = [];
    await handleWorkerMessage({ type: 'import', id: 3, name: 'a.xyz', bytes: new Uint8Array(1) }, (m) => out.push(m), new Map(), () => null);
    expect(out[0]).toMatchObject({ type: 'error' });
  });
});

describe('importInWorker', () => {
  it('resolve com o modelo e repassa o progresso', async () => {
    const w = fakeWorker(fakeImport);
    const prog: number[] = [];
    const model: ImportedModel = await importInWorker(
      { name: 'a.skp', bytes: bytes8() },
      { workerFactory: () => w, onProgress: (f) => prog.push(f) },
    );
    expect(model.stats.triangles).toBe(1);
    expect(prog).toEqual([0.5]);
    expect(w.terminated).toBe(true);
  });
  it('envia copia por padrao e transfere com transferInput', async () => {
    const bytes = bytes8();
    const w = fakeWorker(fakeImport);
    await importInWorker({ name: 'a.skp', bytes }, { workerFactory: () => w });
    expect((w.sent[0] as { bytes: Uint8Array }).bytes).not.toBe(bytes);
    const w2 = fakeWorker(fakeImport);
    await importInWorker({ name: 'a.skp', bytes }, { workerFactory: () => w2, transferInput: true });
    expect((w2.sent[0] as { bytes: Uint8Array }).bytes).toBe(bytes);
  });
  it('propaga o erro do leitor', async () => {
    await expect(
      importInWorker({ name: 'erro.skp', bytes: bytes8() }, { workerFactory: () => fakeWorker(fakeImport) }),
    ).rejects.toThrow('falhou de proposito');
  });
  it('cancela: rejeita com AbortError e encerra o Worker', async () => {
    const w = fakeWorker(fakeImport, { hang: true });
    const ctl = new AbortController();
    const p = importInWorker({ name: 'a.skp', bytes: bytes8() }, { workerFactory: () => w, signal: ctl.signal });
    ctl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    expect(w.terminated).toBe(true);
  });
  it('ja cancelado antes de comecar', async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(
      importInWorker({ name: 'a.skp', bytes: bytes8() }, { workerFactory: () => fakeWorker(fakeImport), signal: ctl.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
