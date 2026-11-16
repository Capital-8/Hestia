/**
 * Gerenciador unificado (fase J): lista de pacote + processo externo, busca/filtro, log, espaço de dados, concessões
 * depois da instalação e atualização que mantém concessões. Roda sem navegador (mesmo Worker de produção, no processo).
 */
import { createZip } from '@hestia/io';
import { createEmptyProject, ProjectStore } from '@hestia/model';
import { installWorkerRuntime, type PluginView, type WorkerLike } from '@hestia/plugin-api';
import { afterEach, describe, expect, it } from 'vitest';
import { createModelPort, setPluginInfoResolver } from './appModelPort.ts';
import { PluginLog } from './pluginLog.ts';
import { pluginRegistry } from './registry.ts';
import { buildItems, countByState, externalState, filterItems, filterLog, formatBytes, formatLog } from './supManage.ts';
import { SupplementRuntime, type SupplementRow } from './supRuntime.ts';
import { KvPackageStore, MemoryKv } from './supStore.ts';

function inMemoryWorker(): WorkerLike {
  const scope = { postMessage: (_m: unknown) => undefined, onmessage: null as ((e: { data: unknown }) => void) | null };
  let dead = false;
  const w: WorkerLike = {
    onmessage: null, onerror: null,
    postMessage: (m) => { if (!dead) setTimeout(() => scope.onmessage?.({ data: m }), 0); },
    terminate: () => { dead = true; },
  };
  scope.postMessage = (m) => { if (!dead) setTimeout(() => w.onmessage?.({ data: m }), 0); };
  installWorkerRuntime(scope, {
    loadModule: (code) => import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`) as Promise<Record<string, unknown>>,
  });
  return w;
}

const ID = 'dev.teste.gerente';
const manifesto = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  manifestVersion: 2, id: ID, name: 'Gerente de teste', version: '1.0.0', hestiaApi: '1.0', runtime: 'script', entry: 'main.js',
  author: 'Fulana', dataSchema: 1, capabilities: ['model.read', 'plugindata.rw'], ...over,
});
const pacote = (m: Record<string, unknown>, code = 'export async function ping() { return "ok"; }'): Uint8Array =>
  createZip([{ path: 'manifest.json', data: JSON.stringify(m) }, { path: 'main.js', data: code }]);

function montar(): { rt: SupplementRuntime; store: ProjectStore; workers: WorkerLike[] } {
  const store = new ProjectStore(createEmptyProject());
  const { model, data } = createModelPort(() => store);
  const workers: WorkerLike[] = [];
  const rt = new SupplementRuntime({
    store: new KvPackageStore(new MemoryKv()),
    createWorker: () => { const w = inMemoryWorker(); workers.push(w); return w; },
    registry: pluginRegistry, model, data, log: new PluginLog(),
    setInfoResolver: setPluginInfoResolver, defer: (fn) => fn(),
  });
  return { rt, store, workers };
}

afterEach(() => {
  for (const id of pluginRegistry.pluginIds()) pluginRegistry.unregister(id);
  setPluginInfoResolver((p) => ({ name: p, dataSchema: 1, version: '' }));
});

const ext = (over: Partial<PluginView> = {}): PluginView => ({
  key: 'renderer-local', label: 'Renderizador arquitetônico', endpoint: { host: '127.0.0.1', port: 47800 }, enabled: false, grants: [], suggested: ['scene.read'],
  state: 'absent', granted: [], pending: [], cameraMode: 'follow-hestia', attempt: 0, ...over,
} as PluginView);

describe('lista unificada, busca e filtro', () => {
  it('mapeia o estado do processo externo para os estados do gerenciador', () => {
    expect(externalState(ext())).toBe('disabled');
    expect(externalState(ext({ enabled: true }))).toBe('needs-grant');
    expect(externalState(ext({ enabled: true, grants: ['scene.read'], state: 'connected' }))).toBe('active');
    expect(externalState(ext({ enabled: true, grants: ['scene.read'], state: 'incompatible' }))).toBe('failed');
  });

  it('junta pacotes e externos, busca sem acento e filtra por estado', async () => {
    const { rt } = montar();
    await rt.install({ kind: 'package', bytes: pacote(manifesto({ description: 'Calcula áreas de ambiente' })) });
    const items = buildItems(rt.snapshot(), [ext()]);
    expect(items.map((i) => i.kind).sort()).toEqual(['external', 'package']);
    expect(filterItems(items, { query: 'AREAS', state: 'all' }).map((i) => i.kind)).toEqual(['package']);
    expect(filterItems(items, { query: 'fulana', state: 'all' })).toHaveLength(1);
    expect(filterItems(items, { query: 'renderizador', state: 'all' }).map((i) => i.kind)).toEqual(['external']);
    expect(filterItems(items, { query: '', state: 'disabled' })).toHaveLength(2);
    expect(filterItems(items, { query: 'zzz', state: 'all' })).toEqual([]);
    expect(countByState(items)).toMatchObject({ all: 2, disabled: 2 });
  });

  it('a linha do pacote traz autor, dataSchema e instante de instalação', async () => {
    const { rt } = montar();
    await rt.install({ kind: 'package', bytes: pacote(manifesto({ dataSchema: 3 })) });
    const row = rt.snapshot()[0] as SupplementRow;
    expect(row).toMatchObject({ author: 'Fulana', dataSchema: 3, source: 'package', state: 'disabled' });
    expect(row.installedAt).toBeGreaterThan(0);
  });
});

describe('log por suplemento', () => {
  const base = [
    { at: Date.UTC(2026, 10, 14, 10, 0, 0), level: 'info' as const, text: 'ativado' },
    { at: Date.UTC(2026, 10, 14, 10, 0, 1), level: 'error' as const, text: 'Falhou: estouro de tempo' },
  ];
  it('filtra por nível e por texto, e formata para copiar em UTC', () => {
    expect(filterLog(base, { level: 'error', text: '' })).toHaveLength(1);
    expect(filterLog(base, { level: 'all', text: 'ESTOURO' })).toHaveLength(1);
    expect(filterLog(base, { level: 'warn', text: '' })).toEqual([]);
    expect(formatLog(base)).toBe('2026-11-14T10:00:00.000Z [info] ativado\n2026-11-14T10:00:01.000Z [error] Falhou: estouro de tempo');
  });
  it('limpar o log esvazia só o suplemento pedido', () => {
    const log = new PluginLog();
    log.append('a', 'info', 'x');
    log.append('b', 'info', 'y');
    log.clear('a');
    expect(log.entries('a')).toEqual([]);
    expect(log.entries('b')).toHaveLength(1);
  });
});

describe('concessões depois da instalação', () => {
  it('revoga e concede de novo, reiniciando o Worker; recusa o que não foi pedido ou sem dependência', async () => {
    const { rt, workers } = montar();
    await rt.install({ kind: 'package', bytes: pacote(manifesto({ capabilities: ['model.read', 'model.write', 'plugindata.rw'] })) });
    expect(await rt.approve(ID, ['model.read', 'model.write', 'plugindata.rw'])).toMatchObject({ ok: true, state: 'active' });
    const antes = workers.length;
    expect(await rt.setGrants(ID, ['model.read', 'plugindata.rw'])).toMatchObject({ ok: true, state: 'active' });
    expect(workers.length).toBeGreaterThan(antes);
    expect(rt.snapshot()[0]!.grants).toEqual(['model.read', 'plugindata.rw']);
    expect(await rt.setGrants(ID, ['model.write'])).toEqual({ ok: false, code: 'missing_dependency', detail: 'model.write -> model.read' });
    expect(await rt.setGrants(ID, ['ui.tools'])).toMatchObject({ ok: false, code: 'not_requested' });
    expect(await rt.setGrants('nao.existe.x', [])).toEqual({ ok: false, code: 'unknown' });
    // Revogar tudo de um suplemento ativo o deixa aguardando permissão.
    expect(await rt.setGrants(ID, [])).toMatchObject({ ok: true, state: 'needs-grant' });
    // Desativado: conceder não ativa.
    await rt.setEnabled(ID, false);
    expect(await rt.setGrants(ID, ['model.read'])).toMatchObject({ ok: true, state: 'disabled' });
    expect(rt.snapshot()[0]).toMatchObject({ enabled: false, grants: ['model.read'] });
  });
});

describe('atualizar mantendo concessões', () => {
  it('mantém as concessões, pede só as novas e reinicia com o código novo', async () => {
    const { rt } = montar();
    await rt.install({ kind: 'package', bytes: pacote(manifesto()) });
    await rt.approve(ID, ['model.read']);
    const novoPacote = pacote(manifesto({ version: '1.1.0', capabilities: ['model.read', 'plugindata.rw'] }), 'export async function ping() { return "novo"; }');
    const r = await rt.update(ID, { kind: 'package', bytes: novoPacote });
    expect(r).toMatchObject({ ok: true, replaced: true, previousVersion: '1.0.0', needsGrant: ['plugindata.rw'] });
    expect(rt.snapshot()[0]).toMatchObject({ version: '1.1.0', grants: ['model.read'], state: 'active', enabled: true });
    expect(await rt.runHandler(ID, 'ping')).toMatchObject({ ok: true, value: 'novo' });
    expect(rt.log.entries(ID).some((e) => e.text.includes('atualizado de 1.0.0 para 1.1.0'))).toBe(true);
  });

  it('recusa pacote de outro suplemento sem gravar nada', async () => {
    const { rt } = montar();
    await rt.install({ kind: 'package', bytes: pacote(manifesto()) });
    const r = await rt.update(ID, { kind: 'package', bytes: pacote(manifesto({ id: 'dev.teste.outro' })) });
    expect(r).toMatchObject({ ok: false, code: 'id_mismatch' });
    expect(rt.snapshot().map((x) => x.id)).toEqual([ID]);
  });
});

describe('falha, reativar e desinstalar', () => {
  it('suplemento que falha mostra o motivo e o Reativar o ativa de novo', async () => {
    const { rt } = montar();
    await rt.install({ kind: 'package', bytes: pacote(manifesto(), 'export function activate() { throw new Error("boom"); }') });
    await rt.approve(ID, ['model.read']);
    expect(rt.snapshot()[0]).toMatchObject({ state: 'failed' });
    expect(rt.snapshot()[0]!.detail).toContain('boom');
    // Reativar com o mesmo código falha de novo, mas sem lançar; o app segue.
    await rt.setEnabled(ID, true);
    expect(rt.snapshot()[0]).toMatchObject({ state: 'failed' });
  });

  it('desinstalar remove pacote e concessões, mas o conteúdo e os dados no projeto permanecem', async () => {
    const { rt, store } = montar();
    await rt.install({ kind: 'package', bytes: pacote(manifesto({ capabilities: ['model.read', 'model.write', 'plugindata.rw'] }), 'export async function grava(ctx) { await ctx.data.set("k", { a: 1 }); }') });
    await rt.approve(ID, ['model.read', 'model.write', 'plugindata.rw']);
    await rt.runHandler(ID, 'grava');
    expect(rt.dataSpace(ID).entries.map((e) => e.key)).toEqual(['k']);
    await rt.uninstall(ID);
    expect(rt.snapshot()).toEqual([]);
    expect(store.project.plugins?.data?.[ID]?.values.k).toEqual({ a: 1 });
  });
});

describe('espaço de dados (somente leitura)', () => {
  it('mede em bytes UTF-8, soma e respeita somente leitura quando o dataSchema do projeto é maior', async () => {
    const { rt, store } = montar();
    await rt.install({ kind: 'package', bytes: pacote(manifesto({ dataSchema: 1 }), 'export async function grava(ctx) { await ctx.data.set("nome", "ação"); await ctx.data.set("n", 7); }') });
    await rt.approve(ID, ['model.read', 'plugindata.rw']);
    await rt.runHandler(ID, 'grava');
    const info = rt.dataSpace(ID);
    expect(info.entries).toEqual([{ key: 'n', bytes: 1, preview: '7' }, { key: 'nome', bytes: 8, preview: '"ação"' }]);
    expect(info.totalBytes).toBe(9);
    expect(info.limitBytes).toBe(1024 * 1024);
    expect(info.readOnly).toBe(false);
    // Projeto salvo por uma versão MAIS NOVA do suplemento (schema 5 > 1 instalado): espaço somente leitura.
    store.exec({ type: 'setPluginData', pluginId: ID, key: 'z', value: 1 as never, schema: 5, version: '9.0.0' });
    expect(rt.dataSpace(ID).readOnly).toBe(true);
  });

  it('formata tamanhos', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KiB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MiB');
  });
});
