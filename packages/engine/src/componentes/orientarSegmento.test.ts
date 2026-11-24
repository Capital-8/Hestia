import { pontoNoMundo } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { orientarSegmento, type PontoSegmento, trechoDeTubo } from './orientarSegmento.ts';

/** Ponto local (0,0,L) da instância orientada, no mundo. */
const pontaFinal = (a: PontoSegmento, b: PontoSegmento) => {
  const o = orientarSegmento(a, b);
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  return pontoNoMundo({ ...o, mirrored: false }, { x: 0, y: 0, z: L });
};

describe('orientarSegmento (N9)', () => {
  it('N9: (0,0,0)→(1,0,0) dá inclinacao[0] = π/2, rotation 0 e (0,0,L) cai em b', () => {
    const o = orientarSegmento([0, 0, 0], [1, 0, 0]);
    expect(o.inclinacao[0]).toBeCloseTo(Math.PI / 2, 12);
    expect(o.inclinacao[1]).toBe(0);
    expect(o.rotation).toBe(0);
    const p = pontaFinal([0, 0, 0], [1, 0, 0]);
    expect(p.x).toBeCloseTo(1, 9);
    expect(p.y).toBeCloseTo(0, 9);
    expect(p.z).toBeCloseTo(0, 9);
  });

  it('vertical subindo: inclinacao 0 e rotation 0', () => {
    const o = orientarSegmento([1, 2, 0], [1, 2, 3]);
    expect(o.inclinacao[0]).toBeCloseTo(0, 12);
    expect(o.rotation).toBe(0);
  });

  it('vertical descendo: inclinacao π e a ponta cai em b', () => {
    const o = orientarSegmento([1, 2, 3], [1, 2, 0]);
    expect(o.inclinacao[0]).toBeCloseTo(Math.PI, 12);
    const p = pontaFinal([1, 2, 3], [1, 2, 0]);
    expect(p.z).toBeCloseTo(0, 9);
  });

  it('diagonal e descendo: a ponta local sempre cai em b', () => {
    const casos: Array<[PontoSegmento, PontoSegmento]> = [
      [[0, 0, 0], [1, 1, 1]],
      [[1, 2, 3], [-2, 5, 0.5]],
      [[0, 0, 2], [0, -3, 1]],
    ];
    for (const [a, b] of casos) {
      const p = pontaFinal(a, b);
      expect(p.x).toBeCloseTo(b[0], 9);
      expect(p.y).toBeCloseTo(b[1], 9);
      expect(p.z).toBeCloseTo(b[2], 9);
    }
    expect(orientarSegmento([0, 0, 2], [0, -3, 1]).inclinacao[0]).toBeGreaterThan(Math.PI / 2);
  });

  it('o giro vai para inclinacao[1]', () => {
    expect(orientarSegmento([0, 0, 0], [1, 0, 0], 0.3).inclinacao[1]).toBe(0.3);
  });
});

describe('trechoDeTubo', () => {
  it('devolve a instância com L em mm, DN e a orientação do segmento', () => {
    const c = trechoDeTubo([1, 1, 0.5], [3, 1, 0.5], { id: 'tubo' }, 50, { id: 'c1', levelId: 'lv_0' });
    expect(c).not.toBeNull();
    expect(c!.values).toEqual({ L: 2000, DN: 50 });
    expect([c!.x, c!.y, c!.z]).toEqual([1, 1, 0.5]);
    expect(c!.inclinacao![0]).toBeCloseTo(Math.PI / 2, 12);
    expect(c!.familyId).toBe('tubo');
  });

  it('segmento de comprimento zero ou DN inválido não cria nada', () => {
    expect(trechoDeTubo([0, 0, 0], [0, 0, 0], { id: 't' }, 50, { id: 'c', levelId: 'lv_0' })).toBeNull();
    expect(trechoDeTubo([0, 0, 0], [1, 0, 0], { id: 't' }, 0, { id: 'c', levelId: 'lv_0' })).toBeNull();
  });
});
