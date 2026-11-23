import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeBeam, makeColumn, makeWall, type Id } from '@hestia/model';
import { idsOfCategory, idsOfType } from './selectionFilters.ts';
import { SelectTool } from './selectTool.ts';
import { P, makeEnv } from './testEnv.ts';
import { podeCapturar, podeSelecionar } from './visibilidade.ts';

/*
 * Bloqueio por disciplina (plano de UX de 2026-11-23): o elemento visível de outra disciplina continua desenhado e
 * serve de snap/cota, mas não é alvo de clique, caixa nem dos filtros de seleção. Valores literais.
 */

describe('bloqueados por disciplina na seleção', () => {
  const bloqueados = new Set<Id>(['w_arq', 'bm_arq']);

  function cenario() {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w_arq', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    store.exec({ type: 'addBeam', beam: makeBeam({ id: 'bm_arq', typeId: 'bt_conc_15x40', levelId: 'lv_0', a: { x: 0, y: 2 }, b: { x: 4, y: 2 } }) });
    store.exec({ type: 'addColumn', column: makeColumn({ id: 'col_est', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 6, y: 0 } }) });
    return makeEnv(store, { blockedIds: bloqueados });
  }

  it('clique na parede e na viga bloqueadas não seleciona; o pilar sim', () => {
    const ctx = cenario();
    const select = new SelectTool(ctx.env);
    select.start();

    select.down(P(2, 0));
    select.up(P(2, 0));
    expect(ctx.sel()).toEqual([]);

    select.down(P(2, 2));
    select.up(P(2, 2));
    expect(ctx.sel()).toEqual([]);

    select.down(P(6, 0));
    select.up(P(6, 0));
    expect(ctx.sel()).toEqual(['col_est']);
  });

  it('a caixa seleciona só o pilar, mesmo cobrindo os bloqueados', () => {
    const ctx = cenario();
    const select = new SelectTool(ctx.env);
    select.start();
    select.down(P(-1, -3));
    select.drag(P(7, 3));
    select.up(P(7, 3));
    expect(new Set(ctx.sel())).toEqual(new Set(['col_est']));
  });

  it('snap e cota continuam: o bloqueado é capturável e só a seleção é que o recusa', () => {
    const env = { hiddenInView: () => new Set<Id>(), halftoneInView: () => new Set<Id>(), bloqueados: () => bloqueados };
    expect(podeCapturar(env, 'w_arq')).toBe(true);
    expect(podeSelecionar(env, 'w_arq', 'clique')).toBe(false);
    expect(podeSelecionar(env, 'w_arq', 'caixa')).toBe(false);
    expect(podeSelecionar(env, 'col_est', 'clique')).toBe(true);
  });

  it('os filtros de seleção por tipo e por categoria ignoram os bloqueados', () => {
    const ctx = cenario();
    const p = ctx.store.project;
    expect(idsOfType(p, 'lv_0', 'bt_conc_15x40')).toEqual(['bm_arq']);
    expect(idsOfType(p, 'lv_0', 'bt_conc_15x40', bloqueados)).toEqual([]);
    expect(idsOfCategory(p, 'lv_0', 'walls', bloqueados)).toEqual([]);
    expect(idsOfCategory(p, 'lv_0', 'columns', bloqueados)).toEqual(['col_est']);
  });
});
