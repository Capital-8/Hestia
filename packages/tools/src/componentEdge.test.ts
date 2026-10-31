import { describe, expect, it } from 'vitest';
import { dist, type Vec2 } from '@hestia/geom';
import { DEFAULT_RAMP_TYPES, type Ramp, type Stair, type StairCurve, type StairLanding, type StairRun } from '@hestia/model';
import { planRamp } from '@hestia/engine';
import { makeEnv } from './testEnv.ts';
import { createStairFromComponents } from './stairCommands.ts';
import { createRampFromPlan } from './rampCommands.ts';
import {
  componentEdgeAt,
  componentEdgeChain,
  componentEdgeCurve,
  pickComponentEdgeAt,
  replaceComponentEdge,
  type ComponentEdgeRef,
} from './componentEdge.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });
const ln = (a: Vec2, b: Vec2): StairCurve => ({ a, b, sag: 0 });

/** Lance reto válido: limites em y = ±0,5 de x = −0,5 a 5; espelhos em `xs`. */
function straight(xs: number[] = [0, 1, 2]): StairRun {
  return {
    id: 'r_test',
    kind: 'run',
    boundaryLeft: [ln(v(-0.5, 0.5), v(5, 0.5))],
    boundaryRight: [ln(v(-0.5, -0.5), v(5, -0.5))],
    risers: xs.map((x) => ln(v(x, -1), v(x, 1))),
    path: [],
  };
}

/** Lance com limite esquerdo em arco (flecha 1), como no teste das alças. */
function arcRun(): StairRun {
  return {
    ...straight(),
    boundaryLeft: [{ a: v(0, 0.5), b: v(4, 0.5), sag: 1 }],
    boundaryRight: [ln(v(0, -0.5), v(4, -0.5))],
    risers: [ln(v(1, -1), v(1, 3)), ln(v(3, -1), v(3, 3))],
  };
}

function withStair(components: Array<StairRun | StairLanding> = [straight()]) {
  const ctx = makeEnv();
  const r = createStairFromComponents(ctx.env, components);
  if (!('id' in r)) throw new Error(r.error);
  return { ...ctx, id: r.id, stair: () => ctx.store.project.elements[r.id] as Stair };
}

describe('pick de aresta do componente', () => {
  it('pega o limite esquerdo da escada e devolve o ponto projetado', () => {
    const w = withStair();
    const pick = pickComponentEdgeAt(w.store.project, 'lv_0', v(1.5, 0.53), 0.01)!;
    expect(pick).not.toBeNull();
    expect(pick.ref).toEqual({ elementId: w.id, part: 0, key: 'boundaryLeft', index: 0 });
    expect(pick.a).toEqual(v(-0.5, 0.5));
    expect(pick.b).toEqual(v(5, 0.5));
    expect(pick.sag).toBe(0);
    expect(pick.at.x).toBeCloseTo(1.5, 9);
    expect(pick.at.y).toBeCloseTo(0.5, 9);
    // Fora da tolerância (4 px = 4 cm), nada.
    expect(pickComponentEdgeAt(w.store.project, 'lv_0', v(1.5, 0.56), 0.01)).toBeNull();
  });

  it('no arco, o ponto projetado é o ponto amostrado mais próximo e o sag vem da curva', () => {
    const w = withStair([arcRun()]);
    const pick = pickComponentEdgeAt(w.store.project, 'lv_0', v(2, 1.53), 0.01)!;
    expect(pick.ref).toMatchObject({ elementId: w.id, part: 0, key: 'boundaryLeft', index: 0 });
    expect(pick.sag).toBe(1);
    expect(dist(pick.at, v(2, 1.5))).toBeLessThan(0.01);
  });

  it('a escada mais recente vence quando as arestas coincidem', () => {
    const ctx = makeEnv();
    const a = createStairFromComponents(ctx.env, [straight()]);
    const b = createStairFromComponents(ctx.env, [straight()]);
    if (!('id' in a) || !('id' in b)) throw new Error('esperava duas escadas');
    const pick = pickComponentEdgeAt(ctx.store.project, 'lv_0', v(1.5, 0.53), 0.01)!;
    expect(pick.ref.elementId).toBe(b.id);
    expect(pick.ref.elementId).not.toBe(a.id);
  });

  it('pega a aresta da rampa do nível', () => {
    const ctx = makeEnv();
    const type = DEFAULT_RAMP_TYPES.find((t) => t.id === 'rmt_nbr9050')!;
    const plan = planRamp({ start: v(0, 0), dir: v(1, 0), H: 0.8, type, shape: 'straight', turn: 'left', width: 1.5, mode: 'slope', slope: 1 / 12 });
    if ('error' in plan) throw new Error(plan.error);
    const r = createRampFromPlan(ctx.env, plan, { typeId: 'rmt_nbr9050', levelId: 'lv_0', shape: 'straight', turn: 'left', inputMode: 'slope', slopeTarget: 1 / 12 });
    if (!('id' in r)) throw new Error(r.error);
    const ramp = ctx.store.project.elements[r.id] as Ramp;
    const part = ramp.components.findIndex((c) => c.kind === 'run');
    const curve = (ramp.components[part] as StairRun).boundaryLeft[0]!;
    const mid = v((curve.a.x + curve.b.x) / 2, (curve.a.y + curve.b.y) / 2);
    // 2 cm para fora do limite (o lado esquerdo do sentido de subida).
    const at = v(mid.x, mid.y + 0.02);
    const pick = pickComponentEdgeAt(ctx.store.project, 'lv_0', at, 0.01)!;
    expect(pick.ref).toMatchObject({ elementId: r.id, part, key: 'boundaryLeft', index: 0 });
    expect(pick.at.x).toBeCloseTo(mid.x, 9);
    expect(pick.at.y).toBeCloseTo(mid.y, 9);
    // O wrapper com o ambiente usa nível e metros por pixel.
    expect(componentEdgeAt(ctx.env, at)!.ref.elementId).toBe(r.id);
  });
});

