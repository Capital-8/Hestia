import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeLevel, makeWall, ProjectStore, type Opening } from '@hestia/model';
import { clipboardFrom, pasteAlignedToLevelsCommand } from '@hestia/tools';
import { planViewOf } from './view.ts';

describe('REPRO vista da planta após colar', () => {
  it('lv_1 tem paredes com camadas depois de colar e depois de excluir a porta', () => {
    const store = new ProjectStore({ ...createEmptyProject(), levels: [] });
    for (const [id, elevation] of [['lv_0', 0], ['lv_1', 3]] as const) store.exec({ type: 'upsertLevel', level: makeLevel({ id, name: id, elevation }) });
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 4, y: 0 }, b: { x: 4, y: 3 } }) });
    const d: Opening = { id: 'd1', kind: 'door', typeId: 'ot_p80', hostId: 'w1', offset: 1, flipHand: false, flipFacing: false, sillOverride: null, mark: '' };
    store.exec({ type: 'addOpening', opening: d });
    store.exec({ type: 'addOpening', opening: { ...d, id: 'j1', kind: 'window', typeId: 'ot_j120', offset: 3 } });
    // vista antes (lv_1 vazio) e depois
    const vazia = planViewOf(store.project, 'lv_1');
    const clip = clipboardFrom(store.project, ['w1', 'w2', 'd1', 'j1'])!;
    store.exec(pasteAlignedToLevelsCommand(store.project, clip, ['lv_1'])!.command);
    const depois = planViewOf(store.project, 'lv_1');
    const info = (v: typeof depois) => ({ walls: Object.keys(v.geo.walls), layers: Object.values(v.geo.walls).map((w) => w.layers.length), clusters: v.geo.clusters.length, outlines: v.outlines.length });
    console.log('VAZIA', JSON.stringify(info(vazia)));
    console.log('DEPOIS', JSON.stringify(info(depois)));
    expect(Object.keys(depois.geo.walls)).toHaveLength(2);
    expect(Object.values(depois.geo.walls).every((w) => w.layers.length > 0)).toBe(true);
    store.exec({ type: 'deleteElements', ids: [Object.values(store.project.elements).find((e) => e.kind === 'door' && e.levelId === undefined && (e as Opening).hostId && store.project.elements[(e as Opening).hostId]?.levelId === 'lv_1')!.id] });
    const apos = planViewOf(store.project, 'lv_1');
    console.log('APOS EXCLUIR', JSON.stringify(info(apos)));
    expect(Object.keys(apos.geo.walls)).toHaveLength(2);
  });
});
