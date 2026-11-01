import { describe, expect, it } from 'vitest';
import { defaultRampTypeId, makeFloor, makeRamp, type Floor, type Ramp, type StairCurve, type StairRun } from '@hestia/model';
import { clickAt, makeEnv, tool } from './testEnv.ts';

const curve = (ax: number, ay: number, bx: number, by: number): StairCurve => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sag: 0 });

const run = (id: string): StairRun => ({
  id,
  kind: 'run',
  boundaryLeft: [curve(0, 2, 0, 5)],
  boundaryRight: [curve(1, 2, 1, 5)],
  risers: [curve(0, 2, 1, 2)],
  path: [],
});

/** Rampa sobre um piso 4 × 3; o clique em x = 1, y = 3 cai no limite direito do lance. */
function ctxWithRampOverFloor() {
  const ctx = makeEnv();
  ctx.store.exec({
    type: 'addFloor',
    floor: makeFloor({ id: 'f', typeId: 'ft_ceram', levelId: 'lv_0', boundary: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }] }),
  });
  ctx.store.exec({
    type: 'addRamp',
    ramp: makeRamp({ id: 'rp1', typeId: defaultRampTypeId, levelId: 'lv_0', components: [run('rc1')] }),
  });
  const msgs: string[] = [];
  ctx.env.say = (m: string) => msgs.push(m);
  return { ...ctx, msgs };
}

const rampOf = (ctx: ReturnType<typeof ctxWithRampOverFloor>): Ramp => ctx.store.project.elements['rp1'] as Ramp;
const runOf = (ctx: ReturnType<typeof ctxWithRampOverFloor>): StairRun => rampOf(ctx).components[0] as StairRun;
const floorOf = (ctx: ReturnType<typeof ctxWithRampOverFloor>): Floor => ctx.store.project.elements['f'] as Floor;

describe('ferramentas de aresta na rampa', () => {
  it('Deslocar move a aresta da rampa e não o piso embaixo', () => {
    const ctx = ctxWithRampOverFloor();
    ctx.options.offsetDistance = 1;
    ctx.options.offsetCopy = false;
    clickAt(tool('offset', ctx.env), 1, 3);
    expect(runOf(ctx).boundaryRight[0]!.a.x).toBeCloseTo(2, 9);
    expect(floorOf(ctx).boundary).toHaveLength(4);
  });

  it('Dividir insere vértice na aresta da rampa e não parte o piso', () => {
    const ctx = ctxWithRampOverFloor();
    clickAt(tool('split', ctx.env), 1, 3);
    expect(runOf(ctx).boundaryRight).toHaveLength(2);
    expect(floorOf(ctx).boundary).toHaveLength(4);
  });

  it('Mover sem seleção move a aresta da rampa e não o piso', () => {
    const ctx = ctxWithRampOverFloor();
    const t = tool('move', ctx.env);
    clickAt(t, 1, 3);
    clickAt(t, 2, 3);
    expect(runOf(ctx).boundaryRight[0]!.a.x).toBeCloseTo(2, 9);
    expect(runOf(ctx).boundaryRight[0]!.b.x).toBeCloseTo(2, 9);
    expect(floorOf(ctx).boundary[0]).toEqual({ x: 0, y: 0 });
  });
});
