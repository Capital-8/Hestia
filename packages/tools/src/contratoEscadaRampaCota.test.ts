/**
 * Escada (croqui e lance), rampa, cota linear e cota angular no núcleo comum de desenho (contrato de ferramentas):
 * Orto, Polar, comprimento digitado e cota dinâmica do trecho, iguais aos da parede.
 */
import { describe, expect, it } from 'vitest';
import { createEmptyProject, levelDimensions, makeWall, ProjectStore } from '@hestia/model';
import { clickAt, makeEnv, P, tool } from './testEnv.ts';
import type { Tool } from './types.ts';

const dim = (t: Tool) => t.tempDims!()[0];
const ortho = (o: { orthoLock?: boolean }): void => { o.orthoLock = true; };
const polar = (o: { angleMode?: unknown }): void => { o.angleMode = { ortho: false, polar: true, polarIncrementDeg: 45 }; };

describe('Escada por croqui', () => {
  it('Orto trava o trecho e a cota dinâmica mostra o comprimento', () => {
    const { env, options } = makeEnv();
    ortho(options);
    const t = tool('stair', env);
    clickAt(t, 0, 0);
    t.move(P(2.04, 0.3));
    const d = dim(t)!;
    expect(d.value).toBeCloseTo(2.04, 6);
    expect(d.b.y).toBeCloseTo(0, 6);
  });

  it('Polar projeta em 45 graus', () => {
    const { env, options } = makeEnv();
    polar(options);
    const t = tool('stair', env);
    clickAt(t, 0, 0);
    t.move(P(3, 3.1));
    const d = dim(t)!;
    expect(Math.abs(d.b.x - d.b.y)).toBeLessThan(0.01);
  });

  it('comprimento digitado acrescenta o ponto na direção do cursor (Orto) e encadeia', () => {
    const { env, options } = makeEnv();
    ortho(options);
    const t = tool('stair', env);
    clickAt(t, 0, 0);
    t.move(P(5, 0.2));
    expect(t.type!('1.5')).toBe(true);
    t.move(P(1.5, 4));
    const d = dim(t)!;
    expect(d.a.x).toBeCloseTo(1.5, 6);
    expect(d.a.y).toBeCloseTo(0, 6);
    expect(t.type!('abc')).toBe(false);
  });
});

describe('Lance de escada livre e rampa livre', () => {
  for (const id of ['stairrun', 'ramp'] as const) {
    it(`${id}: Orto, cota dinâmica e comprimento digitado`, () => {
      const { env, options } = makeEnv();
      ortho(options);
      if (id === 'stairrun') options.stairRun = { shape: 'free', width: 1, turn: 'left' } as never;
      else options.ramp = { shape: 'free', turn: 'left', mode: 'length' } as never;
      const t = tool(id, env);
      clickAt(t, 0, 0);
      t.move(P(3.02, 0.4));
      const d = dim(t)!;
      expect(d.value).toBeCloseTo(3.02, 6);
      expect(d.b.y).toBeCloseTo(0, 6);
      t.type!('2');
      t.move(P(2, 5));
      const d2 = dim(t)!;
      expect(d2.a.x).toBeCloseTo(2, 6);
      expect(d2.a.y).toBeCloseTo(0, 6);
    });
  }

  it('lance reto: Orto e cota dinâmica da origem ao cursor', () => {
    const { env, options } = makeEnv();
    ortho(options);
    options.stairRun = { shape: 'straight', width: 1, turn: 'left' } as never;
    const t = tool('stairrun', env);
    clickAt(t, 0, 0);
    t.move(P(4.01, 0.3));
    expect(dim(t)!.b.y).toBeCloseTo(0, 6);
  });

  it('rampa reta: Polar e cota dinâmica', () => {
    const { env, options } = makeEnv();
    polar(options);
    options.ramp = { shape: 'straight', turn: 'left', mode: 'length' } as never;
    const t = tool('ramp', env);
    clickAt(t, 0, 0);
    t.move(P(6, 6.1));
    const d = dim(t)!;
    expect(Math.abs(d.b.x - d.b.y)).toBeLessThan(0.01);
  });
});

describe('Cota linear: comprimento digitado', () => {
  it('digitar o comprimento define o 2º ponto (Orto) e depois o afastamento grava', () => {
    const { store, env, options } = makeEnv();
    ortho(options);
    const t = tool('dimension', env);
    clickAt(t, 0, 0);
    t.move(P(3, 0.4));
    expect(dim(t)!.value).toBeCloseTo(3, 6);
    expect(t.inputPrompt!()).not.toBeNull();
    expect(t.type!('2')).toBe(true);
    clickAt(t, 1, 1);
    const [d] = levelDimensions(store.project, 'lv_0');
    expect(d).toBeDefined();
    expect(d!.b.x).toBeCloseTo(2, 6);
    expect(d!.b.y).toBeCloseTo(0, 6);
  });

  it('sem ponto inicial o texto não é consumido; valor inválido é recusado', () => {
    const { env } = makeEnv();
    const t = tool('dimension', env);
    expect(t.type!('2')).toBe(false);
    clickAt(t, 0, 0);
    expect(t.type!('xyz')).toBe(false);
  });
});

describe('Cota angular: raio por núcleo comum', () => {
  const cruz = () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: -3, y: 0 }, b: { x: 3, y: 0 } }) });
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: -3 }, b: { x: 0, y: 3 } }) });
    return makeEnv(store);
  };

  it('Orto e cota dinâmica do raio; raio digitado grava o arco', () => {
    const { store, env, options } = cruz();
    const t = tool('angularDimension', env);
    clickAt(t, 1.2, 0.01);
    clickAt(t, 0.01, 1.2);
    ortho(options);
    t.move(P(1, 0.3));
    const d = dim(t)!;
    expect(d.value).toBeGreaterThan(0.8);
    expect(d.b.y).toBeCloseTo(d.a.y, 6);
    expect(t.inputPrompt!()).not.toBeNull();
    t.move(P(1, 1));
    expect(t.type!('2.5')).toBe(true);
    const [g] = levelDimensions(store.project, 'lv_0');
    expect(g?.angular).toBeDefined();
    expect(Math.hypot(g!.b.x - g!.a.x, g!.b.y - g!.a.y)).toBeCloseTo(2.5, 6);
  });
});
