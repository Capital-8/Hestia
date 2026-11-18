import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const ctx = vi.hoisted(() => ({ sheetId: '' }));

vi.mock('../../editor/controller.ts', async () => {
  const { ProjectStore, createEmptyProject, makeWall } = await import('@hestia/model');
  const { addSheetAction } = await import('../../editor/sheetActions.ts');
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 3 }) });
  ctx.sheetId = addSheetAction(store);
  return { editor: { store }, useProject: () => store.project, useProjectVersion: () => store.version };
});

import { AddViewDialog } from './AddViewDialog.tsx';
import { encodeInsertArg } from '../../editor/sheetInsertArg.ts';

describe('janela Inserir vistas (componente)', () => {
  it('abre larga, com prévia da folha, tamanho em mm, seletor de escala e opção personalizada', () => {
    const html = renderToStaticMarkup(createElement(AddViewDialog, { sheetId: ctx.sheetId }));
    expect(html).toContain('data-testid="insert-preview"');
    expect(html).toContain('data-testid="insert-box"');
    expect(html).toContain('data-fits="1"');
    expect(html).toContain('Tamanho na folha:');
    expect(html).toContain('1:100');
    expect(html).toContain('1:500');
    expect(html).toContain('Personalizada');
    expect(html).toContain('Da vista · 1:');
    expect(html).not.toContain('data-testid="insert-warning"');
  });
  it('vinda do arraste com Shift: pré-marca a vista e avisa que entra onde foi solta', () => {
    const arg = encodeInsertArg({ sheetId: ctx.sheetId, view: { kind: 'plan', levelId: 'lv_0' }, centre: { x: 150, y: 100 } });
    const html = renderToStaticMarkup(createElement(AddViewDialog, { sheetId: arg }));
    expect(html).toContain('Será inserida onde você soltou.');
    expect(html).toContain('data-testid="insert-box"');
  });
  it('prancha inexistente não desenha nada', () => {
    expect(renderToStaticMarkup(createElement(AddViewDialog, { sheetId: 'nao_existe' }))).toBe('');
  });
});
