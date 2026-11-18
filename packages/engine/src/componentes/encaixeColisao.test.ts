import type { CaixaLocal, Corpo, FaceDeParede, Pose } from './encaixeTipos.ts';
import type { Vec2 } from '@hestia/geom';
import { describe, expect, it } from 'vitest';
import { colisoes, retanguloNoMundo } from './encaixeColisao.ts';

const caixaBase: CaixaLocal = { min: [0, 0, 0], max: [0.6, 0.56, 0.72] };

const pose = (x: number, y: number, extra: Partial<Pose> = {}): Pose => ({ x, y, rotation: 0, mirrored: false, z: 0, ...extra });

const corpo = (id: string, x: number, y: number, extra: Partial<Pose> = {}, caixa: CaixaLocal = caixaBase): Corpo => ({
  id, pose: pose(x, y, extra), caixa,
});

/** Compara os 4 cantos (x, y) com tolerância 1e-9. */
const esperarCantos = (cantos: readonly Vec2[], esperado: ReadonlyArray<[number, number]>): void => {
  expect(cantos).toHaveLength(esperado.length);
  cantos.forEach((p, i) => {
    expect(p.x).toBeCloseTo(esperado[i]![0], 9);
    expect(p.y).toBeCloseTo(esperado[i]![1], 9);
  });
};

const colideCom = (a: Corpo, b: Corpo): boolean => colisoes(a, [b], []).moveis.length > 0;

describe('retanguloNoMundo', () => {
  it('pose sem giro: cantos em (x, y) + caixa, na ordem local', () => {
    esperarCantos(retanguloNoMundo(pose(1, 2), caixaBase), [[1, 2], [1.6, 2], [1.6, 2.56], [1, 2.56]]);
  });
  it('girada 90°: ponto local (x, y) → (x0 − y, y0 + x)', () => {
    esperarCantos(retanguloNoMundo(pose(1, 2, { rotation: Math.PI / 2 }), caixaBase), [[1, 2], [1, 2.6], [0.44, 2.6], [0.44, 2]]);
  });
  it('espelhada: o eixo X local inverte antes do giro', () => {
    esperarCantos(retanguloNoMundo(pose(1, 2, { mirrored: true }), caixaBase), [[1, 2], [0.4, 2], [0.4, 2.56], [1, 2.56]]);
  });
});

describe('colisoes entre móveis', () => {
  it('0,6×0,56 com origens (0,0) e (0,3, 0,2): sobrepõem, colide', () => {
    expect(colideCom(corpo('a', 0, 0), corpo('b', 0.3, 0.2))).toBe(true);
  });
  it('encostados em x = 0,6: não colide', () => {
    expect(colideCom(corpo('a', 0, 0), corpo('b', 0.6, 0))).toBe(false);
  });
  it('folga de 0,5 mm (origem 0,6005): não colide', () => {
    expect(colideCom(corpo('a', 0, 0), corpo('b', 0.6005, 0))).toBe(false);
  });
  it('penetração de 2 mm (origem 0,598): colide', () => {
    expect(colideCom(corpo('a', 0, 0), corpo('b', 0.598, 0))).toBe(true);
  });
  it('caixa girada 45° com o canto 1 cm dentro da lateral do outro: colide; recuada 1 cm: não', () => {
    const s45 = Math.sin(Math.PI / 4);
    const px = 0.59 + 0.56 * s45;
    const alvo = corpo('a', 0, 0);
    expect(colideCom(alvo, corpo('b', px, 0.1, { rotation: Math.PI / 4 }))).toBe(true);
    expect(colideCom(alvo, corpo('b', px + 0.01, 0.1, { rotation: Math.PI / 4 }))).toBe(false);
  });
  it('aéreo (z 1,4, altura 0,7) acima da base (0 a 0,72): não colide; descido para z 0,6: colide', () => {
    const caixaAereo: CaixaLocal = { min: [0, 0, 0], max: [0.6, 0.56, 0.7] };
    const base = corpo('base', 0, 0);
    expect(colideCom(base, corpo('aereo', 0, 0, { z: 1.4 }, caixaAereo))).toBe(false);
    expect(colideCom(base, corpo('aereo', 0, 0, { z: 0.6 }, caixaAereo))).toBe(true);
  });
  it('móvel com o mesmo id do alvo é ignorado', () => {
    const alvo = corpo('a', 0, 0);
    expect(colisoes(alvo, [corpo('a', 0.3, 0.2), corpo('b', 0.3, 0.2)], [])).toEqual({ moveis: ['b'], paredes: [] });
    expect(colisoes(alvo, [corpo('a', 0.3, 0.2)], [])).toEqual({ moveis: [], paredes: [] });
  });
  it('ordem determinística: `moveis` por id mesmo com `outros` embaralhado', () => {
    const alvo = corpo('alvo', 0, 0);
    const outros = [corpo('m9', 0.3, 0.2), corpo('m1', 0.2, 0.1), corpo('m5', 0.1, 0.3)];
    expect(colisoes(alvo, outros, []).moveis).toEqual(['m1', 'm5', 'm9']);
  });
});

describe('colisoes com paredes', () => {
  const face: FaceDeParede = { a: { x: 0, y: 0 }, b: { x: 4, y: 0 } };

  it('canto 5 cm no lado sólido (y < 0) com projeção dentro da face: paredes = [0]', () => {
    expect(colisoes(corpo('a', 1, -0.05), [], [face]).paredes).toEqual([0]);
  });
  it('móvel todo em y ≥ 0: []', () => {
    expect(colisoes(corpo('a', 1, 0), [], [face]).paredes).toEqual([]);
  });
  it('canto além do comprimento da face (x > 4,2): []', () => {
    expect(colisoes(corpo('a', 4.2, -0.05), [], [face]).paredes).toEqual([]);
  });
  it('índices crescentes e sem repetição com duas faces atravessadas', () => {
    const outra: FaceDeParede = { a: { x: 4, y: 0.2 }, b: { x: 0, y: 0.2 } };
    const r = colisoes(corpo('a', 1, -0.05), [], [outra, face]);
    expect(r.paredes).toEqual([0, 1]);
    expect(colisoes(corpo('a', 1, -0.05), [], [face, face]).paredes).toEqual([0, 1]);
  });
});
