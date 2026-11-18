import { describe, expect, it } from 'vitest';
import { DEFAULT_AREA_GRAPHICS, ProjectStore, createEmptyProject, makeRoom, type AreaPlan, type RoomTag } from '@hestia/model';
import { P, drawWall, makeEnv, tool, walls } from './testEnv.ts';
import { areaPlansOf } from '@hestia/model';

const plan = (g: Partial<typeof DEFAULT_AREA_GRAPHICS> = {}): AreaPlan => ({
  id: 'ap1', name: 'A', levelId: 'lv_0', scale: 50,
  graphics: { ...DEFAULT_AREA_GRAPHICS, ...g, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault } }, tags: [],
});
const roomTag = (): RoomTag => ({ id: 'rt1', planId: 'ap1', roomId: 'r1', at: { x: 5, y: 5 }, orientation: 'horizontal', leader: 'none', fields: ['name'], visible: true });

function setup(g: Partial<typeof DEFAULT_AREA_GRAPHICS>, withTag = false) {
  const store = new ProjectStore(createEmptyProject());
  const ctx = makeEnv(store);
  store.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: 'lv_0', name: 'Sala', number: '1', point: { x: 2, y: 1.5 } }) });
  drawWall(ctx.env, [0, 0], [4, 0]);
  store.exec({ type: 'addAreaPlan', plan: plan(g) });
  if (withTag) store.exec({ type: 'addRoomTag', planId: 'ap1', tag: roomTag() });
  ctx.setAreaPlanId('ap1');
  return ctx;
}

const click = (t: ReturnType<typeof tool>, x: number, y: number) => { t.down?.(P(x, y)); t.up?.(P(x, y)); };
const box = (t: ReturnType<typeof tool>, a: [number, number], b: [number, number]) => { t.down?.(P(...a)); t.drag?.(P(...b)); t.up?.(P(...b)); };

describe('seleção respeita o perfil da vista (planta de área)', () => {
  it('parede visível é selecionada por clique e por janela', () => {
    const c = setup({ showWalls: 'normal' });
    const t = tool('select', c.env);
    click(t, 2, 0);
    expect(c.sel()).toEqual([walls(c.store)[0]!.id]);
    c.env.setSelection([]);
    box(t, [-1, -1], [5, 1]);
    expect(c.sel()).toContain(walls(c.store)[0]!.id);
  });
  it('parede oculta pelo perfil não é selecionada por clique nem por janela', () => {
    const c = setup({ showWalls: 'hidden' });
    const t = tool('select', c.env);
    click(t, 2, 0);
    expect(c.sel()).toEqual([]);
    box(t, [-1, -1], [5, 1]);
    expect(c.sel()).toEqual([]);
  });
  it('planta de piso fica inalterada: seleciona a parede mesmo com o perfil da área oculto', () => {
    const c = setup({ showWalls: 'hidden' });
    c.setAreaPlanId(null);
    const t = tool('select', c.env);
    click(t, 2, 0);
    expect(c.sel()).toEqual([walls(c.store)[0]!.id]);
  });
});

describe('etiqueta de ambiente (RoomTag) da vista', () => {
  it('é selecionável por clique e por janela', () => {
    const c = setup({}, true);
    const t = tool('select', c.env);
    click(t, 5, 5);
    expect(c.sel()).toEqual(['rt1']);
    c.env.setSelection([]);
    box(t, [3, 3], [7, 7]);
    expect(c.sel()).toEqual(['rt1']);
  });
  it('arrastar grava em RoomTag.at e não em Room.labelPosition', () => {
    const c = setup({}, true);
    const t = tool('select', c.env);
    click(t, 5, 5);
    t.down?.(P(5, 5));
    t.drag?.(P(6, 7));
    t.up?.(P(6, 7));
    const tag = areaPlansOf(c.store.project)[0]!.tags[0]!;
    expect(tag.at.x).toBeCloseTo(6);
    expect(tag.at.y).toBeCloseTo(7);
  });
  it('hover gera contorno de destaque', () => {
    const c = setup({}, true);
    const t = tool('select', c.env);
    t.move(P(5, 5));
    expect(t.preview().some((i) => i.kind === 'polygon')).toBe(true);
  });
  it('na planta de piso a etiqueta não é alvo', () => {
    const c = setup({}, true);
    c.setAreaPlanId(null);
    const t = tool('select', c.env);
    click(t, 5, 5);
    expect(c.sel()).toEqual([]);
  });
});
