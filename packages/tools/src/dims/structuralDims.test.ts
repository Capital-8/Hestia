import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_GRID_TYPE_ID,
  ProjectStore,
  applyCommand,
  createEmptyProject,
  dimensionSettingsOf,
  elementRing,
  isBeam,
  isColumn,
  isFooting,
  makeBeam,
  makeColumn,
  makeFooting,
  makeWall,
  type Dimension,
  type DrivenEdit,
  type Project,
} from '@hestia/model';
import { drivenEditCommands } from './driven.ts';
import { toPermanent } from './permanent.ts';
import { clearDimProviders, registerBuiltinDimProviders, selectionDims } from './registry.ts';
import type { DimContext } from './types.ts';
import { SelectTool } from '../selectTool.ts';
import { makeEnv } from '../testEnv.ts';

function ctxOf(p: Project, overrides: DimContext['overrides'] = {}): DimContext {
  return {
    project: p,
    levelId: 'lv_0',
    settings: dimensionSettingsOf(p),
    overrides,
  };
}

function applyDriven(s: ProjectStore, res: DrivenEdit): Project {
  if (!res.ok) throw new Error(`cota dirigida recusada: ${res.reason}`);
  expect(res.commands).toHaveLength(1);
  s.exec({ type: 'batch', commands: (res.commands[0] as { commands: never[] }).commands });
  return s.project;
}

