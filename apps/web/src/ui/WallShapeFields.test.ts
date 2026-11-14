import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_OPTIONS } from '../editor/state.ts';
import { WallShapeFields } from './OptionsBar.tsx';
import { wallModePatch, type WallMode } from './wallModes.ts';

const render = (modo: WallMode, extra: Record<string, unknown> = {}): string =>
  renderToStaticMarkup(createElement(WallShapeFields, { o: { ...DEFAULT_OPTIONS, ...wallModePatch(modo), ...extra }, set: () => {} }));

describe('barra de opções da parede: campos do modo', () => {
  it('reta, arco e retângulo não mostram campo numérico', () => {
    for (const m of ['line', 'arc', 'rect'] as const) expect(render(m)).toBe('');
  });

  it('polígono (inscrito ou circunscrito) mostra o número de lados, padrão 6', () => {
    for (const m of ['polygonIn', 'polygonOut'] as const) {
      const html = render(m);
      expect(html).toContain('id="opt-poly-sides"');
      expect(html).toContain('value="6"');
      expect(html).not.toContain('id="opt-fit-tol"');
    }
  });

  it('elipse e spline mostram a tolerância do ajuste em mm, padrão 5', () => {
    for (const m of ['ellipse', 'spline'] as const) {
      const html = render(m);
      expect(html).toContain('id="opt-fit-tol"');
      expect(html).toContain('value="5"');
      expect(html).not.toContain('id="opt-poly-sides"');
    }
  });

  it('o valor gravado nas opções aparece no campo (lados 12; tolerância 0,02 m = 20 mm)', () => {
    expect(render('polygonOut', { wallPolygonSides: 12 })).toContain('value="12"');
    expect(render('spline', { wallFitTol: 0.02 })).toContain('value="20"');
  });
});
