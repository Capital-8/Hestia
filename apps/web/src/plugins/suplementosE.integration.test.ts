/**
 * Fase E ponta a ponta (ADR 0057): verificações e quantitativos de suplementos.
 * pacote de plugins-exemplo/ -> instalar -> conceder -> check no painel de problemas -> quantitativo -> CSV.
 * Também cobre a verificação por handler de script (Worker real em processo) e as ações `check` e `schedule`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createZip, type ZipFile } from '@hestia/io';
import { createEmptyProject, makeWall, ProjectStore } from '@hestia/model';
import { installWorkerRuntime, type WorkerLike } from '@hestia/plugin-api';
import { afterEach, describe, expect, it } from 'vitest';
import { createModelPort, setPluginInfoResolver } from './appModelPort.ts';
import { computePluginIssues, setCheckHandlerRunner } from './pluginChecksRun.ts';
import { buildPluginSchedule, scheduleCsvFile } from './pluginSchedules.ts';
import { pluginRegistry, runPluginCommand } from './registry.ts';
import { KvPackageStore, MemoryKv } from './supStore.ts';
import { SupplementRuntime } from './supRuntime.ts';
import { useUi } from '../editor/state.ts';

const RAIZ = path.resolve(import.meta.dirname, '../../../..');
const ID = 'dev.hestia.verificacoes-quantitativos';
const CAPS = ['model.read', 'checks.run', 'content.schedules', 'ui.commands', 'ui.ribbon'];

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

function pacoteDeExemplo(nome: string): Uint8Array {
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
  return createZip(out);
}

/** Duas paredes (4 m e 3 m) e duas portas: uma de 0,80 m (conforme) e uma de 0,70 m (viola). */
function projeto(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 0, y: 3 } }) });
  const ab = (id: string, typeId: string, offset: number) =>
    ({ type: 'addOpening' as const, opening: { id, kind: 'door' as const, typeId, hostId: 'w1', offset, flipHand: false, flipFacing: false, sillOverride: null, mark: id.toUpperCase() } });
  s.exec(ab('d1', 'ot_p80', 1));
  s.exec(ab('d2', 'ot_p70', 3));
  return s;
}

function montar(store: ProjectStore, runCheck?: (p: string, c: string) => void): SupplementRuntime {
  const { model, data } = createModelPort(() => store);
  const rt = new SupplementRuntime({
    store: new KvPackageStore(new MemoryKv()), createWorker: inMemoryWorker, registry: pluginRegistry, model, data,
    setInfoResolver: setPluginInfoResolver, defer: (fn) => fn(), ...(runCheck ? { runCheck } : {}),
  });
  vivos.push(rt.attachExecutor());
  return rt;
}

const vivos: Array<() => void> = [];
afterEach(() => {
  for (const d of vivos.splice(0)) d();
  setCheckHandlerRunner(null);
  for (const id of pluginRegistry.pluginIds()) pluginRegistry.unregister(id);
  setPluginInfoResolver((p) => ({ name: p, dataSchema: 1, version: '' }));
  useUi.setState({ dialog: null, dialogArg: null });
});

