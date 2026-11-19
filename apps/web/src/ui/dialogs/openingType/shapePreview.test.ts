import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPENING_TYPES, OPENING_SHAPE_KINDS, outline, openingShapeOf, type OpeningType } from '@hestia/model';
import { ShapePanel } from './panels/ShapePanel.tsx';
import { ShapePreview } from './ShapePreview.tsx';
import { fromPx, polygonHandlePx, previewFrame, pxToPolygonUV, shapeGeometry, toPx } from './shapePreview.ts';
import { polygonPointsOf, withPolygonPoints, withShapeKind, withShapeNumber } from './openingTypeShape.ts';

vi.mock('../../../editor/controller.ts', async () => {
  const { ProjectStore, createEmptyProject } = await import('@hestia/model');
  const store = new ProjectStore(createEmptyProject());
  return { editor: { store }, useProject: () => store.project, useProjectVersion: () => store.version };
});

const base = (): OpeningType => ({ ...DEFAULT_OPENING_TYPES.find((t) => t.id === 'ot_j120')! });
const painel = (d: OpeningType): string =>
  renderToStaticMarkup(createElement(ShapePanel, { d, onChange: () => {}, family: null, support: {} as never, leaves: [], materials: {} }));

describe('geometria da prévia', () => {
  it('o contorno é o outline() real do vão, e há cotas de largura e altura', () => {
    for (const kind of OPENING_SHAPE_KINDS) {
      const d = withShapeKind(base(), kind);
      const g = shapeGeometry(d);
      const esperado = kind === 'rect' ? null : outline(openingShapeOf(d)!);
      if (esperado) expect(g.outer, kind).toEqual(esperado);
      expect(g.outer, kind).not.toBeNull();
      expect(g.dims.map((x) => x.id), kind).toEqual(expect.arrayContaining(['width', 'height']));
      expect(g.frameFallsBack, kind).toBe(false);
    }
  });

  it('flecha vira cota no arco, na ogiva e na empena; topo no trapézio', () => {
    const rise = (k: 'round' | 'segmental' | 'pointed' | 'gable'): number | undefined => shapeGeometry(withShapeKind(base(), k)).dims.find((x) => x.id === 'rise')?.value;
    expect(rise('round')).toBeCloseTo(0.6, 9);
    expect(rise('segmental')).toBeCloseTo(0.3, 9);
    expect(rise('pointed')).toBeGreaterThan(0.6);
    expect(rise('gable')).toBeCloseTo(0.4, 9);
    expect(shapeGeometry(withShapeKind(base(), 'trapezoid')).dims.some((x) => x.id === 'top')).toBe(true);
    expect(shapeGeometry(base()).dims.some((x) => x.id === 'rise')).toBe(false);
  });

  it('a esquadria recuada fica dentro do vão e é menor que ele', () => {
    const g = shapeGeometry(withShapeKind(base(), 'round'));
    const maxX = (r: readonly (readonly [number, number])[]): number => Math.max(...r.map((p) => p[0]));
    expect(g.inner).not.toBeNull();
    expect(maxX(g.inner!)).toBeLessThan(maxX(g.outer!));
  });

  it('forma inválida: sem contorno, sem quebrar', () => {
    const g = shapeGeometry(withShapeNumber(withShapeKind(base(), 'segmental'), 'rise', 5));
    expect(g.outer).toBeNull();
    expect(g.dims.length).toBeGreaterThanOrEqual(2);
  });

  it('pixels e metros são inversos; o ponto do polígono ida e volta (com folga do vão bruto)', () => {
    const d = { ...withShapeKind(base(), 'polygon'), roughOversize: { w: 0.1, h: 0.1 } };
    const g = shapeGeometry(d);
    const f = previewFrame(g.width, g.height);
    const p: [number, number] = [0.1, 0.4];
    const [px, py] = toPx(f, p);
    expect(fromPx(f, px, py)[0]).toBeCloseTo(0.1, 9);
    expect(fromPx(f, px, py)[1]).toBeCloseTo(0.4, 9);
    const pt = { u: 0.3, v: 0.9 };
    const [hx, hy] = polygonHandlePx(f, g, pt);
    const uv = pxToPolygonUV(f, g, hx, hy);
    expect(uv.u).toBeCloseTo(0.3, 9);
    expect(uv.v).toBeCloseTo(0.9, 9);
  });
});

describe('painel da forma (render)', () => {
  it('retangular: só o seletor e a prévia, sem parâmetros', () => {
    const html = painel(base());
    expect(html).toContain('id="op-shape-kind"');
    expect(html).toContain('op-shape-svg');
    expect(html).not.toContain('op-shape-rise');
    expect(html).not.toContain('op-shape-issues');
  });

  it('mostra os parâmetros de cada forma', () => {
    expect(painel(withShapeKind(base(), 'segmental'))).toContain('id="op-shape-rise"');
    expect(painel(withShapeKind(base(), 'horseshoe'))).toContain('id="op-shape-neck"');
    const trap = painel(withShapeKind(base(), 'trapezoid'));
    expect(trap).toContain('id="op-shape-top"');
    expect(trap).toContain('id="op-shape-base"');
    const poly = painel(withShapeKind(base(), 'polygon'));
    expect(poly).toContain('id="op-shape-sym"');
    expect(poly).toContain('id="op-pt-u-4"');
    expect((poly.match(/class="op-shape-handle/g) ?? []).length).toBe(5);
  });

  it('forma inválida: mensagem em português do código, sem o texto técnico', () => {
    const html = painel(withShapeNumber(withShapeKind(base(), 'pointed'), 'rise', 0.1));
    expect(html).toContain('data-issue="pointed-rise-below-half"');
    expect(html).toContain('No arco ogival a flecha deve ser de pelo menos metade da largura.');
    expect(html).not.toContain('op-shape-valid');
  });

  it('polígono horário: lista o problema', () => {
    const d = withShapeKind(base(), 'polygon');
    const rev = withPolygonPoints(d, polygonPointsOf(d).reverse());
    expect(painel(rev)).toContain('Os pontos estão em sentido horário');
  });

  it('a prévia isolada renderiza o SVG com as cotas', () => {
    const html = renderToStaticMarkup(createElement(ShapePreview, { d: withShapeKind(base(), 'round'), onChange: () => {} }));
    expect(html).toContain('data-dim="width"');
    expect(html).toContain('data-dim="rise"');
    expect(html).toContain('op-shape-inner');
  });
});
