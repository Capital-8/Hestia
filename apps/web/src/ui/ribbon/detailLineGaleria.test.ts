import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEmptyProject } from '@hestia/model';
import { DrawGalleryPanel, isGalleryDrawTool } from './DrawGalleryPanel.tsx';
import { contextTab } from './context.ts';

describe('faixa: galeria Desenhar da Linha de detalhe', () => {
  it('a ferramenta abre a aba contextual `tool:detailLine` e é uma ferramenta de galeria', () => {
    const ct = contextTab('detailLine', [], createEmptyProject('vazio'));
    expect(ct?.key).toBe('tool:detailLine');
    expect(isGalleryDrawTool('detailLine')).toBe(true);
  });

  it('o painel renderiza as 9 formas (linha, retângulo, 2 polígonos, círculo, 3 arcos, elipse)', () => {
    const html = renderToStaticMarkup(createElement(DrawGalleryPanel, { tool: 'detailLine' }));
    expect((html.match(/class="pm-gi/g) ?? []).length).toBe(9);
    expect(html).toContain('pm-galbox');
  });
});
