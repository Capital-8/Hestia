import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AREA_GRAPHICS,
  ProjectStore,
  createEmptyProject,
  levelDimensions,
  levelTexts,
  makeRoom,
  makeWall,
  planAnnotationsOf,
  floorViewId,
  viewAnnotationsOf,
  type AreaPlan,
} from '@hestia/model';
import { clickAt, makeEnv, P, tool } from './testEnv.ts';
import { areaPlansOf } from '@hestia/model';

const LV0 = 'lv_0';

const plan = (id: string): AreaPlan => ({
  id,
  name: `Planta de área ${id}`,
  levelId: LV0,
  scale: 50,
  graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault } },
  tags: [],
});

function withAreaPlan(areaPlanId: string | null) {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: LV0, name: 'Sala', number: '101', point: { x: 2, y: 1.5 } }) });
  store.exec({ type: 'addAreaPlan', plan: plan('ap1') });
  const ctx = makeEnv(store);
  ctx.setAreaPlanId(areaPlanId);
  return ctx;
}

const annotationsOf = (s: ProjectStore) => planAnnotationsOf(areaPlansOf(s.project).find((p) => p.id === 'ap1')!);

describe('ferramentas de anotação numa planta de área', () => {
  it('cota, texto, detalhe e etiqueta vão para a planta quando areaPlanId existe', () => {
    const ctx = withAreaPlan('ap1');

    const dim = tool('dimension', ctx.env);
    clickAt(dim, 0, 0);
    clickAt(dim, 4, 0);
    clickAt(dim, 2, 1);

    const text = tool('text', ctx.env);
    clickAt(text, 1, 1);
    expect(text.type('Sala')).toBe(true);

    const line = tool('detailLine', ctx.env);
    clickAt(line, 0, 2);
    clickAt(line, 3, 2);

    const region = tool('filledRegion', ctx.env);
    clickAt(region, 0, 0);
    clickAt(region, 1, 0);
    clickAt(region, 1, 1);
    region.confirm();

    ctx.env.setSelection(['r1']);
    const tag = tool('tag', ctx.env);
    clickAt(tag, 2, 2);

    const a = annotationsOf(ctx.store);
    expect(a.dimensions).toHaveLength(1);
    expect(a.texts.map((x) => x.text)).toEqual(['Sala']);
    expect(a.detailLines).toHaveLength(1);
    expect(a.detailRegions).toHaveLength(1);
    expect(a.tags.map((x) => x.hostId)).toEqual(['r1']);

    expect(levelDimensions(ctx.store.project, LV0)).toHaveLength(0);
    expect(levelTexts(ctx.store.project, LV0)).toHaveLength(0);
    const doNivel = viewAnnotationsOf(ctx.store.project, floorViewId(LV0));
    expect(doNivel.detailLines).toHaveLength(0);
    expect(doNivel.detailRegions).toHaveLength(0);
    expect(doNivel.tags).toHaveLength(0);
  });

  it('sem planta de área, as ferramentas continuam gravando no nível', () => {
    const ctx = withAreaPlan(null);

    const dim = tool('dimension', ctx.env);
    clickAt(dim, 0, 0);
    clickAt(dim, 4, 0);
    clickAt(dim, 2, 1);

    const text = tool('text', ctx.env);
    clickAt(text, 1, 1);
    expect(text.type('Sala')).toBe(true);

    ctx.env.setSelection(['r1']);
    const tag = tool('tag', ctx.env);
    clickAt(tag, 2, 2);

    expect(levelDimensions(ctx.store.project, LV0)).toHaveLength(1);
    expect(levelTexts(ctx.store.project, LV0)).toHaveLength(1);
    expect(viewAnnotationsOf(ctx.store.project, floorViewId(LV0)).tags).toHaveLength(1);
    expect(annotationsOf(ctx.store).dimensions).toHaveLength(0);
  });
});

const press = (t: ReturnType<typeof tool>, x: number, y: number) => { t.move(P(x, y)); t.down!(P(x, y)); t.up!(P(x, y)); };

describe('seleção com paredes ocultas pelo perfil da planta de área', () => {
  it('abertura visível continua selecionável; a parede oculta não', () => {
    const ctx = withAreaPlan('ap1');
    ctx.store.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: LV0, a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    ctx.store.exec({ type: 'addOpening', opening: { id: 'd', kind: 'door', typeId: 'ot_p80', hostId: 'w', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    ctx.store.exec({ type: 'updateAreaPlan', id: 'ap1', patch: { graphics: { ...DEFAULT_AREA_GRAPHICS, showWalls: 'hidden', showOpenings: true } } } as never);
    const t = tool('select', ctx.env);
    press(t, 2, 0);
    expect(ctx.sel()).toEqual(['d']);
    ctx.env.setSelection([]);
    press(t, 0.3, 0);
    expect(ctx.sel()).toEqual([]);
  });
});
