import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '@hestia/model';
import { defaultPaint, paintOps, planStyleOf } from './style.ts';
import type { FillOp, StrokeOp } from './types.ts';

/**
 * Apresentação da disciplina na planta (plano de UX de 2026-11-23): o `PlanPaint` carrega clareamento e opacidade; o
 * `paintOps` mistura a cor com o papel e aplica a opacidade nas alphas. Valores literais da ficha.
 */

describe('PlanPaint e paintOps com apresentação por categoria', () => {
  const p = createEmptyProject();

  it('sem o mapa, o paint continua o de hoje (clareamento 0, opacidade 1, halftone do gráfico)', () => {
    const pt = planStyleOf(p, 'lv_0', 100).paint.wall;
    expect(pt.clareamento).toBe(0);
    expect(pt.opacidade).toBe(1);
    expect(pt.halftone).toBe(false);
    expect(pt.visible).toBe(true);
  });

  it('halftone com clareamento 0,2 e opacidade 0,5 chega ao paint da categoria', () => {
    const pt = planStyleOf(p, 'lv_0', 100, undefined, undefined, { wall: { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 } }).paint.wall;
    expect(pt.halftone).toBe(true);
    expect(pt.visible).toBe(true);
    expect(pt.clareamento).toBe(0.2);
    expect(pt.opacidade).toBe(0.5);
    expect(pt.alpha).toBe(1);
  });

  it('normal com clareamento 0,5 não vira halftone e mantém a opacidade 1', () => {
    const pt = planStyleOf(p, 'lv_0', 100, undefined, undefined, { wall: { tone: 'normal', clareamento: 0.5 } }).paint.wall;
    expect(pt.halftone).toBe(false);
    expect(pt.clareamento).toBe(0.5);
    expect(pt.opacidade).toBe(1);
  });

  it('paintOps: preenchimento e hachura usam alpha × opacidade; as linhas usam max(0,3; opacidade)', () => {
    const pt = { ...defaultPaint('wall', 100), halftone: true, clareamento: 0.2, opacidade: 0.5 };
    const fill: FillOp = { polygons: [], color: '#000000', alpha: 0.8, hatch: { kind: 'cross', color: '#000000', alpha: 0.6 } };
    const stroke: StrokeOp = { pts: [], closed: true, widthPx: 1, color: '#000000', alpha: 0.9 };
    const out = paintOps({ fills: [fill], strokes: [stroke], labels: [] }, pt, '#ffffff');
    expect(out.fills[0]!.color).toBe('#333333');
    expect(out.fills[0]!.alpha).toBeCloseTo(0.4, 12);
    expect(out.fills[0]!.hatch?.color).toBe('#333333');
    expect(out.fills[0]!.hatch?.alpha).toBeCloseTo(0.3, 12);
    expect(out.strokes[0]!.color).toBe('#333333');
    expect(out.strokes[0]!.alpha).toBeCloseTo(0.45, 12);
  });

  it('paintOps: normal com clareamento 0,5 clareia sem mexer nas alphas', () => {
    const pt = { ...defaultPaint('wall', 100), halftone: false, clareamento: 0.5, opacidade: 1 };
    const fill: FillOp = { polygons: [], color: '#000000', alpha: 0.8 };
    const stroke: StrokeOp = { pts: [], closed: true, widthPx: 1, color: '#000000', alpha: 0.9 };
    const out = paintOps({ fills: [fill], strokes: [stroke], labels: [] }, pt, '#ffffff');
    expect(out.fills[0]!.color).toBe('#808080');
    expect(out.fills[0]!.alpha).toBeCloseTo(0.8, 12);
    expect(out.strokes[0]!.color).toBe('#808080');
    expect(out.strokes[0]!.alpha).toBeCloseTo(0.9, 12);
  });

  it('paintOps sem apresentação devolve o mesmo objeto (desenho de hoje)', () => {
    const ops = { fills: [], strokes: [], labels: [] };
    expect(paintOps(ops, defaultPaint('wall', 100), '#ffffff')).toBe(ops);
  });
});
