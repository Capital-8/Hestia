import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { DEFAULT_STAIR_TYPES, ProjectStore, createEmptyProject, defaultStairTypeId, makeLevel, makeRamp, makeStair, type StairCurve, type StairRun } from '@hestia/model';
import { computeSection } from './index.ts';
import { planRamp } from './rampPlan.ts';
import { planStairFree } from './stairFree.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });
const ln = (ax: number, ay: number, bx: number, by: number): StairCurve => ({ a: v(ax, ay), b: v(bx, by), sag: 0 });

const xs = Array.from({ length: 16 }, (_, k) => k * 0.28);
const run: StairRun = {
  id: 'run0',
  kind: 'run',
  boundaryLeft: [ln(0, 0.6, 4.2, 0.6)],
  boundaryRight: [ln(0, -0.6, 4.2, -0.6)],
  risers: xs.map((x) => ln(x, -1, x, 1)),
  path: [],
};

function build() {
  const base = createEmptyProject();
  const store = new ProjectStore({ ...base, levels: base.levels.map((l) => (l.id === 'lv_1' ? { ...l, elevation: 2.8 } : l)) });
  store.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', components: [run] }) });
  return store.project;
}

describe('anéis de captura da escada no corte', () => {
  const p = build();
  const long = computeSection(p, { a: v(-1, 0), b: v(6, 0), depth: 2 });
  const elev = computeSection(p, { a: v(-1, -3), b: v(6, -3), depth: 10 });

  it('o corte longitudinal expõe um anel por degrau/espelho cortado, com hostId da escada', () => {
    expect(long.snapRings?.length).toBeGreaterThan(10);
    expect(long.snapRings!.every((r) => r.hostId === 'st1' && r.ring.length >= 3)).toBe(true);
  });

  it('a elevação também expõe anéis da escada (além do plano)', () => {
    expect(elev.snapRings?.length).toBeGreaterThan(10);
  });

  it('sem escada o campo não existe', () => {
    expect(computeSection(createEmptyProject(), { a: v(0, 0), b: v(4, 0), depth: 2 }).snapRings).toBeUndefined();
  });
});

describe('anéis de captura: escada livre em L e rampa', () => {
  it('escada livre em L: a elevação expõe anéis do host com vértices da planta (sem envoltória convexa)', () => {
    const base = createEmptyProject();
    const mono = DEFAULT_STAIR_TYPES.find((t) => t.id === 'stt_monolitica')!;
    const plan = planStairFree([v(0, 0), v(3, 0), v(3, 2)], 2.8, mono, { width: 1 });
    if ('error' in plan) throw new Error(plan.error);
    const store = new ProjectStore(base);
    store.exec({
      type: 'addStair',
      stair: makeStair({
        id: 'stL',
        typeId: 'stt_monolitica',
        levelId: 'lv_0',
        topOffset: -0.2,
        height: 3,
        freePath: plan.path,
        components: plan.parts.map((c, i) => (c.kind === 'run' ? { id: `c${i}`, kind: 'run', ...c.run } : { id: `c${i}`, kind: 'landing', ...c.landing })),
      }),
    });
    const r = computeSection(store.project, { a: v(-1, -4), b: v(6, -4), depth: 10 });
    expect(r.snapRings?.length).toBeGreaterThan(0);
    expect(r.snapRings!.every((x) => x.hostId === 'stL')).toBe(true);
  });

  it('rampa: a seção longitudinal expõe anéis com hostId da rampa', () => {
    const type = createEmptyProject().rampTypes.rmt_nbr9050!;
    const planR = planRamp({ start: v(0, 0), dir: v(1, 0), H: 0.8, type, shape: 'straight', turn: 'left', width: 1.5, mode: 'slope', slope: 1 / 12 });
    if ('error' in planR) throw new Error(planR.error);
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_top', name: 'Topo', elevation: 0.8 }) });
    store.exec({
      type: 'addRamp',
      ramp: makeRamp({
        id: 'rpS',
        typeId: type.id,
        levelId: 'lv_0',
        topLevelId: 'lv_top',
        components: planR.parts.map((x, i) => (x.kind === 'run' ? { id: `c${i}`, kind: 'run', ...x.run } : { id: `c${i}`, kind: 'landing', ...x.landing })),
        inputMode: 'slope',
        slopeTarget: 1 / 12,
      }),
    });
    const r = computeSection(store.project, { a: v(-1, 0), b: v(11, 0), depth: 2 });
    expect(r.snapRings?.length).toBeGreaterThan(0);
    expect(r.snapRings!.every((x) => x.hostId === 'rpS')).toBe(true);
  });
});
