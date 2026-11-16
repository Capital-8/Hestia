/**
 * Ponta a ponta da fase H com o suplemento de exemplo "grade-de-paredes": pacote -> instalar -> permissões -> diálogo
 * (campos em unidades do projeto, convertidos para metro) -> ferramenta de dois cliques (prévia, Esc, lote) -> um passo
 * de desfazer. O "Worker" é o runtime real do Worker de suplemento, no mesmo processo (ver suplementos.integration.test).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createZip, type ZipFile } from '@hestia/io';
import { createEmptyProject, ProjectStore, resolveUnits, wallsOnLevel } from '@hestia/model';
import { installWorkerRuntime, type WorkerLike } from '@hestia/plugin-api';
import { DEFAULT_DISJOIN, PluginTool, type PluginToolBridge, type PluginToolSpec, type ToolEnv, type ToolOptions } from '@hestia/tools';
import { afterEach, describe, expect, it } from 'vitest';
import { t } from '../editor/i18n.ts';
import { createModelPort, setPluginInfoResolver } from './appModelPort.ts';
import { checkForm } from './fieldForm.ts';
import { textToField } from './fieldUnits.ts';
import { pluginRegistry, runPluginAction } from './registry.ts';
import { KvPackageStore, MemoryKv } from './supStore.ts';
import { SupplementRuntime, type SupNotice } from './supRuntime.ts';
import { txt } from '../ui/ribbon/model.ts';

const RAIZ = path.resolve(import.meta.dirname, '../../../..');
const ID = 'dev.hestia.grade-de-paredes';
const ID_RUIM = 'dev.teste.ferramenta';

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

interface Aberta { spec: Omit<PluginToolSpec, 'redraw'>; bridge: PluginToolBridge }

function montar() {
  const store = new ProjectStore(createEmptyProject());
  const { model, data } = createModelPort(() => store);
  const abertas: Aberta[] = [];
  const notices: SupNotice[] = [];
  const rt = new SupplementRuntime({
    store: new KvPackageStore(new MemoryKv()),
    createWorker: inMemoryWorker,
    registry: pluginRegistry,
    model, data,
    setInfoResolver: setPluginInfoResolver,
    defer: (fn) => fn(),
    notify: (n) => notices.push(n),
    tools: { start: (spec, bridge) => abertas.push({ spec, bridge }), text: (x) => txt(x, 'pt'), message: (k, a) => t('pt', k, a) },
  });
  return { store, rt, abertas, notices, detach: rt.attachExecutor() };
}

/** Ambiente mínimo das ferramentas: projeto do store, nível `lv_0`, snaps desligados (o clique vale a posição crua). */
function ambiente(store: ProjectStore) {
  const falas: string[] = [];
  let saiu = 0;
  const options: ToolOptions = {
    wallTypeId: 'wt_alv14', locationLine: 'wallCenter', wallHeight: 2.8, chain: true, wallShape: 'line', doorTypeId: 'ot_p80', windowTypeId: 'ot_j120',
    orthoLock: false, arrayCount: 3, offsetDistance: 1, rotateCopy: false, mirrorCopy: false, offsetCopy: true, moveDisjoin: DEFAULT_DISJOIN.move,
    rotateDisjoin: DEFAULT_DISJOIN.rotate, mirrorDisjoin: DEFAULT_DISJOIN.mirror, floorTypeId: 'ft_ceram', floorOffset: 0, slabTypeId: 'ls_mac12', slabOffset: 0,
    slabSlopePercent: 2, ceilingTypeId: 'ct_gesso', ceilingOffset: 2.6,
    snap: { enabled: false, grid: false, axis: false, faces: false, core: false, intersections: false, perpendicular: false, alignment: false },
  };
  const env: ToolEnv = {
    project: () => store.project, levelId: () => 'lv_0', selection: () => [], setSelection: () => undefined,
    exec: (c) => store.exec(c), transaction: (l, fn, s) => store.transaction(l, fn, s),
    metersPerPixel: () => 0.01, gridStep: () => 0.1, say: (m) => { falas.push(m); }, done: () => { saiu += 1; }, options: () => options,
  };
  return { env, falas, saiu: () => saiu };
}

const fluxo = async (): Promise<void> => { for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 2)); };
const P = (x: number, y: number) => ({ raw: { x, y }, shift: false, ctrl: false, alt: false });
const paredes = (s: ProjectStore): number => wallsOnLevel(s.project, 'lv_0').length;

const vivos: Array<ReturnType<typeof montar>> = [];
const novo = (): ReturnType<typeof montar> => { const c = montar(); vivos.push(c); return c; };
afterEach(() => {
  for (const c of vivos.splice(0)) c.detach();
  for (const id of pluginRegistry.pluginIds()) pluginRegistry.unregister(id);
  setPluginInfoResolver((p) => ({ name: p, dataSchema: 1, version: '' }));
});

