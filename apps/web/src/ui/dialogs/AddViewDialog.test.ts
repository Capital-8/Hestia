import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const ctx = vi.hoisted(() => ({ sheetId: '' }));

vi.mock('../../editor/controller.ts', async () => {
  const { ProjectStore, createEmptyProject, makeView3DPoint, makeWall } = await import('@hestia/model');
  const { addSheetAction } = await import('../../editor/sheetActions.ts');
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 3 }) });
  // Muitas vistas 3D: a lista mostra só o começo; o resto entra ao rolar.
  for (let i = 1; i <= 250; i++) {
    const nome = `Ponto ${String(i).padStart(3, '0')}`;
    store.exec({ type: 'addView3DPoint', point: makeView3DPoint({ azimuth: 0, elevation: 0.5, distance: 10, target: { x: 0, y: 0, z: 0 }, ortho: false }, nome) });
  }
  ctx.sheetId = addSheetAction(store);
  return { editor: { store }, useProject: () => store.project, useProjectVersion: () => store.version };
});

import { AddViewDialog } from './AddViewDialog.tsx';
import { encodeInsertArg } from '../../editor/sheetInsertArg.ts';

describe('janela Inserir vistas (componente)', () => {
  it('abre com a lista agrupada por tipo, a escala inicial "Da vista" e os botões; sem prévia', () => {
    const html = renderToStaticMarkup(createElement(AddViewDialog, { sheetId: ctx.sheetId }));
    expect(html).toContain('class="dialog ins"');
    expect(html).toContain('>Plantas<');
    expect(html).toContain('title="Térreo">Térreo<');
    expect(html).toContain('title="Pavimento 2">Pavimento 2<');
    expect(html).toContain('>Modelo 3D<');
    expect(html).not.toContain('>Cortes<');
    expect(html).toContain('Marcar todas');
    expect(html).toContain('Limpar');
    expect(html).toContain('>Da vista<');
    expect(html).toContain('>1:100<');
    expect(html).toContain('>1:500<');
    expect(html).toContain('Personalizada…');
    expect(html).toContain('Dica: segure Shift ao soltar uma vista do Navegador para abrir esta janela.');
    expect(html).toContain('>Cancelar<');
    expect(html).toContain('>Inserir<');
    expect(html).not.toContain('data-testid="insert-preview"');
    expect(html).not.toContain('Tamanho na folha');
    expect(html).not.toContain('Cabe na folha');
  });

  it('nada marcado: o botão Inserir começa desabilitado', () => {
    const html = renderToStaticMarkup(createElement(AddViewDialog, { sheetId: ctx.sheetId }));
    expect(html).toContain('disabled="">Inserir</button>');
    expect(html).not.toContain('checked=""');
  });

  it('lista longa: só o começo entra no DOM; as últimas vistas aparecem só ao rolar', () => {
    const html = renderToStaticMarkup(createElement(AddViewDialog, { sheetId: ctx.sheetId }));
    expect(html).toContain('title="Ponto 001"');
    expect(html).toContain('title="Ponto 010"');
    expect(html).not.toContain('title="Ponto 200"');
    expect(html).not.toContain('title="Ponto 250"');
  });

  it('vinda do arraste com Shift: marca a vista solta e avisa que entra onde foi solta', () => {
    const arg = encodeInsertArg({ sheetId: ctx.sheetId, view: { kind: 'plan', levelId: 'lv_0' }, centre: { x: 150, y: 100 } });
    const html = renderToStaticMarkup(createElement(AddViewDialog, { sheetId: arg }));
    expect(html).toContain('Será inserida onde você soltou.');
    expect(html).toMatch(/type="checkbox" checked=""\/?>\s*<span class="ins-name" title="Térreo">Térreo<\/span>/);
    expect(html).not.toContain('disabled="">Inserir</button>');
  });

  it('prancha inexistente não desenha nada', () => {
    expect(renderToStaticMarkup(createElement(AddViewDialog, { sheetId: 'nao_existe' }))).toBe('');
  });
});
