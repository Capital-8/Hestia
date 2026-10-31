import { describe, expect, it } from 'vitest';
import { arcFromSagitta, arcPointAt, dist, type Vec2 } from '@hestia/geom';
import type { StairCurve, StairLanding, StairRun } from '@hestia/model';
import type { ComponentEdgeRef } from './componentEdge.ts';
import {
  alignComponentEdge,
  moveComponentEdge,
  offsetComponentEdge,
  splitComponentEdge,
  trimComponentEdge,
} from './componentOps.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });
const ln = (a: Vec2, b: Vec2): StairCurve => ({ a, b, sag: 0 });
const arc = (a: Vec2, b: Vec2, sag: number): StairCurve => ({ a, b, sag });

/** Lance só com boundaryLeft (as operações puras não dependem dos demais campos). */
const run = (curves: StairCurve[]): StairRun => ({ id: 'r_test', kind: 'run', boundaryLeft: curves, boundaryRight: [], risers: [], path: [] });
const holder = (curves: StairCurve[]): { components: Array<StairRun | StairLanding> } => ({ components: [run(curves)] });
const ref = (index = 0): ComponentEdgeRef => ({ elementId: 'st', part: 0, key: 'boundaryLeft', index });
const left = (h: { components: Array<{ kind: string }> }): StairCurve[] => (h.components[0] as StairRun).boundaryLeft;

describe('mover aresta do componente', () => {
  it('translada a curva e leva as pontas compartilhadas das vizinhas (cadeia contínua)', () => {
    const h = holder([ln(v(0, 0), v(2, 0)), ln(v(2, 0), v(4, 0))]);
    const out = moveComponentEdge(h, ref(0), v(0, 1));
    const [c0, c1] = left(out);
    expect(c0!.a).toEqual(v(0, 1));
    expect(c0!.b).toEqual(v(2, 1));
    expect(c1!.a).toEqual(v(2, 1));
    expect(c1!.b).toEqual(v(4, 0));
    // O holder original não muda.
    expect(left(h)[0]!.a).toEqual(v(0, 0));
  });

  it('mover a segunda curva ajusta a ponta final da primeira', () => {
    const h = holder([ln(v(0, 0), v(2, 0)), ln(v(2, 0), v(4, 0))]);
    const [c0, c1] = left(moveComponentEdge(h, ref(1), v(0, -1)));
    expect(c0!.b).toEqual(v(2, -1));
    expect(c1!.a).toEqual(v(2, -1));
    expect(c1!.b).toEqual(v(4, -1));
  });

  it('espelhos são linhas soltas: mover um não mexe nos outros', () => {
    const r: StairRun = { ...run([]), risers: [ln(v(1, -1), v(1, 1)), ln(v(2, -1), v(2, 1))] };
    const out = moveComponentEdge({ components: [r] }, { elementId: 'st', part: 0, key: 'risers', index: 0 }, v(0, 0.2));
    const risers = (out.components[0] as StairRun).risers;
    expect(risers[0]!.a).toEqual(v(1, -0.8));
    expect(risers[1]!.a).toEqual(v(2, -1));
  });
});

describe('deslocar aresta do componente', () => {
  it('reta desloca para o lado esquerdo do sentido a→b e reconecta a vizinha', () => {
    const h = holder([ln(v(0, 0), v(2, 0)), ln(v(2, 0), v(2, 2))]);
    const [c0, c1] = left(offsetComponentEdge(h, ref(0), 0.3)!);
    expect(c0!.a.y).toBeCloseTo(0.3, 12);
    expect(c0!.b.y).toBeCloseTo(0.3, 12);
    expect(c1!.a.x).toBeCloseTo(2, 12);
    expect(c1!.a.y).toBeCloseTo(0.3, 12);
  });

  it('arco mantém o centro e muda o raio; null quando o raio deixaria de existir', () => {
    const h = holder([arc(v(0, 0), v(4, 0), 1)]);
    const out = offsetComponentEdge(h, ref(0), 0.5)!;
    const c = left(out)[0]!;
    const a0 = arcFromSagitta(v(0, 0), v(4, 0), 1)!;
    const a1 = arcFromSagitta(c.a, c.b, c.sag)!;
    expect(a1.radius).toBeCloseTo(a0.radius + 0.5, 9);
    expect(offsetComponentEdge(h, ref(0), -2.6)).toBeNull();
  });
});

