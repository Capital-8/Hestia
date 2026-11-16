import { describe, expect, it } from 'vitest';
import { createEmptyProject } from './defaults.ts';
import { ProjectStore } from './history.ts';
import { PLUGIN_BATCH_LIMITS, PluginIdIssuer, applyPluginBatch, type PluginBatchOptions } from './pluginCommands.ts';
import { PLUGIN_DATA_LIMITS, pluginDataReadOnly, pluginDataSpace } from './pluginData.ts';
import type { Wall } from './types.ts';
import { makeWall } from './wall.ts';

const PID = 'dev.exemplo.teste';

function setup() {
  const store = new ProjectStore(createEmptyProject());
  const issuer = new PluginIdIssuer();
  const run = (commands: unknown, extra: Partial<PluginBatchOptions> = {}) =>
    applyPluginBatch(store, { pluginId: PID, label: 'Teste: lote', commands, isIssuedId: (id) => issuer.has(PID, id), ...extra });
  const wall = (id: string, x = 0) => ({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a: { x, y: 0 }, b: { x: x + 3, y: 0 } }) });
  return { store, issuer, run, wall };
}

describe('applyPluginBatch: sucesso', () => {
  it('aplica N comandos como UM passo de desfazer, com o rótulo do plugin', () => {
    const { store, issuer, run, wall } = setup();
    const ids = [issuer.issue(PID, 'w'), issuer.issue(PID, 'w'), issuer.issue(PID, 'w')];
    const r = run(ids.map((id, i) => wall(id, i * 4)));
    expect(r).toEqual({ ok: true, applied: 3 });
    for (const id of ids) expect(store.project.elements[id]).toBeDefined();
    expect(store.undoLabel).toBe('Teste: lote');
    store.undo();
    for (const id of ids) expect(store.project.elements[id]).toBeUndefined();
    expect(store.canUndo).toBe(false);
  });

  it('lote vazio é aceito e não cria passo', () => {
    const { store, run } = setup();
    expect(run([])).toEqual({ ok: true, applied: 0 });
    expect(store.canUndo).toBe(false);
  });
});

describe('applyPluginBatch: atomicidade', () => {
  it('um comando inválido no meio recusa o lote todo, devolve o índice e não deixa rastro', () => {
    const { store, issuer, run, wall } = setup();
    const a = issuer.issue(PID, 'w');
    const b = issuer.issue(PID, 'w');
    const before = store.project;
    const v = store.version;
    const r = run([wall(a), { type: 'deleteLevel', id: 'lv_0' }, wall(b)]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.index).toBe(1);
    expect(store.project).toBe(before);
    expect(store.version).toBe(v);
    expect(store.canUndo).toBe(false);
  });

  it('falha ao aplicar (tipo de parede inexistente) recusa o lote inteiro sem mudar o projeto', () => {
    const { store, issuer, run, wall } = setup();
    const a = issuer.issue(PID, 'w');
    const b = issuer.issue(PID, 'w');
    const ruim = wall(b) as unknown as { wall: Wall };
    ruim.wall = { ...ruim.wall, typeId: 'wt_nao_existe' } as Wall;
    const before = store.project;
    const r = run([wall(a), ruim]);
    expect(r.ok).toBe(false);
    expect(store.project).toBe(before);
    expect(store.canUndo).toBe(false);
  });
});

