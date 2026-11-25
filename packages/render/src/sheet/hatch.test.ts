import { describe, expect, it } from 'vitest';
import { hatchPartsOf, HATCH_PITCH_MM } from './hatch.ts';
import { partsOf } from './convert.ts';
import type { SheetPoint } from './types.ts';
import { LIGHT, type PlanDrawList } from '../plan/types.ts';

const square = (x0: number, y0: number, x1: number, y1: number): SheetPoint[][] => [
  [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ],
];

const mid = (pts: SheetPoint[]): SheetPoint => ({ x: (pts[0]!.x + pts[1]!.x) / 2, y: (pts[0]!.y + pts[1]!.y) / 2 });
const inside = (p: SheetPoint, x0: number, y0: number, x1: number, y1: number) => p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1;

/** Dentro do conjunto de anéis pela regra par-ímpar (furos ficam de fora). */
function insideRings(rings: SheetPoint[][], p: SheetPoint): boolean {
  let c = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!;
      const b = ring[j]!;
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
  }
  return c;
}

describe('hachura de padrão na folha (B6)', () => {
  it('diagonal: traços em 45° recortados ao quadrado, espaçados pelo passo', () => {
    const parts = hatchPartsOf([square(0, 0, 10, 10)], 'diagonal', '#333333');
    expect(parts.fills).toHaveLength(0);
    // Um quadrado de 10 mm tem ~ 10·√2 / passo retas por família.
    const expected = (10 * Math.SQRT2) / HATCH_PITCH_MM;
    expect(parts.paths.length).toBeGreaterThan(expected * 0.8);
    expect(parts.paths.length).toBeLessThan(expected * 1.25);
    for (const path of parts.paths) {
      expect(path.closed).toBe(false);
      expect(path.pts).toHaveLength(2);
      for (const q of path.pts) {
        expect(q.x).toBeGreaterThanOrEqual(-1e-9);
        expect(q.x).toBeLessThanOrEqual(10 + 1e-9);
        expect(q.y).toBeGreaterThanOrEqual(-1e-9);
        expect(q.y).toBeLessThanOrEqual(10 + 1e-9);
      }
      // Traço a 45°: as duas pontas têm a mesma distância em x e em y.
      const [a, b] = path.pts as [SheetPoint, SheetPoint];
      expect(Math.abs(b.x - a.x)).toBeCloseTo(Math.abs(b.y - a.y), 6);
      expect(inside(mid(path.pts), 0, 0, 10, 10)).toBe(true);
    }
  });

  it('cross: duas famílias, uma em cada diagonal', () => {
    const diag = hatchPartsOf([square(0, 0, 10, 10)], 'diagonal', '#333333');
    const cross = hatchPartsOf([square(0, 0, 10, 10)], 'cross', '#333333');
    expect(cross.paths.length).toBeGreaterThan(diag.paths.length * 1.8);
    const slopes = new Set(cross.paths.map(({ pts: [a, b] }) => (Math.sign((b!.y - a!.y) * (b!.x - a!.x)))));
    expect(slopes).toEqual(new Set([1, -1]));
  });

  it('furo: nenhum traço cai dentro do furo (regra par-ímpar)', () => {
    const outer = square(0, 0, 20, 20);
    const hole = square(8, 8, 12, 12);
    const parts = hatchPartsOf([[outer[0]!, hole[0]!]], 'diagonal', '#333333');
    expect(parts.paths.length).toBeGreaterThan(0);
    for (const path of parts.paths) expect(inside(mid(path.pts), 8, 8, 12, 12)).toBe(false);
    // Traço que cruza o furo é cortado nas duas bordas dele: a metade de cada lado continua.
    expect(parts.paths.some((path) => inside(mid(path.pts), 0, 0, 8, 8))).toBe(true);
  });

  it('solid: uma cobertura da cor da hachura, sem traços', () => {
    const polys = [square(0, 0, 5, 5)];
    const parts = hatchPartsOf(polys, 'solid', '#112233');
    expect(parts.paths).toHaveLength(0);
    expect(parts.fills).toEqual([{ polygons: polys, color: '#112233' }]);
  });

  it('dots: pontos em malha, dentro do polígono, todos do mesmo preenchimento', () => {
    const parts = hatchPartsOf([square(0, 0, 10, 10)], 'dots', '#444444');
    expect(parts.paths).toHaveLength(0);
    expect(parts.fills).toHaveLength(1);
    const dots = parts.fills[0]!.polygons;
    expect(dots.length).toBeGreaterThan(10);
    for (const [ring] of dots) {
      const cx = ring!.reduce((s, q) => s + q.x, 0) / 4;
      const cy = ring!.reduce((s, q) => s + q.y, 0) / 4;
      expect(inside({ x: cx, y: cy }, 0, 0, 10, 10)).toBe(true);
    }
  });

  it('none e polígono vazio não desenham nada', () => {
    expect(hatchPartsOf([square(0, 0, 10, 10)], 'none', '#000000')).toEqual({ fills: [], paths: [], texts: [] });
    expect(hatchPartsOf([], 'diagonal', '#000000').paths).toHaveLength(0);
  });

  it('novos padrões: traços e pontos ficam dentro da região com furo', () => {
    const outer = square(0, 0, 20, 20);
    const hole = square(8, 8, 12, 12);
    const rings = [outer[0]!, hole[0]!];
    const kinds = ['brick', 'concrete', 'timber', 'insulation', 'earth'] as const;
    for (const kind of kinds) {
      const parts = hatchPartsOf([rings], kind, '#333333');
      expect(parts.paths.length + parts.fills.reduce((n, f) => n + f.polygons.length, 0)).toBeGreaterThan(0);
      for (const path of parts.paths) {
        const m = mid(path.pts);
        expect(insideRings(rings, m)).toBe(true);
        expect(m.x > 8 && m.x < 12 && m.y > 8 && m.y < 12).toBe(false);
      }
      for (const fill of parts.fills) {
        for (const [ring] of fill.polygons) {
          const cx = ring!.reduce((s, q) => s + q.x, 0) / ring!.length;
          const cy = ring!.reduce((s, q) => s + q.y, 0) / ring!.length;
          expect(insideRings(rings, { x: cx, y: cy })).toBe(true);
          expect(cx > 8 && cx < 12 && cy > 8 && cy < 12).toBe(false);
        }
      }
    }
  });

  it('timber: linhas horizontais e passo de 1,2 mm entre linhas sucessivas', () => {
    const parts = hatchPartsOf([square(0, 0, 10, 10)], 'timber', '#333333');
    expect(parts.paths.length).toBeGreaterThan(0);
    for (const path of parts.paths) expect(Math.abs(path.pts[1]!.y - path.pts[0]!.y)).toBeLessThan(1e-9);
    const ys = [...new Set(parts.paths.map((p) => p.pts[0]!.y))].sort((a, b) => a - b);
    expect(ys.length).toBeGreaterThan(1);
    for (let i = 1; i < ys.length; i++) expect(Math.abs(ys[i]! - ys[i - 1]! - 1.2)).toBeLessThan(1e-9);
  });

  it('brick: duas direções e ~3 traços a 45° para cada traço a −45°', () => {
    const parts = hatchPartsOf([square(0, 0, 10, 10)], 'brick', '#333333');
    const up = parts.paths.filter(({ pts: [a, b] }) => Math.sign(b!.x - a!.x) * Math.sign(b!.y - a!.y) > 0).length;
    const down = parts.paths.filter(({ pts: [a, b] }) => Math.sign(b!.x - a!.x) * Math.sign(b!.y - a!.y) < 0).length;
    expect(up).toBeGreaterThan(0);
    expect(down).toBeGreaterThan(0);
    expect(Math.abs(up / down - 3)).toBeLessThanOrEqual(1);
  });

  it('insulation: traços de até 2,25 mm e fase 0 na origem da reta', () => {
    const parts = hatchPartsOf([square(0, 0, 10, 10)], 'insulation', '#333333');
    expect(parts.paths.length).toBeGreaterThan(0);
    for (const path of parts.paths) {
      expect(Math.hypot(path.pts[1]!.x - path.pts[0]!.x, path.pts[1]!.y - path.pts[0]!.y)).toBeLessThanOrEqual(2.25 + 1e-9);
    }
    expect(parts.paths.some((p) => Math.hypot(p.pts[0]!.x, p.pts[0]!.y) < 1e-9)).toBe(true);
  });

  it('concrete: há pelo menos um ponto e pelo menos uma linha', () => {
    const parts = hatchPartsOf([square(0, 0, 10, 10)], 'concrete', '#333333');
    expect(parts.paths.length).toBeGreaterThan(0);
    expect(parts.fills.some((f) => f.polygons.length > 0)).toBe(true);
  });

  it('padrões antigos: saída literal inalterada no quadrado 10×10', () => {
    const polys = [square(0, 0, 10, 10)];
    expect(hatchPartsOf(polys, 'none', '#000000')).toEqual({ fills: [], paths: [], texts: [] });
    expect(hatchPartsOf(polys, 'solid', '#112233').paths).toHaveLength(0);
    expect(hatchPartsOf(polys, 'solid', '#112233').fills).toEqual([{ polygons: polys, color: '#112233' }]);
    expect(hatchPartsOf(polys, 'diagonal', '#333333').paths).toHaveLength(9);
    expect(hatchPartsOf(polys, 'cross', '#333333').paths).toHaveLength(18);
    const dots = hatchPartsOf(polys, 'dots', '#444444');
    expect(dots.paths).toHaveLength(0);
    expect(dots.fills).toHaveLength(1);
    expect(dots.fills[0]!.polygons).toHaveLength(16);
    expect(hatchPartsOf(polys, 'gesso', '#333333')).toEqual({ fills: [], paths: [], texts: [] });
  });

  it('partsOf leva a hachura do preenchimento da planta para a folha, antes dos traços', () => {
    const list: PlanDrawList = {
      background: '#fff',
      fills: [{ polygons: [[[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]]], color: '#cccccc', alpha: 1, hatch: { kind: 'diagonal', color: '#333333' } }],
      strokes: [{ pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }], closed: false, widthPx: 1000, color: '#000000', alpha: 1 }],
      labels: [],
    };
    const parts = partsOf(list, (q) => q, LIGHT);
    expect(parts.fills).toHaveLength(1);
    expect(parts.paths.length).toBeGreaterThan(2);
    expect(parts.paths.at(-1)!.color).toBe('#000000');
    expect(parts.paths[0]!.color).toBe('#333333');
  });
});
