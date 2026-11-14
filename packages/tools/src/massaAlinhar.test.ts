import { describe, expect, it } from 'vitest';
import { massaM1 } from '@hestia/engine/src/fixtureMassa.ts';
import { makeWall, type Id, type Mass, type Project } from '@hestia/model';
import { alignFeaturesAt } from './alignFeatures.ts';
import { solveAlign } from './alignSolve.ts';
import { clickAt, makeEnv, tool } from './testEnv.ts';

/**
 * Alinhar com o alvo `'massa'` (ficha T1c, item b): a feição de aresta da massa diz que o alvo é a própria massa, e o Alinhar leva a massa
 * até a referência pelo `transform` do id (o mesmo efeito de antes, agora com o alvo nomeado).
 */
const get = (p: Project, id: Id): Mass => p.elements[id] as Mass;

describe('Alinhar: alvo `massa`', () => {
  it('a aresta da massa é feição com alvo `massa` e o solver devolve o mesmo alvo com o deslocamento até a referência', () => {
    const ctx = makeEnv();
    ctx.store.exec({ type: 'addMass', mass: massaM1() });
    const f = alignFeaturesAt({ project: ctx.store.project, levelId: 'lv_0', at: { x: 2, y: 3 }, metersPerPixel: 0.01 }).find((x) => x.kind === 'arestaMassa');
    expect(f).toBeDefined();
    expect(f!.move).toEqual({ policy: 'transladar', target: 'massa', id: 'm1' });
    // Referência horizontal em y = 5: a aresta de cima da massa (y = 3) sobe 2 m.
    const sol = solveAlign({ p: { x: 0, y: 5 }, d: { x: 1, y: 0 } }, f!, ctx.store.project);
    expect(sol).toMatchObject({ kind: 'transladar', target: 'massa', id: 'm1' });
    if (sol.kind !== 'transladar') throw new Error('o solver deveria transladar a massa');
    expect(sol.d.x).toBeCloseTo(0, 9);
    expect(sol.d.y).toBeCloseTo(2, 9);
  });

  it('Alinhar com a parede como referência leva a massa até ela; um passo de desfazer', () => {
    const ctx = makeEnv();
    ctx.store.exec({ type: 'addMass', mass: massaM1() });
    ctx.store.exec({ type: 'addWall', wall: makeWall({ id: 'w_ref', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: -8, y: 5 }, b: { x: 8, y: 5 }, locationLine: 'wallCenter' }) });
    ctx.options.alignPrefer = 'eixos';
    const t = tool('align', ctx.env);
    clickAt(t, 3, 5); // referência: eixo da parede (y = 5)
    clickAt(t, 2, 3); // aresta de cima da massa (y = 3)
    expect(get(ctx.store.project, 'm1').origem.y).toBeCloseTo(2, 9);
    ctx.store.undo();
    expect(get(ctx.store.project, 'm1').origem).toEqual({ x: 0, y: 0 });
    ctx.store.redo();
    expect(get(ctx.store.project, 'm1').origem.y).toBeCloseTo(2, 9);
  });
});
