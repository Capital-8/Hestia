import { describe, expect, it } from 'vitest';
import { openingShapeOf, openingShapeProblems } from './openingShapeOf.ts';

const base = { width: 0.9, height: 2.1 };

describe('openingShapeOf', () => {
  it('sem forma ou com rect = retangular (null): os números de hoje', () => {
    expect(openingShapeOf(base)).toBeNull();
    expect(openingShapeOf({ ...base, shape: { kind: 'rect', width: 9, height: 9 } })).toBeNull();
  });

  it('com forma usa o vão do tipo, não as dimensões gravadas na forma', () => {
    const s = openingShapeOf({ ...base, shape: { kind: 'round', width: 0.1, height: 0.1 } });
    expect(s).toEqual({ kind: 'round', width: 0.9, height: 2.1 });
  });

  it('a altura da instância e a folga do vão bruto entram, a flecha fica como gravada', () => {
    const s = openingShapeOf({ ...base, roughOversize: { w: 0.04, h: 0.02 }, shape: { kind: 'segmental', width: 1, height: 1, rise: 0.2 } }, 1.5);
    expect(s).toMatchObject({ kind: 'segmental', rise: 0.2 });
    expect(s!.width).toBeCloseTo(0.94, 12);
    expect(s!.height).toBeCloseTo(1.52, 12);
  });

  it('problemas: vazio para retangular e válida; códigos para inválida', () => {
    expect(openingShapeProblems(base)).toEqual([]);
    expect(openingShapeProblems({ ...base, shape: { kind: 'round', width: 1, height: 1 } })).toEqual([]);
    expect(openingShapeProblems({ width: 0.9, height: 0.3, shape: { kind: 'round', width: 1, height: 1 } })).toEqual(['round-height-below-half']);
    expect(openingShapeProblems({ ...base, shape: { kind: 'pointed', width: 1, height: 1, rise: 0.2 } })).toEqual(['pointed-rise-below-half']);
  });
});
