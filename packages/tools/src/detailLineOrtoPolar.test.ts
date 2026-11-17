import { describe, expect, it } from 'vitest';
import type { DetailLine } from '@hestia/model';
import { clickAt, makeEnv, tool } from './testEnv.ts';
import type { WallDrawShape } from './types.ts';

// Orto (F8) e Polar (F10) na linha de detalhe, no molde de orthoLock.test.ts. Valores literais, calculados à mão.
// Retângulo: o 2º canto recebe Orto a partir do 1º, como na viga (beamTool, `contextoDeTraco(startPt)`). Com F8 ligado o
// canto cai sobre o eixo do 1º e o retângulo fica degenerado. Não há teste de F8 para retângulo: fica como pendência.

const dl = (s: ReturnType<typeof makeEnv>['store']): DetailLine[] => s.project.levels[0]!.detailLines ?? [];

function ambiente(shape: WallDrawShape, extra: { orthoLock?: boolean; angleMode?: { ortho: boolean; polar: boolean; polarIncrementDeg: number } } = {}) {
  const env = makeEnv();
  env.options.detailLineShape = shape;
  if (extra.orthoLock !== undefined) env.options.orthoLock = extra.orthoLock;
  if (extra.angleMode) env.options.angleMode = extra.angleMode;
  return { ...env, t: tool('detailLine', env.env) };
}

describe('linha de detalhe: Orto (F8)', () => {
  it('linha, 2º ponto (3; 0,4) com Orto: vai a (3; 0) (eixo X é o mais próximo)', () => {
    const { store, t } = ambiente('line', { orthoLock: true });
    clickAt(t, 0, 0);
    clickAt(t, 3, 0.4);
    const ls = dl(store);
    expect(ls).toHaveLength(1);
    expect(ls[0]!.a).toEqual({ x: 0, y: 0 });
    expect(ls[0]!.b.x).toBeCloseTo(3, 9);
    expect(ls[0]!.b.y).toBeCloseTo(0, 9);
  });

  it('linha, 2º ponto (0,4; 3) com Orto: vai a (0; 3) (eixo Y, análogo)', () => {
    const { store, t } = ambiente('line', { orthoLock: true });
    clickAt(t, 0, 0);
    clickAt(t, 0.4, 3);
    const ls = dl(store);
    expect(ls).toHaveLength(1);
    expect(ls[0]!.b.x).toBeCloseTo(0, 9);
    expect(ls[0]!.b.y).toBeCloseTo(3, 9);
  });

  it('polígono inscrito, centro (0,0), vértice (2; 0,3) com Orto: vértice sobre o eixo X, raio 2, 6 lados de lado 2', () => {
    const { store, t } = ambiente('poly-inscribed', { orthoLock: true });
    clickAt(t, 0, 0);
    clickAt(t, 2, 0.3);
    const ls = dl(store);
    expect(ls).toHaveLength(6);
    expect(ls[0]!.a.x).toBeCloseTo(2, 9);
    expect(ls[0]!.a.y).toBeCloseTo(0, 9);
    expect(ls.some((l) => Math.abs(l.a.x - 2) < 1e-9 && Math.abs(l.a.y) < 1e-9)).toBe(true);
    for (const l of ls) expect(Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y)).toBeCloseTo(2, 9);
  });

  it('círculo, centro (0,0), ponto do raio (1,5; 0,2) com Orto: raio 1,5 sobre o eixo X, extremos (1,5; 0) e (-1,5; 0)', () => {
    const { store, t } = ambiente('circle', { orthoLock: true });
    clickAt(t, 0, 0);
    clickAt(t, 1.5, 0.2);
    const ls = dl(store);
    expect(ls.length).toBeGreaterThanOrEqual(2);
    const pontos = ls.flatMap((l) => [l.a, l.b]);
    expect(pontos.some((p) => Math.abs(p.x - 1.5) < 1e-9 && Math.abs(p.y) < 1e-9)).toBe(true);
    expect(pontos.some((p) => Math.abs(p.x + 1.5) < 1e-9 && Math.abs(p.y) < 1e-9)).toBe(true);
    for (const l of ls) expect(Math.abs(l.sag!)).toBeCloseTo(1.5, 6);
  });
});

describe('linha de detalhe: Polar (F10)', () => {
  it('linha, incremento 45 graus, 2º ponto (2; 2,1): projeta na diagonal em (2,05; 2,05)', () => {
    // d = (2; 2,1), ângulo 46,4 graus -> múltiplo de 45 mais próximo = 45 graus. Projeção sobre (cos45, sen45):
    // (2 + 2,1)·0,70711 = 2,89914 de comprimento; ponto = (2,05; 2,05), comprimento total 2,05·√2 = 2,8991378.
    const { store, t } = ambiente('line', { angleMode: { ortho: false, polar: true, polarIncrementDeg: 45 } });
    clickAt(t, 0, 0);
    clickAt(t, 2, 2.1);
    const ls = dl(store);
    expect(ls).toHaveLength(1);
    expect(ls[0]!.b.x).toBeCloseTo(2.05, 9);
    expect(ls[0]!.b.y).toBeCloseTo(2.05, 9);
    expect(Math.hypot(ls[0]!.b.x, ls[0]!.b.y)).toBeCloseTo(2.8991378, 6);
  });
});
