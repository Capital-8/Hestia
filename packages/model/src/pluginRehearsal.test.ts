import { describe, expect, it } from 'vitest';
import { ProjectStore } from './history.ts';
import { createEmptyProject } from './defaults.ts';
import { PluginIdIssuer, applyPluginBatch, rehearsePluginBatch } from './pluginCommands.ts';
import { makeWall } from './wall.ts';

const PID = 'dev.teste.ia';

function cenario() {
  const store = new ProjectStore(createEmptyProject('pt'));
  const issuer = new PluginIdIssuer();
  const typeId = store.project.defaults.wallTypeId;
  const wall = (id: string) => ({ type: 'addWall', wall: makeWall({ id, typeId, levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 2, y: 0 } }) });
  const opts = (commands: unknown) => ({ pluginId: PID, label: 'T', commands, isIssuedId: (id: string) => issuer.has(PID, id) });
  return { store, issuer, wall, opts };
}

describe('rehearsePluginBatch (ensaio de prévia)', () => {
  it('conta criados, alterados e apagados sem gravar nada nem tocar no histórico', () => {
    const { store, issuer, wall, opts } = cenario();
    const a = issuer.issue(PID, 'w');
    expect(applyPluginBatch(store, opts([wall(a)])).ok).toBe(true);
    const v = store.version;
    const b = issuer.issue(PID, 'w');
    const r = rehearsePluginBatch(store, opts([wall(b), { type: 'updateElements', ids: [a], patch: { comments: 'x' } }]));
    expect(r).toEqual({ ok: true, commands: 2, created: 1, changed: 1, deleted: 0, errors: [] });
    const d = rehearsePluginBatch(store, opts([{ type: 'deleteElements', ids: [a] }]));
    expect(d).toMatchObject({ ok: true, created: 0, changed: 0, deleted: 1 });
    expect(store.version).toBe(v);
    expect(Object.keys(store.project.elements)).toEqual([a]);
  });

  it('as mesmas recusas do lote real: id inventado, comando proibido, tamanho; reporta todos os erros por índice', () => {
    const { store, wall, opts } = cenario();
    const r = rehearsePluginBatch(store, opts([wall('w_inventado'), { type: 'deleteLevel', id: 'lv_0' }, 5]));
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => e.index)).toEqual([0, 1, 2]);
    expect(rehearsePluginBatch(store, opts('não é lista'))).toMatchObject({ ok: false, errors: [{ index: -1 }] });
    expect(rehearsePluginBatch(store, { ...opts([wall('w_1'), wall('w_2')]), maxCommands: 1 })).toMatchObject({ ok: false, errors: [{ index: -1 }] });
    expect(rehearsePluginBatch(store, opts([]))).toMatchObject({ ok: true, commands: 0 });
  });

  it('o veredito do ensaio coincide com o do lote real', () => {
    const { store, issuer, wall, opts } = cenario();
    const id = issuer.issue(PID, 'w');
    const lote = [wall(id), { type: 'updateElements', ids: ['nao-existe'], patch: { comments: 'x' } }];
    expect(rehearsePluginBatch(store, opts(lote)).ok).toBe(false);
    expect(applyPluginBatch(store, opts(lote)).ok).toBe(false);
    expect(Object.keys(store.project.elements)).toEqual([]);
  });
});