describe('applyPluginBatch: lista branca e argumentos', () => {
  it('recusa comando fora da lista branca', () => {
    const { run } = setup();
    for (const type of ['deleteLevel', 'setProjectName', 'batch', 'ensurePluginProjectUid', 'setPluginViewOverride', 'resetDxfLayers']) {
      const r = run([{ type }]);
      expect(r.ok, type).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/não é permitido/);
    }
  });

  it('recusa item que não é objeto com type e valores não JSON', () => {
    const { run } = setup();
    expect(run(['x']).ok).toBe(false);
    expect(run([{ type: 'deleteElements', ids: [() => 1] }]).ok).toBe(false);
    expect(run([{ type: 'deleteElements', ids: [Number.NaN] }]).ok).toBe(false);
    expect(run('nao-lista').ok).toBe(false);
  });

  it('recusa id que o host não emitiu e id repetido', () => {
    const { store, issuer, run, wall } = setup();
    const r = run([wall('w_inventado')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/não foi emitido/);
    const id = issuer.issue(PID, 'w');
    expect(run([wall(id)]).ok).toBe(true);
    // Mesmo id de novo: já existe.
    const again = run([wall(id)]);
    expect(again.ok).toBe(false);
    expect(store.undoLabel).toBe('Teste: lote');
  });

  it('id emitido para outro plugin não vale', () => {
    const { issuer, run, wall } = setup();
    const outro = issuer.issue('dev.outro.plugin', 'w');
    expect(run([wall(outro)]).ok).toBe(false);
  });

  it('só adiciona tipos sob o prefixo <pluginId>: e só os apaga sob ele', () => {
    const { store, run } = setup();
    const base = store.project.wallTypes['wt_alv14']!;
    const sem = run([{ type: 'upsertWallType', wallType: { ...base, id: 'wt_novo' } }]);
    expect(sem.ok).toBe(false);
    const sobre = run([{ type: 'upsertWallType', wallType: { ...base, id: 'wt_alv14' } }]);
    expect(sobre.ok).toBe(false);
    const alheio = run([{ type: 'upsertWallType', wallType: { ...base, id: 'dev.outro.plugin:x' } }]);
    expect(alheio.ok).toBe(false);
    const ok = run([{ type: 'upsertWallType', wallType: { ...base, id: `${PID}:parede` } }]);
    expect(ok).toEqual({ ok: true, applied: 1 });
    expect(store.project.wallTypes[`${PID}:parede`]).toBeDefined();
    expect(run([{ type: 'deleteWallType', id: 'wt_alv14' }]).ok).toBe(false);
    expect(run([{ type: 'deleteWallType', id: `${PID}:parede` }]).ok).toBe(true);
  });

  it('patch não pode trocar id, kind nem order; ids precisam existir', () => {
    const { issuer, run, wall } = setup();
    const id = issuer.issue(PID, 'w');
    expect(run([wall(id)]).ok).toBe(true);
    expect(run([{ type: 'updateElements', ids: [id], patch: { id: 'x' } }]).ok).toBe(false);
    expect(run([{ type: 'updateElements', ids: ['nao_existe'], patch: { height: 3 } }]).ok).toBe(false);
    expect(run([{ type: 'updateElements', ids: [id], patch: { height: 3 } }]).ok).toBe(true);
  });

  it('um comando pode usar elemento criado antes, no mesmo lote', () => {
    const { store, issuer, run, wall } = setup();
    const id = issuer.issue(PID, 'w');
    expect(run([wall(id), { type: 'updateElements', ids: [id], patch: { height: 3.1 } }]).ok).toBe(true);
    expect((store.project.elements[id] as Wall).height).toBe(3.1);
  });

  it('o plugin não guarda referência ao que o host aplicou', () => {
    const { store, issuer, run, wall } = setup();
    const id = issuer.issue(PID, 'w');
    const cmd = wall(id);
    expect(run([cmd]).ok).toBe(true);
    cmd.wall.height = 99;
    expect((store.project.elements[id] as Wall).height).not.toBe(99);
  });
});

describe('applyPluginBatch: limites', () => {
  it('recusa mais de 5000 comandos e respeita teto menor do manifesto', () => {
    const { run } = setup();
    const muitos = Array.from({ length: PLUGIN_BATCH_LIMITS.maxCommands + 1 }, () => ({ type: 'deleteElements', ids: ['a'] }));
    const r = run(muitos);
    expect(r).toMatchObject({ ok: false, index: -1 });
    const poucos = run([{ type: 'deleteElements', ids: ['a'] }, { type: 'deleteElements', ids: ['a'] }], { maxCommands: 1 });
    expect(poucos).toMatchObject({ ok: false, index: -1 });
    // Teto do manifesto nunca amplia o do host.
    const ampliar = run(muitos, { maxCommands: 999_999 });
    expect(ampliar).toMatchObject({ ok: false, index: -1 });
  });

  it('recusa lote com mais de 8 MiB', () => {
    const { run } = setup();
    const r = run([{ type: 'setPluginData', key: 'k', value: 'x'.repeat(PLUGIN_BATCH_LIMITS.maxBytes) }]);
    expect(r).toMatchObject({ ok: false, index: -1 });
    if (!r.ok) expect(r.error).toMatch(/8 MiB/);
  });
});

