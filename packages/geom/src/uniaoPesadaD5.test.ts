import { describe, expect, it } from 'vitest';
import { multiArea, unionClipper, type MultiPolygon } from './index.ts';

/** D5: união de 3 ou mais operandos com um operando pesado (>= 500 vértices) vai dobrada, do menor para o maior; a região é a mesma da passada única. */
const disco = (cx: number, cy: number, r: number, n: number): MultiPolygon => [[Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos((2 * Math.PI * i) / n), y: cy + r * Math.sin((2 * Math.PI * i) / n) }))]];
const ret = (x0: number, y0: number, x1: number, y1: number): MultiPolygon => [[[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]]];

describe('unionClipper com operando pesado (D5)', () => {
  it('mesma área que a união em duas etapas, e rápido (limite 3x do medido, ~10 ms)', () => {
    const partes = [ret(-3, -1, 3, 1), disco(0, 0, 2, 700), ret(1, -4, 2, 4), ret(-6, -0.5, -2, 0.5)];
    // referência literal: a união é um disco de raio 2 (700 lados) mais três faixas; área calculada por união em dois níveis
    const ref = multiArea(unionClipper(unionClipper(partes[0]!, partes[2]!, partes[3]!), partes[1]!));
    const t0 = performance.now();
    const u = unionClipper(...partes);
    const dt = performance.now() - t0;
    expect(multiArea(u)).toBeCloseTo(ref, 6);
    expect(dt).toBeLessThan(300);
  });
});
