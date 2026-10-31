import { describe, expect, it } from 'vitest';
import {
  defaultStairTypeId,
  makeStair,
  stairsOnLevel,
  wallsOnLevel,
  type StairCurve,
  type StairRun,
  type Wall,
} from '@hestia/model';
import { COMPONENT_EDGE_MSG } from './componentTarget.ts';
import { clickAt, drawWall, makeEnv, tool } from './testEnv.ts';

const curve = (ax: number, ay: number, bx: number, by: number): StairCurve => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sag: 0 });

/** Lance sobre a parede (y de 2 a 5): a linha direita fica a 2 m do eixo da parede. */
const run = (id: string): StairRun => ({
  id,
  kind: 'run',
  boundaryLeft: [curve(0, 2, 0, 5)],
  boundaryRight: [curve(1, 2, 1, 5)],
  risers: [curve(0, 2, 1, 2)],
  path: [],
});

/** Parede de 6 m no eixo X, com uma escada a 2 m dela. */
function wallAndStair() {
  const ctx = makeEnv();
  drawWall(ctx.env, [0, 0], [6, 0]);
  ctx.store.exec({
    type: 'addStair',
    stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', components: [run('r1')] }),
  });
  const msgs: string[] = [];
  ctx.env.say = (m: string) => msgs.push(m);
  ctx.options.offsetCopy = false;
  return { ...ctx, msgs };
}

const wallOf = (ctx: ReturnType<typeof wallAndStair>): Wall => wallsOnLevel(ctx.store.project, 'lv_0')[0]!;

describe('Deslocar: escada/rampa não é parede', () => {
  it('clique na linha da escada a 2 m da parede não desloca a parede', () => {
    const ctx = wallAndStair();
    const before = { ...wallOf(ctx).a };
    const t = tool('offset', ctx.env);
    clickAt(t, 1, 2.5);
    expect(ctx.msgs).toContain(COMPONENT_EDGE_MSG);
    expect(wallOf(ctx).a).toEqual(before);
    expect(wallsOnLevel(ctx.store.project, 'lv_0')).toHaveLength(1);
  });

  it('o cursor na linha da escada destaca a escada, não a parede de baixo', () => {
    const ctx = wallAndStair();
    const t = tool('offset', ctx.env);
    t.move({ raw: { x: 1, y: 2.5 }, shift: false, ctrl: false, alt: false });
    expect(t.preview()).toContainEqual({ kind: 'highlight', ids: ['st1'] });
    expect(t.preview().some((i) => i.kind === 'highlight' && i.ids.includes(wallsOnLevel(ctx.store.project, 'lv_0')[0]!.id))).toBe(false);
    expect(stairsOnLevel(ctx.store.project, 'lv_0')).toHaveLength(1);
  });

  it('clique no vazio a 2 m da parede também não desloca (tolerância de cursor, não de 5 m)', () => {
    const ctx = makeEnv();
    drawWall(ctx.env, [0, 0], [6, 0]);
    ctx.options.offsetCopy = false;
    ctx.options.offsetDistance = 0.5;
    const before = wallsOnLevel(ctx.store.project, 'lv_0')[0]!.a;
    const t = tool('offset', ctx.env);
    clickAt(t, 3, 2);
    expect(wallsOnLevel(ctx.store.project, 'lv_0')[0]!.a).toEqual(before);
    // Na faixa da parede continua deslocando normalmente.
    clickAt(t, 3, 0.01);
    expect(wallsOnLevel(ctx.store.project, 'lv_0')[0]!.a.y).toBeCloseTo(0.5, 9);
  });
});
