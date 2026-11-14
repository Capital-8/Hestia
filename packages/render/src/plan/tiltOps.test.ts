import { describe, expect, it } from 'vitest';
import type { ResolvedWall } from '@hestia/engine';
import { tiltProjectionStrokes } from './tiltOps.ts';
import type { PlanTheme } from './types.ts';

/** F2.5 · projeção de base e topo da parede inclinada na planta. */
const theme = { inkSoft: '#555555' } as PlanTheme;
const quad = (y0: number, y1: number) => [[[{ x: 0, y: y0 }, { x: 4, y: y0 }, { x: 4, y: y1 }, { x: 0, y: y1 }]]];
const wall = (tiltPlan?: ResolvedWall['tiltPlan']) => ({ A: { wallId: 'A', tiltPlan } as ResolvedWall });

describe('tiltProjectionStrokes', () => {
  it('sem tiltPlan (tilt=0): nenhum traço', () => {
    expect(tiltProjectionStrokes(wall(), undefined, undefined, theme, {})).toEqual([]);
  });
  it('com tiltPlan: base sólida em y -0,1035..0,1035 e topo tracejada em 0,7003..0,9074', () => {
    const s = tiltProjectionStrokes(wall({ z: 1.2, base: quad(-0.1035276, 0.1035276), top: quad(0.7003200, 0.9073752) }), undefined, undefined, theme, {});
    expect(s).toHaveLength(2);
    expect(s[0]!.dash).toBeUndefined();
    expect(s[1]!.dash).toEqual([6, 3]);
    expect(Math.max(...s[0]!.pts.map((p) => p.y))).toBeCloseTo(0.1035, 4);
    expect(Math.min(...s[1]!.pts.map((p) => p.y))).toBeCloseTo(0.7003, 4);
  });
  it('parede oculta não gera traço', () => {
    expect(tiltProjectionStrokes(wall({ z: 1.2, base: quad(0, 1), top: quad(0, 1) }), undefined, new Set(['A']), theme, {})).toEqual([]);
  });
});
