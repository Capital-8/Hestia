import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { abrirImportTerreno, fecharImportTerreno } from '../../editor/terrenoImport.ts';
import { ImportTerrenoDialog } from './ImportTerrenoDialog.tsx';

afterEach(() => fecharImportTerreno());

describe('Diálogo Importar levantamento', () => {
  it('fechado não renderiza nada', () => {
    expect(renderToStaticMarkup(createElement(ImportTerrenoDialog))).toBe('');
  });

  it('aberto por abrirImportTerreno mostra o seletor de .dxf e .csv e o botão Importar desligado', () => {
    abrirImportTerreno();
    const html = renderToStaticMarkup(createElement(ImportTerrenoDialog));
    expect(html).toContain('Importar levantamento');
    expect(html).toContain('accept=".dxf,.csv"');
    expect(html).toMatch(/<button class="btn primary" disabled="">Importar<\/button>/);
  });
});
