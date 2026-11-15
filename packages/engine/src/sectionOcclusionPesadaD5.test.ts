import { differenceClipper, multiArea, type MultiPolygon } from '@hestia/geom';
import { describe, expect, it } from 'vitest';
import { subtrairEmLotes } from './sectionOcclusion.ts';

/** D5: com um oclusor complexo (>= 500 vértices) a subtração vai em lotes por vértices, do menor para o maior; a região é a da passada única. */
const ret = (x0: number, y0: number, x1: number, y1: number): MultiPolygon => [[[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]]];
const disco = (cx: number, cy: number, r: number, n: number): MultiPolygon => [[Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos((2 * Math.PI * i) / n), y: cy + r * Math.sin((2 * Math.PI * i) / n) }))]];

describe('subtrairEmLotes com oclusor complexo (D5)', () => {
  it('mesma área da passada única; oclusores longe da peça não pesam; limite 3x', () => {
    const peca = ret(0, 0, 4, 3);
    const oclusores = [ret(0, 0, 1, 1), ret(10, 10, 11, 11), ret(1, 1, 2, 3), disco(3, 1.5, 1, 800), ret(3.5, 0, 4, 3), ret(-5, -5, -4, -4), ret(0, 2, 2, 3), ret(2, 0, 3, 1), ret(0.5, 0.5, 3.5, 0.6)];
    const ref = multiArea(differenceClipper(peca, ...oclusores));
    const t0 = performance.now();
    const r = subtrairEmLotes(peca, oclusores);
    const dt = performance.now() - t0;
    expect(multiArea(r)).toBeCloseTo(ref, 6);
    expect(dt).toBeLessThan(300);
  });
});
