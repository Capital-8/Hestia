import { describe, expect, it } from 'vitest';
import type { FurnitureAsset } from '@hestia/model';
import { BatchImport } from './batchImport.ts';
import type { FlowFile, ImportFn } from './importFlow.ts';
import { buildAssetFromModel } from './importModel.ts';
import { boxModel } from './testFixtures.ts';

const file = (name: string, size = 10): FlowFile => ({ name, size, arrayBuffer: async () => new ArrayBuffer(size) });

describe('importação de vários arquivos', () => {
  it('um erro não aborta os outros; cada arquivo bom vira um bloco; dimensões na unidade escolhida', async () => {
    const importFn: ImportFn = async (f) => {
      if (f.name === 'quebra.glb') throw new Error('arquivo corrompido');
      return { ...boxModel(), name: f.name.replace('.glb', ''), sourceFileName: f.name };
    };
    const added: FurnitureAsset[] = [];
    const b = new BatchImport(importFn, async (m, o) => buildAssetFromModel(m, o), (a) => added.push(a));
    await b.start([file('a.glb'), file('quebra.glb'), file('foto.png'), file('c.glb')], { unit: 'm', up: 'auto' });
    const s = b.getState();
    expect(s.running).toBe(false);
    expect(s.items.map((i) => i.status)).toEqual(['done', 'error', 'error', 'done']);
    expect(s.items[1]!.error).toEqual({ kind: 'generic', msg: 'arquivo corrompido' });
    expect(s.items[2]!.error).toEqual({ kind: 'format', ext: 'png' });
    expect(added.map((a) => a.name)).toEqual(['a', 'c']);
    expect(s.items[0]!.triangles).toBe(12);
    expect(s.items[0]!.dims).toEqual([expect.closeTo(0.8, 6), expect.closeTo(0.4, 6), expect.closeTo(0.5, 6)]);
  });

  it('unidade cm do lote: 0,8 m do leitor viram 0,008 m', async () => {
    const importFn: ImportFn = async (f) => ({ ...boxModel(), sourceFileName: f.name });
    const b = new BatchImport(importFn, async (m, o) => buildAssetFromModel(m, o), () => undefined);
    await b.start([file('a.glb')], { unit: 'cm', up: 'auto' });
    expect(b.getState().items[0]!.dims![0]).toBeCloseTo(0.008, 6);
  });

  it('cancelar pula os que faltam', async () => {
    const ref: { b?: BatchImport } = {};
    const importFn: ImportFn = async (f) => {
      if (f.name === 'a.glb') ref.b?.cancel();
      return { ...boxModel(), sourceFileName: f.name };
    };
    const added: FurnitureAsset[] = [];
    const b = new BatchImport(importFn, async (m, o) => buildAssetFromModel(m, o), (a) => added.push(a));
    ref.b = b;
    await b.start([file('a.glb'), file('b.glb')], { unit: 'm', up: 'auto' });
    expect(b.getState().items.map((i) => i.status)).toEqual(['skipped', 'skipped']);
    expect(added).toHaveLength(0);
  });
});