describe('exemplo verificacoes-quantitativos', () => {
  it('instalar, conceder e ver o aviso da porta estreita no formato do painel de problemas', async () => {
    const store = projeto();
    const rt = montar(store);
    const r = await rt.install({ kind: 'package', bytes: pacoteDeExemplo('verificacoes-quantitativos') });
    expect(r).toMatchObject({ ok: true, id: ID });
    // Sem concessão nada roda.
    expect(await computePluginIssues(store.project, pluginRegistry, 'pt')).toEqual([]);
    expect(await rt.approve(ID, CAPS)).toEqual({ ok: true, state: 'active' });

    const issues = await computePluginIssues(store.project, pluginRegistry, 'pt');
    expect(issues).toEqual([
      { severity: 'warning', code: `plugin:${ID}:porta-largura-minima`, elementId: 'd2', message: 'Porta D2 (Porta 70 x 210) com 0.7 m de largura; o mínimo é 0,80 m.' },
    ]);
    const en = await computePluginIssues(store.project, pluginRegistry, 'en');
    expect(en[0]!.message).toBe('Door D2 (Porta 70 x 210) is 0.7 m wide; the minimum is 0.80 m.');
  });

  it('revogar checks.run retira a verificação (permissão conferida no registro)', async () => {
    const store = projeto();
    const rt = montar(store);
    await rt.install({ kind: 'package', bytes: pacoteDeExemplo('verificacoes-quantitativos') });
    await rt.approve(ID, ['model.read', 'content.schedules', 'ui.commands']);
    expect(pluginRegistry.checks()).toEqual([]);
    expect(pluginRegistry.schedules()).toHaveLength(1);
    expect(await computePluginIssues(store.project, pluginRegistry, 'pt')).toEqual([]);
  });

  it('quantitativo de paredes por material, com totais e CSV', async () => {
    const store = projeto();
    const rt = montar(store);
    await rt.install({ kind: 'package', bytes: pacoteDeExemplo('verificacoes-quantitativos') });
    await rt.approve(ID, CAPS);
    const reg = pluginRegistry.schedule(`${ID}:paredes-por-material`)!;
    expect(reg).toBeDefined();
    const { table } = buildPluginSchedule(store.project, reg, 'pt');
    expect(table.columns.map((c) => c.title)).toEqual(['Material do miolo', 'Paredes', 'Comprimento', 'Área (uma face)']);
    expect(table.rows).toHaveLength(1);
    const [material, qtd, comp, area] = table.rows[0]!.cells;
    expect(typeof material).toBe('string');
    expect([qtd, comp, area]).toEqual([2, 7, 19.6]); // 4 m + 3 m, altura padrão 2,8 m
    expect(table.totals).toEqual([null, 2, 7, 19.6]);
    expect(table.errors).toBe(0);
    const csv = scheduleCsvFile(reg, table, 'pt', 'Total');
    expect(csv.nome).toBe(`${ID}-paredes-por-material.csv`);
    expect(csv.conteudo.startsWith('﻿Material do miolo;Paredes;Comprimento (m);Área (uma face) (m²)\r\n')).toBe(true);
    expect(csv.conteudo).toContain(';2;7;19,6\r\n');
    expect(csv.conteudo.endsWith('Total;2;7;19,6\r\n')).toBe(true);
  });

  it('ações check e schedule passam pelo registro: schedule abre o diálogo, check vai ao executor', async () => {
    const chamadas: string[] = [];
    const rt = montar(projeto(), (p, c) => chamadas.push(`${p}/${c}`));
    await rt.install({ kind: 'package', bytes: pacoteDeExemplo('verificacoes-quantitativos') });
    await rt.approve(ID, CAPS);
    runPluginCommand(`${ID}:paredes-material`);
    expect(useUi.getState()).toMatchObject({ dialog: 'pluginSchedule', dialogArg: `${ID}:paredes-por-material` });
    runPluginCommand(`${ID}:verificar-portas`);
    expect(chamadas).toEqual([`${ID}/porta-largura-minima`]);
    expect(pluginRegistry.ribbonPanels()[0]!.items).toHaveLength(2);
  });
});

describe('verificação por handler de script', () => {
  const main = `export async function verificar(ctx) {
    const p = await ctx.model.read();
    return Object.values(p.elements).filter((e) => e.kind === 'door' && e.typeId === 'ot_p70').map((e) => ({ elementId: e.id }))
      .concat([{ elementId: 'inexistente', message: 'sem elemento' }]);
  }`;
  const manifesto = {
    manifestVersion: 2, id: 'dev.teste.check-script', name: 'Check script', version: '1.0.0', hestiaApi: '1.0', runtime: 'script', entry: 'main.js',
    capabilities: ['model.read', 'checks.run'],
    contributes: { checks: [{ id: 'estreita', title: 'Estreita', severity: 'error', applyTo: 'door', handler: 'verificar', message: 'Porta {mark} estreita ({width} m).' }] },
  };

  it('o handler devolve elementos e o host monta os itens (texto do manifesto preenchido)', async () => {
    const store = projeto();
    const rt = montar(store);
    setCheckHandlerRunner((id, h) => rt.loader.call(id, h, []));
    const bytes = createZip([{ path: 'manifest.json', data: JSON.stringify(manifesto) }, { path: 'main.js', data: main }]);
    expect(await rt.install({ kind: 'package', bytes })).toMatchObject({ ok: true });
    expect(await rt.approve('dev.teste.check-script', ['model.read', 'checks.run'])).toEqual({ ok: true, state: 'active' });
    const issues = await computePluginIssues(store.project, pluginRegistry, 'pt');
    expect(issues).toEqual([
      { severity: 'error', code: 'plugin:dev.teste.check-script:estreita', message: 'Porta D2 estreita (0.7 m).', elementId: 'd2' },
      { severity: 'error', code: 'plugin:dev.teste.check-script:estreita', message: 'sem elemento' },
    ]);
  });

  it('handler que falha não derruba as demais verificações nem lança', async () => {
    const store = projeto();
    const rt = montar(store);
    setCheckHandlerRunner(async () => { throw new Error('boom'); });
    const bytes = createZip([{ path: 'manifest.json', data: JSON.stringify(manifesto) }, { path: 'main.js', data: main }]);
    await rt.install({ kind: 'package', bytes });
    await rt.approve('dev.teste.check-script', ['model.read', 'checks.run']);
    await expect(computePluginIssues(store.project, pluginRegistry, 'pt')).resolves.toEqual([]);
  });
});