describe('applyPluginBatch: espaço de dados', () => {
  it('o host força pluginId, schema e versão: o plugin não escreve no espaço alheio', () => {
    const { store, run } = setup();
    const r = run([{ type: 'setPluginData', pluginId: 'dev.alheio.x', key: 'a', value: { n: 1 } }], { dataSchema: 2, version: '1.2.3' });
    expect(r.ok).toBe(true);
    expect(pluginDataSpace(store.project, 'dev.alheio.x')).toBeUndefined();
    expect(pluginDataSpace(store.project, PID)).toEqual({ schema: 2, version: '1.2.3', values: { a: { n: 1 } } });
  });
});

describe('espaço de dados por plugin', () => {
  const set = (store: ProjectStore, key: string, value: unknown, schema = 1) =>
    store.exec({ type: 'setPluginData', pluginId: PID, key, value: value as never, schema, version: '1.0.0' });

  it('grava, desfaz e apaga', () => {
    const store = new ProjectStore(createEmptyProject());
    set(store, 'k', { a: [1, 2] });
    expect(pluginDataSpace(store.project, PID)?.values.k).toEqual({ a: [1, 2] });
    store.undo();
    expect(pluginDataSpace(store.project, PID)).toBeUndefined();
    set(store, 'k', 1);
    store.exec({ type: 'deletePluginData', pluginId: PID, key: 'k', schema: 1 });
    expect(pluginDataSpace(store.project, PID)?.values).toEqual({});
  });

  it('valida chave e JSON puro e profundidade', () => {
    const store = new ProjectStore(createEmptyProject());
    expect(() => set(store, '', 1)).toThrow();
    expect(() => set(store, 'x'.repeat(65), 1)).toThrow();
    expect(() => set(store, 'k', undefined)).toThrow();
    expect(() => set(store, 'k', Number.POSITIVE_INFINITY)).toThrow();
    expect(() => set(store, 'k', () => 1)).toThrow();
    let fundo: unknown = 1;
    for (let i = 0; i < PLUGIN_DATA_LIMITS.maxDepth + 2; i++) fundo = { f: fundo };
    expect(() => set(store, 'k', fundo)).toThrow(/profundidade/);
    expect(store.canUndo).toBe(false);
  });

  it('limita 1 MiB por plugin e 4 MiB no projeto', () => {
    const store = new ProjectStore(createEmptyProject());
    const meio = 'x'.repeat(600 * 1024);
    set(store, 'a', meio);
    expect(() => set(store, 'b', meio)).toThrow(/1 MiB/);
    // Três plugins de 900 KiB somam 3,3 MiB com o primeiro; o quarto estoura os 4 MiB do projeto.
    const grande = 'y'.repeat(900 * 1024);
    for (let i = 0; i < 3; i++) store.exec({ type: 'setPluginData', pluginId: `dev.p${i}.x`, key: 'k', value: grande, schema: 1 });
    expect(() => store.exec({ type: 'setPluginData', pluginId: 'dev.p3.x', key: 'k', value: grande, schema: 1 })).toThrow(/4 MiB/);
  });

  it('schema salvo maior que o instalado deixa o espaço somente leitura; o menor migra', () => {
    const store = new ProjectStore(createEmptyProject());
    set(store, 'k', 1, 3);
    expect(pluginDataReadOnly(store.project, PID, 2)).toBe(true);
    expect(pluginDataReadOnly(store.project, PID, 3)).toBe(false);
    expect(() => set(store, 'k', 2, 2)).toThrow(/somente leitura/);
    expect(() => store.exec({ type: 'deletePluginData', pluginId: PID, key: 'k', schema: 2 })).toThrow(/somente leitura/);
    expect(pluginDataSpace(store.project, PID)?.values.k).toBe(1);
    set(store, 'k', 5, 4);
    expect(pluginDataSpace(store.project, PID)).toMatchObject({ schema: 4, values: { k: 5 } });
  });

  it('o espaço de um plugin não aparece no de outro', () => {
    const store = new ProjectStore(createEmptyProject());
    set(store, 'k', 1);
    expect(pluginDataSpace(store.project, 'dev.outro.x')).toBeUndefined();
  });
});
