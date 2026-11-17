import { describe, expect, it } from 'vitest';
import { closeGaps, differenceClipper, multiArea, unionClipper, type MultiPolygon } from './index.ts';

/** Etapa P: cena com mais de 47 m (limite rápido do Clipper) dá o mesmo resultado que a mesma cena transladada para perto da origem. */
const r = (x0: number, y0: number, x1: number, y1: number): MultiPolygon => [[[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]]];
const mover = (m: MultiPolygon, dx: number, dy: number): MultiPolygon => m.map((p) => p.map((q) => q.map((v) => ({ x: v.x + dx, y: v.y + dy }))));
const caixa = (m: MultiPolygon): number[] => { const xs = m.flat(2).map((v) => v.x), ys = m.flat(2).map((v) => v.y); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };

describe('Clipper em cena grande (centrada, sem Int128)', () => {
  const faixas = [r(0, 0, 50, 3), r(40, 0, 94, 3), r(10, 1, 20, 2.5)];
  it('união, diferença e fechamento: área e caixa iguais às da cena deslocada', () => {
    const perto = faixas.map((m) => mover(m, -47, -1.5));
    const u = unionClipper(...faixas), up = unionClipper(...perto);
    expect(multiArea(u)).toBeCloseTo(multiArea(up), 9);
    expect(caixa(u)).toEqual([0, 0, 94, 3]);
    const d = differenceClipper(faixas[0]!, faixas[2]!), dp = differenceClipper(perto[0]!, perto[2]!);
    expect(multiArea(d)).toBeCloseTo(multiArea(dp), 9);
    expect(caixa(d)).toEqual([0, 0, 50, 3]);
    const c = closeGaps(u), cp = closeGaps(up);
    expect(multiArea(c)).toBeCloseTo(multiArea(cp), 9);
    expect(caixa(c).map((v) => Math.round(v * 1e5) / 1e5)).toEqual([0, 0, 94, 3]);
  });
});
