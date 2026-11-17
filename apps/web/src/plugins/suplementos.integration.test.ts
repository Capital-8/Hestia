/**
 * Integração ponta a ponta dos suplementos (ADR 0057, fase de integração), sem navegador real:
 * pacote .hestiapkg -> instalar -> revisar permissões -> ativar -> botão na faixa -> handler no ScriptHost -> resultado.
 * O "Worker" é um duplo no mesmo processo que roda o runtime REAL do Worker (`installWorkerRuntime`): o protocolo de
 * mensagens, o portão de permissões, os limites e o tempo máximo são os de produção.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createZip, type ZipFile } from '@hestia/io';
import { createEmptyProject, makeWall, ProjectStore } from '@hestia/model';
import { ScriptHost, installWorkerRuntime, type HostToWorker, type WorkerLike, type WorkerToHost } from '@hestia/plugin-api';
import { afterEach, describe, expect, it } from 'vitest';
import { createModelPort, setPluginInfoResolver } from './appModelPort.ts';
import { pluginRegistry, runPluginCommand } from './registry.ts';
import { MemoryKv, KvPackageStore } from './supStore.ts';
import { SupplementRuntime, formatHandlerResult, type HandlerResult, type SupNotice } from './supRuntime.ts';
import { scriptPortsFactory } from './supSink.ts';
import { requiresOf, withDeps, withoutDependents } from './supDeps.ts';
import { pluginRibbonPanels, suplementosTab } from '../ui/ribbon/pluginRibbon.ts';
import { TABS } from '../ui/ribbon/tabs.ts';

const RAIZ = path.resolve(import.meta.dirname, '../../../..');

/** Worker no mesmo processo que roda o runtime real do Worker de suplemento. */
function inMemoryWorker(counter?: { n: number }): WorkerLike {
  if (counter) counter.n += 1;
  const scope = { postMessage: (_m: unknown) => undefined, onmessage: null as ((e: { data: unknown }) => void) | null };
  let dead = false;
  const w: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage: (m) => { if (!dead) setTimeout(() => scope.onmessage?.({ data: m }), 0); },
    terminate: () => { dead = true; },
  };
  scope.postMessage = (m) => { if (!dead) setTimeout(() => w.onmessage?.({ data: m }), 0); };
  installWorkerRuntime(scope, {
    loadModule: (code) => import(/* @vite-ignore */ `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`) as Promise<Record<string, unknown>>,
  });
  return w;
}

function pastaDeExemplo(nome: string): ZipFile[] {
  const base = path.join(RAIZ, 'plugins-exemplo', nome);
  const out: ZipFile[] = [];
  const visita = (dir: string): void => {
    for (const n of readdirSync(dir).sort()) {
      const p = path.join(dir, n);
      if (statSync(p).isDirectory()) visita(p);
      else out.push({ path: path.relative(base, p).split(path.sep).join('/'), data: new Uint8Array(readFileSync(p)) });
    }
  };
  visita(base);
  return out;
}

const pacoteDeExemplo = (nome: string): Uint8Array => createZip(pastaDeExemplo(nome));

function manifesto(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    manifestVersion: 2, id: 'dev.teste.sup', name: 'Suplemento de teste', version: '1.0.0', hestiaApi: '1.0', runtime: 'script', entry: 'main.js',
    capabilities: ['model.read'], ...over,
  };
}

const pacote = (m: Record<string, unknown>, code: string): Uint8Array => createZip([{ path: 'manifest.json', data: JSON.stringify(m) }, { path: 'main.js', data: code }]);

