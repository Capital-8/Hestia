import { describe, expect, it } from 'vitest';
import { createEmptyProject, dimensionPoints, dimensionValue, levelDimensions, ProjectStore } from '@hestia/model';
import { toPermanent } from './permanent.ts';
import type { DimEnd, TempDim } from './types.ts';

const end = (x: number): DimEnd => ({ at: { x, y: 0 }, slot: 's', kind: 'wall', current: 'axis', options: ['axis'] });
const dim = (key: string, ax: number, bx: number, offset: number): TempDim => ({ key, a: { x: ax, y: 0 }, b: { x: bx, y: 0 }, offset, value: Math.abs(bx - ax), ends: [end(ax), end(bx)] });

describe('toPermanent', () => {
  it('gera um addDimension por cota, com pontos, afastamento e medida iguais', () => {
    const cmds = toPermanent('lv_0', [dim('a', 1, 2.6, 0.25), dim('b', 3.4, 4.9, -0.25)]);
    expect(cmds).toHaveLength(2);
    const s = new ProjectStore(createEmptyProject());
    s.transaction('Converter', () => cmds.forEach((c) => s.exec(c)));
    const dims = levelDimensions(s.project, 'lv_0');
    expect(dims).toHaveLength(2);
    expect(dims[0]).toMatchObject({ a: { x: 1, y: 0 }, b: { x: 2.6, y: 0 }, offset: 0.25, mode: 'aligned' });
    expect(dims[0]!.unit).toBeUndefined();
    expect(dims[0]!.precision).toBeUndefined();
    expect(dimensionValue(s.project, dims[0]!)).toBeCloseTo(1.6, 6);
    expect(dimensionPoints(s.project, dims[1]!).b).toEqual({ x: 4.9, y: 0 });
    // Desfazer remove tudo de uma vez.
    s.undo();
    expect(levelDimensions(s.project, 'lv_0')).toHaveLength(0);
  });

  it('lista vazia não gera comando; ids são distintos', () => {
    expect(toPermanent('lv_0', [])).toEqual([]);
    const [a, b] = toPermanent('lv_0', [dim('a', 0, 1, 0.2), dim('b', 0, 1, 0.2)]);
    expect(a!.type === 'addDimension' && b!.type === 'addDimension' && a!.dimension.id !== b!.dimension.id).toBe(true);
  });
});

describe('toPermanent com refs', () => {
  it('grava refs das pontas reconhecidas e a cota acompanha o elemento', async () => {
    const { makeWall } = await import('@hestia/model');
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    const d: TempDim = { ...dim('a', 0, 4, 0.25), refs: { a: { elementId: 'w1', feature: 'wall-axis-a' }, b: { elementId: 'w1', feature: 'wall-axis-b' } } };
    s.transaction('c', () => toPermanent('lv_0', [d]).forEach((c) => s.exec(c)));
    const got = levelDimensions(s.project, 'lv_0')[0]!;
    expect(got.refs).toEqual(d.refs);
    s.exec({ type: 'setWallEnds', id: 'w1', b: { x: 6, y: 0 } });
    expect(dimensionValue(s.project, got)).toBe(6);
    expect(toPermanent('lv_0', [dim('x', 0, 1, 0)])[0]).not.toHaveProperty('dimension.refs');
  });
  it('viewId vai no comando', () => {
    expect(toPermanent('lv_0', [dim('a', 0, 1, 0)], 'ap1')[0]).toMatchObject({ viewId: 'ap1' });
  });
});