describe('leitura e substituição da aresta', () => {
  const ref: ComponentEdgeRef = { elementId: 'st', part: 0, key: 'boundaryLeft', index: 0 };

  it('a cadeia é a do mesmo campo e componente', () => {
    const run: StairRun = { ...straight([]), boundaryLeft: [ln(v(0, 0), v(2, 0)), ln(v(2, 0), v(4, 0))] };
    const chain = componentEdgeChain({ components: [run] }, ref);
    expect(chain).toHaveLength(2);
    expect(chain[0]).toBe(run.boundaryLeft[0]);
    expect(componentEdgeCurve({ components: [run] }, ref)).toBe(run.boundaryLeft[0]);
  });

  it('referência impossível devolve null / cadeia vazia (boundary só existe no patamar)', () => {
    const run = straight();
    const bad: ComponentEdgeRef = { elementId: 'st', part: 0, key: 'boundary', index: 0 };
    expect(componentEdgeCurve({ components: [run] }, bad)).toBeNull();
    expect(componentEdgeChain({ components: [run] }, bad)).toEqual([]);
  });

  it('substituir preserva o tipo do componente e os demais campos', () => {
    const run: StairRun = { ...straight(), generatedBy: 'straight', path: [ln(v(0, 0), v(1, 0))] };
    const out = replaceComponentEdge({ components: [run] }, ref, { a: v(0, 2), b: v(5, 2), sag: 0.4 });
    const c = out.components[0] as StairRun;
    expect(c.kind).toBe('run');
    expect(c.id).toBe(run.id);
    expect(c.generatedBy).toBe('straight');
    expect(c.path).toBe(run.path);
    expect(c.boundaryRight).toBe(run.boundaryRight);
    expect(c.boundaryLeft[0]).toEqual({ a: v(0, 2), b: v(5, 2), sag: 0.4 });
    // O original não muda.
    expect(run.boundaryLeft[0]!.a).toEqual(v(-0.5, 0.5));
  });

  it('substituir no patamar mantém o kind landing', () => {
    const landing: StairLanding = { id: 'p_1', kind: 'landing', boundary: [ln(v(0, 0), v(2, 0)), ln(v(2, 0), v(2, 2))] };
    const out = replaceComponentEdge({ components: [landing] }, { elementId: 'st', part: 0, key: 'boundary', index: 1 }, ln(v(2, 0), v(3, 3)));
    const c = out.components[0] as StairLanding;
    expect(c.kind).toBe('landing');
    expect(c.boundary[1]).toEqual(ln(v(2, 0), v(3, 3)));
  });
});
