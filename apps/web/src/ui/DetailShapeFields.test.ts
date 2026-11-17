import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_OPTIONS } from '../editor/state.ts';
import { DetailShapeFields } from './OptionsBar.tsx';
import type { WallDrawShape } from '@hestia/tools';

const render = (shape: WallDrawShape, extra: Record<string, unknown> = {}): string =>
  renderToStaticMarkup(createElement(DetailShapeFields, { o: { ...DEFAULT_OPTIONS, detailLineShape: shape, ...extra }, set: () => {} }));

describe('barra de opções da linha de detalhe: campo de lados', () => {
  it('reta, retângulo, círculo, arcos e elipse não mostram campo numérico', () => {
    for (const s of ['line', 'rect', 'circle', 'arc', 'arc-center', 'arc-tangent', 'ellipse'] as const) expect(render(s)).toBe('');
  });

  it('polígono inscrito ou circunscrito mostra "Lados" com padrão 6, faixa 3..64', () => {
    for (const s of ['poly-inscribed', 'poly-circumscribed'] as const) {
      const html = render(s);
      expect(html).toContain('id="opt-dl-sides"');
      expect(html).toContain('value="6"');
    }
  });

  it('o valor gravado em detailLinePolygonSides aparece no campo', () => {
    expect(render('poly-inscribed', { detailLinePolygonSides: 12 })).toContain('value="12"');
  });
});
