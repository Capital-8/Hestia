import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AREA_GRAPHICS,
  createEmptyProject,
  levelRoomSeparators,
  makeFloor,
  makeWall,
  planAnnotationsOf,
  ProjectStore,
  type AreaPlan,
} from '@hestia/model';
import { makeEnv, P, tool, walls } from './testEnv.ts';
import type { SelectTool } from './selectTool.ts';
import { areaPlansOf } from '@hestia/model';

/**
 * Regra da planta de área (F0): a vista é de análise/anotação. Elementos de modelo continuam selecionáveis (clique e
 * janela), mas o `select` não os arrasta e nenhuma alça de modelo é oferecida. Anotações, separador de ambiente e o
 * rótulo do ambiente (no controlador) continuam editáveis. A planta de piso não muda.
 */
const plan = (id = 'ap1'): AreaPlan => ({
  id,
  name: `Planta de área ${id}`,
  levelId: 'lv_0',
  scale: 50,
  graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault } },
  tags: [],
});

function comPlantaDeArea() {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addAreaPlan', plan: plan() });
  const ctx = makeEnv(store);
  ctx.setAreaPlanId('ap1');
  return ctx;
}

const textAt = (store: ProjectStore) =>
  planAnnotationsOf(areaPlansOf(store.project).find((p) => p.id === 'ap1')!).texts;

describe('planta de área · o select é somente leitura para o modelo', () => {
  it('arrastar uma parede selecionada não move o modelo', () => {
    const ctx = comPlantaDeArea();
    ctx.store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    ctx.env.setSelection(['w1']);
    const s = tool('select', ctx.env) as SelectTool;
    s.down(P(2, 0));
    s.drag(P(3, 0));
    s.up(P(3, 0));
    expect(walls(ctx.store)[0]!.a).toEqual({ x: 0, y: 0 });
    expect(walls(ctx.store)[0]!.b).toEqual({ x: 4, y: 0 });
  });

  it('arrastar sobre a parede selecionada vira janela de seleção (o arrasto continua servindo para selecionar)', () => {
    const ctx = comPlantaDeArea();
    ctx.store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    ctx.env.setSelection(['w1']);
    const s = tool('select', ctx.env) as SelectTool;
    s.down(P(2, 0));
    s.drag(P(-1, -2));
    s.up(P(-1, -2));
    expect(ctx.sel()).toEqual(['w1']);
    expect(walls(ctx.store)[0]!.a).toEqual({ x: 0, y: 0 });
  });

  it('clicar numa parede continua selecionando (clique seco, sem arrasto)', () => {
    const ctx = comPlantaDeArea();
    ctx.store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    const s = tool('select', ctx.env) as SelectTool;
    s.down(P(2, 0));
    s.up(P(2, 0));
    expect(ctx.sel()).toEqual(['w1']);
  });

  it('piso selecionado: arrastar não move a geometria e o cursor não mostra alças de modelo', () => {
    const ctx = comPlantaDeArea();
    const boundary = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
    ctx.store.exec({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'lv_0', boundary }) });
    ctx.env.setSelection(['f1']);
    const s = tool('select', ctx.env) as SelectTool;
    s.move(P(2, 1.5));
    expect(s.preview().some((i) => i.kind === 'point')).toBe(false);
    s.down(P(2, 1.5));
    s.drag(P(3, 2.5));
    s.up(P(3, 2.5));
    expect((ctx.store.project.elements.f1 as { boundary: unknown }).boundary).toEqual(boundary);
  });

  it('arrastar a alça do texto da planta de área continua movendo a anotação', () => {
    const ctx = comPlantaDeArea();
    ctx.store.exec({ type: 'addText', levelId: 'lv_0', planId: 'ap1', text: { id: 't1', at: { x: 2, y: 2 }, text: 'Nota', height: 0.25, rotation: 0 } });
    ctx.env.setSelection(['t1']);
    const s = tool('select', ctx.env) as SelectTool;
    s.down(P(2, 2));
    s.drag(P(3, 3));
    s.up(P(3, 3));
    expect(textAt(ctx.store)[0]!.at).toEqual({ x: 3, y: 3 });
  });

  it('a alça do separador de ambiente funciona mesmo com a extremidade sobre uma parede (a alça de anotação vence)', () => {
    const ctx = comPlantaDeArea();
    ctx.store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    ctx.store.exec({ type: 'addRoomSeparator', levelId: 'lv_0', separator: { id: 's1', a: { x: 2, y: 0 }, b: { x: 2, y: 3 } } });
    ctx.env.setSelection(['s1']);
    const s = tool('select', ctx.env) as SelectTool;
    s.down(P(2, 0));
    s.drag(P(2, 1));
    s.up(P(2, 1));
    expect(levelRoomSeparators(ctx.store.project, 'lv_0')[0]).toEqual({ id: 's1', a: { x: 2, y: 1 }, b: { x: 2, y: 3 } });
    expect(walls(ctx.store)[0]!.a).toEqual({ x: 0, y: 0 });
  });

  it('arrastar a alça do separador de ambiente continua funcionando na planta de área', () => {
    const ctx = comPlantaDeArea();
    ctx.store.exec({ type: 'addRoomSeparator', levelId: 'lv_0', separator: { id: 's1', a: { x: 2, y: 1 }, b: { x: 2, y: 5 } } });
    ctx.env.setSelection(['s1']);
    const s = tool('select', ctx.env) as SelectTool;
    s.down(P(2, 5));
    s.drag(P(2, 4));
    s.up(P(2, 4));
    expect(levelRoomSeparators(ctx.store.project, 'lv_0')[0]).toEqual({ id: 's1', a: { x: 2, y: 1 }, b: { x: 2, y: 4 } });
  });
});

describe('planta de piso · mover e alças continuam como hoje', () => {
  it('arrastar uma parede selecionada move o modelo', () => {
    const ctx = makeEnv();
    ctx.store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    ctx.env.setSelection(['w1']);
    const s = tool('select', ctx.env) as SelectTool;
    s.down(P(2, 0));
    s.drag(P(3, 0));
    s.up(P(3, 0));
    expect(walls(ctx.store)[0]!.a).toEqual({ x: 1, y: 0 });
    expect(walls(ctx.store)[0]!.b).toEqual({ x: 5, y: 0 });
  });

  it('piso selecionado mostra as alças de vértice e de aresta', () => {
    const ctx = makeEnv();
    const boundary = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
    ctx.store.exec({ type: 'addFloor', floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'lv_0', boundary }) });
    ctx.env.setSelection(['f1']);
    const s = tool('select', ctx.env) as SelectTool;
    s.move(P(2, 1.5));
    expect(s.preview().filter((i) => i.kind === 'point')).toHaveLength(8);
  });
});