/** Projeto com 2 portas e 1 janela, para o exemplo "contador-portas". */
function projetoComAberturas(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }) });
  const ab = (id: string, kind: 'door' | 'window', typeId: string, offset: number) =>
    ({ type: 'addOpening' as const, opening: { id, kind, typeId, hostId: 'w1', offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  s.exec(ab('d1', 'door', 'ot_p80', 2));
  s.exec(ab('d2', 'door', 'ot_p80', 5));
  s.exec(ab('j1', 'window', 'ot_jcomb_fc180x120', 8));
  return s;
}

interface Ctx {
  rt: SupplementRuntime;
  store: ProjectStore;
  results: HandlerResult[];
  notices: SupNotice[];
  workers: { n: number };
  detach: () => void;
}

/** Monta o núcleo com o registro GLOBAL do app (o botão da faixa e `runPluginCommand` leem dele), como em produção. */
function montar(opts: { store?: ProjectStore; kv?: MemoryKv } = {}): Ctx {
  const store = opts.store ?? projetoComAberturas();
  const { model, data } = createModelPort(() => store);
  const results: HandlerResult[] = [];
  const notices: SupNotice[] = [];
  const workers = { n: 0 };
  const rt = new SupplementRuntime({
    store: new KvPackageStore(opts.kv ?? new MemoryKv()),
    createWorker: () => inMemoryWorker(workers),
    registry: pluginRegistry,
    model, data,
    setInfoResolver: setPluginInfoResolver,
    defer: (fn) => fn(),
    showResult: (r) => results.push(r),
    notify: (n) => notices.push(n),
  });
  return { rt, store, results, notices, workers, detach: rt.attachExecutor() };
}

const vivos: Ctx[] = [];
const novo = (o?: Parameters<typeof montar>[0]): Ctx => { const c = montar(o); vivos.push(c); return c; };

afterEach(() => {
  for (const c of vivos.splice(0)) c.detach();
  for (const id of pluginRegistry.pluginIds()) pluginRegistry.unregister(id);
  setPluginInfoResolver((p) => ({ name: p, dataSchema: 1, version: '' }));
});

const ID_CONTADOR = 'dev.hestia.contador-portas';

describe('exemplo contador-portas: instalar -> revisar -> ativar -> botão -> handler', () => {
  it('fluxo completo com os arquivos de plugins-exemplo/', async () => {
    const c = novo();
    // 1. Instalar: valida e guarda, mas NÃO ativa, NÃO concede e NÃO cria Worker.
    const r = await c.rt.install({ kind: 'package', bytes: pacoteDeExemplo('contador-portas') });
    expect(r).toMatchObject({ ok: true, id: ID_CONTADOR, requested: ['model.read', 'ui.commands', 'ui.ribbon'], needsGrant: ['model.read', 'ui.commands', 'ui.ribbon'], replaced: false });
    expect(c.workers.n).toBe(0);
    expect(pluginRegistry.has(ID_CONTADOR)).toBe(false);
    expect(pluginRibbonPanels()).toEqual([]);
    const linha = c.rt.snapshot().find((x) => x.id === ID_CONTADOR);
    expect(linha).toMatchObject({ enabled: false, grants: [], state: 'disabled' });

    // 2. Ativar sem concessão fica aguardando permissões; nada aparece.
    await c.rt.setEnabled(ID_CONTADOR, true);
    expect(c.rt.snapshot()[0]).toMatchObject({ state: 'needs-grant' });
    expect(pluginRibbonPanels()).toEqual([]);

    // 3. Revisão: o usuário concede as três permissões.
    const ok = await c.rt.approve(ID_CONTADOR, ['model.read', 'ui.commands', 'ui.ribbon']);
    expect(ok).toEqual({ ok: true, state: 'active' });
    expect(c.rt.snapshot()[0]).toMatchObject({ state: 'active', enabled: true, grants: ['model.read', 'ui.commands', 'ui.ribbon'] });

    // 4. O botão aparece na aba Suplementos (painel contribuído pelo manifesto).
    const painéis = pluginRibbonPanels();
    expect(painéis).toHaveLength(1);
    expect(painéis[0]!.items[0]).toMatchObject({ kind: 'plugin', command: `${ID_CONTADOR}:contar`, label: { pt: 'Contar portas', en: 'Count doors' }, icon: 'door' });

    // 5. Clicar no botão roda o handler no ScriptHost e o resultado chega ao diálogo.
    runPluginCommand(`${ID_CONTADOR}:contar`);
    await c.rt.settled();
    expect(c.results).toHaveLength(1);
    expect(c.results[0]).toMatchObject({ pluginId: ID_CONTADOR, pluginName: 'Contador de portas' });
    expect(c.results[0]!.message).toEqual({ pt: 'O projeto tem 2 porta(s) e 1 janela(s).', en: 'The project has 2 door(s) and 1 window(s).' });
    expect(c.notices).toEqual([]);
    // Só leu: o projeto não mudou e nada entrou no histórico além das aberturas do cenário.
    expect(c.store.undoLabel).not.toMatch(/Contador/);
  });

  it('desativar retira o botão; ativar de novo o devolve', async () => {
    const c = novo();
    await c.rt.install({ kind: 'package', bytes: pacoteDeExemplo('contador-portas') });
    await c.rt.approve(ID_CONTADOR, ['model.read', 'ui.commands', 'ui.ribbon']);
    expect(pluginRibbonPanels()).toHaveLength(1);
    await c.rt.setEnabled(ID_CONTADOR, false);
    expect(pluginRibbonPanels()).toEqual([]);
    await c.rt.setEnabled(ID_CONTADOR, true);
    expect(pluginRibbonPanels()).toHaveLength(1);
    await c.rt.uninstall(ID_CONTADOR);
    expect(pluginRibbonPanels()).toEqual([]);
    expect(c.rt.snapshot()).toEqual([]);
  });

  it('concessão parcial ativa só o concedido: sem ui.ribbon o botão não aparece, mas o comando sim', async () => {
    const c = novo();
    await c.rt.install({ kind: 'package', bytes: pacoteDeExemplo('contador-portas') });
    await c.rt.approve(ID_CONTADOR, ['model.read', 'ui.commands']);
    expect(pluginRibbonPanels()).toEqual([]);
    expect(pluginRegistry.commands().map((x) => x.qid)).toEqual([`${ID_CONTADOR}:contar`]);
    runPluginCommand(`${ID_CONTADOR}:contar`);
    await c.rt.settled();
    expect(c.results).toHaveLength(1);
  });
});

describe('exemplo materiais-exemplo (declarativo)', () => {
  it('instala e ativa sem criar Worker nem executar código', async () => {
    const c = novo();
    const r = await c.rt.install({ kind: 'package', bytes: pacoteDeExemplo('materiais-exemplo') });
    expect(r).toMatchObject({ ok: true, id: 'dev.hestia.materiais-exemplo', requested: ['content.materials'] });
    expect(await c.rt.approve('dev.hestia.materiais-exemplo', ['content.materials'])).toEqual({ ok: true, state: 'active' });
    expect(pluginRegistry.has('dev.hestia.materiais-exemplo')).toBe(true);
    expect(c.workers.n).toBe(0);
  });
});

describe('revisão de permissões: nada é concedido sem o usuário', () => {
  it('recusa concessão sem a dependência e permissão que o manifesto não pediu', async () => {
    const c = novo();
    await c.rt.install({ kind: 'package', bytes: pacoteDeExemplo('contador-portas') });
    expect(await c.rt.approve(ID_CONTADOR, ['ui.ribbon'])).toMatchObject({ ok: false, code: 'missing_dependency' });
    expect(await c.rt.approve(ID_CONTADOR, ['model.write'])).toMatchObject({ ok: false, code: 'not_requested' });
    expect(c.rt.snapshot()[0]).toMatchObject({ grants: [], enabled: false });
    expect(pluginRegistry.has(ID_CONTADOR)).toBe(false);
  });

  it('atualização com permissão nova mantém as antigas e pede só a nova', async () => {
    const c = novo();
    await c.rt.install({ kind: 'package', bytes: pacote(manifesto(), 'export async function ola() { return "oi"; }') });
    await c.rt.approve('dev.teste.sup', ['model.read']);
    const r = await c.rt.install({ kind: 'package', bytes: pacote(manifesto({ version: '1.1.0', capabilities: ['model.read', 'plugindata.rw'] }), 'export async function ola() { return "oi"; }') });
    expect(r).toMatchObject({ ok: true, replaced: true, needsGrant: ['plugindata.rw'] });
    expect(c.rt.snapshot()[0]).toMatchObject({ version: '1.1.0', grants: ['model.read'] });
  });

  it('manifesto com hestiaApi 2.0 é recusado (o host aceita 1.x) e nada fica instalado', async () => {
    const c = novo();
    const r = await c.rt.install({ kind: 'package', bytes: pacote(manifesto({ hestiaApi: '2.0' }), 'export async function ola() {}') });
    expect(r).toMatchObject({ ok: false, code: 'manifest_invalid' });
    expect(c.rt.snapshot()).toEqual([]);
  });

  it('pacote com .wasm ou sem manifest.json é recusado com código estável', async () => {
    const c = novo();
    expect(await c.rt.install({ kind: 'package', bytes: createZip([{ path: 'x.txt', data: 'oi' }]) })).toMatchObject({ ok: false, code: 'no_manifest' });
    expect(await c.rt.install({ kind: 'package', bytes: createZip([{ path: 'manifest.json', data: '{}' }, { path: 'a.wasm', data: 'x' }]) })).toMatchObject({ ok: false, code: 'wasm' });
  });

  it('instalar de pasta (desenvolvimento) usa as mesmas regras', async () => {
    const c = novo();
    const files = pastaDeExemplo('contador-portas').map((f) => ({ path: f.path, data: typeof f.data === 'string' ? new TextEncoder().encode(f.data) : f.data }));
    expect(await c.rt.install({ kind: 'folder', files })).toMatchObject({ ok: true, id: ID_CONTADOR });
    expect(c.rt.snapshot()[0]).toMatchObject({ source: 'folder' });
  });
});

describe('permissões negadas pelo host', () => {
  it('script sem model.write: a porta nem existe no ctx, o handler falha e o projeto não muda', async () => {
    const c = novo();
    const code = `export async function gravar(ctx) { const r = await ctx.model.apply('x', []); return String(r.ok); }`;
    await c.rt.install({ kind: 'package', bytes: pacote(manifesto({ capabilities: ['model.read', 'model.write'] }), code) });
    await c.rt.approve('dev.teste.sup', ['model.read']); // concede só a leitura
    const antes = c.store.version;
    const r = await c.rt.runHandler('dev.teste.sup', 'gravar');
    expect(r).toMatchObject({ ok: false, code: 'script_error' });
    expect(c.store.version).toBe(antes);
    expect(c.notices).toEqual([{ kind: 'handler-error', pluginName: 'Suplemento de teste' }]);
    expect(c.rt.snapshot()[0]!.state).toBe('active'); // um erro isolado não desativa
  });

  it('mensagem forjada de porta sem concessão é negada pelo ScriptHost e pelo portão do host', async () => {
    const store = projetoComAberturas();
    const { model, data } = createModelPort(() => store);
    const respostas: Array<Extract<HostToWorker, { t: 'reply' }>> = [];
    // Worker malicioso: ignora o `ctx` e fala direto com o host pedindo escrita, leitura e dados sem permissão.
    const forjado = (): WorkerLike => {
      const w: WorkerLike = {
        onmessage: null, onerror: null, terminate: () => undefined,
        postMessage: (m) => {
          const msg = m as HostToWorker;
          const send = (x: WorkerToHost): void => { setTimeout(() => w.onmessage?.({ data: x }), 0); };
          if (msg.t === 'load') send({ t: 'loaded', ok: true, exports: ['atacar'] });
          else if (msg.t === 'reply') respostas.push(msg);
          else if (msg.t === 'call') {
            send({ t: 'port', id: 1, method: 'model.apply', args: ['x', [{ type: 'deleteElements', ids: ['w1'] }]] });
            send({ t: 'port', id: 2, method: 'data.set', args: ['k', 1] });
            send({ t: 'port', id: 3, method: 'model.newId', args: ['w'] });
            send({ t: 'port', id: 4, method: 'model.read', args: [] });
            setTimeout(() => send({ t: 'result', id: msg.id, ok: true, value: null }), 30);
          }
        },
      };
      return w;
    };
    const grants = ['model.read'];
    const host = new ScriptHost({
      pluginId: 'dev.teste.sup', code: '', limits: { timeoutMs: 1000, memoryMiB: 64, maxCommandsPerAction: 10 }, grants,
      ports: scriptPortsFactory(model, data)('dev.teste.sup', grants), createWorker: forjado, log: () => undefined, onFailed: () => undefined,
    });
    await host.call('atacar');
    const por = (id: number) => respostas.find((r) => r.id === id)!;
    expect(por(1)).toMatchObject({ ok: false, error: 'permission_denied: model.write' });
    expect(por(2)).toMatchObject({ ok: false, error: 'permission_denied: plugindata.rw' });
    expect(por(3)).toMatchObject({ ok: false, error: 'permission_denied: model.write' });
    expect(por(4)).toMatchObject({ ok: true }); // a única concedida
    expect(store.project.elements['w1']).toBeDefined(); // o lote forjado não rodou
  });

  it('o portão da fase C também confere model.read dentro de model.write (dependência)', () => {
    const store = projetoComAberturas();
    const { model, data } = createModelPort(() => store);
    const ports = scriptPortsFactory(model, data)('dev.teste.sup', ['model.write']); // write sem read: inválido
    expect(ports.modelApply?.('x', [])).toMatchObject({ ok: false, error: 'permission_denied: model.read' });
    expect(() => ports.modelRead?.()).toThrow(/permission_denied/);
  });
});

describe('script que trava ou quebra: falha isolada, o app continua', () => {
  it('estourou o tempo 3 vezes em 60 s = falhou, contribuições retiradas, outro suplemento segue', async () => {
    const c = novo();
    const m = manifesto({ capabilities: ['model.read', 'ui.commands'], limits: { timeoutMs: 40 }, contributes: { commands: [{ id: 'travar', title: 'Travar', run: { type: 'handler', ref: 'travar' } }] } });
    await c.rt.install({ kind: 'package', bytes: pacote(m, 'export async function travar() { await new Promise(() => {}); }') });
    await c.rt.install({ kind: 'package', bytes: pacoteDeExemplo('contador-portas') });
    await c.rt.approve('dev.teste.sup', ['model.read', 'ui.commands']);
    await c.rt.approve(ID_CONTADOR, ['model.read', 'ui.commands', 'ui.ribbon']);
    expect(pluginRegistry.has('dev.teste.sup')).toBe(true);

    for (let i = 0; i < 3; i += 1) {
      runPluginCommand('dev.teste.sup:travar');
      await c.rt.settled();
    }
    expect(c.rt.snapshot().find((x) => x.id === 'dev.teste.sup')).toMatchObject({ state: 'failed' });
    expect(pluginRegistry.has('dev.teste.sup')).toBe(false); // o botão/comando sumiu
    expect(c.notices.filter((n) => n.kind === 'handler-error')).toHaveLength(3);
    expect(c.notices.some((n) => n.kind === 'failed')).toBe(true);
    expect(c.rt.log.entries('dev.teste.sup').some((e) => e.level === 'error' && /timeout/.test(e.text))).toBe(true);

    // O app segue: o outro suplemento continua funcionando e o projeto continua editável.
    runPluginCommand(`${ID_CONTADOR}:contar`);
    await c.rt.settled();
    expect(c.results).toHaveLength(1);
    c.store.exec({ type: 'addWall', wall: makeWall({ id: 'w9', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 5 }, b: { x: 4, y: 5 } }) });
    expect(c.store.project.elements['w9']).toBeDefined();
    // Reativar manualmente depois de falhar é possível (o usuário decide).
    await c.rt.setEnabled('dev.teste.sup', true);
  });

  it('exceção do script no meio de uma ação vira aviso, nunca propaga ao chamador', async () => {
    const c = novo();
    await c.rt.install({ kind: 'package', bytes: pacote(manifesto(), 'export async function quebrar() { throw new Error("boom"); }') });
    await c.rt.approve('dev.teste.sup', ['model.read']);
    const r = await c.rt.runHandler('dev.teste.sup', 'quebrar');
    expect(r).toMatchObject({ ok: false, code: 'script_error', message: 'boom' });
    const r2 = await c.rt.runHandler('dev.teste.sup', 'inexistente');
    expect(r2.ok).toBe(false);
    expect(await c.rt.runHandler('dev.nao.existe', 'x')).toMatchObject({ ok: false, code: 'stopped' });
  });
});

describe('desfazer desfaz o lote do plugin (um passo)', () => {
  const parede = JSON.stringify(makeWall({ id: 'x', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }));
  const code = `
    export async function criar(ctx, valores) {
      const n = valores.n;
      const comandos = [];
      for (let i = 0; i < n; i += 1) {
        const id = await ctx.model.newId('w');
        const wall = JSON.parse('${parede.replace(/\\/g, '\\\\')}');
        wall.id = id; wall.a = { x: 0, y: 10 + i }; wall.b = { x: 3, y: 10 + i };
        comandos.push({ type: 'addWall', wall });
      }
      const r = await ctx.model.apply('Criar paredes', comandos);
      return { message: String(r.ok ? r.applied : r.error) };
    }`;
  const m = (): Record<string, unknown> => manifesto({ name: 'Gerador', capabilities: ['model.read', 'model.write', 'ui.commands'] });

  it('N paredes viram UM passo "Gerador: Criar paredes"; Desfazer remove todas', async () => {
    const c = novo();
    await c.rt.install({ kind: 'package', bytes: pacote(m(), code) });
    await c.rt.approve('dev.teste.sup', ['model.read', 'model.write', 'ui.commands']);
    const antes = Object.keys(c.store.project.elements).length;
    const r = await c.rt.runHandler('dev.teste.sup', 'criar', { n: 3 });
    expect(r).toMatchObject({ ok: true });
    expect(c.results.at(-1)!.message).toBe('3');
    expect(Object.keys(c.store.project.elements).length).toBe(antes + 3);
    expect(c.store.undoLabel).toBe('Gerador: Criar paredes');
    c.store.undo(); // UM passo desfaz o lote inteiro
    expect(Object.keys(c.store.project.elements).length).toBe(antes);
    expect(c.store.undoLabel).not.toBe('Gerador: Criar paredes');
    c.store.redo();
    expect(Object.keys(c.store.project.elements).length).toBe(antes + 3);
  });

  it('lote com id inventado é recusado inteiro: nada muda e nada entra no histórico', async () => {
    const c = novo();
    const ruim = `export async function criar(ctx) { const w = JSON.parse('${parede.replace(/\\/g, '\\\\')}'); w.id = 'inventado'; const r = await ctx.model.apply('x', [{ type: 'addWall', wall: w }]); return { message: r.ok ? 'ok' : r.error }; }`;
    await c.rt.install({ kind: 'package', bytes: pacote(m(), ruim) });
    await c.rt.approve('dev.teste.sup', ['model.read', 'model.write', 'ui.commands']);
    const v = c.store.version;
    await c.rt.runHandler('dev.teste.sup', 'criar');
    expect(c.results.at(-1)!.message).toMatch(/não foi emitido pelo host/);
    expect(c.store.version).toBe(v);
  });
});

describe('persistência: concessões e estado sobrevivem a reiniciar o app', () => {
  it('reabrir carrega os habilitados (após o defer) e respeita as concessões gravadas', async () => {
    const kv = new MemoryKv();
    const a = novo({ kv });
    await a.rt.install({ kind: 'package', bytes: pacoteDeExemplo('contador-portas') });
    await a.rt.install({ kind: 'package', bytes: pacoteDeExemplo('materiais-exemplo') });
    await a.rt.approve(ID_CONTADOR, ['model.read', 'ui.commands', 'ui.ribbon']); // o de materiais fica instalado e NÃO concedido
    a.detach();
    for (const id of pluginRegistry.pluginIds()) pluginRegistry.unregister(id); // "fechou o app"

    // Registro corrompido no armazenamento não impede nada.
    kv.map.set('lixo', { manifest: null } as never);

    // "Abriu o app": runtime novo sobre o mesmo armazenamento; só `boot` carrega, e o defer é respeitado.
    let agendado: (() => void) | null = null;
    const b = montar({ kv });
    vivos.push(b);
    const rt2 = new SupplementRuntime({
      store: new KvPackageStore(kv), createWorker: () => inMemoryWorker(), registry: pluginRegistry, ...createModelPort(() => b.store),
      defer: (fn) => { agendado = fn; }, showResult: (r) => b.results.push(r), notify: (n) => b.notices.push(n),
    });
    const bootando = rt2.boot();
    expect(pluginRegistry.has(ID_CONTADOR)).toBe(false); // nada carregou antes do defer (primeira pintura)
    expect(agendado).not.toBeNull();
    agendado!();
    await bootando;
    expect(pluginRegistry.has(ID_CONTADOR)).toBe(true);
    expect(pluginRibbonPanels()).toHaveLength(1);
    const linhas = rt2.snapshot();
    expect(linhas.find((x) => x.id === ID_CONTADOR)).toMatchObject({ state: 'active', grants: ['model.read', 'ui.commands', 'ui.ribbon'], enabled: true });
    expect(linhas.find((x) => x.id === 'dev.hestia.materiais-exemplo')).toMatchObject({ state: 'disabled', grants: [], enabled: false });
    expect(pluginRegistry.has('dev.hestia.materiais-exemplo')).toBe(false);
    rt2.attachExecutor()();
  });

  it('um suplemento quebrado no armazenamento vira failed e os outros carregam', async () => {
    const kv = new MemoryKv();
    const a = novo({ kv });
    await a.rt.install({ kind: 'package', bytes: pacoteDeExemplo('contador-portas') });
    await a.rt.approve(ID_CONTADOR, ['model.read', 'ui.commands', 'ui.ribbon']);
    a.detach();
    for (const id of pluginRegistry.pluginIds()) pluginRegistry.unregister(id);
    const quebrado = await kv.get(ID_CONTADOR);
    await kv.put('dev.quebrado.x', { ...quebrado!, manifest: { ...quebrado!.manifest, id: 'dev.quebrado.x', name: 'Quebrado' }, files: {} });
    const b = novo({ kv });
    await b.rt.boot();
    const linhas = b.rt.snapshot();
    expect(linhas.find((x) => x.id === 'dev.quebrado.x')).toMatchObject({ state: 'failed' });
    expect(linhas.find((x) => x.id === ID_CONTADOR)).toMatchObject({ state: 'active' });
  });
});

describe('espaço de dados do suplemento (plugindata.rw)', () => {
  it('grava e lê no próprio espaço, com nome do suplemento no desfazer', async () => {
    const c = novo();
    const code = `export async function salvar(ctx, v) { await ctx.data.set('ultima', v); return { message: JSON.stringify(await ctx.data.get('ultima')) }; }`;
    await c.rt.install({ kind: 'package', bytes: pacote(manifesto({ name: 'Dados', capabilities: ['plugindata.rw'] }), code) });
    await c.rt.approve('dev.teste.sup', ['plugindata.rw']);
    await c.rt.runHandler('dev.teste.sup', 'salvar', { nx: 4 });
    expect(c.results.at(-1)!.message).toBe('{"nx":4}');
    expect(c.store.undoLabel).toBe('Dados: gravar dados');
  });
});

describe('aba Suplementos na faixa', () => {
  it('sempre traz o gerenciador (instalar suplemento) depois das ferramentas externas, sem mexer na aba fixa', () => {
    const fixa = TABS.find((x) => x.id === 'suplementos')!;
    const tab = suplementosTab(fixa, []);
    expect(tab.panels.map((p) => p.id)).toEqual(['sup-externas', 'sup-gerenciar']);
    expect(tab.panels[1]!.items[0]).toMatchObject({ kind: 'action', action: 'pluginManager' });
    expect(fixa.panels.map((p) => p.id)).toEqual(['sup-externas']);
  });
});

describe('utilitários', () => {
  it('formatHandlerResult aceita texto, {title,message} e JSON; trata dado não confiável', () => {
    expect(formatHandlerResult(null)).toBeNull();
    expect(formatHandlerResult('oi')).toEqual({ message: 'oi' });
    expect(formatHandlerResult({ title: 'T', message: { pt: 'a', en: 'b' } })).toEqual({ title: 'T', message: { pt: 'a', en: 'b' } });
    expect(formatHandlerResult({ message: 5 })).toEqual({ message: '{\n  "message": 5\n}' });
    expect(formatHandlerResult('x'.repeat(9000))!.message).toHaveLength(4000);
  });

  it('dependências de permissão: marcar marca as exigidas, desmarcar tira as dependentes', () => {
    const req = ['model.read', 'ui.commands', 'ui.ribbon'];
    expect(requiresOf('ui.ribbon')).toEqual(['ui.commands']);
    const s = withDeps(new Set(), 'ui.ribbon', req);
    expect([...s].sort()).toEqual(['ui.commands', 'ui.ribbon']);
    expect([...withoutDependents(s, 'ui.commands')]).toEqual([]);
  });
});
