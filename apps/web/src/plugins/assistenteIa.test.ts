/**
 * Ponta a ponta da fase I (IA com prévia) com o suplemento de exemplo "assistente-ia" (sem IA real): pacote -> instalar ->
 * permissões -> diálogo -> handler devolve `{ proposal }` -> ensaio e prévia -> "Aplicar" -> um passo de Desfazer.
 * Também cobre a prévia genérica (`BatchPreview`) com propostas inválidas e a garantia de que nada é aplicado sem o clique.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createZip, type ZipFile } from '@hestia/io';
import { createEmptyProject, ProjectStore, wallsOnLevel } from '@hestia/model';
import { installWorkerRuntime, type WorkerLike } from '@hestia/plugin-api';
import { afterEach, describe, expect, it } from 'vitest';
import { createModelPort, setPluginInfoResolver } from './appModelPort.ts';
import { BatchPreview, parseProposal, type BatchOutcome } from './batchPreview.ts';
import { pluginRegistry, runPluginAction } from './registry.ts';
import { SupplementRuntime } from './supRuntime.ts';
import { KvPackageStore, MemoryKv } from './supStore.ts';

const RAIZ = path.resolve(import.meta.dirname, '../../../..');
const ID = 'dev.hestia.assistente-ia';
const TODAS = ['model.read', 'model.write', 'ui.commands', 'ui.ribbon', 'ui.dialogs'];

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

const paredes = (s: ProjectStore): number => wallsOnLevel(s.project, 'lv_0').length;

function montar() {
  const store = new ProjectStore(createEmptyProject());
  const { model, data } = createModelPort(() => store);
  const saidas: BatchOutcome[] = [];
  const rt = new SupplementRuntime({
    store: new KvPackageStore(new MemoryKv()),
    createWorker: inMemoryWorker,
    registry: pluginRegistry,
    model, data,
    setInfoResolver: setPluginInfoResolver,
    defer: (fn) => fn(),
    batch: { version: () => store.version, undo: () => store.undo(), onOutcome: (o) => saidas.push(o) },
  });
  return { store, rt, saidas, detach: rt.attachExecutor() };
}

const vivos: Array<ReturnType<typeof montar>> = [];
afterEach(() => {
  for (const c of vivos.splice(0)) c.detach();
  for (const id of pluginRegistry.pluginIds()) pluginRegistry.unregister(id);
  setPluginInfoResolver((p) => ({ name: p, dataSchema: 1, version: '' }));
});

async function instalar() {
  const c = montar();
  vivos.push(c);
  expect(await c.rt.install({ kind: 'package', bytes: createZip(pastaDeExemplo('assistente-ia')) })).toMatchObject({ ok: true, id: ID });
  expect(await c.rt.approve(ID, TODAS)).toMatchObject({ ok: true, state: 'active' });
  return c;
}

const pedir = async (c: Awaited<ReturnType<typeof instalar>>, frase: string): Promise<void> => {
  runPluginAction(ID, { type: 'handler', ref: 'interpretar' }, { frase });
  await c.rt.settled();
};

describe('assistente-ia: frase -> proposta -> ensaio e prévia -> Aplicar -> Desfazer', () => {
  it('"sala 4x5" gera uma proposta; NADA muda até o clique em Aplicar; a prévia conta 4 criados', async () => {
    const c = await instalar();
    const antes = paredes(c.store);
    const versao = c.store.version;
    await pedir(c, 'sala 4x5');
    const st = c.rt.batch!.snapshot();
    expect(st.pending).toMatchObject({ pluginId: ID, label: 'Sala 4 x 5 m', rehearsal: { ok: true, commands: 4, created: 4, changed: 0, deleted: 0, errors: [] } });
    expect(c.saidas.map((o) => o.kind)).toEqual(['proposed']);
    expect(paredes(c.store)).toBe(antes); // o ensaio roda numa cópia
    expect(c.store.version).toBe(versao); // e não toca no histórico
    expect(c.store.undoLabel).toBeFalsy();
  });

  it('Aplicar grava as 4 paredes como UM passo de Desfazer com o nome do plugin; desfazer da prévia volta ao estado anterior', async () => {
    const c = await instalar();
    const antes = paredes(c.store);
    await pedir(c, 'sala 3,5 x 4');
    expect(c.rt.batch!.confirm()).toMatchObject({ kind: 'applied', created: 4, changed: 0, deleted: 0 });
    expect(paredes(c.store)).toBe(antes + 4);
    expect(c.store.undoLabel).toBe('Assistente (exemplo de IA): Sala 3.5 x 4 m');
    const xs = wallsOnLevel(c.store.project, 'lv_0').flatMap((w) => [w.a.x, w.b.x]);
    expect(Math.max(...xs)).toBeCloseTo(3.5, 6);
    expect(c.rt.batch!.canUndo()).toBe(true);
    expect(c.rt.batch!.undo()).toMatchObject({ kind: 'undone' });
    expect(paredes(c.store)).toBe(antes); // UM passo desfez tudo
    expect(c.rt.batch!.undo()).toBeNull();
  });

  it('cancelar não aplica nada; confirmar sem proposta não faz nada', async () => {
    const c = await instalar();
    const antes = paredes(c.store);
    await pedir(c, 'sala 4x5');
    expect(c.rt.batch!.cancel()).toMatchObject({ kind: 'cancelled' });
    expect(c.rt.batch!.confirm()).toBeNull();
    expect(paredes(c.store)).toBe(antes);
  });

  it('frase que a regra não entende vira mensagem comum (sem prévia, sem alteração)', async () => {
    const c = await instalar();
    await pedir(c, 'faça uma casa bonita');
    expect(c.rt.batch!.snapshot().pending).toBeNull();
    expect(c.saidas).toEqual([]);
    expect(paredes(c.store)).toBe(0);
  });

  it('o desfazer da aplicação é recusado se o projeto mudou depois dela', async () => {
    const c = await instalar();
    await pedir(c, 'sala 4x5');
    c.rt.batch!.confirm();
    const w = wallsOnLevel(c.store.project, 'lv_0')[0]!;
    c.store.exec({ type: 'updateElements', ids: [w.id], patch: { comments: 'editado' } });
    expect(c.rt.batch!.canUndo()).toBe(false);
    expect(c.rt.batch!.undo()).toBeNull();
  });
});

describe('BatchPreview genérico: nada de atalho', () => {
  function geral() {
    const store = new ProjectStore(createEmptyProject());
    const { model } = createModelPort(() => store);
    const saidas: BatchOutcome[] = [];
    let write = true;
    const b = new BatchPreview({ model, canWrite: () => write, version: () => store.version, undo: () => store.undo(), onOutcome: (o) => saidas.push(o) });
    const wall = (id: string) => ({ type: 'addWall', wall: { id, kind: 'wall', typeId: Object.keys(store.project.wallTypes)[0], levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, baseOffset: 0, topLevelId: null, height: 2.8, topOffset: 0, attachBottomToFloor: false, attachTopToFloor: false, attachTopToRoof: false, locationLine: 'wallCenter', flipped: false, noJoinStart: false, noJoinEnd: false, joinStart: { kind: 'butt', flip: false }, joinEnd: { kind: 'butt', flip: false }, sag: 0, topProfile: null, mark: '', comments: '' } });
    return { store, model, b, saidas, wall, setWrite: (v: boolean) => { write = v; } };
  }

  it('só a chave `proposal` vira prévia; comandos soltos no resultado nunca são aplicados', () => {
    const g = geral();
    expect(g.b.offer(ID, 'X', [g.wall('w_x')])).toBeNull();
    expect(g.b.offer(ID, 'X', { commands: [g.wall('w_x')] })).toBeNull();
    expect(parseProposal({ proposal: { commands: 'não' } })).toBeNull();
    expect(g.store.version).toBe(0);
    expect(g.b.snapshot().pending).toBeNull();
  });

  it('id inventado pelo suplemento: a prévia mostra o erro, "Aplicar" é recusado e o projeto fica intacto', () => {
    const g = geral();
    const o = g.b.offer(ID, 'X', { proposal: { label: 'ruim', commands: [g.wall('w_inventado')] } });
    expect(o).toMatchObject({ kind: 'proposed' });
    const p = g.b.snapshot().pending!;
    expect(p.rehearsal.ok).toBe(false);
    expect(p.rehearsal.errors[0]).toMatchObject({ index: 0 });
    expect(p.rehearsal.errors[0]!.message).toMatch(/não foi emitido pelo host/);
    expect(g.b.confirm()).toMatchObject({ kind: 'error' });
    expect(wallsOnLevel(g.store.project, 'lv_0')).toHaveLength(0);
  });

  it('comando fora da lista branca e apagar elemento: erros e contagens de apagados/alterados no ensaio', () => {
    const g = geral();
    const id = g.model.newId(ID, 'w');
    g.model.apply(ID, 'base', [g.wall(id)]);
    const id2 = g.model.newId(ID, 'w');
    const bad = g.b.offer(ID, 'X', { proposal: { commands: [{ type: 'deleteLevel', id: 'lv_0' }, g.wall(id2)] } });
    expect(bad).toMatchObject({ kind: 'proposed' });
    expect(g.b.snapshot().pending!.rehearsal.errors[0]!.message).toMatch(/não é permitido/);
    g.b.cancel();
    g.b.offer(ID, 'X', { proposal: { label: 'mexe', commands: [{ type: 'updateElements', ids: [id], patch: { comments: 'oi' } }, { type: 'deleteElements', ids: [id] }, g.wall(id2)] } });
    expect(g.b.snapshot().pending!.rehearsal).toMatchObject({ ok: true, created: 1, changed: 0, deleted: 1 });
    g.b.cancel();
    g.b.offer(ID, 'X', { proposal: { commands: [{ type: 'updateElements', ids: [id], patch: { comments: 'oi' } }] } });
    expect(g.b.snapshot().pending!.rehearsal).toMatchObject({ ok: true, created: 0, changed: 1, deleted: 0 });
  });

  it('sem model.write não há prévia; permissão revogada entre a prévia e o clique impede a aplicação', () => {
    const g = geral();
    g.setWrite(false);
    expect(g.b.offer(ID, 'X', { proposal: { commands: [g.wall(g.model.newId(ID, 'w'))] } })).toMatchObject({ kind: 'error' });
    g.setWrite(true);
    g.b.offer(ID, 'X', { proposal: { commands: [g.wall(g.model.newId(ID, 'w'))] } });
    g.setWrite(false);
    expect(g.b.confirm()).toMatchObject({ kind: 'error', detail: expect.stringMatching(/revogada/) });
    expect(wallsOnLevel(g.store.project, 'lv_0')).toHaveLength(0);
  });

  it('porta de modelo sem ensaio: a proposta é recusada (não há como aplicar sem prévia)', () => {
    const g = geral();
    const sem = { ...g.model, rehearse: undefined };
    const b = new BatchPreview({ model: sem, canWrite: () => true, version: () => 0, undo: () => undefined });
    expect(b.offer(ID, 'X', { proposal: { commands: [g.wall('w_q')] } })).toMatchObject({ kind: 'error' });
    expect(b.snapshot().pending).toBeNull();
  });
});
