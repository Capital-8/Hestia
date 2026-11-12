import { describe, expect, it } from 'vitest';
import { levelDimensions, ProjectStore, createEmptyProject, makeWall, type DimensionElementRef, type Id, type Project } from '@hestia/model';
import { clickAt, drawWall, makeEnv, tool } from './testEnv.ts';
import { createTool } from './registry.ts';
import { toPermanent } from './dims/permanent.ts';
import { endAltOf, pickRefCommands } from './dims/providers/dimension.ts';
import type { TempDim } from './dims/types.ts';

/*
 * Regra 4.5: "cota nova só referencia elemento visível". O que a vista oculta (`ToolEnv.hiddenInView`) não entra como
 * candidato de referência de cota (clique, troca de referência, alternativas da alça, conversão em cota permanente).
 */

const dims = (s: { project: Project }) => levelDimensions(s.project, 'lv_0');

function parede(): ReturnType<typeof makeEnv> {
  const ctx = makeEnv();
  drawWall(ctx.env, [0, 0], [6, 0]);
  const host = Object.values(ctx.store.project.elements).find((e) => e.kind === 'wall')!;
  ctx.store.exec({ type: 'addOpening', opening: { id: 'd1', kind: 'door', typeId: 'ot_p80', hostId: host.id, offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  return ctx;
}

const wallIdOf = (ctx: ReturnType<typeof makeEnv>): Id => Object.values(ctx.store.project.elements).find((e) => e.kind === 'wall')!.id;

const ocultando = (ctx: ReturnType<typeof makeEnv>, ...ids: Id[]): void => {
  ctx.env.hiddenInView = () => new Set(ids);
};

describe('ferramenta Cota: não referencia o que a vista oculta', () => {
  it('visível: a ponta fica presa à parede e à esquadria (controle)', () => {
    const ctx = parede();
    const t = tool('dimension', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 3, 0);
    clickAt(t, 3, 1);
    expect(dims(ctx.store)[0]!.refs?.a).toMatchObject({ feature: 'wall-axis-a' });
    expect(dims(ctx.store)[0]!.refs?.b).toEqual({ elementId: 'd1', feature: 'opening-center' });
  });

  it('esquadria oculta: o ponto é medido mas não vira referência; a parede visível continua referenciada', () => {
    const ctx = parede();
    ocultando(ctx, 'd1');
    const t = tool('dimension', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 3, 0);
    clickAt(t, 3, 1);
    const d = dims(ctx.store)[0]!;
    expect(d.refs?.a).toMatchObject({ feature: 'wall-axis-a' });
    expect(d.refs?.b).toBeUndefined();
  });

  it('parede oculta: nenhuma ponta fica presa a ela (a cota nasce com pontos livres)', () => {
    const ctx = parede();
    ocultando(ctx, wallIdOf(ctx));
    const t = tool('dimension', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 6, 0);
    clickAt(t, 3, 1);
    expect(dims(ctx.store)).toHaveLength(1);
    expect(dims(ctx.store)[0]!.refs).toBeUndefined();
  });

  it('sequência de cotas (cadeia) também não referencia o oculto', () => {
    const ctx = parede();
    ctx.options.dimensionString = 'continuous';
    ocultando(ctx, 'd1');
    const t = tool('dimension', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 3, 0);
    clickAt(t, 6, 0);
    t.confirm();
    clickAt(t, 3, 1);
    const todas = dims(ctx.store);
    expect(todas.length).toBeGreaterThan(0);
    const refs = todas.flatMap((d) => [d.refs?.a, d.refs?.b]).filter((r): r is DimensionElementRef => !!r && 'elementId' in r);
    expect(refs.some((r) => r.elementId === 'd1')).toBe(false);
    expect(refs.some((r) => r.elementId === wallIdOf(ctx))).toBe(true);
  });
});

describe('troca de referência, alternativas e conversão em cota permanente', () => {
  function comCota(): { ctx: ReturnType<typeof makeEnv>; dimId: Id; wallId: Id } {
    const ctx = parede();
    const t = tool('dimension', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 6, 0);
    clickAt(t, 3, 1);
    return { ctx, dimId: dims(ctx.store)[0]!.id, wallId: wallIdOf(ctx) };
  }

  it('pickRefCommands: elemento oculto não é alvo da nova referência', () => {
    const { ctx, dimId } = comCota();
    const p = ctx.store.project;
    expect('commands' in pickRefCommands(p, 'lv_0', dimId, 'b', { x: 3, y: 0 }, 0.05)).toBe(true);
    expect('error' in pickRefCommands(p, 'lv_0', dimId, 'b', { x: 3, y: 0 }, 0.05, 'pt', new Set(['d1']))).toBe(true);
  });

  it('endAltOf: as alternativas da alça não incluem esquadria oculta', () => {
    const { ctx, dimId, wallId } = comCota();
    const p = ctx.store.project;
    const d = dims(ctx.store).find((x) => x.id === dimId)!;
    const ref: DimensionElementRef = { elementId: wallId, feature: 'wall-axis-a' };
    const todas = endAltOf(p, { levelId: 'lv_0' }, d, 'a', ref)!;
    expect(todas.options.some((o) => o.elementId === 'd1')).toBe(true);
    const sem = endAltOf(p, { levelId: 'lv_0' }, d, 'a', ref, new Set(['d1']))!;
    expect(sem.options.some((o) => o.elementId === 'd1')).toBe(false);
    expect(sem.options.some((o) => o.elementId === wallId)).toBe(true);
    // A atual continua sendo a mesma referência dentro da lista filtrada.
    expect(sem.options[sem.current]).toEqual(ref);
  });

  it('toPermanent: a referência a elemento oculto não é gravada (a ponta fica livre)', () => {
    const fim = (x: number): TempDim['ends'][number] => ({ at: { x, y: 0 }, slot: 'a', kind: 'wall', current: 'axis', options: ['axis'] });
    const dim: TempDim = {
      key: 'k', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, offset: 1, value: 3,
      refs: { a: { elementId: 'w1', feature: 'wall-axis-a' }, b: { elementId: 'd1', feature: 'opening-center' } },
      ends: [fim(0), fim(3)],
    };
    const refsDe = (c: unknown): unknown => (c as { dimension: { refs?: unknown } }).dimension.refs;
    expect(refsDe(toPermanent('lv_0', [dim], undefined, undefined, new Set(['d1']))[0])).toEqual({ a: { elementId: 'w1', feature: 'wall-axis-a' } });
    expect(refsDe(toPermanent('lv_0', [{ ...dim, refs: { b: dim.refs!.b } }], undefined, undefined, new Set(['d1']))[0])).toBeUndefined();
    expect(refsDe(toPermanent('lv_0', [dim])[0])).toEqual(dim.refs);
  });
});

describe('Cota angular: não referencia o que a vista oculta', () => {
  function cena(): ProjectStore {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: -3, y: 0 }, b: { x: 3, y: 0 } }) });
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: -3 }, b: { x: 0, y: 3 } }) });
    store.exec({ type: 'addDetailLine', levelId: 'lv_0', item: { id: 'dl1', a: { x: 2, y: 0.5 }, b: { x: 3, y: 2 } } });
    return store;
  }

  const angulares = (hidden: Id[], second: [number, number]) => {
    const store = cena();
    const { env } = makeEnv(store);
    env.hiddenInView = () => new Set(hidden);
    const t = createTool('angularDimension', env);
    t.start();
    clickAt(t, 1.2, 0.01);
    clickAt(t, second[0], second[1]);
    clickAt(t, 1, 1);
    return levelDimensions(store.project, 'lv_0').flatMap((d) => (d.angular ? [d.angular] : []));
  };

  it('parede oculta não vira referência da cota angular', () => {
    expect(angulares([], [0.01, 1.2])).toHaveLength(1);
    expect(angulares(['w2'], [0.01, 1.2])).toHaveLength(0);
  });

  it('linha de detalhe oculta não vira referência da cota angular', () => {
    const livre = angulares([], [2.5, 1.25]);
    expect(livre).toHaveLength(1);
    expect(livre[0]!.refB).toBe('dl1:detalhe');
    expect(angulares(['dl1'], [2.5, 1.25])).toHaveLength(0);
  });
});