const TODAS = ['model.read', 'model.write', 'ui.commands', 'ui.ribbon', 'ui.dialogs', 'ui.tools'];

async function instalarGrade(c: ReturnType<typeof montar>): Promise<void> {
  expect(await c.rt.install({ kind: 'package', bytes: createZip(pastaDeExemplo('grade-de-paredes')) })).toMatchObject({ ok: true, id: ID });
  expect(await c.rt.approve(ID, TODAS)).toMatchObject({ ok: true, state: 'active' });
}

describe('grade-de-paredes: diálogo -> ferramenta de dois cliques -> um passo de desfazer', () => {
  it('o registro expõe o diálogo (3 campos de comprimento) e a ferramenta de um prompt "line"', async () => {
    const c = novo();
    await instalarGrade(c);
    expect(pluginRegistry.dialog(`${ID}:params`)!.fields.map((f) => [f.key, f.type])).toEqual([['largura', 'length'], ['altura', 'length'], ['passo', 'length']]);
    expect(pluginRegistry.tool(`${ID}:grade`)).toMatchObject({ onCommit: 'grade', prompts: [{ key: 'base', kind: 'line' }] });
  });

  it('comprimentos digitados em centímetro, com vírgula, chegam ao handler em metro', async () => {
    const c = novo();
    await instalarGrade(c);
    const u = resolveUnits({ length: { unit: 'cm', decimals: 0 }, decimalSymbol: ',' });
    const campos = pluginRegistry.dialog(`${ID}:params`)!.fields;
    const [largura, altura, passo] = campos;
    const ok = checkForm(campos, { largura: textToField(largura!, '800', u) ?? undefined, altura: textToField(altura!, '400', u) ?? undefined, passo: textToField(passo!, '400,0', u) ?? undefined });
    expect(ok).toEqual({ ok: true, values: { largura: 8, altura: 4, passo: 4 } });
    // texto inválido e abaixo do mínimo (10 cm = 0,1 m < 0,5 m) são barrados antes de chegar ao suplemento
    const ruim = checkForm(campos, { largura: textToField(largura!, 'abc', u) ?? undefined, altura: textToField(altura!, '10', u) ?? undefined, passo: 2 });
    expect(ruim).toEqual({ ok: false, errors: { largura: 'invalid', altura: 'below_min' } });
  });

  it('abre pelo diálogo, mostra a prévia ao mover, aplica 5 paredes no 2º clique e UM Desfazer remove todas', async () => {
    const c = novo();
    await instalarGrade(c);
    const antes = paredes(c.store);
    // O botão do diálogo roda a ação `tool` com os valores já validados (metro).
    runPluginAction(ID, { type: 'tool', ref: 'grade' }, { largura: 8, altura: 4, passo: 4 });
    await c.rt.settled();
    expect(c.abertas).toHaveLength(1);
    const { env, falas } = ambiente(c.store);
    const tool = new PluginTool(env, { ...c.abertas[0]!.spec, redraw: () => undefined }, c.abertas[0]!.bridge);
    tool.start();
    expect(falas[0]).toBe('Clique no início e no fim da linha de base da grade');

    tool.click(P(0, 0));
    tool.move(P(10, 0)); // direção +X: grade 8 x 4 com passo 4
    await fluxo();
    expect(tool.preview().filter((i) => i.kind === 'line')).toHaveLength(5); // 2 linhas em X + 3 em Y
    expect(paredes(c.store)).toBe(antes); // a prévia não altera o modelo

    tool.click(P(10, 0));
    await fluxo();
    expect(paredes(c.store)).toBe(antes + 5);
    expect(c.store.undoLabel).toBe('Grade de paredes: Grade de paredes');
    expect(tool.preview()).toEqual([]);
    const xs = wallsOnLevel(c.store.project, 'lv_0').flatMap((w) => [w.a.x, w.b.x]);
    expect(Math.max(...xs)).toBeCloseTo(8, 6); // a largura de 8 m, e não os 10 m do clique

    c.store.undo(); // UM passo desfaz o lote inteiro
    expect(paredes(c.store)).toBe(antes);
    c.store.redo();
    expect(paredes(c.store)).toBe(antes + 5);
  });

  it('gira a grade com a direção dos cliques (perpendicular a ela vira a altura)', async () => {
    const c = novo();
    await instalarGrade(c);
    runPluginAction(ID, { type: 'tool', ref: 'grade' }, { largura: 2, altura: 2, passo: 2 });
    await c.rt.settled();
    const { env } = ambiente(c.store);
    const tool = new PluginTool(env, { ...c.abertas[0]!.spec, redraw: () => undefined }, c.abertas[0]!.bridge);
    tool.start();
    tool.click(P(1, 1));
    tool.click(P(1, 9)); // direção +Y: a largura segue Y, a altura segue -X
    await fluxo();
    const pts = wallsOnLevel(c.store.project, 'lv_0').flatMap((w) => [w.a, w.b]);
    expect(Math.min(...pts.map((p) => p.x))).toBeCloseTo(-1, 6);
    expect(Math.max(...pts.map((p) => p.y))).toBeCloseTo(3, 6);
  });

  it('Esc no meio do traço cancela: nada é aplicado e o segundo Esc sai da ferramenta', async () => {
    const c = novo();
    await instalarGrade(c);
    const antes = paredes(c.store);
    runPluginAction(ID, { type: 'tool', ref: 'grade' }, { largura: 4, altura: 4, passo: 2 });
    await c.rt.settled();
    const { env, saiu } = ambiente(c.store);
    const tool = new PluginTool(env, { ...c.abertas[0]!.spec, redraw: () => undefined }, c.abertas[0]!.bridge);
    tool.start();
    tool.click(P(0, 0));
    tool.move(P(5, 0));
    await fluxo();
    expect(tool.preview().length).toBeGreaterThan(0);
    tool.cancel(); // 1º Esc
    await fluxo();
    expect(tool.preview()).toEqual([]);
    expect(saiu()).toBe(0);
    tool.move(P(6, 0)); // sem primeiro ponto, o handler não desenha mais nada
    await fluxo();
    expect(tool.preview()).toEqual([]);
    tool.cancel(); // 2º Esc
    expect(saiu()).toBe(1);
    expect(paredes(c.store)).toBe(antes);
  });
});

