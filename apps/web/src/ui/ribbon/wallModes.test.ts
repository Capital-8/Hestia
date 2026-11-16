import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEmptyProject } from '@hestia/model';
import { DEFAULT_OPTIONS } from '../../editor/state.ts';
import { wallGalleryOf, wallGalleryPatch, wallModeOf, type WallGalleryId } from '../wallModes.ts';
import { WALL_SHAPES, WallDrawPanel } from '../WallDrawPanel.tsx';
import { perimeterShapesFor } from '../perimeter/PerimeterRibbonPanels.tsx';
import { contextTab } from './context.ts';

const IDS: WallGalleryId[] = ['line', 'rect', 'poly-inscribed', 'poly-circumscribed', 'circle', 'arc-3pt', 'arc-center', 'arc-tangent', 'ellipse', 'spline'];

describe('faixa: galeria Desenhar da ferramenta Parede (a mesma do perímetro)', () => {
  it('a aba da Parede não tem mais painel Desenhar próprio, e mantém Modificar', () => {
    const tab = contextTab('wall', [], createEmptyProject('vazio'))!.tab;
    expect(tab.panels.some((p) => p.id === 'desenhar')).toBe(false);
    expect(tab.panels.some((p) => p.id === 'modificar')).toBe(true);
  });

  it('oferece dez formas, sem filete, face, perímetro e ambiente; spline é nova', () => {
    expect(WALL_SHAPES.map((s) => s.id)).toEqual(IDS);
    expect(WALL_SHAPES.find((s) => s.id === 'spline')!.isNew).toBe(true);
    const doPerimetro = perimeterShapesFor('floor').map((s) => s.id as string);
    for (const s of WALL_SHAPES) if (s.id !== 'spline') expect(doPerimetro).toContain(s.id);
  });

  it('cada forma seleciona o wallShape certo e fica marcada sozinha', () => {
    const esperado: Record<WallGalleryId, Partial<typeof DEFAULT_OPTIONS>> = {
      line: { wallShape: 'line' },
      rect: { wallShape: 'rect' },
      'poly-inscribed': { wallShape: 'polygon', wallPolygonCircumscribed: false },
      'poly-circumscribed': { wallShape: 'polygon', wallPolygonCircumscribed: true },
      circle: { wallShape: 'circle' },
      'arc-3pt': { wallShape: 'arc' },
      'arc-center': { wallShape: 'arc-center' },
      'arc-tangent': { wallShape: 'arc-tangent' },
      ellipse: { wallShape: 'ellipse' },
      spline: { wallShape: 'spline' },
    };
    for (const id of IDS) {
      expect(wallGalleryPatch(id), id).toEqual(esperado[id]);
      const o = { ...DEFAULT_OPTIONS, ...wallGalleryPatch(id) };
      expect(wallGalleryOf(o), id).toBe(id);
      expect(wallModeOf(o)).toBeDefined();
    }
  });

  it('o painel desenha a galeria com um botão por forma e só o da opção atual pressionado', () => {
    const html = renderToStaticMarkup(createElement(WallDrawPanel, { options: { ...DEFAULT_OPTIONS, ...wallGalleryPatch('arc-tangent') }, onPatch: () => {} }));
    expect(html.match(/class="pm-gi/g)).toHaveLength(10);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain('pm-galbox');
  });
});
