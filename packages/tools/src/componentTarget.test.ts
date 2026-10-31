import { describe, expect, it } from 'vitest';
import {
  defaultRampTypeId,
  defaultStairTypeId,
  makeRamp,
  makeStair,
  type ProjectStore,
  type StairCurve,
  type StairRun,
} from '@hestia/model';
import { componentLineAt, componentUnderCursor } from './componentTarget.ts';
import { makeEnv } from './testEnv.ts';

const curve = (ax: number, ay: number, bx: number, by: number): StairCurve => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sag: 0 });

/** Lance de 1 m de largura entre x=0 e x=1, do pé (y=0) ao topo (y=3). */
const run = (id: string): StairRun => ({
  id,
  kind: 'run',
  boundaryLeft: [curve(0, 0, 0, 3)],
  boundaryRight: [curve(1, 0, 1, 3)],
  risers: [curve(0, 0, 1, 0)],
  path: [],
});

function ctxWithStair(id = 'st1'): { store: ProjectStore; id: string } {
  const { store } = makeEnv();
  store.exec({ type: 'addStair', stair: makeStair({ id, typeId: defaultStairTypeId, levelId: 'lv_0', components: [run('r1')] }) });
  return { store, id };
}

const MPP = 0.01; // 4 px = 4 cm

describe('componentLineAt', () => {
  it('detecta a linha do croqui da escada (limite, espelho e caminhada)', () => {
    const { store } = ctxWithStair();
    expect(componentLineAt(store.project, 'lv_0', { x: 1, y: 1.5 }, MPP)).toEqual({ id: 'st1', kind: 'stair' });
    expect(componentLineAt(store.project, 'lv_0', { x: 0, y: 2.5 }, MPP)).toEqual({ id: 'st1', kind: 'stair' });
    expect(componentLineAt(store.project, 'lv_0', { x: 0.5, y: 0 }, MPP)).toEqual({ id: 'st1', kind: 'stair' });
  });

  it('o interior do lance não conta: só a linha', () => {
    const { store } = ctxWithStair();
    // Centro do lance: 0,5 m das duas bordas e 1,5 m do espelho, bem acima dos 4 cm.
    expect(componentLineAt(store.project, 'lv_0', { x: 0.5, y: 1.5 }, MPP)).toBeNull();
  });

  it('detecta a linha da rampa', () => {
    const { store } = makeEnv();
    store.exec({
      type: 'addRamp',
      ramp: makeRamp({ id: 'rp1', typeId: defaultRampTypeId, levelId: 'lv_0', components: [run('rc1')] }),
    });
    expect(componentLineAt(store.project, 'lv_0', { x: 1, y: 2 }, MPP)).toEqual({ id: 'rp1', kind: 'ramp' });
  });

  it('o elemento mais recente vence quando as linhas se sobrepõem', () => {
    const { store } = ctxWithStair('st1');
    store.exec({ type: 'addStair', stair: makeStair({ id: 'st2', typeId: defaultStairTypeId, levelId: 'lv_0', components: [run('r2')] }) });
    expect(componentLineAt(store.project, 'lv_0', { x: 1, y: 1.5 }, MPP)).toEqual({ id: 'st2', kind: 'stair' });

    // A rampa é ainda mais recente e ganha da escada na mesma linha.
    store.exec({
      type: 'addRamp',
      ramp: makeRamp({ id: 'rp1', typeId: defaultRampTypeId, levelId: 'lv_0', components: [run('rc1')] }),
    });
    expect(componentLineAt(store.project, 'lv_0', { x: 1, y: 1.5 }, MPP)).toEqual({ id: 'rp1', kind: 'ramp' });
  });

  it('ignora escada/rampa de outro nível', () => {
    const { store } = ctxWithStair();
    expect(componentLineAt(store.project, 'lv_9', { x: 1, y: 1.5 }, MPP)).toBeNull();
  });
});

describe('componentUnderCursor', () => {
  it('usa o projeto, o nível e a escala do ambiente', () => {
    const { store } = ctxWithStair();
    const ctx = makeEnv(store);
    expect(componentUnderCursor(ctx.env, { x: 1, y: 1.5 })).toEqual({ id: 'st1', kind: 'stair' });
    expect(componentUnderCursor(ctx.env, { x: 0.5, y: 1.5 })).toBeNull();
  });
});