describe('cotas temporárias e dirigidas de elementos estruturais', () => {
  beforeEach(() => {
    clearDimProviders();
    registerBuiltinDimProviders();
  });

  it('selectionDims mede pilar com vizinho e ao editar move o pilar junto com sapata vinculada', () => {
    const p = createEmptyProject();
    applyCommand(p, {
      type: 'addWall',
      wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: -2 }, b: { x: 0, y: 2 } }),
    });
    applyCommand(p, {
      type: 'addColumn',
      column: makeColumn({ id: 'col1', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 3, y: 0 } }),
    });
    applyCommand(p, {
      type: 'addFooting',
      footing: makeFooting({
        id: 'ft1',
        typeId: 'ft_iso_100x100',
        levelId: 'lv_0',
        at: { x: 3, y: 0 },
        columnId: 'col1',
      }),
    });

    const dims = selectionDims(ctxOf(p), ['col1']);
    const dimX = dims.find((d) => d.key === 'column:col1:axisX');
    expect(dimX).toBeDefined();
    expect(dimX!.value).toBeCloseTo(3 - 0.1 - 0.092, 6);
    expect(dimX!.edit).toBeDefined();

    const edited = dimX!.edit!(4.5);
    if ('error' in edited) throw new Error(edited.error);
    for (const c of edited.commands) applyCommand(p, c);

    const col = p.elements.col1;
    const ft = p.elements.ft1;
    if (!isColumn(col) || !isFooting(ft)) throw new Error('expected column and footing');
    expect(col.at.x).toBeCloseTo(4.5 + 0.1 + 0.092, 6);
    expect(ft.at.x).toBeCloseTo(4.5 + 0.1 + 0.092, 6);
  });

  it('selectionDims mede e move sapata excêntrica em relação a vizinho', () => {
    const p = createEmptyProject();
    applyCommand(p, {
      type: 'addWall',
      wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: -2 }, b: { x: 0, y: 2 } }),
    });
    applyCommand(p, {
      type: 'addFooting',
      footing: makeFooting({
        id: 'ft_exc',
        typeId: 'ft_iso_100x100',
        levelId: 'lv_0',
        at: { x: 2, y: 0 },
        eccentricityX: 0.3,
        eccentricityY: 0.1,
      }),
    });

    const dims = selectionDims(ctxOf(p), ['ft_exc']);
    const dimX = dims.find((d) => d.key === 'footing:ft_exc:axisX');
    expect(dimX).toBeDefined();
    expect(dimX!.value).toBeCloseTo(1.8 - 0.092, 6);

    const edited = dimX!.edit!(3.2);
    if ('error' in edited) throw new Error(edited.error);
    for (const c of edited.commands) applyCommand(p, c);

    const ft = p.elements.ft_exc;
    if (!isFooting(ft)) throw new Error('expected footing');
    expect(ft.at.x).toBeCloseTo(2 + (3.2 - (1.8 - 0.092)), 6);
  });

  it('selectionDims da viga traz vão lateral, vão axial e comprimento editável', () => {
    const p = createEmptyProject();
    applyCommand(p, {
      type: 'addWall',
      wall: makeWall({ id: 'w_lat', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 3 }, b: { x: 6, y: 3 } }),
    });
    applyCommand(p, {
      type: 'addWall',
      wall: makeWall({ id: 'w_ax', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 6, y: -2 }, b: { x: 6, y: 2 } }),
    });
    applyCommand(p, {
      type: 'addBeam',
      beam: makeBeam({ id: 'bm1', typeId: 'bt_conc_15x40', levelId: 'lv_0', a: { x: 1, y: 0 }, b: { x: 4, y: 0 } }),
    });

    const dims = selectionDims(ctxOf(p), ['bm1']);
    const dLat = dims.find((d) => d.key === 'beam:bm1:right' || d.key === 'beam:bm1:left');
    const dAx = dims.find((d) => d.key === 'beam:bm1:axisB');
    const dLen = dims.find((d) => d.key === 'beam:bm1:length');
    expect(dLat).toBeDefined();
    expect(dAx).toBeDefined();
    expect(dLen).toBeDefined();
    expect(dLen!.value).toBeCloseTo(3, 6);

    const res = dLen!.edit!(4.25);
    if ('error' in res) throw new Error(res.error);
    for (const c of res.commands) applyCommand(p, c);

    const bm = p.elements.bm1;
    if (!isBeam(bm)) throw new Error('expected beam');
    expect(bm.a).toEqual({ x: 1, y: 0 });
    expect(bm.b.x).toBeCloseTo(5.25, 6);
  });

  it('SelectTool.type altera o comprimento da viga selecionada mantendo a extremidade a fixa', () => {
    const ctx = makeEnv();
    ctx.store.exec({
      type: 'addBeam',
      beam: makeBeam({ id: 'bm1', typeId: 'bt_conc_15x40', levelId: 'lv_0', a: { x: 1, y: 2 }, b: { x: 4, y: 2 } }),
    });
    ctx.env.setSelection(['bm1']);

    const sel = new SelectTool(ctx.env);
    sel.start();
    expect(sel.type('5.5')).toBe(true);

    const bm = ctx.store.project.elements.bm1;
    if (!isBeam(bm)) throw new Error('expected beam');
    expect(bm.a).toEqual({ x: 1, y: 2 });
    expect(bm.b.x).toBeCloseTo(6.5, 6);
    expect(bm.b.y).toBeCloseTo(2, 6);
  });

  it('cota permanente (drivenEditCommands) move pilar e extremidade de viga referenciados', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({
      type: 'addWall',
      wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: -2 }, b: { x: 0, y: 2 } }),
    });
    s.exec({
      type: 'addColumn',
      column: makeColumn({ id: 'col1', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 3, y: 0 } }),
    });
    s.exec({
      type: 'addBeam',
      beam: makeBeam({ id: 'bm1', typeId: 'bt_conc_15x40', levelId: 'lv_0', a: { x: 1, y: -1 }, b: { x: 4, y: -1 } }),
    });

    const col = s.project.elements.col1!;
    const colRing = elementRing(col, s.project);
    const dimCol: Dimension = {
      id: 'dm_col',
      a: { x: 0, y: -2 },
      b: colRing[0]!,
      offset: 0.5,
      mode: 'horizontal',
      refs: {
        a: { elementId: 'w1', feature: 'wall-axis-a' },
        b: { elementId: 'col1', feature: 'vertex', index: 0 },
      },
    };
    const nextDist = Math.abs(colRing[0]!.x) + 1.5;
    applyDriven(s, drivenEditCommands(s.project, dimCol, nextDist));
    const movedCol = s.project.elements.col1;
    if (!isColumn(movedCol)) throw new Error('expected column');
    expect(movedCol.at.x).toBeCloseTo(4.5, 6);

    const bm = s.project.elements.bm1!;
    const bmRing = elementRing(bm, s.project);
    const dimBeam: Dimension = {
      id: 'dm_beam',
      a: { x: 0, y: -2 },
      b: bmRing[1]!, // ponta b está na aresta i = 1
      offset: 0.5,
      mode: 'horizontal',
      refs: {
        a: { elementId: 'w1', feature: 'wall-axis-a' },
        b: { elementId: 'bm1', feature: 'edge', index: 1 },
      },
    };
    applyDriven(s, drivenEditCommands(s.project, dimBeam, 6));
    const movedBm = s.project.elements.bm1;
    if (!isBeam(movedBm)) throw new Error('expected beam');
    expect(movedBm.a).toEqual({ x: 1, y: -1 });
    expect(movedBm.b.x).toBeCloseTo(6, 6);
  });

  it('fallback de pavimento inteiro: pilar fora da faixa 1D de parede vizinha ainda exibe TempDim até ela', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w_far', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }) });
    // Pilar deslocado em X (x=10) sem sobreposição 1D com w_far [0..3], mas afastado em Y (y=4)
    s.exec({ type: 'addColumn', column: makeColumn({ id: 'col_far', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 10, y: 4 } }) });

    const dims = selectionDims(ctxOf(s.project), ['col_far']);
    const yGap = dims.find((d) => d.refs?.b?.elementId === 'w_far' || d.refs?.a?.elementId === 'w_far');
    expect(yGap).toBeDefined();
    expect(yGap!.value).toBeGreaterThan(3);
  });

  it('beamAxisGaps cota longitudinalmente de viga até pilar perpendicular ou viga transversal', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addBeam', beam: makeBeam({ id: 'bm_host', typeId: 'bt_conc_15x40', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    s.exec({ type: 'addColumn', column: makeColumn({ id: 'col_end', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 7, y: 0 } }) });
    s.exec({ type: 'addBeam', beam: makeBeam({ id: 'bm_cross', typeId: 'bt_conc_15x40', levelId: 'lv_0', a: { x: -2, y: -2 }, b: { x: -2, y: 2 } }) });

    const dims = selectionDims(ctxOf(s.project), ['bm_host']);
    expect(dims.some((d) => d.refs?.b?.elementId === 'col_end' || d.refs?.a?.elementId === 'col_end')).toBe(true);
    expect(dims.some((d) => d.refs?.b?.elementId === 'bm_cross' || d.refs?.a?.elementId === 'bm_cross')).toBe(true);
  });

  it('cota permanente associativa: ao selecionar parede, aparece em modo anexado sem duplicar e editar move apenas a parede selecionada', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w_left', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 0, y: 4 } }) });
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w_sel', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 3, y: 0 }, b: { x: 3, y: 4 } }) });

    const ctx = ctxOf(s.project);
    const rawDims = selectionDims(ctx, ['w_sel']);
    const gapDim = rawDims.find(
      (d) => d.key.startsWith('wall:') && (d.refs?.a?.elementId === 'w_left' || d.refs?.b?.elementId === 'w_left'),
    );
    expect(gapDim).toBeDefined();

    for (const cmd of toPermanent('lv_0', [gapDim!])) s.exec(cmd);
    const permId = s.project.levels[0]!.dimensions![0]!.id;

    const after = selectionDims(ctxOf(s.project), ['w_sel']);
    const attached = after.find((d) => d.key === `dimension:${permId}:attached:w_sel`);
    expect(attached).toBeDefined();
    // Não deve duplicar a cota temporária bruta com mesma medição/eixo
    expect(after.filter((d) => Math.abs(d.value - attached!.value) < 1e-3)).toHaveLength(1);
    expect(attached!.edit).toBeDefined();

    const oldRightX = (s.project.elements.w_sel as { a: { x: number } }).a.x;
    const oldLeftX = (s.project.elements.w_left as { a: { x: number } }).a.x;
    const res = attached!.edit!(attached!.value + 1);
    if ('error' in res) throw new Error(res.error);
    for (const c of res.commands) s.exec(c);

    expect((s.project.elements.w_left as { a: { x: number } }).a.x).toBeCloseTo(oldLeftX, 6);
    expect((s.project.elements.w_sel as { a: { x: number } }).a.x).toBeGreaterThan(oldRightX + 0.5);
  });

  it('alternar Face ↔ Eixo independente em cada ponta e customTargets para parede/grade com edição dirigida', () => {
    const p = createEmptyProject();
    applyCommand(p, {
      type: 'addWall',
      wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: -2 }, b: { x: 0, y: 2 } }),
    });
    applyCommand(p, {
      type: 'addWall',
      wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 6, y: -2 }, b: { x: 6, y: 2 } }),
    });
    applyCommand(p, {
      type: 'addColumn',
      column: makeColumn({ id: 'col1', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 3, y: 0 } }),
    });
    applyCommand(p, {
      type: 'addGrid',
      grid: { id: 'g1', name: 'A', typeId: DEFAULT_GRID_TYPE_ID, points: [{ x: 8, y: -3 }, { x: 8, y: 3 }], sag: 0, bubbleStart: true, bubbleEnd: true },
    });

    // Alterna só a ponta do pilar para eixo (`axis`), mantendo a parede alvo em face acabada (`finish`).
    const dimsAxis = selectionDims(ctxOf(p, { 'column:col1:axisX:axisXSelf': 'axis' }), ['col1']);
    const dimAxis = dimsAxis.find((d) => d.key === 'column:col1:axisX')!;
    expect(dimAxis.ends[0]!.current).toBe('axis');
    expect(dimAxis.ends[1]!.current).toBe('finish');
    expect(dimAxis.value).toBeCloseTo(3 - 0.092, 6);

    // Custom target: arrastado para a grade `g1` em x = 8, editando para distância 3,00 move o pilar para x = 5,00 (com eixo).
    const dimsGrid = selectionDims({
      ...ctxOf(p, { 'column:col1:axisX:axisXSelf': 'axis' }),
      customTargets: { 'column:col1:axisX': { kind: 'grid', gridId: 'g1' } },
    }, ['col1']);
    const gridDim = dimsGrid.find((d) => d.key === 'column:col1:axisX')!;
    expect(gridDim.value).toBeCloseTo(5, 6);
    const moveRes = gridDim.edit!(3);
    if ('error' in moveRes) throw new Error(moveRes.error);
    for (const c of moveRes.commands) applyCommand(p, c);
    expect((p.elements.col1 as { at: { x: number } }).at.x).toBeCloseTo(5, 6);

    // Parede w1 com customTarget apontando para w2 em x = 6 (normal de w2 aponta para -x, logo wall-face-hi está em 6 - 0.092).
    const wDims = selectionDims({
      ...ctxOf(p, { 'wall:w1:right:gapRightA': 'axis' }),
      customTargets: { 'wall:w1:right': { kind: 'element', ref: { elementId: 'w2', feature: 'wall-face-hi' } } },
    }, ['w1']);
    const wCustom = wDims.find((d) => d.key === 'wall:w1:right')!;
    expect(wCustom.value).toBeCloseTo(6 - 0.092, 5);
  });
});
