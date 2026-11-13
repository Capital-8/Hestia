import { describe, expect, it } from 'vitest';
import { PermissionDeniedError, pluginDataApi, pluginModelApi, type ModelPort, type PluginDataPort } from './modelPort.ts';

const port = (): ModelPort & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    read: () => ({ name: 'p' }),
    newId: (pid, prefix) => { calls.push(`id:${pid}:${prefix}`); return `${prefix}_1`; },
    apply: (pid, label, cmds) => { calls.push(`apply:${pid}:${label}:${cmds.length}`); return { ok: true, applied: cmds.length }; },
  };
};

describe('portão de permissões do modelo', () => {
  it('model.read libera a leitura; sem ela lança permission_denied', () => {
    const p = port();
    expect(pluginModelApi(p, 'dev.a.b', () => ['model.read']).read()).toEqual({ name: 'p' });
    expect(() => pluginModelApi(p, 'dev.a.b', () => []).read()).toThrow(PermissionDeniedError);
  });

  it('model.write sem model.read (dependência) é recusado', () => {
    const p = port();
    const api = pluginModelApi(p, 'dev.a.b', () => ['model.write']);
    expect(api.apply('x', [{}])).toMatchObject({ ok: false, index: -1 });
    expect(() => api.newId('w')).toThrow(/permission_denied/);
    expect(p.calls).toEqual([]);
  });

  it('com as duas, aplica e fixa o id do plugin; confere a concessão a cada chamada', () => {
    const p = port();
    let grants = ['model.read', 'model.write'];
    const api = pluginModelApi(p, 'dev.a.b', () => grants);
    expect(api.apply('Lote', [{}, {}])).toEqual({ ok: true, applied: 2 });
    expect(p.calls).toEqual(['apply:dev.a.b:Lote:2']);
    grants = [];
    expect(api.apply('Lote', [{}])).toMatchObject({ ok: false });
    expect(p.calls).toHaveLength(1);
  });

  it('plugindata.rw é exigida para o espaço de dados', () => {
    const store = new Map<string, unknown>();
    const dp: PluginDataPort = {
      get: (_p, k) => store.get(k), keys: () => [...store.keys()], set: (_p, k, v) => void store.set(k, v), delete: (_p, k) => void store.delete(k), readOnly: () => false,
    };
    expect(() => pluginDataApi(dp, 'dev.a.b', () => ['model.read']).get('k')).toThrow(PermissionDeniedError);
    const api = pluginDataApi(dp, 'dev.a.b', () => ['plugindata.rw']);
    api.set('k', 1);
    expect(api.get('k')).toBe(1);
    expect(api.keys()).toEqual(['k']);
  });
});
