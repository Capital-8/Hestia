import { describe, expect, it } from 'vitest';
import {
  defaultRampTypeId,
  makeRamp,
  type Ramp,
  type StairCurve,
  type StairRun,
} from '@hestia/model';
import { alignFeaturesAt } from './alignFeatures.ts';
import { solveAlign } from './alignSolve.ts';
import { applyAlign } from './alignApply.ts';
import { makeEnv } from './testEnv.ts';

const curve = (ax: number, ay: number, bx: number, by: number): StairCurve => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sag: 0 });

const run = (id: string): StairRun => ({
  id,
  kind: 'run',
  boundaryLeft: [curve(0, 2, 0, 5)],
  boundaryRight: [curve(1, 2, 1, 5)],
  risers: [curve(0, 2, 1, 2)],
  path: [],
});

function ctxWithRamp() {
  const ctx = makeEnv();
  ctx.store.exec({
    type: 'addRamp',
    ramp: makeRamp({ id: 'rp1', typeId: defaultRampTypeId, levelId: 'lv_0', components: [run('rc1')] }),
  });
  return ctx;
}

const rampOf = (ctx: ReturnType<typeof ctxWithRamp>): Ramp => ctx.store.project.elements['rp1'] as Ramp;

describe('Alinhar rampa', () => {
  it('a linha da rampa vira feição arestaRampa com alvo rampa', () => {
    const ctx = ctxWithRamp();
    const features = alignFeaturesAt({
      project: ctx.store.project,
      levelId: 'lv_0',
      at: { x: 0.5, y: 2 },
      metersPerPixel: 0.01,
    });
    const feira = features.find((f) => f.kind === 'arestaRampa');
    expect(feira).toBeDefined();
    expect(feira!.label).toBe('espelho da rampa');
    expect(feira!.ownerId).toBe('rp1');
    expect(feira!.move).toEqual({ policy: 'transladar', target: 'rampa', id: 'rp1' });
  });

  it('com referência paralela, o Alinhar devolve transladar a rampa (e aplica a translação)', () => {
    const ctx = ctxWithRamp();
    const features = alignFeaturesAt({
      project: ctx.store.project,
      levelId: 'lv_0',
      at: { x: 0.5, y: 2 },
      metersPerPixel: 0.01,
    });
    // O espelho em y = 2 é horizontal: serve para alinhar a rampa a uma referência horizontal.
    const feira = features.find((f) => f.kind === 'arestaRampa' && Math.abs(f.line.d.x) > 0.99);
    expect(feira).toBeDefined();
    const sol = solveAlign({ p: { x: 0, y: 0 }, d: { x: 1, y: 0 } }, feira!, ctx.store.project);
    expect(sol.kind).toBe('transladar');
    if (sol.kind !== 'transladar') return;
    expect(sol.target).toBe('rampa');
    expect(sol.d.x).toBeCloseTo(0, 9);
    expect(sol.d.y).toBeCloseTo(-2, 9);

    expect(applyAlign(ctx.env, sol)).toBe(true);
    const r = rampOf(ctx).components[0] as StairRun;
    expect(r.risers[0]!.a.y).toBeCloseTo(0, 9);
    expect(r.boundaryLeft[0]!.a.y).toBeCloseTo(0, 9);
  });
});
