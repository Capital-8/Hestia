import { createZip } from '@hestia/io';
import { installWorkerRuntime, type WorkerLike } from '@hestia/plugin-api';
import { describe, expect, it, vi } from 'vitest';
import { Installer, MemoryPackageStore } from './installer.ts';
import { PluginLoader, type ContributionSink } from './loader.ts';
import { PLUGIN_LOG_CAPACITY, PluginLog } from './pluginLog.ts';

function inMemoryWorker(): WorkerLike {
  const scope = { postMessage: (_m: unknown) => undefined, onmessage: null as ((e: { data: unknown }) => void) | null };
  let dead = false;
  const w: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage: (m) => {
      if (!dead) setTimeout(() => scope.onmessage?.({ data: m }), 0);
    },
    terminate: () => {
      dead = true;
    },
  };
  scope.postMessage = (m) => {
    if (!dead) setTimeout(() => w.onmessage?.({ data: m }), 0);
  };
  installWorkerRuntime(scope, {
    loadModule: (code) => import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`) as Promise<Record<string, unknown>>,
  });
  return w;
}

function manifest(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { manifestVersion: 2, id: 'dev.exemplo.t', name: 'T', version: '1.0.0', hestiaApi: '2.0', runtime: 'script', entry: 'main.js', capabilities: ['model.read'], ...over };
}

function zip(m: Record<string, unknown>, code = 'export function ola() { return "oi"; }'): Uint8Array {
  return createZip([{ path: 'manifest.json', data: JSON.stringify(m) }, { path: 'main.js', data: code }]);
}

function setup(sink?: ContributionSink) {
  const store = new MemoryPackageStore();
  const log = new PluginLog();
  const changes: string[] = [];
  const loader = new PluginLoader({
    store,
    log,
    createWorker: inMemoryWorker,
    defer: (fn) => fn(),
    onChange: (id, s) => changes.push(`${id}:${s}`),
    ...(sink ? { contributions: sink } : {}),
  });
  return { store, log, loader, installer: new Installer({ store }), changes };
}

describe('Installer', () => {
  it('instala sem executar e lista permissões pedidas', async () => {
    const { installer, store, loader } = setup();
    const r = await installer.installBytes(zip(manifest()));
    expect(r).toMatchObject({ ok: true, id: 'dev.exemplo.t', requested: ['model.read'], needsGrant: ['model.read'], replaced: false });
    expect((await store.get('dev.exemplo.t'))?.enabled).toBe(false);
    expect(loader.state('dev.exemplo.t')).toBeUndefined();
  });
  it('recusa pacote inválido e não instala', async () => {
    const { installer, store } = setup();
    const r = await installer.installBytes(createZip([{ path: 'manifest.json', data: '{}' }]));
    expect(r.ok).toBe(false);
    expect(await store.list()).toHaveLength(0);
  });
  it('recusa quando o validador de manifesto da Fase B recusa', async () => {
    const store = new MemoryPackageStore();
    const r = await new Installer({ store, validateManifest: () => 'capacidade desconhecida' }).installBytes(zip(manifest()));
    expect(r).toMatchObject({ ok: false, code: 'manifest_invalid' });
  });
  it('atualização mantém concessões e pede só as novas', async () => {
    const { installer, loader, store } = setup();
    await installer.installBytes(zip(manifest()));
    await loader.setGrants('dev.exemplo.t', ['model.read']);
    const r = await installer.installBytes(zip(manifest({ version: '1.1.0', capabilities: ['model.read', 'model.write'] })));
    expect(r).toMatchObject({ ok: true, replaced: true, needsGrant: ['model.write'] });
    expect((await store.get('dev.exemplo.t'))?.grants).toEqual(['model.read']);
  });
});

describe('PluginLoader', () => {
  it('sem concessão fica needs-grant; com concessão ativa e executa script', async () => {
    const { installer, loader } = setup();
    await installer.installBytes(zip(manifest()));
    expect(await loader.activate('dev.exemplo.t')).toBe('needs-grant');
    expect(await loader.setGrants('dev.exemplo.t', ['model.read'])).toBe('active');
    expect(await loader.call('dev.exemplo.t', 'ola')).toBe('oi');
  });

  it('declarativo registra contribuições (stub) sem executar código e desativar as retira', async () => {
    const unregister = vi.fn();
    const register = vi.fn(() => unregister);
    const { store, loader } = setup({ register });
    const raw = { manifestVersion: 2, id: 'dev.exemplo.d', name: 'D', version: '1.0.0', hestiaApi: '2.0', runtime: 'declarative', capabilities: [], contributes: { commands: [] } };
    await store.put('dev.exemplo.d', {
      manifest: { id: 'dev.exemplo.d', name: 'D', version: '1.0.0', runtime: 'declarative', capabilities: [], dataSchema: 1, raw },
      files: {},
      installedAt: 0,
      enabled: false,
      grants: [],
      source: 'package',
    });
    expect(await loader.activate('dev.exemplo.d')).toBe('active');
    expect(register).toHaveBeenCalledWith('dev.exemplo.d', raw, []);
    await loader.deactivate('dev.exemplo.d');
    expect(unregister).toHaveBeenCalled();
    expect(loader.state('dev.exemplo.d')).toBe('disabled');
  });

  it('script que lança em activate vira failed e o app segue', async () => {
    const unregister = vi.fn();
    const { installer, loader, log, store } = setup({ register: () => unregister });
    await installer.installBytes(zip(manifest({ capabilities: [] }), 'export function activate() { throw new Error("quebrou"); }'));
    expect(await loader.activate('dev.exemplo.t')).toBe('failed');
    expect(unregister).toHaveBeenCalled();
    expect(log.entries('dev.exemplo.t').some((e) => e.text.includes('quebrou'))).toBe(true);
    await expect(loader.call('dev.exemplo.t', 'ola')).rejects.toMatchObject({ code: 'stopped' });
    expect(await store.get('dev.exemplo.t')).toBeDefined();
  });

  it('pacote corrompido na abertura do app: loadAll não lança e marca failed', async () => {
    const { store, loader } = setup();
    await store.put('dev.exemplo.x', {
      manifest: { id: 'dev.exemplo.x', name: 'X', version: '1.0.0', runtime: 'script', entry: 'main.js', capabilities: [], dataSchema: 1, raw: {} },
      files: {}, // entrada ausente
      installedAt: 0,
      enabled: true,
      grants: [],
      source: 'package',
    });
    await store.put('dev.exemplo.y', { ...(await store.get('dev.exemplo.x'))!, manifest: { id: 'dev.exemplo.y', name: 'Y', version: '1.0.0', runtime: 'declarative', capabilities: [], dataSchema: 1, raw: {} }, enabled: false });
    (store as unknown as { map: Map<string, unknown> }).map.set('lixo', { manifest: null });
    await expect(loader.loadAll()).resolves.toBeUndefined();
    expect(loader.state('dev.exemplo.x')).toBe('failed');
    expect(loader.state('dev.exemplo.y')).toBe('disabled');
  });

  it('loadAll com armazenamento quebrado não lança', async () => {
    const { store, loader } = setup();
    store.list = () => Promise.reject(new Error('disco'));
    await expect(loader.loadAll()).resolves.toBeUndefined();
  });

  it('uninstall remove o pacote', async () => {
    const { installer, loader, store } = setup();
    await installer.installBytes(zip(manifest({ capabilities: [] })));
    await loader.activate('dev.exemplo.t');
    await loader.uninstall('dev.exemplo.t');
    expect(await store.get('dev.exemplo.t')).toBeUndefined();
    expect(loader.state('dev.exemplo.t')).toBeUndefined();
  });
});

describe('PluginLog', () => {
  it('mantém o anel de 500 entradas e corta o texto em 500 caracteres', () => {
    const log = new PluginLog(() => 1);
    for (let i = 0; i < PLUGIN_LOG_CAPACITY + 20; i += 1) log.append('p', 'info', `m${i}`);
    const e = log.entries('p');
    expect(e).toHaveLength(PLUGIN_LOG_CAPACITY);
    expect(e[0]!.text).toBe('m20');
    log.append('p', 'warn', 'x'.repeat(900));
    expect(log.entries('p').at(-1)!.text).toHaveLength(500);
    expect(log.entries('outro')).toEqual([]);
  });
});
