/**
 * Fase F ponta a ponta, sem navegador: pacote de `plugins-exemplo/csv-paredes` -> instalar -> aprovar permissões ->
 * exportar (handler e modelo declarativo) e importar (prévia, confirmação, um passo de Desfazer).
 * O "Worker" é o duplo no mesmo processo que roda o runtime REAL do Worker (protocolo, permissões e limites de produção).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createZip, type ZipFile } from '@hestia/io';
import { createEmptyProject, makeWall, ProjectStore } from '@hestia/model';
import { installWorkerRuntime, type WorkerLike } from '@hestia/plugin-api';
import { afterEach, describe, expect, it } from 'vitest';
import { createModelPort, setPluginInfoResolver } from './appModelPort.ts';
import type { IoOutcome } from './ioBridge.ts';
import { pluginRegistry, runPluginAction } from './registry.ts';
import { KvPackageStore, MemoryKv } from './supStore.ts';
import { SupplementRuntime, type SupNotice } from './supRuntime.ts';

const RAIZ = path.resolve(import.meta.dirname, '../../../..');
const ID = 'dev.hestia.csv-paredes';
const TODAS = ['model.read', 'model.write', 'io.import', 'io.export'];

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

function pasta(nome: string): ZipFile[] {
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

const pacoteComMain = (main: string): Uint8Array =>
  createZip(pasta('csv-paredes').map((f) => (f.path === 'main.js' ? { path: f.path, data: main } : f)));

const csv = (s: string): Uint8Array => new TextEncoder().encode(s);

interface Entregue { name: string; text: string; mime: string }
interface Ctx { rt: SupplementRuntime; store: ProjectStore; entregues: Entregue[]; outcomes: IoOutcome[]; notices: SupNotice[]; detach: () => void }

function novoCtx(): Ctx {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }) });
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 10, y: 0 }, b: { x: 10, y: 5.5 } }) });
  const { model, data } = createModelPort(() => store);
  const entregues: Entregue[] = [];
  const outcomes: IoOutcome[] = [];
  const notices: SupNotice[] = [];
  const rt = new SupplementRuntime({
    store: new KvPackageStore(new MemoryKv()),
    createWorker: () => inMemoryWorker(),
    registry: pluginRegistry, model, data,
    setInfoResolver: setPluginInfoResolver,
    defer: (fn) => fn(),
    notify: (n) => notices.push(n),
    deliver: async (name, bytes, mime) => { entregues.push({ name, text: new TextDecoder().decode(bytes), mime }); return `salvo ${name}`; },
    onIo: (o) => outcomes.push(o),
  });
  const c: Ctx = { rt, store, entregues, outcomes, notices, detach: rt.attachExecutor() };
  vivos.push(c);
  return c;
}

const vivos: Ctx[] = [];
afterEach(() => {
  for (const c of vivos.splice(0)) c.detach();
  for (const id of pluginRegistry.pluginIds()) pluginRegistry.unregister(id);
  setPluginInfoResolver((p) => ({ name: p, dataSchema: 1, version: '' }));
});

async function ativo(c: Ctx, bytes?: Uint8Array): Promise<void> {
  const r = await c.rt.install({ kind: 'package', bytes: bytes ?? createZip(pasta('csv-paredes')) });
  expect(r.ok).toBe(true);
  expect(await c.rt.approve(ID, TODAS)).toEqual({ ok: true, state: 'active' });
}

const paredes = (s: ProjectStore): number => Object.values(s.project.elements).filter((e) => e.kind === 'wall').length;

describe('exportar (suplemento csv-paredes)', () => {
  it('handler recebe cópia do modelo e o host entrega o CSV com nome e mime', async () => {
    const c = novoCtx();
    await ativo(c);
    expect(pluginRegistry.exporters().map((x) => x.qid)).toEqual([`${ID}:paredes-csv`, `${ID}:paredes-modelo`]);
    const o = await c.rt.io.exportWith(ID, 'paredes-csv');
    expect(o).toMatchObject({ kind: 'exported', fileName: 'Projeto-sem-titulo.csv' });
    expect(c.entregues).toHaveLength(1);
    expect(c.entregues[0]).toMatchObject({ mime: 'text/csv', text: 'id;x1;y1;x2;y2\nw1;0;0;10;0\nw2;10;0;10;5.5\n' });
    expect(c.notices).toEqual([]);
  });

  it('exportador declarativo por template: sem código do suplemento', async () => {
    const c = novoCtx();
    await ativo(c);
    await c.rt.io.exportWith(ID, 'paredes-modelo');
    expect(c.entregues[0]!.text).toBe('id;x1;y1;x2;y2\nw1;0;0;10;0\nw2;10;0;10;5.5\n');
  });

  it('a ação `exporter` (faixa/busca de comandos) passa pelo executor', async () => {
    const c = novoCtx();
    await ativo(c);
    runPluginAction(ID, { type: 'exporter', ref: 'paredes-csv' });
    await c.rt.settled();
    expect(c.entregues).toHaveLength(1);
    expect(c.outcomes.at(-1)).toMatchObject({ kind: 'exported' });
  });

  it('erro do handler vira resultado `error`, o app segue e o modelo não muda', async () => {
    const c = novoCtx();
    await ativo(c, pacoteComMain('export function exportarParedes() { throw new Error("quebrou"); }\nexport function importarParedes() { return []; }'));
    const antes = JSON.stringify(c.store.project);
    const o = await c.rt.io.exportWith(ID, 'paredes-csv');
    expect(o).toMatchObject({ kind: 'error', code: 'handler' });
    expect(c.notices.map((n) => n.kind)).toContain('handler-error');
    expect(c.entregues).toEqual([]);
    expect(JSON.stringify(c.store.project)).toBe(antes);
  });

  it('o handler não consegue alterar o projeto vivo pela cópia', async () => {
    const c = novoCtx();
    await ativo(c, pacoteComMain('export function exportarParedes(_c, { project }) { try { project.name = "X"; project.elements.w1.a.x = 99; } catch (e) {} return String(project.elements.w1.a.x); }\nexport function importarParedes() { return []; }'));
    await c.rt.io.exportWith(ID, 'paredes-csv');
    expect(c.store.project.elements.w1).toMatchObject({ a: { x: 0 } });
    expect(c.entregues[0]!.text).toBe('0');
  });

  it('nome e extensão inválidos devolvidos pelo handler são recusados', async () => {
    const c = novoCtx();
    await ativo(c, pacoteComMain('export function exportarParedes() { return { data: "x", name: "../../etc/passwd.csv" }; }\nexport function importarParedes() { return []; }'));
    expect(await c.rt.io.exportWith(ID, 'paredes-csv')).toMatchObject({ kind: 'error', code: 'io_bad_name' });
    expect(c.entregues).toEqual([]);
  });

  it('tipo de retorno inválido e exportador inexistente', async () => {
    const c = novoCtx();
    await ativo(c, pacoteComMain('export function exportarParedes() { return { x: 1 }; }\nexport function importarParedes() { return []; }'));
    expect(await c.rt.io.exportWith(ID, 'paredes-csv')).toMatchObject({ kind: 'error', code: 'io_bad_bytes' });
    expect(await c.rt.io.exportWith(ID, 'nao-existe')).toMatchObject({ kind: 'error', code: 'denied' });
  });

  it('suplemento desativado não exporta', async () => {
    const c = novoCtx();
    await ativo(c);
    await c.rt.setEnabled(ID, false);
    expect(pluginRegistry.exporters()).toEqual([]);
    expect(await c.rt.io.exportWith(ID, 'paredes-csv')).toMatchObject({ kind: 'error', code: 'denied' });
  });
});

describe('importar (suplemento csv-paredes)', () => {
  const ARQ = 'x1;y1;x2;y2\n0;0;4;0\n4;0;4;3\nlinha ruim\n1;1;1;1\n';

  it('prévia, confirmação e UM passo de Desfazer', async () => {
    const c = novoCtx();
    await ativo(c);
    expect(pluginRegistry.importers().map((x) => x.qid)).toEqual([`${ID}:paredes-csv`]);
    const antes = paredes(c.store);
    const rotulo = c.store.undoLabel;

    const o = await c.rt.io.prepareImport(ID, 'paredes-csv', { name: 'entrada.csv', bytes: csv(ARQ) });
    expect(o).toMatchObject({ kind: 'prepared', created: 2 });
    // Nada foi aplicado ainda.
    expect(paredes(c.store)).toBe(antes);
    expect(c.store.undoLabel).toBe(rotulo);
    const p = c.rt.io.snapshot();
    expect(p).toMatchObject({ pluginId: ID, fileName: 'entrada.csv', preview: { commands: 2, created: 2, byType: { addWall: 2 } } });
    expect(p!.report).toMatch(/3 linha/);

    const r = c.rt.io.confirmImport();
    expect(r).toMatchObject({ kind: 'imported', created: 2, applied: 2 });
    expect(c.rt.io.snapshot()).toBeNull();
    expect(paredes(c.store)).toBe(antes + 2);
    expect(c.store.undoLabel).toMatch(/^CSV de paredes: importar entrada\.csv/);

    c.store.undo(); // um único passo desfaz as duas paredes
    expect(paredes(c.store)).toBe(antes);
    expect(c.store.undoLabel).toBe(rotulo);
  });

  it('cancelar não aplica nada', async () => {
    const c = novoCtx();
    await ativo(c);
    const antes = paredes(c.store);
    await c.rt.io.prepareImport(ID, 'paredes-csv', { name: 'a.csv', bytes: csv(ARQ) });
    expect(c.rt.io.cancelImport()).toMatchObject({ kind: 'cancelled' });
    expect(c.rt.io.snapshot()).toBeNull();
    expect(c.rt.io.confirmImport()).toBeNull();
    expect(paredes(c.store)).toBe(antes);
  });

  it('extensão errada e arquivo grande demais são recusados antes do handler', async () => {
    const c = novoCtx();
    await ativo(c);
    expect(await c.rt.io.prepareImport(ID, 'paredes-csv', { name: 'a.txt', bytes: csv(ARQ) })).toMatchObject({ kind: 'error', code: 'io_bad_extension' });
    const grande = { name: 'g.csv', bytes: { byteLength: 64 * 1024 * 1024 + 1 } as unknown as Uint8Array };
    expect(await c.rt.io.prepareImport(ID, 'paredes-csv', grande)).toMatchObject({ kind: 'error', code: 'io_too_large' });
    expect(c.rt.io.snapshot()).toBeNull();
  });

  it('arquivo sem nenhuma linha válida: erro do handler ou lote vazio, sem prévia', async () => {
    const c = novoCtx();
    await ativo(c);
    expect(await c.rt.io.prepareImport(ID, 'paredes-csv', { name: 'a.csv', bytes: csv('nada\n') })).toMatchObject({ kind: 'error', code: 'io_no_commands' });
    expect(c.rt.io.snapshot()).toBeNull();
  });

  it('handler que lança: erro isolado, app e suplemento seguem', async () => {
    const c = novoCtx();
    await ativo(c, pacoteComMain('export function exportarParedes() { return "x"; }\nexport function importarParedes() { throw new Error("falhou"); }'));
    expect(await c.rt.io.prepareImport(ID, 'paredes-csv', { name: 'a.csv', bytes: csv(ARQ) })).toMatchObject({ kind: 'error', code: 'handler' });
    expect(c.rt.snapshot()[0]!.state).toBe('active');
    expect(await c.rt.io.exportWith(ID, 'paredes-csv')).toMatchObject({ kind: 'exported' });
  });

  it('lote com comando fora da lista branca é recusado de forma atômica na confirmação', async () => {
    const c = novoCtx();
    const main = 'export function exportarParedes() { return "x"; }\nexport async function importarParedes(ctx) { const id = await ctx.model.newId("w"); return [{ type: "deleteLevel", id: "lv_0" }, { type: "deleteElements", ids: [id] }]; }';
    await ativo(c, pacoteComMain(main));
    const antes = JSON.stringify(c.store.project);
    expect(await c.rt.io.prepareImport(ID, 'paredes-csv', { name: 'a.csv', bytes: csv(ARQ) })).toMatchObject({ kind: 'prepared' });
    expect(c.rt.io.confirmImport()).toMatchObject({ kind: 'error', code: 'apply' });
    expect(JSON.stringify(c.store.project)).toBe(antes);
  });

  it('ids inventados pelo suplemento são recusados', async () => {
    const c = novoCtx();
    const main = 'export function exportarParedes() { return "x"; }\nexport function importarParedes() { return [{ type: "addWall", wall: { id: "inventado", kind: "wall" } }]; }';
    await ativo(c, pacoteComMain(main));
    await c.rt.io.prepareImport(ID, 'paredes-csv', { name: 'a.csv', bytes: csv(ARQ) });
    expect(c.rt.io.confirmImport()).toMatchObject({ kind: 'error', code: 'apply' });
    expect(paredes(c.store)).toBe(2);
  });

  it('a ação `importer` pede o arquivo à interface e prepara a prévia', async () => {
    const c = novoCtx();
    await ativo(c);
    const rt2 = c.rt;
    const o = await rt2.io.run(ID, { type: 'importer', ref: 'paredes-csv' }, async (ext) => {
      expect(ext).toEqual(['csv']);
      return { name: 'b.csv', bytes: csv('0;0;2;0\n') };
    });
    expect(o).toMatchObject({ kind: 'prepared', created: 1 });
    expect(c.outcomes.at(-1)).toMatchObject({ kind: 'prepared' });
    // Usuário cancelou o seletor: nada acontece.
    c.rt.io.cancelImport();
    expect(await rt2.io.run(ID, { type: 'importer', ref: 'paredes-csv' }, async () => null)).toBeNull();
  });
});

describe('permissões', () => {
  it('sem io.import/io.export concedidos, o registro não expõe importador nem exportador', async () => {
    const c = novoCtx();
    await c.rt.install({ kind: 'package', bytes: createZip(pasta('csv-paredes')) });
    await c.rt.approve(ID, ['model.read']);
    expect(pluginRegistry.importers()).toEqual([]);
    expect(pluginRegistry.exporters()).toEqual([]);
    expect(await c.rt.io.prepareImport(ID, 'paredes-csv', { name: 'a.csv', bytes: csv('0;0;1;1\n') })).toMatchObject({ kind: 'error', code: 'denied' });
  });

  it('só io.export (com model.read): exporta, mas não importa', async () => {
    const c = novoCtx();
    await c.rt.install({ kind: 'package', bytes: createZip(pasta('csv-paredes')) });
    expect(await c.rt.approve(ID, ['model.read', 'io.export'])).toEqual({ ok: true, state: 'active' });
    expect(pluginRegistry.exporters()).toHaveLength(2);
    expect(pluginRegistry.importers()).toEqual([]);
    expect(await c.rt.io.exportWith(ID, 'paredes-modelo')).toMatchObject({ kind: 'exported' });
  });

  it('revogar model.write depois do preview impede a confirmação', async () => {
    const c = novoCtx();
    await ativo(c);
    await c.rt.io.prepareImport(ID, 'paredes-csv', { name: 'a.csv', bytes: csv('0;0;2;0\n') });
    await c.rt.approve(ID, ['model.read', 'io.export']);
    expect(c.rt.io.confirmImport()).toMatchObject({ kind: 'error', code: 'denied' });
    expect(paredes(c.store)).toBe(2);
  });
});
