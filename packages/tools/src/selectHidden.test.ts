import { describe, expect, it } from 'vitest';
import { DEFAULT_GRID_TYPE_ID, ProjectStore, createEmptyProject, makeBeam, makeColumn, makeFooting, makeWall, type Id } from '@hestia/model';
import { SelectTool } from './selectTool.ts';
import { P, makeEnv } from './testEnv.ts';

describe('SelectTool com elementos ocultos na vista 2D', () => {
  it('clique e caixa de seleção ignoram elementos ocultos em hiddenInView e selecionam o elemento visível por baixo', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w_hid', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    store.exec({ type: 'addColumn', column: makeColumn({ id: 'col_vis', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 2, y: 0 } }) });
    store.exec({ type: 'addBeam', beam: makeBeam({ id: 'bm_hid', typeId: 'bt_conc_15x40', levelId: 'lv_0', a: { x: 0, y: 2 }, b: { x: 4, y: 2 } }) });
    store.exec({ type: 'addFooting', footing: makeFooting({ id: 'ft_vis', typeId: 'ft_iso_100x100', levelId: 'lv_0', at: { x: 6, y: 0 } }) });
    store.exec({ type: 'addFooting', footing: makeFooting({ id: 'ft_hid', typeId: 'ft_iso_100x100', levelId: 'lv_0', at: { x: 8, y: 0 } }) });
    store.exec({ type: 'addGrid', grid: { id: 'gr_hid', name: 'A', typeId: DEFAULT_GRID_TYPE_ID, points: [{ x: 10, y: -2 }, { x: 10, y: 2 }], sag: 0, bubbleStart: true, bubbleEnd: true } });

    let hidden = new Set<Id>(['w_hid', 'bm_hid', 'ft_hid', 'gr_hid']);
    const ctx = makeEnv(store);
    ctx.env.hiddenInView = () => hidden;
    const select = new SelectTool(ctx.env);
    select.start();

    // Clique em (2, 0): parede w_hid está oculta, logo seleciona col_vis por baixo.
    select.down(P(2, 0));
    select.up(P(2, 0));
    expect(ctx.sel()).toEqual(['col_vis']);

    // Clique direto sobre viga, sapata e eixo ocultos não seleciona nada.
    select.down(P(2, 2));
    select.up(P(2, 2));
    expect(ctx.sel()).toEqual([]);

    select.down(P(8, 0));
    select.up(P(8, 0));
    expect(ctx.sel()).toEqual([]);

    select.down(P(10, 0));
    select.up(P(10, 0));
    expect(ctx.sel()).toEqual([]);

    // Seleção em janela cobrindo tudo seleciona só os visíveis (col_vis e ft_vis).
    select.down(P(-1, -3));
    select.drag(P(11, 3));
    select.up(P(11, 3));
    expect(new Set(ctx.sel())).toEqual(new Set(['col_vis', 'ft_vis']));

    // Sem elementos ocultos (ou no modo revelar), todos voltam a ser selecionáveis.
    hidden = new Set<Id>();
    select.down(P(-1, -3));
    select.drag(P(11, 3));
    select.up(P(11, 3));
    expect(new Set(ctx.sel())).toEqual(new Set(['w_hid', 'col_vis', 'bm_hid', 'ft_vis', 'ft_hid', 'gr_hid']));
  });
});
