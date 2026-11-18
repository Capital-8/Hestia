import { describe, expect, it } from 'vitest';
import { buildAssetOffThread, type BuildWorkerLike } from './buildAssetOffThread.ts';
import { buildAssetFromModel, initialMaterialEdits } from './importModel.ts';
import { boxModel } from './testFixtures.ts';

const opts = (m = boxModel()) => ({ name: 'Mesa', factor: 1, materials: initialMaterialEdits(m) });

/** Worker falso: roda a mesma função que o Worker real e devolve pelo `onmessage`, como ele faria. */
function fakeWorker(fail = false): BuildWorkerLike & { terminated: boolean } {
  const w: BuildWorkerLike & { terminated: boolean } = {
    terminated: false,
    onmessage: null,
    onerror: null,
    terminate() {
      w.terminated = true;
    },
    postMessage(req) {
      setTimeout(() => {
        if (fail) w.onmessage?.({ data: { id: req.id, ok: false, message: 'quebrou' } });
        else w.onmessage?.({ data: { id: req.id, ok: true, asset: buildAssetFromModel(req.model, req.opts, 'fa_teste') } });
      }, 0);
    },
  };
  return w;
}

describe('montagem do bloco fora da thread da interface', () => {
  it('devolve o asset montado pelo Worker e o encerra', async () => {
    const w = fakeWorker();
    const a = await buildAssetOffThread(boxModel(), opts(), () => w);
    expect(a.id).toBe('fa_teste');
    expect(a.stats.triangles).toBe(12);
    expect(w.terminated).toBe(true);
  });

  it('erro no Worker rejeita com a mensagem', async () => {
    const w = fakeWorker(true);
    await expect(buildAssetOffThread(boxModel(), opts(), () => w)).rejects.toThrow('quebrou');
    expect(w.terminated).toBe(true);
  });

  it('sem Worker no ambiente roda na própria thread', async () => {
    const a = await buildAssetOffThread(boxModel(), opts(), null);
    expect(a.name).toBe('Mesa');
  });
});
