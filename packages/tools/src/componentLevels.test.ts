import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, defaultRampTypeId, defaultStairTypeId, makeLevel, makeRamp, makeStair, type StairRun } from '@hestia/model';
import { planComponentsInLevel } from './componentLevels.ts';

const run = (id: string): StairRun => ({
  id,
  kind: 'run',
  boundaryLeft: [{ a: { x: 0, y: 0 }, b: { x: 0, y: 4 }, sag: 0 }],
  boundaryRight: [{ a: { x: 1, y: 0 }, b: { x: 1, y: 4 }, sag: 0 }],
  risers: [{ a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, sag: 0 }],
  path: [],
});

function storeWithStairAndRamp() {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_2', name: 'Pav. 3', elevation: 6 }) });
  store.exec({ type: 'addStair', stair: makeStair({ id: 'st0', typeId: defaultStairTypeId, levelId: 'lv_0', topLevelId: 'lv_1', components: [run('r0')] }) });
  store.exec({ type: 'addRamp', ramp: makeRamp({ id: 'rp1', typeId: defaultRampTypeId, levelId: 'lv_0', topLevelId: 'lv_1', components: [run('rr1')] }) });
  return store;
}

describe('planComponentsInLevel', () => {
  it('inclui a escada/rampa que nasce no nível e a que chega nele', () => {
    const store = storeWithStairAndRamp();
    expect(planComponentsInLevel(store.project, 'lv_0').map((e) => e.id)).toEqual(['st0', 'rp1']);
    expect(planComponentsInLevel(store.project, 'lv_1').map((e) => e.id)).toEqual(['st0', 'rp1']);
  });

  it('não inclui elemento que não nasce, não chega e não atravessa o nível', () => {
    const store = storeWithStairAndRamp();
    expect(planComponentsInLevel(store.project, 'lv_2')).toEqual([]);
  });
});