describe('ferramenta que falha ou abusa não derruba o app', () => {
  const MANIFESTO = {
    manifestVersion: 2, id: ID_RUIM, name: 'Ferramenta ruim', version: '1.0.0', hestiaApi: '1.0', runtime: 'script', entry: 'main.js',
    capabilities: ['model.read', 'model.write', 'ui.tools'],
    contributes: { tools: [{ id: 'f', title: 'F', prompts: [{ key: 'p', kind: 'point', label: 'Clique' }], onCommit: 'f' }] },
  };
  const instalar = async (c: ReturnType<typeof montar>, code: string): Promise<void> => {
    await c.rt.install({ kind: 'package', bytes: createZip([{ path: 'manifest.json', data: JSON.stringify(MANIFESTO) }, { path: 'main.js', data: code }]) });
    await c.rt.approve(ID_RUIM, ['model.read', 'model.write', 'ui.tools']);
    runPluginAction(ID_RUIM, { type: 'tool', ref: 'f' });
    await c.rt.settled();
  };

  it('exceção do handler: a ferramenta vira failed, o app avisa e o suplemento segue ativo', async () => {
    const c = novo();
    await instalar(c, 'export async function f(ctx, ev) { if (ev.type === "point") throw new Error("boom"); return {}; }');
    const { env, falas, saiu } = ambiente(c.store);
    const tool = new PluginTool(env, { ...c.abertas[0]!.spec, redraw: () => undefined }, c.abertas[0]!.bridge);
    tool.start();
    tool.click(P(1, 1));
    await fluxo();
    expect(tool.failed).toBe(true);
    expect(falas.at(-1)).toMatch(/falhou e foi encerrada/);
    expect(saiu()).toBe(1);
    expect(c.notices).toContainEqual({ kind: 'handler-error', pluginName: 'Ferramenta ruim' });
    expect(c.rt.snapshot()[0]!.state).toBe('active'); // uma falha isolada não desativa
  });

  it('lote com comando fora da lista branca é recusado inteiro: o modelo não muda', async () => {
    const c = novo();
    await instalar(c, 'export async function f(ctx, ev) { return ev.type === "point" ? { commit: { label: "x", commands: [{ type: "deleteElements", ids: ["w1"] }] } } : {}; }');
    const { env, falas, saiu } = ambiente(c.store);
    const versao = c.store.version;
    const tool = new PluginTool(env, { ...c.abertas[0]!.spec, redraw: () => undefined }, c.abertas[0]!.bridge);
    tool.start();
    tool.click(P(1, 1));
    await fluxo();
    expect(c.store.version).toBe(versao);
    expect(falas.at(-1)).toMatch(/recusou o lote/);
    expect(saiu()).toBe(0); // recusa de lote não encerra a ferramenta
  });

  it('rascunho gigante e lixo no lugar do objeto são limitados/ignorados pela ponte', async () => {
    const c = novo();
    await instalar(c, 'export async function f(ctx, ev) { if (ev.type === "move") return { draft: { lines: Array.from({ length: 5000 }, () => ({ a: { x: 0, y: 0 }, b: { x: 1, y: 1 } })) } }; return 42; }');
    const { env } = ambiente(c.store);
    const tool = new PluginTool(env, { ...c.abertas[0]!.spec, redraw: () => undefined }, c.abertas[0]!.bridge);
    tool.start();
    tool.move(P(1, 1));
    await fluxo();
    expect(tool.preview()).toHaveLength(500);
    expect(tool.failed).toBe(false);
  });
});
