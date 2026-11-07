import type { MultiPolygon } from '@hestia/geom';
import { describe, expect, it } from 'vitest';
import { mesmaRegiaoNaGrade } from './geomSig.ts';

const retangulo = (x1: number, w = 1, h = 0.2): MultiPolygon => [[[{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }].map((q) => ({ x: q.x === w ? x1 : q.x, y: q.y }))]];

describe('mesmaRegiaoNaGrade: fusão de faixas que só diferem pela grade do kernel', () => {
  it('formas idênticas, com vértice inicial diferente, são a mesma região', () => {
    const a = retangulo(1);
    const b: MultiPolygon = [[[a[0]![0]![2]!, a[0]![0]![3]!, a[0]![0]![0]!, a[0]![0]![1]!]]];
    expect(mesmaRegiaoNaGrade(a, b)).toBe(true);
  });

  it('um lado uma célula de 1 µm para lá é a mesma região (nuvem de ruído da grade do Rust)', () => {
    expect(mesmaRegiaoNaGrade(retangulo(1), retangulo(1.000001))).toBe(true);
  });

  it('um deslocamento de 1 mm é geometria de verdade e mantém as faixas separadas', () => {
    expect(mesmaRegiaoNaGrade(retangulo(1), retangulo(1.001))).toBe(false);
  });

  it('região vazia contra região cheia não é a mesma', () => {
    expect(mesmaRegiaoNaGrade([], retangulo(1))).toBe(false);
  });
});
