import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEmptyProject } from '@hestia/model';
import { DrawGalleryPanel, isGalleryDrawTool } from './DrawGalleryPanel.tsx';
import { contextTab } from './context.ts';

describe('faixa: galeria Desenhar da Topografia (curvas de nível)', () => {
  it('Topografia e Editar terreno abrem a aba contextual e usam a galeria', () => {
    for (const id of ['terrain', 'terrainEdit'] as const) {
      expect(contextTab(id, [], createEmptyProject('vazio'))?.key).toBe(`tool:${id}`);
      expect(isGalleryDrawTool(id)).toBe(true);
    }
  });

  it('a Topografia mostra 10 formas: linha, 3 arcos, círculo, elipse, retângulo, 2 polígonos e a spline', () => {
    const html = renderToStaticMarkup(createElement(DrawGalleryPanel, { tool: 'terrain' }));
    expect((html.match(/class="pm-gi/g) ?? []).length).toBe(10);
    expect(html).toContain('Spline');
  });

  it('o Editar terreno só mostra a galeria no submodo Curva (aqui, com outra ferramenta ativa, nada)', () => {
    expect(renderToStaticMarkup(createElement(DrawGalleryPanel, { tool: 'terrainEdit' }))).toBe('');
  });
});
