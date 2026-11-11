import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeRoom } from './index.ts';
import { DEFAULT_AREA_GRAPHICS, DEFAULT_TAG_FIELDS, type AreaPlan, type RoomTag } from './areaPlan.ts';
import { roomIssues } from './validateRooms.ts';
import { areaPlansOf } from './index.ts';

const plan = (over: Partial<AreaPlan> = {}): AreaPlan => ({
  id: 'ap1',
  name: 'Planta de área — Térreo',
  levelId: 'lv_0',
  scale: 50,
  graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault, fields: [...DEFAULT_TAG_FIELDS] } },
  tags: [],
  ...over,
});

const tag = (over: Partial<RoomTag> = {}): RoomTag => ({
  id: 'tag1',
  planId: 'ap1',
  roomId: 'r1',
  at: { x: 2, y: 1.5 },
  orientation: 'horizontal',
  leader: 'none',
  fields: [...DEFAULT_TAG_FIELDS],
  visible: true,
  ...over,
});

function withRoom(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: 'lv_0', name: 'Sala', number: '101', point: { x: 2, y: 1.5 } }) });
  return s;
}

describe('planta de área · modelo e comandos', () => {
  it('cria a planta com os gráficos padrão e sem cor', () => {
    const s = withRoom();
    s.exec({ type: 'addAreaPlan', plan: plan({ graphics: undefined as never }) });
    const p = areaPlansOf(s.project)[0]!;
    expect(p.graphics.fill).toBe('none');
    expect(p.graphics.referenceLines).toBe('always');
    expect(p.graphics.tagDefault.leader).toBe('straight');
  });

  it('uma etiqueta por ambiente e por planta', () => {
    const s = withRoom();
    s.exec({ type: 'addAreaPlan', plan: plan() });
    s.exec({ type: 'addRoomTag', planId: 'ap1', tag: tag() });
    expect(areaPlansOf(s.project)[0]!.tags).toHaveLength(1);
    expect(() => s.exec({ type: 'addRoomTag', planId: 'ap1', tag: tag({ id: 'tag2' }) })).toThrow('já tem etiqueta');
  });

  it('apagar o ambiente remove a etiqueta; apagar a planta não apaga o ambiente', () => {
    const s = withRoom();
    s.exec({ type: 'addAreaPlan', plan: plan() });
    s.exec({ type: 'addRoomTag', planId: 'ap1', tag: tag() });
    s.exec({ type: 'removeAreaPlan', id: 'ap1' });
    expect(s.project.elements.r1).toBeTruthy();
    s.exec({ type: 'addAreaPlan', plan: plan() });
    s.exec({ type: 'addRoomTag', planId: 'ap1', tag: tag() });
    s.exec({ type: 'removeRoom', id: 'r1' });
    expect(areaPlansOf(s.project)[0]!.tags).toHaveLength(0);
  });

  it('move a etiqueta e muda o líder sem tocar no ponto do ambiente', () => {
    const s = withRoom();
    s.exec({ type: 'addAreaPlan', plan: plan() });
    s.exec({ type: 'addRoomTag', planId: 'ap1', tag: tag() });
    s.exec({ type: 'updateRoomTag', planId: 'ap1', id: 'tag1', patch: { at: { x: 8, y: 8 }, leader: 'kinked' } });
    expect(areaPlansOf(s.project)[0]!.tags[0]!.at).toEqual({ x: 8, y: 8 });
    expect((s.project.elements.r1 as { point: { x: number; y: number } }).point).toEqual({ x: 2, y: 1.5 });
  });

  it('grava e limpa o ponto de referência', () => {
    const s = withRoom();
    s.exec({ type: 'setRoomReference', id: 'r1', point: { x: 3, y: 3 } });
    expect((s.project.elements.r1 as { referencePoint?: { x: number } }).referencePoint).toEqual({ x: 3, y: 3 });
    s.exec({ type: 'setRoomReference', id: 'r1', point: null });
    expect((s.project.elements.r1 as { referencePoint?: unknown }).referencePoint).toBeUndefined();
  });

  it('recusa pé-direito zero e nível inexistente', () => {
    const s = withRoom();
    s.exec({ type: 'updateRoom', id: 'r1', patch: { ceilingHeight: 0 } });
    expect(roomIssues(s.project).some((i) => i.code === 'room-ceiling-height')).toBe(true);
    expect(() => s.exec({ type: 'addAreaPlan', plan: plan({ levelId: 'nope' }) })).toThrow('nível inexistente');
  });

  it('avisa número repetido no mesmo nível, sem bloquear', () => {
    const s = withRoom();
    s.exec({ type: 'addRoom', room: makeRoom({ id: 'r2', levelId: 'lv_0', name: 'Quarto', number: '101', point: { x: 1, y: 1 } }) });
    const issues = roomIssues(s.project);
    expect(issues.some((i) => i.code === 'room-number-duplicate' && i.severity === 'warning')).toBe(true);
  });

  it('categoria: editar uma categoria padrão preserva as demais', () => {
    const s = withRoom();
    const before = (s.project.roomCategories ?? []).length;
    s.exec({ type: 'upsertRoomCategory', category: { id: 'rc_sala', name: 'Estar', code: 'ES', color: '#ff0000', hatch: 'solid' } });
    expect((s.project.roomCategories ?? [])).toHaveLength(before);
    expect((s.project.roomCategories ?? []).find((c) => c.id === 'rc_sala')?.name).toBe('Estar');
    s.exec({ type: 'updateElements', ids: ['r1'], patch: { categoryId: 'rc_sala' } });
    expect((s.project.elements.r1 as { categoryId?: string }).categoryId).toBe('rc_sala');
  });

  it('ida e volta de JSON preserva planta, etiquetas e referência', () => {
    const s = withRoom();
    s.exec({ type: 'setRoomReference', id: 'r1', point: { x: 3, y: 2 } });
    s.exec({ type: 'addAreaPlan', plan: plan() });
    s.exec({ type: 'addRoomTag', planId: 'ap1', tag: tag() });
    const round = JSON.parse(JSON.stringify(s.project));
    expect(round.planViews.find((v: { id: string }) => v.id === 'ap1').area.tags[0].roomId).toBe('r1');
    expect(round.elements.r1.referencePoint).toEqual({ x: 3, y: 2 });
  });
});
