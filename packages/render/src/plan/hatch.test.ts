import { describe, expect, it } from 'vitest';
import type { Polygon, Vec2 } from '@hestia/geom';
import { HATCH_SPACING, hatchSegments } from './hatch.ts';

const sq = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

/** Dentro da região pela regra par-ímpar (mesma usada pela hachura, para anéis de furo). */
function inside(poly: Polygon, p: Vec2): boolean {
  let c = false;
  for (const ring of poly) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!;
      const b = ring[j]!;
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
  }
  return c;
}

const mid = (s: { a: Vec2; b: Vec2 }): Vec2 => ({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 });
const len = (s: { a: Vec2; b: Vec2 }): number => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);

describe('hachura vetorial (plan/hatch)', () => {
  const square: Polygon = [sq(0, 0, 4, 4)];

  it('solid e none não geram linhas (solid é só preenchimento)', () => {
    expect(hatchSegments(square, 'solid')).toEqual([]);
    expect(hatchSegments(square, 'none')).toEqual([]);
  });

  it('diagonal: comprimento total ≈ área / espaçamento e todos os pontos médios dentro', () => {
    const segs = hatchSegments(square, 'diagonal');
    const total = segs.reduce((s, g) => s + len(g), 0);
    expect(total).toBeGreaterThan((16 / HATCH_SPACING) * 0.97);
    expect(total).toBeLessThan((16 / HATCH_SPACING) * 1.03);
    for (const s of segs) expect(inside(square, mid(s))).toBe(true);
  });

  it('diagonal: linhas a 45° (dx e dy com o mesmo sinal)', () => {
    const segs = hatchSegments(square, 'diagonal');
    for (const s of segs) expect(Math.sign(s.b.x - s.a.x) * Math.sign(s.b.y - s.a.y)).toBe(1);
  });

  it('cross: há linhas nas duas direções diagonais', () => {
    const segs = hatchSegments(square, 'cross');
    expect(segs.some((s) => (s.b.x - s.a.x) * (s.b.y - s.a.y) > 0)).toBe(true);
    expect(segs.some((s) => (s.b.x - s.a.x) * (s.b.y - s.a.y) < 0)).toBe(true);
  });

  it('furo: a região dentro do furo fica vazia', () => {
    const holed: Polygon = [sq(0, 0, 4, 4), sq(1, 1, 3, 3)];
    const segs = hatchSegments(holed, 'diagonal');
    for (const s of segs) {
      const m = mid(s);
      expect(inside(holed, m)).toBe(true);
      expect(m.x > 1 && m.x < 3 && m.y > 1 && m.y < 3).toBe(false);
    }
    const total = segs.reduce((s, g) => s + len(g), 0);
    expect(total).toBeGreaterThan((12 / HATCH_SPACING) * 0.97);
    expect(total).toBeLessThan((12 / HATCH_SPACING) * 1.03);
  });

  it('gesso: trechos horizontais pintados ≈ 10/16 do comprimento das linhas', () => {
    const segs = hatchSegments(square, 'gesso');
    expect(segs.every((s) => Math.abs(s.a.y - s.b.y) < 1e-9)).toBe(true);
    const total = segs.reduce((s, g) => s + len(g), 0);
    expect(total).toBeGreaterThan((4 / HATCH_SPACING) * 4 * (10 / 16) * 0.97);
    expect(total).toBeLessThan((4 / HATCH_SPACING) * 4 * (10 / 16) * 1.03);
  });

  it('dots: um ponto por passo na grade, todos dentro da região', () => {
    const segs = hatchSegments(square, 'dots');
    expect(segs.every((s) => s.dot === true)).toBe(true);
    const expected = 16 / (HATCH_SPACING * HATCH_SPACING);
    expect(segs.length).toBeGreaterThan(expected * 0.97);
    expect(segs.length).toBeLessThan(expected * 1.03);
    for (const s of segs) expect(inside(square, mid(s))).toBe(true);
  });

  it('é cacheada por contorno e por padrão (mesma referência)', () => {
    expect(hatchSegments(square, 'diagonal')).toBe(hatchSegments(square, 'diagonal'));
  });

  it('novos padrões: segmentos e pontos ficam dentro da região com furo', () => {
    const holed: Polygon = [sq(0, 0, 4, 4), sq(1, 1, 3, 3)];
    const kinds = ['brick', 'concrete', 'timber', 'insulation', 'earth'] as const;
    for (const kind of kinds) {
      const segs = hatchSegments(holed, kind);
      expect(segs.length).toBeGreaterThan(0);
      for (const s of segs) {
        const m = mid(s);
        expect(inside(holed, m)).toBe(true);
        expect(m.x > 1 && m.x < 3 && m.y > 1 && m.y < 3).toBe(false);
      }
    }
  });

  it('timber: linhas horizontais e passo de 0,04 m entre linhas sucessivas', () => {
    const segs = hatchSegments(square, 'timber');
    expect(segs.length).toBeGreaterThan(0);
    for (const s of segs) expect(Math.abs(s.b.y - s.a.y)).toBeLessThan(1e-9);
    const ys = [...new Set(segs.map((s) => s.a.y))].sort((a, b) => a - b);
    expect(ys.length).toBeGreaterThan(1);
    for (let i = 1; i < ys.length; i++) expect(Math.abs(ys[i]! - ys[i - 1]! - 0.04)).toBeLessThan(1e-9);
  });

  it('brick: duas direções e ~3 linhas a 45° para cada linha a −45°', () => {
    const segs = hatchSegments(square, 'brick');
    const up = segs.filter((s) => (s.b.x - s.a.x) * (s.b.y - s.a.y) > 0).length;
    const down = segs.filter((s) => (s.b.x - s.a.x) * (s.b.y - s.a.y) < 0).length;
    expect(up).toBeGreaterThan(0);
    expect(down).toBeGreaterThan(0);
    expect(Math.abs(up / down - 3)).toBeLessThanOrEqual(1);
  });

  it('insulation: traços de até 1,5p e fase 0 na origem da reta', () => {
    const segs = hatchSegments(square, 'insulation');
    expect(segs.length).toBeGreaterThan(0);
    for (const s of segs) expect(len(s)).toBeLessThanOrEqual(1.5 * HATCH_SPACING + 1e-9);
    expect(segs.some((s) => Math.hypot(s.a.x, s.a.y) < 1e-9)).toBe(true);
  });

  it('concrete: há pelo menos um ponto e pelo menos uma linha', () => {
    const segs = hatchSegments(square, 'concrete');
    expect(segs.some((s) => s.dot === true)).toBe(true);
    expect(segs.some((s) => s.dot !== true)).toBe(true);
  });

  it('padrões antigos: saída literal inalterada no quadrado 4×4', () => {
    const total = (kind: 'diagonal' | 'cross' | 'gesso' | 'dots'): number =>
      hatchSegments(square, kind).reduce((s, g) => s + len(g), 0);
    expect(hatchSegments(square, 'none')).toEqual([]);
    expect(hatchSegments(square, 'solid')).toEqual([]);
    expect(hatchSegments(square, 'diagonal')).toHaveLength(113);
    expect(total('diagonal')).toBeCloseTo(320.02453019263896, 9);
    expect(hatchSegments(square, 'cross')).toHaveLength(226);
    expect(total('cross')).toBeCloseTo(640.0059146347703, 9);
    expect(hatchSegments(square, 'gesso')).toHaveLength(6400);
    expect(total('gesso')).toBeCloseTo(200, 9);
    expect(hatchSegments(square, 'dots')).toHaveLength(6400);
    expect(total('dots')).toBeCloseTo(80.00000000000963, 9);
  });
});
