/** Ferramentas de esboço de contorno no núcleo comum de desenho: Orto, Polar, comprimento digitado e cota dinâmica. */
import { describe, expect, it } from 'vitest';
import { isRoof, isSlab, makeRoof, makeSlab, type Roof } from '@hestia/model';
import { PerimeterTool } from './perimeterTool.ts';
import { P, clickAt, makeEnv, tool } from './testEnv.ts';
import { registerBuiltinDimProviders } from './dims/registry.ts';

const POLAR45 = { ortho: false, polar: true, polarIncrementDeg: 45 } as never;
const r3 = (n: number): number => Math.round(n * 1000) / 1000;

for (const alvo of ['floor', 'slab', 'ceiling', 'roof'] as const) {
  describe(`esboço de ${alvo} (perímetro) no núcleo comum`, () => {
    const novo = (ajuste: (o: ReturnType<typeof makeEnv>['options']) => void = () => {}) => {
      const ctx = makeEnv();
      ajuste(ctx.options);
      const t = new PerimeterTool(ctx.env, alvo);
      t.start();
      t.setShape('line');
      return t;
    };
    const fim = (t: PerimeterTool) => { const s = t.draft().segs[0]!; return [r3(s.b.x), r3(s.b.y)]; };

    it('Orto trava o trecho na horizontal', () => {
      const t = novo((o) => { o.orthoLock = true; });
      clickAt(t, 0, 0);
      clickAt(t, 3.04, 0.4);
      expect(fim(t)).toEqual([3.04, 0]);
    });

    it('Polar projeta em 45 graus', () => {
      const t = novo((o) => { o.angleMode = POLAR45; });
      clickAt(t, 0, 0);
      clickAt(t, 3, 3.1);
      const [x, y] = fim(t);
      expect(Math.abs(x! - y!)).toBeLessThan(0.01);
    });

    it('comprimento digitado + Enter põe o fim na direção do cursor e encadeia; a cota dinâmica mede o trecho', () => {
      registerBuiltinDimProviders();
      const t = novo((o) => { o.orthoLock = true; });
      clickAt(t, 0, 0);
      t.move(P(2, 0.3));
      expect(t.tempDims()[0]!.value).toBeCloseTo(2, 6);
      expect(t.type!('2,5')).toBe(true);
      expect(fim(t)).toEqual([2.5, 0]);
      expect(t.inputPrompt()).not.toBeNull(); // encadeado: o próximo trecho já espera
    });
  });
}

describe('telhado por extrusão no núcleo comum', () => {
  it('Polar 45 e comprimento digitado fecham o retângulo; há cota dinâmica', () => {
    const { store, env, options } = makeEnv();
    options.angleMode = POLAR45;
    const t = tool('roofextrusion', env);
    clickAt(t, 0, 0);
    t.move(P(4, 4.2));
    expect(t.tempDims!()).toHaveLength(1);
    expect(t.inputPrompt()).not.toBeNull();
    expect(t.type!('5,656854')).toBe(true);
    const roof = Object.values(store.project.elements).find(isRoof) as Roof | undefined;
    expect(roof).toBeDefined();
    expect(Math.max(...roof!.boundary.map((q) => q.x))).toBeCloseTo(4, 2);
  });

  it('Orto trava o canto numa linha: retângulo estreito é recusado', () => {
    const { store, env, options } = makeEnv();
    options.orthoLock = true;
    const t = tool('roofextrusion', env);
    clickAt(t, 0, 0);
    clickAt(t, 4, 0.5);
    expect(Object.values(store.project.elements).some(isRoof)).toBe(false);
  });
});

function comTelhado() {
  const ctx = makeEnv();
  const roof = makeRoof({ id: 't1', typeId: Object.keys(ctx.store.project.roofTypes)[0]!, levelId: 'lv_0', boundary: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }], heightOffset: 2.8, shape: 'gable', slopePercent: 30 });
  ctx.store.exec({ type: 'addRoof', roof });
  ctx.env.setSelection(['t1']);
  return ctx;
}

describe('seta de caimento do telhado no núcleo comum', () => {
  const sobe = (c: ReturnType<typeof comTelhado>) => (c.store.project.elements.t1 as Roof).planes?.map((q) => [r3(q.up.x), r3(q.up.y)]) ?? [];

  it('Orto trava a direção de subida', () => {
    const c = comTelhado();
    c.options.orthoLock = true;
    const t = tool('roofarrow', c.env);
    clickAt(t, 3, 2);
    clickAt(t, 3.2, 3.6);
    expect(sobe(c)).toContainEqual([0, 1]);
  });

  it('Polar trava em 45 graus', () => {
    const c = comTelhado();
    c.options.angleMode = POLAR45;
    const t = tool('roofarrow', c.env);
    clickAt(t, 3, 2);
    clickAt(t, 4.5, 3.6);
    expect(sobe(c).some(([x, y]) => Math.abs(x! - 0.707) < 0.01 && Math.abs(y! - 0.707) < 0.01)).toBe(true);
  });

  it('comprimento digitado define a subida na direção do cursor e a cota mede o trecho', () => {
    const c = comTelhado();
    c.options.orthoLock = true;
    const t = tool('roofarrow', c.env);
    clickAt(t, 3, 2);
    t.move(P(3.3, 3));
    expect(t.tempDims!()).toHaveLength(1);
    expect(t.type!('1,5')).toBe(true);
    expect(sobe(c)).toContainEqual([0, 1]);
  });
});

function comLaje() {
  const ctx = makeEnv();
  const slab = makeSlab({ id: 'l1', typeId: 'ls_mac12', levelId: 'lv_0', boundary: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }] });
  ctx.store.exec({ type: 'addSlab', slab } as never);
  ctx.env.setSelection(['l1']);
  return ctx;
}

describe('inclinação de laje no núcleo comum', () => {
  const dir = (c: ReturnType<typeof comLaje>) => {
    const s = c.store.project.elements.l1;
    return isSlab(s) && s.slope ? { x: r3(s.slope.dir.x), y: r3(s.slope.dir.y) } : null;
  };

  it('Orto trava a direção do caimento', () => {
    const c = comLaje();
    c.options.orthoLock = true;
    const t = tool('slope', c.env);
    clickAt(t, 3, 2);
    clickAt(t, 3.2, 3.6);
    t.confirm();
    expect(dir(c)).toEqual({ x: 0, y: 1 });
  });

  it('Polar trava em 45 graus', () => {
    const c = comLaje();
    c.options.angleMode = POLAR45;
    const t = tool('slope', c.env);
    clickAt(t, 3, 2);
    clickAt(t, 4.5, 3.6);
    t.confirm();
    const d = dir(c);
    expect(d).not.toBeNull();
    expect(Math.abs(d!.x - d!.y)).toBeLessThan(0.01);
  });

  it('comprimento digitado fixa a direção, a cota mede o trecho e o percentual segue', () => {
    const c = comLaje();
    c.options.orthoLock = true;
    const t = tool('slope', c.env);
    clickAt(t, 3, 2);
    t.move(P(3.3, 3));
    expect(t.tempDims!()).toHaveLength(1);
    expect(t.type!('1,5')).toBe(true);
    expect(t.inputPrompt()).not.toBeNull();
    t.confirm();
    expect(dir(c)).toEqual({ x: 0, y: 1 });
  });
});
