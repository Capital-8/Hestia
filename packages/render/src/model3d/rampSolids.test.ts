import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeLevel, makeRamp, ProjectStore, type StairLanding, type StairRun } from '@hestia/model';
import { planRamp, resolveRamps, type RampPlan, type ResolvedRamp } from '@hestia/engine';
import { buildRampSolids } from './rampSolids.ts';

const TYPE = createEmptyProject().rampTypes.rmt_nbr9050!;

const componentsOf = (plan: RampPlan): Array<StairRun | StairLanding> =>
  plan.parts.map((x, i) => (x.kind === 'run' ? { id: `c${i}`, kind: 'run', ...x.run } : { id: `c${i}`, kind: 'landing', ...x.landing }));

function build(H = 0.8): ResolvedRamp {
  const plan = planRamp({ start: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, H, type: TYPE, shape: 'straight', turn: 'left', width: 1.5, mode: 'slope', slope: 1 / 12 });
  if ('error' in plan) throw new Error(plan.error);
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_top', name: 'Topo', elevation: H }) });
  store.exec({
    type: 'addRamp',
    ramp: makeRamp({ id: 'rp1', typeId: TYPE.id, levelId: 'lv_0', topLevelId: 'lv_top', components: componentsOf(plan), inputMode: 'slope', slopeTarget: 1 / 12 }),
  });
  return resolveRamps(store.project)[0]!;
}

describe('sólidos de rampa (3D, §4.2)', () => {
  it('1 lance: 1 lote, topo de 0 a 0,80 e fundo 0,150519 abaixo, com ids da rampa', () => {
    const rr = build(0.8);
    const batches = buildRampSolids([rr]);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.category).toBe('ramp');
    expect(batches[0]!.materialId).toBe(TYPE.materialId);
    expect(batches[0]!.ids.length).toBeGreaterThan(0);
    const zs = batches[0]!.positions.filter((_, i) => i % 3 === 2);
    expect(Math.min(...zs)).toBeCloseTo(-0.1505199, 5);
    expect(Math.max(...zs)).toBeCloseTo(0.8, 6);
  });

  it('rampa com erro (ramp-run-edges) não gera malha', () => {
    const rr = build(0.8);
    const broken: ResolvedRamp = { ...rr, issues: [{ code: 'ramp-run-edges', severity: 'error', message: 'x', rampId: rr.id }] };
    expect(buildRampSolids([broken])).toEqual([]);
  });

  it('duas rampas do mesmo material caem no mesmo lote', () => {
    const rr = build(0.8);
    const batches = buildRampSolids([rr, { ...rr, id: 'rp2' }]);
    expect(batches).toHaveLength(1);
    expect(new Set(batches[0]!.ids.map((r) => r.id))).toEqual(new Set(['rp1', 'rp2']));
  });
});
