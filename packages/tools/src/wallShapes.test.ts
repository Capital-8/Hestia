import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { circleSegments, ellipseSegments, polygonSegments, splineSegments, type WallSegment } from './wallShapes.ts';

const len = (s: WallSegment) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
const closedChain = (segs: WallSegment[]) =>
  segs.every((s, i) => Math.hypot(s.b.x - segs[(i + 1) % segs.length]!.a.x, s.b.y - segs[(i + 1) % segs.length]!.a.y) < 1e-9);

describe('wallShapes', () => {
  it('hexágono r=3 inscrito: 6 paredes de 3,0000', () => {
    const s = polygonSegments({ x: 0, y: 0 }, { x: 3, y: 0 }, 6);
    expect(s).toHaveLength(6);
    for (const w of s) { expect(len(w)).toBeCloseTo(3, 9); expect(w.sag).toBe(0); }
    expect(closedChain(s)).toBe(true);
  });
  it('hexágono r=3 circunscrito: lados de 3,4641', () => {
    const s = polygonSegments({ x: 0, y: 0 }, { x: 3, y: 0 }, 6, true);
    expect(s).toHaveLength(6);
    for (const w of s) expect(len(w)).toBeCloseTo(3.4641, 4);
    expect(closedChain(s)).toBe(true);
  });
  it('polígono é horário (face externa à esquerda)', () => {
    const s = polygonSegments({ x: 0, y: 0 }, { x: 2, y: 0 }, 5);
    let area = 0;
    for (const w of s) area += w.a.x * w.b.y - w.b.x * w.a.y;
    expect(area).toBeLessThan(0);
  });
  it('círculo r=3: 2 paredes, sag=±r, a=(-3,0), b=(3,0)', () => {
    const s = circleSegments({ x: 0, y: 0 }, 3);
    expect(s).toHaveLength(2);
    expect(s[0]!.a).toEqual({ x: -3, y: 0 });
    expect(s[0]!.b).toEqual({ x: 3, y: 0 });
    expect(Math.abs(s[0]!.sag)).toBe(3);
    expect(s[1]!.a).toEqual(s[0]!.b);
    expect(s[1]!.b).toEqual(s[0]!.a);
    expect(Math.abs(s[1]!.sag)).toBe(3);
  });
  it('elipse rx=4, ry=2: 16 arcos tangentes encadeados', () => {
    const s = ellipseSegments({ x: 0, y: 0 }, 4, 2);
    expect(s).toHaveLength(16);
    expect(closedChain(s)).toBe(true);
    let area = 0;
    for (const w of s) area += w.a.x * w.b.y - w.b.x * w.a.y;
    expect(area).toBeLessThan(0);
  });
  it('spline aberta e fechada encadeiam', () => {
    const pts: Vec2[] = [{ x: 0, y: 0 }, { x: 2, y: 1 }, { x: 4, y: 0 }, { x: 6, y: 1 }];
    const o = splineSegments(pts);
    expect(o.length).toBeGreaterThan(0);
    for (let i = 0; i + 1 < o.length; i++) expect(Math.hypot(o[i]!.b.x - o[i + 1]!.a.x, o[i]!.b.y - o[i + 1]!.a.y)).toBeLessThan(1e-9);
    const c = splineSegments([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }], true);
    expect(c.length).toBeGreaterThan(0);
    expect(closedChain(c)).toBe(true);
  });
  it('formas degeneradas devolvem [] sem lançar', () => {
    const o = { x: 0, y: 0 };
    expect(polygonSegments(o, o, 6)).toEqual([]);
    expect(polygonSegments(o, { x: 1, y: 0 }, 2)).toEqual([]);
    expect(polygonSegments(o, { x: 1, y: 0 }, 65)).toEqual([]);
    expect(circleSegments(o, 0)).toEqual([]);
    expect(ellipseSegments(o, 0, 2)).toEqual([]);
    expect(splineSegments([o])).toEqual([]);
    expect(splineSegments([o, { x: 1, y: 1 }], true)).toEqual([]);
  });
});
