import { describe, expect, it } from 'vitest';
import type { DetailLine } from '@hestia/model';
import { P, clickAt, makeEnv, tool } from './testEnv.ts';
import { detailPolygonSides, normalizeDetailSegs } from './detailLineToolShapes.ts';
import type { WallDrawShape } from './types.ts';

const dl = (s: ReturnType<typeof makeEnv>['store']): DetailLine[] => s.project.levels[0]!.detailLines ?? [];
const len = (l: DetailLine): number => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);

function desenha(shape: WallDrawShape, pts: Array<[number, number]>, sides?: number) {
  const { store, env, options } = makeEnv();
  options.detailLineShape = shape;
  if (sides !== undefined) options.detailLinePolygonSides = sides;
  const t = tool('detailLine', env);
  for (const [x, y] of pts) clickAt(t, x, y);
  return { store, t, lines: dl(store) };
}

describe('linha de detalhe sobre o núcleo de formas', () => {
  it('retângulo (0,0)-(2,1): 4 linhas retas, perímetro 6', () => {
    const { lines } = desenha('rect', [[0, 0], [2, 1]]);
    expect(lines).toHaveLength(4);
    expect(lines.every((l) => l.sag === undefined)).toBe(true);
    expect(lines.map(len).sort()).toEqual([1, 1, 2, 2]);
  });

  it('polígono inscrito de 6 lados (padrão), centro (0,0), vértice (1,0): 6 linhas de comprimento 1', () => {
    const { lines } = desenha('poly-inscribed', [[0, 0], [1, 0]]);
    expect(lines).toHaveLength(6);
    for (const l of lines) expect(len(l)).toBeCloseTo(1, 9);
    expect(lines[0]!.a).toEqual({ x: 1, y: 0 });
  });

  it('polígono inscrito de 4 lados pela opção: quadrado de lado raiz de 2', () => {
    const { lines } = desenha('poly-inscribed', [[0, 0], [1, 0]], 4);
    expect(lines).toHaveLength(4);
    for (const l of lines) expect(len(l)).toBeCloseTo(1.4142135, 6);
  });

  it('polígono circunscrito de 4 lados, centro (0,0), meio de lado (1,0): quadrado de lado 2', () => {
    const { lines } = desenha('poly-circumscribed', [[0, 0], [1, 0]], 4);
    expect(lines).toHaveLength(4);
    for (const l of lines) expect(len(l)).toBeCloseTo(2, 9);
    for (const l of lines) expect(Math.min(Math.abs(l.a.x), Math.abs(l.a.y))).toBeCloseTo(1, 9);
  });

  it('arco por 3 pontos (0,0), (1,1), (2,0): UMA linha a=(0,0) b=(2,0) com sag +1 (esquerda de a para b)', () => {
    const { lines } = desenha('arc', [[0, 0], [1, 1], [2, 0]]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.a).toEqual({ x: 0, y: 0 });
    expect(lines[0]!.b).toEqual({ x: 2, y: 0 });
    expect(lines[0]!.sag).toBeCloseTo(1, 6);
  });

  it('arco por 3 pontos (0,0), (1,-0,5), (2,0): sag -0,5 (abaula à direita)', () => {
    const { lines } = desenha('arc', [[0, 0], [1, -0.5], [2, 0]]);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.sag).toBeCloseTo(-0.5, 6);
  });

  it('círculo de raio 1: arcos de 180 graus com corda 2 e flecha de módulo 1, extremos em (1,0) e (-1,0)', () => {
    const { lines } = desenha('circle', [[0, 0], [1, 0]]);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.length).toBeLessThan(24);
    for (const l of lines) {
      expect(len(l)).toBeCloseTo(2, 6);
      expect(Math.abs(l.sag!)).toBeCloseTo(1, 6);
      expect(Math.abs(Math.hypot(l.a.x, l.a.y) - 1)).toBeLessThan(1e-9);
    }
  });

  it('elipse de semieixos 2 e 1: todos os extremos satisfazem x²/4 + y² = 1', () => {
    const { lines } = desenha('ellipse', [[0, 0]]);
    expect(lines).toHaveLength(0);
    const { store, env, options } = makeEnv();
    options.detailLineShape = 'ellipse';
    const t = tool('detailLine', env);
    clickAt(t, 0, 0);
    expect(t.type('2')).toBe(true);
    expect(t.type('1')).toBe(true);
    expect(t.type('0')).toBe(true);
    const ls = dl(store);
    expect(ls.length).toBeGreaterThanOrEqual(8);
    for (const l of ls) expect(l.a.x ** 2 / 4 + l.a.y ** 2).toBeCloseTo(1, 9);
  });

  it('linha: comprimento digitado 3 + Enter a partir de (0,0) na direção (1,0) grava (0,0)-(3,0)', () => {
    const { store, env, options } = makeEnv();
    options.detailLineShape = 'line';
    const t = tool('detailLine', env);
    clickAt(t, 0, 0);
    t.move(P(1, 0));
    expect(t.type('3')).toBe(true);
    const ls = dl(store);
    expect(ls).toHaveLength(1);
    expect(ls[0]!.a).toEqual({ x: 0, y: 0 });
    expect(ls[0]!.b).toEqual({ x: 3, y: 0 });
    expect(ls[0]!.sag).toBeUndefined();
  });

  it('linha não encadeia: o segundo clique grava e o terceiro começa outra linha', () => {
    const { store, env } = makeEnv();
    const t = tool('detailLine', env);
    clickAt(t, 0, 0);
    clickAt(t, 2, 0);
    clickAt(t, 2, 1);
    expect(dl(store)).toHaveLength(1);
  });

  it('Esc cancela e não grava; tudo numa só transação', () => {
    const { store, env, options } = makeEnv();
    options.detailLineShape = 'rect';
    const t = tool('detailLine', env);
    clickAt(t, 0, 0);
    t.move(P(2, 1));
    t.cancel();
    expect(dl(store)).toHaveLength(0);
    clickAt(t, 0, 0);
    clickAt(t, 2, 1);
    expect(dl(store)).toHaveLength(4);
    store.undo();
    expect(dl(store)).toHaveLength(0);
  });

  it('auxiliares: lados limitados a 3..64 e trechos menores que 0,01 m descartados', () => {
    expect(detailPolygonSides(undefined)).toBe(6);
    expect(detailPolygonSides(2)).toBe(3);
    expect(detailPolygonSides(100)).toBe(64);
    const segs = normalizeDetailSegs([
      { id: 's1', a: { x: 0, y: 0 }, b: { x: 0.005, y: 0 } },
      { id: 's2', a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, sag: 0.2 },
    ]);
    expect(segs).toEqual([{ a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, sag: 0.2 }]);
  });
});
