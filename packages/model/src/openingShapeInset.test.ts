import { describe, expect, it } from 'vitest';
import { CHORD_TOL, outline, type OpeningShape } from './openingShape.ts';
import { clipRect, crownBand, crownOf, outlineInset, ringHalves, ringPerimeter, ringSignedArea } from './openingShapeInset.ts';

const FORMAS: OpeningShape[] = [
  { kind: 'round', width: 0.9, height: 2.1 },
  { kind: 'round', width: 1, height: 0.5 },
  { kind: 'segmental', width: 1.2, height: 1.5, rise: 0.25 },
  { kind: 'pointed', width: 0.9, height: 2.1, rise: 0.6 },
];

describe('crownBand e outlineInset', () => {
  it('área da faixa = (contorno acima do piso) - (contorno recuado acima do piso)', () => {
    for (const f of FORMAS) {
      const d = 0.05;
      const banda = crownBand(f, 0, d)!;
      expect(banda).not.toBeNull();
      const acima = (ring: Array<readonly [number, number]>): number => ringSignedArea(clipRect(ring, -10, 10, banda.floor, 10));
      const esperada = acima(outlineInset(f, 0)) - acima(outlineInset(f, d));
      expect(Math.abs(ringSignedArea(banda.pts) / esperada - 1)).toBeLessThan(1e-6);
    }
  });
  it('arco abatido: o arranque do recuo é mais baixo que o do contorno', () => {
    const f = FORMAS[2]!;
    expect(crownOf(f, 0.05)!.spring).toBeLessThan(crownOf(f, 0)!.spring);
  });
  it('ogival: arranque e ápice recuados na vertical em d (ápice) e a coroa é simétrica', () => {
    const f = FORMAS[3]!;
    const c = crownOf(f, 0.04)!;
    const topo = Math.max(...c.pts.map((p) => p[1]));
    expect(topo).toBeLessThan(2.1);
    const a = c.pts.find((p) => Math.abs(p[1] - topo) < 1e-12)!;
    expect(Math.abs(a[0])).toBeLessThan(1e-9);
    for (const p of c.pts) expect(c.pts.some((q) => Math.abs(q[0] + p[0]) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9)).toBe(true);
  });
  it('recuo nulo reproduz a área do contorno e recuo exagerado devolve vazio', () => {
    for (const f of FORMAS) {
      expect(Math.abs(ringSignedArea(outlineInset(f, 0)) / ringSignedArea(outline(f, CHORD_TOL)) - 1)).toBeLessThan(1e-6);
      expect(outlineInset(f, 5)).toEqual([]);
      expect(crownBand(f, 0, 5)).toBeNull();
    }
  });
  it('forma inválida e retângulo sem arco: sem coroa nem faixa', () => {
    expect(crownOf({ kind: 'round', width: 1, height: 0.2 }, 0)).toBeNull();
    expect(crownOf({ kind: 'rect', width: 1, height: 1 }, 0)).toBeNull();
    expect(crownBand({ kind: 'rect', width: 1, height: 1 }, 0, 0.05)).toBeNull();
  });
});

describe('círculo: metades do anel', () => {
  it('as duas metades somam a área do anel e fecham em x = 0', () => {
    const f: OpeningShape = { kind: 'circle', width: 1, height: 0.8 };
    const h = ringHalves(f, 0, 0.05)!;
    const anel = ringSignedArea(outlineInset(f, 0)) - ringSignedArea(outlineInset(f, 0.05));
    expect((ringSignedArea(h.right) + ringSignedArea(h.left)) / anel).toBeCloseTo(1, 9);
    for (const r of [h.right, h.left]) {
      expect(ringSignedArea(r)).toBeGreaterThan(0);
      expect(ringPerimeter(r)).toBeGreaterThan(0);
    }
    expect(h.right.some((p) => Math.abs(p[0]) < 1e-12 && p[1] < 1e-9)).toBe(true); // base
  });
});

describe('clipRect', () => {
  it('recorta e devolve [] quando nada sobra', () => {
    const q: Array<[number, number]> = [[0, 0], [2, 0], [2, 2], [0, 2]];
    expect(ringSignedArea(clipRect(q, 1, 3, 1, 3))).toBeCloseTo(1, 12);
    expect(clipRect(q, 5, 6, 5, 6)).toEqual([]);
  });
});
