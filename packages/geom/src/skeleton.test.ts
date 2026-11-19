import { describe, expect, it } from 'vitest';
import { weightedSkeleton, type SkeletonArc, type SkeletonFace } from './skeleton.ts';
import { polygonArea, ringArea } from './polygon.ts';
import { v2, type Vec2 } from './vec.ts';

const rect = (w: number, h: number): Vec2[] => [v2(0, 0), v2(w, 0), v2(w, h), v2(0, h)];
const len = (s: SkeletonArc): number => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
const sumArea = (fs: SkeletonFace[]): number => fs.reduce((s, f) => s + Math.abs(ringArea(f.polygon)), 0);
const areas = (fs: SkeletonFace[]): number[] => fs.map((f) => Math.abs(ringArea(f.polygon))).sort((a, b) => a - b);

describe('esqueleto reto com pesos', () => {
  it('retângulo 8×6 com pesos 0,30: 2 trapézios + 2 triângulos, cumeeira de 2 m a z = 0,90', () => {
    const r = weightedSkeleton({ outer: rect(8, 6), holes: [], weights: [[0.3, 0.3, 0.3, 0.3]] });
    expect(r.ok).toBe(true);
    expect(r.faces).toHaveLength(4);
    [9, 9, 15, 15].forEach((a, i) => expect(areas(r.faces)[i]).toBeCloseTo(a, 6));
    expect(sumArea(r.faces)).toBeCloseTo(48, 6);
    expect(r.arcs).toHaveLength(5);
    const ridge = r.arcs.filter((s) => Math.abs(len(s) - 2) < 1e-6);
    expect(ridge).toHaveLength(1);
    expect(ridge[0]!.za).toBeCloseTo(0.9, 6);
    expect(ridge[0]!.zb).toBeCloseTo(0.9, 6);
  });

  it('quadrado 6×6 com pesos 0,30: pirâmide, vértice no centro com z = 0,90', () => {
    const r = weightedSkeleton({ outer: rect(6, 6), holes: [], weights: [[0.3, 0.3, 0.3, 0.3]] });
    expect(r.ok).toBe(true);
    expect(r.faces).toHaveLength(4);
    expect(areas(r.faces).every((a) => Math.abs(a - 9) < 1e-6)).toBe(true);
    expect(r.arcs).toHaveLength(4);
    for (const s of r.arcs) {
      expect(Math.hypot(s.b.x - 3, s.b.y - 3) < 1e-6 || Math.hypot(s.a.x - 3, s.a.y - 3) < 1e-6).toBe(true);
      const apex = Math.hypot(s.b.x - 3, s.b.y - 3) < 1e-6 ? s.zb : s.za;
      expect(apex).toBeCloseTo(0.9, 6);
    }
  });

  it('retângulo 8×6 com lados curtos de peso 0: gable com cumeeira de 8 m a z = 0,90 e sem faces nas empenas', () => {
    const r = weightedSkeleton({ outer: rect(8, 6), holes: [], weights: [[0.3, 0, 0.3, 0]] });
    expect(r.ok).toBe(true);
    expect(r.faces).toHaveLength(2);
    expect(areas(r.faces)).toEqual([24, 24]);
    expect(r.arcs).toHaveLength(1);
    expect(len(r.arcs[0]!)).toBeCloseTo(8, 6);
    expect(r.arcs[0]!.za).toBeCloseTo(0.9, 6);
    expect(r.arcs[0]!.zb).toBeCloseTo(0.9, 6);
  });

  it('retângulo com um lado de peso 0,30 e os outros 0: uma água cobrindo tudo, z máximo 1,80', () => {
    const r = weightedSkeleton({ outer: rect(8, 6), holes: [], weights: [[0.3, 0, 0, 0]] });
    expect(r.ok).toBe(true);
    expect(r.faces).toHaveLength(1);
    expect(sumArea(r.faces)).toBeCloseTo(48, 6);
    expect(Math.max(...r.faces[0]!.z)).toBeCloseTo(1.8, 6);
    expect(r.arcs).toHaveLength(0);
  });

  it('L ortogonal com pesos 0,30: 6 faces, área total 48', () => {
    const L = [v2(0, 0), v2(8, 0), v2(8, 4), v2(4, 4), v2(4, 8), v2(0, 8)];
    const r = weightedSkeleton({ outer: L, holes: [], weights: [[0.3, 0.3, 0.3, 0.3, 0.3, 0.3]] });
    expect(r.ok).toBe(true);
    expect(r.faces).toHaveLength(6);
    expect(sumArea(r.faces)).toBeCloseTo(polygonArea([L]), 6);
    expect(sumArea(r.faces)).toBeCloseTo(48, 6);
    // rincão: nasce no canto reentrante (4,4) com z = 0
    const valley = r.arcs.filter((s) => (Math.hypot(s.a.x - 4, s.a.y - 4) < 1e-6 && s.za === 0) || (Math.hypot(s.b.x - 4, s.b.y - 4) < 1e-6 && s.zb === 0));
    expect(valley.length).toBeGreaterThan(0);
  });

  it('retângulo 8×6 com pesos 0,2 / 0,4 / 0,2 / 0,4: lados curtos mais íngremes, cumeeira a z = 0,6', () => {
    // Cálculo à mão: cumeeira em y = 3 entre as águas dos lados longos (0,2·3 = 0,6);
    // áreas: triângulos 4,5 e 4,5 nos lados curtos; trapézios 19,5 e 19,5.
    const r = weightedSkeleton({ outer: rect(8, 6), holes: [], weights: [[0.2, 0.4, 0.2, 0.4]] });
    expect(r.ok).toBe(true);
    expect(r.faces).toHaveLength(4);
    expect(areas(r.faces)[0]).toBeCloseTo(4.5, 6);
    expect(areas(r.faces)[1]).toBeCloseTo(4.5, 6);
    expect(areas(r.faces)[2]).toBeCloseTo(19.5, 6);
    expect(areas(r.faces)[3]).toBeCloseTo(19.5, 6);
    const ridge = r.arcs.filter((s) => Math.abs(len(s) - 5) < 1e-6);
    expect(ridge).toHaveLength(1);
    expect(ridge[0]!.za).toBeCloseTo(0.6, 6);
    expect(ridge[0]!.zb).toBeCloseTo(0.6, 6);
  });

  it('formas T, U, H, polígono convexo de 10 lados e côncavo: área das faces = área do polígono', () => {
    const shapes: Vec2[][] = [
      [v2(0, 0), v2(9, 0), v2(9, 3), v2(6, 3), v2(6, 9), v2(3, 9), v2(3, 3), v2(0, 3)],
      [v2(0, 0), v2(9, 0), v2(9, 9), v2(6, 9), v2(6, 3), v2(3, 3), v2(3, 9), v2(0, 9)],
      [v2(0, 0), v2(3, 0), v2(3, 4), v2(6, 4), v2(6, 0), v2(9, 0), v2(9, 9), v2(6, 9), v2(6, 5), v2(3, 5), v2(3, 9), v2(0, 9)],
      [v2(0, 0), v2(6, -1), v2(10, 1), v2(11, 5), v2(9, 8), v2(5, 9), v2(2, 8), v2(-1, 5), v2(-1, 2), v2(0, 1)],
      [v2(0, 0), v2(10, 0), v2(10, 6), v2(5, 2), v2(0, 6)],
    ];
    for (const outer of shapes) {
      const w = outer.map(() => 0.3);
      const r = weightedSkeleton({ outer, holes: [], weights: [w] });
      expect(r.ok, r.reason).toBe(true);
      expect(sumArea(r.faces)).toBeCloseTo(polygonArea([outer]), 6);
    }
  });

  it('polígono com furo retangular central (claraboia): faces ao redor do furo', () => {
    const outer = rect(12, 12);
    const hole = [v2(4, 4), v2(4, 8), v2(8, 8), v2(8, 4)];
    const r = weightedSkeleton({ outer, holes: [hole], weights: [[0.3, 0.3, 0.3, 0.3], [0.3, 0.3, 0.3, 0.3]] });
    expect(r.ok, r.reason).toBe(true);
    expect(r.faces.filter((f) => f.ring === 1)).toHaveLength(4);
    expect(sumArea(r.faces)).toBeCloseTo(144 - 16, 6);
  });

  it('pesos diferentes por aresta: cada face respeita o próprio peso', () => {
    const outer = [v2(0, 0), v2(8, 0), v2(8, 6), v2(0, 6)];
    const r = weightedSkeleton({ outer, holes: [], weights: [[0.2, 0.4, 0.2, 0.4]] });
    expect(r.ok).toBe(true);
    for (const f of r.faces) {
      const k = f.edge;
      const a = outer[k]!;
      const b = outer[(k + 1) % 4]!;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      for (let i = 0; i < f.polygon.length; i++) {
        const p = f.polygon[i]!;
        const dist = Math.abs(((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / d);
        const w = [0.2, 0.4, 0.2, 0.4][k]!;
        expect(f.z[i]).toBeCloseTo(w * dist, 6);
      }
    }
  });

  it('claraboia com furo anti-horário', () => {
    const r = weightedSkeleton({
      outer: rect(12, 12),
      holes: [[v2(4, 4), v2(8, 4), v2(8, 8), v2(4, 8)]],
      weights: [[0.3, 0.3, 0.3, 0.3], [0.3, 0.3, 0.3, 0.3]],
    });
    expect(r.ok, r.reason).toBe(true);
    expect(sumArea(r.faces)).toBeCloseTo(128, 6);
  });
  it('furo a 1 m da parede externa', () => {
    const r = weightedSkeleton({
      outer: rect(12, 12),
      holes: [[v2(1, 4), v2(3, 4), v2(3, 8), v2(1, 8)]],
      weights: [[0.3, 0.3, 0.3, 0.3], [0.2, 0.4, 0.2, 0.4]],
    });
    expect(r.ok, r.reason).toBe(true);
    expect(sumArea(r.faces)).toBeCloseTo(136, 6);
  });

  it('entradas inválidas devolvem ok:false com motivo, sem lançar exceção', () => {
    const bowtie = [v2(0, 0), v2(4, 4), v2(4, 0), v2(0, 4)];
    const cases = [
      { outer: bowtie, holes: [], weights: [[0.3, 0.3, 0.3, 0.3]] },
      { outer: [v2(0, 0), v2(4, 0)], holes: [], weights: [[0.3, 0.3]] },
      { outer: [v2(0, 0), v2(1, 0), v2(2, 0)], holes: [], weights: [[0.3, 0.3, 0.3]] },
      { outer: rect(8, 6), holes: [], weights: [[0, 0, 0, 0]] },
    ];
    for (const c of cases) {
      const r = weightedSkeleton(c);
      expect(r.ok).toBe(false);
      expect(typeof r.reason).toBe('string');
      expect(r.reason!.length).toBeGreaterThan(0);
      expect(r.faces).toHaveLength(0);
    }
    expect(weightedSkeleton({ outer: rect(8, 6), holes: [], weights: [[0, 0, 0, 0]] }).reason).toBe(
      'nenhuma aresta define inclinação',
    );
  });
});
