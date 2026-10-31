import { describe, expect, it } from 'vitest';
import {
  defaultStairTypeId,
  makeFloor,
  makeStair,
  wallsOnLevel,
  type Floor,
  type StairCurve,
  type StairRun,
} from '@hestia/model';
import { COMPONENT_EDGE_MSG, COMPONENT_MOVE_MSG } from './componentTarget.ts';
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

describe('ferramentas de aresta não agem na escada (nem no piso embaixo)', () => {
  it('Dividir: clique na linha da escada avisa e não corta o piso', () => {
    const ctx = ctxWithStairOverFloor();
    const t = tool('split', ctx.env);
    clickAt(t, 1, 2.5);
    expect(ctx.msgs.at(-1)).toBe(COMPONENT_EDGE_MSG);
    expect(floorOf(ctx).boundary).toHaveLength(4);
    expect(ctx.store.project.elements['f2']).toBeUndefined();
  });

  it('Aparar/Estender: clique na linha da escada avisa e não mexe nas paredes', () => {
    const ctx = ctxWithStairOverFloor();
    const before = wallsOnLevel(ctx.store.project, 'lv_0').map((w) => ({ id: w.id, a: { ...w.a }, b: { ...w.b } }));
    const t = tool('trim', ctx.env);
    clickAt(t, 1, 2.5);
    expect(ctx.msgs).toContain(COMPONENT_EDGE_MSG);
    expect(wallsOnLevel(ctx.store.project, 'lv_0').map((w) => ({ id: w.id, a: w.a, b: w.b }))).toEqual(before);
  });

  it('Mover sem seleção: clique na linha da escada pede para selecionar o elemento inteiro', () => {
    const ctx = ctxWithStairOverFloor();
    const t = tool('move', ctx.env);
    clickAt(t, 1, 2.5);
    expect(ctx.msgs).toContain(COMPONENT_MOVE_MSG);
    // A ferramenta continua à espera (não sai para Selecionar) e o piso não se move.
    expect(ctx.done()).toBe(0);
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
