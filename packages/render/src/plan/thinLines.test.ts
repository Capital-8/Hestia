import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { resolveLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, type Project } from '@hestia/model';
import { buildPlanDrawList, type PlanInput } from './build.ts';
import { thinStrokes } from './thin.ts';
import { LIGHT, type StrokeOp } from './types.ts';

/*
 * Linhas finas só na tela (decisão 0015): com a opção, todo traço do modelo sai com 1 px; sem ela, o desenho é o de antes.
 * Cena: parede de 3 m em y = 0 (peso de corte 5 = 0,5 mm de papel em 1:100, com zoom de 100 px/m = 5 px).
 */

const P = (x: number, y: number): Vec2 => ({ x, y });

function scene(): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: P(0, 0), b: P(3, 0), height: 2.8 }) });
  return s.project;
}

function draw(p: Project, over: Partial<PlanInput> = {}) {
  const input: PlanInput = {
    project: p,
    levelId: 'lv_0',
    resolved: resolveLevel(p, 'lv_0', new Map()),
    below: null,
    viewport: { cx: 1.5, cy: 0, zoom: 100, width: 800, height: 600 },
    theme: LIGHT,
    dark: false,
    selection: [],
    hover: null,
    preview: [],
    inference: null,
    showGrid: false,
    ...over,
  };
  return buildPlanDrawList(input);
}

describe('linhas finas na planta (decisão 0015)', () => {
  it('com a opção, todo traço sai com 1 px ou menos', () => {
    const fina = draw(scene(), { thinLines: true });
    expect(fina.strokes.length).toBeGreaterThan(0);
    expect(fina.strokes.every((s) => s.widthPx <= 1)).toBe(true);
  });

  it('sem a opção, a parede cortada mantém a largura real (5 px no peso 5 a 1:100 e 100 px/m)', () => {
    const real = draw(scene());
    expect(real.strokes.some((s) => s.closed && s.widthPx === 5)).toBe(true);
  });

  it('opção falsa é igual a não passar a opção', () => {
    const p = scene();
    expect(draw(p, { thinLines: false })).toEqual(draw(p));
  });

  it('o realce de seleção mantém a largura própria (2 px) com linhas finas', () => {
    const fina = draw(scene(), { thinLines: true, selection: ['w'] });
    expect(fina.strokes.some((s) => s.color === LIGHT.select && s.widthPx === 2)).toBe(true);
  });
});

describe('thinStrokes', () => {
  const stroke = (widthPx: number): StrokeOp => ({ pts: [P(0, 0), P(1, 0)], closed: false, widthPx, color: '#000', alpha: 1 });

  it('limita a 1 px os traços mais grossos e deixa os finos como estão', () => {
    const list = [stroke(5), stroke(0.5), stroke(1)];
    thinStrokes(list);
    expect(list.map((s) => s.widthPx)).toEqual([1, 0.5, 1]);
  });

  it('não muda o objeto original (troca a posição pelo traço novo)', () => {
    const original = stroke(3);
    const list = [original];
    thinStrokes(list);
    expect(original.widthPx).toBe(3);
    expect(list[0]).not.toBe(original);
  });
});