describe('dividir aresta do componente', () => {
  it('reta vira duas retas no ponto projetado, uma logo após a outra', () => {
    const h = holder([ln(v(0, 0), v(4, 0))]);
    const out = splitComponentEdge(h, ref(0), v(2, 0.7))!;
    const curves = left(out);
    expect(curves).toHaveLength(2);
    expect(curves[0]).toMatchObject({ a: v(0, 0), b: v(2, 0), sag: 0 });
    expect(curves[1]).toMatchObject({ a: v(2, 0), b: v(4, 0), sag: 0 });
  });

  it('corte na ponta não divide', () => {
    const h = holder([ln(v(0, 0), v(4, 0))]);
    expect(splitComponentEdge(h, ref(0), v(0, 0))).toBeNull();
    expect(splitComponentEdge(h, ref(0), v(4, 0))).toBeNull();
  });

  it('arco vira dois arcos com a flecha dos três pontos, sem perder o traço', () => {
    const h = holder([arc(v(0, 0), v(4, 0), 1)]);
    const out = splitComponentEdge(h, ref(0), v(2, 1))!;
    const [c1, c2] = left(out);
    expect(c1!.a).toEqual(v(0, 0));
    expect(c1!.b.x).toBeCloseTo(2, 9);
    expect(c1!.b.y).toBeCloseTo(1, 9);
    expect(c2!.a).toEqual(c1!.b);
    expect(c2!.b).toEqual(v(4, 0));
    expect(c1!.sag).toBeGreaterThan(0);
    expect(c2!.sag).toBeGreaterThan(0);
    // O meio de cada sub-arco continua sobre o arco original (centro (2, −1,5), raio 2,5).
    for (const c of [c1!, c2!]) {
      const a = arcFromSagitta(c.a, c.b, c.sag)!;
      const mid = arcPointAt(a, a.length / 2);
      expect(dist(mid, v(2, -1.5))).toBeCloseTo(2.5, 6);
    }
  });
});

describe('aparar aresta do componente', () => {
  it('move a ponta indicada até a interseção e reconecta a vizinha', () => {
    const h = holder([ln(v(0, 0), v(4, 0)), ln(v(4, 0), v(4, 3))]);
    const [c0, c1] = left(trimComponentEdge(h, ref(0), { p: v(1, 0), d: v(0, 1) }, 'b')!);
    expect(c0!.a).toEqual(v(0, 0));
    expect(c0!.b.x).toBeCloseTo(1, 12);
    expect(c0!.b.y).toBeCloseTo(0, 12);
    expect(c1!.a).toEqual(c0!.b);
  });

  it('linha paralela e arco são recusados', () => {
    const h = holder([ln(v(0, 0), v(4, 0))]);
    expect(trimComponentEdge(h, ref(0), { p: v(0, 1), d: v(1, 0) }, 'b')).toBeNull();
    const a = holder([arc(v(0, 0), v(4, 0), 1)]);
    expect(trimComponentEdge(a, ref(0), { p: v(1, 0), d: v(0, 1) }, 'b')).toBeNull();
  });
});

describe('alinhar aresta do componente', () => {
  it('projeta as duas pontas na reta e reconecta a vizinha', () => {
    const h = holder([ln(v(0, 0), v(4, 0)), ln(v(4, 0), v(4, 3))]);
    const [c0, c1] = left(alignComponentEdge(h, ref(0), { p: v(0, 1), d: v(1, 0) })!);
    expect(c0!.a.y).toBeCloseTo(1, 12);
    expect(c0!.b.y).toBeCloseTo(1, 12);
    expect(c1!.a.y).toBeCloseTo(1, 12);
  });

  it('arco é recusado', () => {
    const h = holder([arc(v(0, 0), v(4, 0), 1)]);
    expect(alignComponentEdge(h, ref(0), { p: v(0, 1), d: v(1, 0) })).toBeNull();
  });
});
