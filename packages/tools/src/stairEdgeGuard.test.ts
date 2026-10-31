import { describe, expect, it } from 'vitest';
import {
  defaultStairTypeId,
  makeFloor,
  makeStair,
  wallsOnLevel,
  type Floor,
  type Stair,
  type StairCurve,
  type StairRun,
} from '@hestia/model';
import { COMPONENT_EDGE_MSG } from './componentTarget.ts';
import { clickAt, drawWall, makeEnv, tool } from './testEnv.ts';

const curve = (ax: number, ay: number, bx: number, by: number): StairCurve => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sag: 0 });

const run = (id: string): StairRun => ({
  id,
  kind: 'run',
  boundaryLeft: [curve(0, 2, 0, 5)],
  boundaryRight: [curve(1, 2, 1, 5)],
  risers: [curve(0, 2, 1, 2)],
  path: [],
});

/** Piso 4 × 3 sob a escada, duas paredes e o lance a partir de y = 2. */
function ctxWithStairOverFloor() {
  const ctx = makeEnv();
  ctx.store.exec({
    type: 'addFloor',
    floor: makeFloor({ id: 'f', typeId: 'ft_ceram', levelId: 'lv_0', boundary: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }] }),
  });
  drawWall(ctx.env, [0, 0], [2, 0]);
  drawWall(ctx.env, [0, 0], [0, 2]);
  ctx.store.exec({
    type: 'addStair',
    stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', components: [run('r1')] }),
  });
  const msgs: string[] = [];
  ctx.env.say = (m: string) => msgs.push(m);
  return { ...ctx, msgs };
}

const floorOf = (ctx: ReturnType<typeof ctxWithStairOverFloor>): Floor => ctx.store.project.elements['f'] as Floor;
const stairOf = (ctx: ReturnType<typeof ctxWithStairOverFloor>): Stair => ctx.store.project.elements['st1'] as Stair;
const runOf = (ctx: ReturnType<typeof ctxWithStairOverFloor>): StairRun => stairOf(ctx).components[0] as StairRun;

describe('ferramentas de aresta agem na escada (e não no piso embaixo)', () => {
  it('Dividir: clique na linha da escada insere vértice no croqui e não corta o piso', () => {
    const ctx = ctxWithStairOverFloor();
    const t = tool('split', ctx.env);
    clickAt(t, 1, 2.5);
    expect(ctx.msgs.at(-1)).toBe('Vértice inserido na aresta do croqui.');
    expect(runOf(ctx).boundaryRight).toHaveLength(2);
    expect(floorOf(ctx).boundary).toHaveLength(4);
    expect(ctx.store.project.elements['f2']).toBeUndefined();
  });

  it('Aparar/Estender: duas arestas do croqui fazem o canto e não mexem nas paredes', () => {
    const ctx = ctxWithStairOverFloor();
    // Espelhos em y = 2, 3 e 4: aparar o fim do limite direito até o espelho de y = 4 é um croqui válido.
    ctx.store.exec({
      type: 'updateElements',
      ids: ['st1'],
      patch: { components: [{ ...run('r1'), risers: [curve(0, 2, 1, 2), curve(0, 3, 1, 3), curve(0, 4, 1, 4)] }] },
    });
    const before = wallsOnLevel(ctx.store.project, 'lv_0').map((w) => ({ id: w.id, a: { ...w.a }, b: { ...w.b } }));
    const t = tool('trim', ctx.env);
    clickAt(t, 1, 2.5);
    clickAt(t, 0.5, 4);
    expect(runOf(ctx).boundaryRight[0]!.b).toEqual({ x: 1, y: 4 });
    expect(wallsOnLevel(ctx.store.project, 'lv_0').map((w) => ({ id: w.id, a: w.a, b: w.b }))).toEqual(before);
  });

  it('Mover sem seleção: aresta do croqui da escada move e o piso não se move', () => {
    const ctx = ctxWithStairOverFloor();
    const t = tool('move', ctx.env);
    clickAt(t, 1, 2.5);
    clickAt(t, 2, 2.5);
    expect(runOf(ctx).boundaryRight[0]!.a.x).toBeCloseTo(2, 9);
    expect(runOf(ctx).boundaryRight[0]!.b.x).toBeCloseTo(2, 9);
    expect(floorOf(ctx).boundary[0]).toEqual({ x: 0, y: 0 });
  });

  it('Parede paralela: clique na linha da escada não cria parede', () => {
    const ctx = ctxWithStairOverFloor();
    const antes = wallsOnLevel(ctx.store.project, 'lv_0').length;
    const t = tool('parallel', ctx.env);
    clickAt(t, 1, 2.5);
    expect(ctx.msgs).toContain(COMPONENT_EDGE_MSG);
    expect(wallsOnLevel(ctx.store.project, 'lv_0')).toHaveLength(antes);
  });
});
