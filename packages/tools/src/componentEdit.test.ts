import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { DEFAULT_RAMP_TYPES, type Ramp, type Stair, type StairCurve, type StairRun } from '@hestia/model';
import { planRamp } from '@hestia/engine';
import { makeEnv } from './testEnv.ts';
import { createStairFromComponents } from './stairCommands.ts';
import { createRampFromPlan, updateRampComponents } from './rampCommands.ts';
import { commitComponentEdge, moveEdge } from './componentEdit.ts';
import type { ComponentEdgeRef } from './componentEdge.ts';

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

function withStair(extra: Parameters<typeof createStairFromComponents>[2] = {}) {
  const ctx = makeEnv();
  const r = createStairFromComponents(ctx.env, [straight()], extra);
  if (!('id' in r)) throw new Error(r.error);
  return { ...ctx, id: r.id, stair: () => ctx.store.project.elements[r.id] as Stair };
}

const rampRef = (elementId: string, part = 0): ComponentEdgeRef => ({ elementId, part, key: 'boundaryRight', index: 0 });

/** Cria uma rampa reta de teste e devolve o ambiente e o id. */
function withRamp() {
  const ctx = makeEnv();
  const type = DEFAULT_RAMP_TYPES.find((t) => t.id === 'rmt_nbr9050')!;
  const plan = planRamp({ start: v(0, 0), dir: v(1, 0), H: 0.8, type, shape: 'straight', turn: 'left', width: 1.5, mode: 'slope', slope: 1 / 12 });
  if ('error' in plan) throw new Error(plan.error);
  const r = createRampFromPlan(ctx.env, plan, { typeId: 'rmt_nbr9050', levelId: 'lv_0', shape: 'straight', turn: 'left', inputMode: 'slope', slopeTarget: 1 / 12 });
  if (!('id' in r)) throw new Error(r.error);
  return { ...ctx, id: r.id, ramp: () => ctx.store.project.elements[r.id] as Ramp };
}

describe('commit da edição de aresta', () => {
  it('escada: move a aresta, grava em um passo e Ctrl+Z desfaz', () => {
    const w = withStair();
    const ref: ComponentEdgeRef = { elementId: w.id, part: 0, key: 'boundaryRight', index: 0 };
    expect(moveEdge(w.env, ref, v(0, -0.1))).toEqual({ ok: true });
    const c = (w.stair().components[0] as StairRun).boundaryRight[0]!;
    expect(c.a.y).toBeCloseTo(-0.6, 9);
    expect(c.b.y).toBeCloseTo(-0.6, 9);
    w.store.undo();
    expect((w.stair().components[0] as StairRun).boundaryRight[0]!.a.y).toBeCloseTo(-0.5, 9);
  });

  it('escada livre (freePath) é recusada e não muda o croqui', () => {
    const w = withStair({ freePath: [v(0, 0), v(1, 0), v(2, 0)] });
    const before = JSON.stringify(w.stair().components);
    const r = moveEdge(w.env, { elementId: w.id, part: 0, key: 'boundaryRight', index: 0 }, v(0, -0.1));
    expect(r).toEqual({ ok: false, error: 'A escada livre não permite editar arestas do croqui.' });
    expect(JSON.stringify(w.stair().components)).toBe(before);
  });

  it('rampa: move a aresta e Ctrl+Z desfaz', () => {
    const w = withRamp();
    const part = w.ramp().components.findIndex((c) => c.kind === 'run');
    const before = (w.ramp().components[part] as StairRun).boundaryRight[0]!.a.y;
    expect(moveEdge(w.env, rampRef(w.id, part), v(0, 0.1))).toEqual({ ok: true });
    expect((w.ramp().components[part] as StairRun).boundaryRight[0]!.a.y).toBeCloseTo(before + 0.1, 9);
    w.store.undo();
    expect((w.ramp().components[part] as StairRun).boundaryRight[0]!.a.y).toBeCloseTo(before, 9);
  });

  it('rampa livre (forma free ou freePath) é recusada', () => {
    const w = withRamp();
    const part = w.ramp().components.findIndex((c) => c.kind === 'run');
    w.store.exec({ type: 'updateElements', ids: [w.id], patch: { shape: 'free' } });
    expect(moveEdge(w.env, rampRef(w.id, part), v(0, 0.1))).toEqual({ ok: false, error: 'A rampa livre não permite editar arestas do croqui.' });
    w.store.exec({ type: 'updateElements', ids: [w.id], patch: { shape: 'straight', freePath: [v(0, 0), v(1, 0)] } });
    expect(moveEdge(w.env, rampRef(w.id, part), v(0, 0.1))).toEqual({ ok: false, error: 'A rampa livre não permite editar arestas do croqui.' });
  });

  it('elemento que não é escada nem rampa é recusado', () => {
    const w = withStair();
    expect(commitComponentEdge(w.env, 'nao_existe', [straight()])).toEqual({ ok: false, error: 'O elemento não é uma escada nem uma rampa.' });
  });
});

describe('updateRampComponents', () => {
  it('grava o croqui e desfaz em um passo', () => {
    const w = withRamp();
    const comps = w.ramp().components;
    const moved = comps.map((c) => (c.kind === 'run' ? { ...c, boundaryLeft: c.boundaryLeft.map((x) => ({ ...x, a: { ...x.a, y: x.a.y + 0.2 }, b: { ...x.b, y: x.b.y + 0.2 } })) } : c));
    expect(updateRampComponents(w.env, w.id, moved)).toEqual({ ok: true });
    const c = (w.ramp().components[0] as StairRun).boundaryLeft[0]!;
    expect(c.a.y).toBeCloseTo((comps[0] as StairRun).boundaryLeft[0]!.a.y + 0.2, 9);
    w.store.undo();
    expect((w.ramp().components[0] as StairRun).boundaryLeft[0]!.a.y).toBeCloseTo((comps[0] as StairRun).boundaryLeft[0]!.a.y, 9);
  });

  it('recusa croqui vazio, curva sem comprimento e rampa livre', () => {
    const w = withRamp();
    expect(updateRampComponents(w.env, w.id, [])).toEqual({ error: 'O croqui da rampa precisa de pelo menos um componente.' });
    const zero: StairRun = { ...straight(), boundaryLeft: [{ a: v(1, 1), b: v(1, 1), sag: 0 }] };
    expect(updateRampComponents(w.env, w.id, [zero])).toEqual({ error: 'O croqui da rampa tem uma curva sem comprimento.' });
    w.store.exec({ type: 'updateElements', ids: [w.id], patch: { freePath: [v(0, 0), v(1, 0)] } });
    expect(updateRampComponents(w.env, w.id, w.ramp().components)).toEqual({ error: 'A rampa livre não permite editar o croqui pelos componentes.' });
  });

  it('rampa inexistente é recusada', () => {
    const w = withRamp();
    expect(updateRampComponents(w.env, 'nao_existe', w.ramp().components)).toEqual({ error: 'Rampa não encontrada.' });
  });
});
