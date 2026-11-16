import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '../editor/state.ts';
import { wallModeOf, wallModePatch, type WallMode } from './wallModes.ts';

const TODOS: WallMode[] = ['line', 'arc', 'rect', 'polygonIn', 'polygonOut', 'circle', 'ellipse', 'spline'];

describe('modos da parede (faixa, barra e Propriedades)', () => {
  it('cada modo, aplicado às opções, volta a ser o mesmo modo', () => {
    for (const m of TODOS) {
      const o = { ...DEFAULT_OPTIONS, ...wallModePatch(m) };
      expect(wallModeOf(o), m).toBe(m);
    }
  });

  it('inscrito e circunscrito são o mesmo tipo de forma com a flag trocada', () => {
    expect(wallModePatch('polygonIn')).toEqual({ wallShape: 'polygon', wallPolygonCircumscribed: false });
    expect(wallModePatch('polygonOut')).toEqual({ wallShape: 'polygon', wallPolygonCircumscribed: true });
  });

  it('o padrão (reta) não tem polígono ligado', () => {
    expect(wallModeOf(DEFAULT_OPTIONS)).toBe('line');
  });
});
