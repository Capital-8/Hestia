import { describe, expect, it } from 'vitest';
import { flatPiece, overlapVolume, type SolidPiece } from './junctionNet.ts';
import type { MultiPolygon, Vec2 } from '@hestia/geom';

/** Retângulo [x0,x1]×[y0,y1] como multipolígono (um anel, sentido anti-horário). */
const rect = (x0: number, y0: number, x1: number, y1: number): MultiPolygon => [
  [
    [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ],
  ],
];

/** Peça com altura linear sobre a planta: z0(p) = a0 + ax·x + ay·y, z1(p) = a1 + bx·x + by·y. */
const linear = (poly: MultiPolygon, a0: number, ax: number, ay: number, a1: number, bx: number, by: number): SolidPiece => ({
  poly,
  flat: false,
  span: (p) => [a0 + ax * p.x + ay * p.y, a1 + bx * p.x + by * p.y] as const,
});

/**
 * Referência independente: soma do volume em malha fina (ponto médio) da altura comum às duas peças, dentro do retângulo
 * de interseção. Não usa nenhuma das funções do motor; só o `span` de cada peça. Erro de discretização O(h).
 */
function volumeDeReferencia(a: SolidPiece, b: SolidPiece, x0: number, y0: number, x1: number, y1: number, h: number): number {
  let total = 0;
  for (let x = x0 + h / 2; x < x1; x += h) {
    for (let y = y0 + h / 2; y < y1; y += h) {
      const p = { x, y };
      const [a0, a1] = a.span(p);
      const [b0, b1] = b.span(p);
      total += Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)) * h * h;
    }
  }
  return total;
}

describe('volume de sobreposição é exato (não depende da divisão em faixas)', () => {
  it('peça plana contra plana: área × altura, exato', () => {
    const a = flatPiece(rect(0, 0, 2, 1), 0, 3);
    const b = flatPiece(rect(1, 0, 3, 1), 1, 4);
    expect(overlapVolume(a, b)).toBeCloseTo(1 * 1 * 2, 12);
  });

  it('plana contra inclinada com altura linear (sem mínimo/máximo que mude de lado): confere com a referência', () => {
    const a = flatPiece(rect(0, 0, 2, 1), 0, 1.2);
    const b = linear(rect(0, 0, 2, 1), 0, 0, 0, 0, 0.5, 0);
    const ref = volumeDeReferencia(a, b, 0, 0, 2, 1, 0.001);
    expect(Math.abs(overlapVolume(a, b) - ref)).toBeLessThan(2e-5);
  });

  it('duas inclinadas que se cruzam (o mínimo e o máximo trocam de lado no meio do retângulo): exato', () => {
    // a: teto cai de 2 para 1 em x; b: piso sobe em x. A altura comum muda de sinal no meio.
    const a = linear(rect(0, 0, 2, 1), 0, 0, 0, 2, -1, 0);
    const b = linear(rect(0, 0, 2, 1), 0.5, 0, 0, 1, 0.5, 0);
    const ref = volumeDeReferencia(a, b, 0, 0, 2, 1, 0.0005);
    expect(Math.abs(overlapVolume(a, b) - ref)).toBeLessThan(2e-5);
  });

  it('inclinadas com altura que encosta em zero no meio (o máximo(0, ·) corta): exato', () => {
    const a = linear(rect(0, 0, 2, 1), 0, 0, 0, 1, 1, 0);
    const b = linear(rect(0, 0, 2, 1), 0, 0, 0.3, 1, -1, 0);
    const ref = volumeDeReferencia(a, b, 0, 0, 2, 1, 0.0005);
    expect(Math.abs(overlapVolume(a, b) - ref)).toBeLessThan(2e-5);
  });
});

describe('volume exato com forma não convexa (valor analítico, sem amostragem)', () => {
  it('L = retângulo [0,2]x[0,1] menos [0,1]x[0,0.5]; altura max(0, 1 - x - 0.3y): 0.365 - 0.214375 = 0.150625', () => {
    const forma = [[[{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 0.5 }, { x: 1, y: 0.5 }]]] as MultiPolygon;
    const a = { poly: forma, flat: false, span: (p: Vec2) => [0, 1 + p.x] as const } as SolidPiece;
    const b = { poly: forma, flat: false, span: (p: Vec2) => [0.3 * p.y, 1 - p.x] as const } as SolidPiece;
    expect(Math.abs(overlapVolume(a, b) - 0.150625)).toBeLessThan(1e-9);
  });
});
