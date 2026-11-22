import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const ctx = vi.hoisted(() => ({ sheetId: '' }));

vi.mock('../../editor/controller.ts', async () => {
  const { ProjectStore, createEmptyProject, makeWall } = await import('@hestia/model');
  const { addSheetAction } = await import('../../editor/sheetActions.ts');
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 3 }) });
  store.exec({ type: 'addPlanView', plan: { id: 'pv_est', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura' } });
  ctx.sheetId = addSheetAction(store);
  return { editor: { store }, useProject: () => store.project, useProjectVersion: () => store.version };
});

import { AddViewDialog } from './AddViewDialog.tsx';
import { encodeInsertArg } from '../../editor/sheetInsertArg.ts';

/*
 * Arraste com Shift de uma planta de disciplina (decisão 0060 §6, etapa 4.3): a janela "Inserir vistas" abre com ELA
 * marcada (chave `pv:`), não com a planta padrão do nível.
 */
describe('janela Inserir vistas com planta de disciplina', () => {
  it('a planta de disciplina aparece na lista junto da padrão do nível', () => {
    const html = renderToStaticMarkup(createElement(AddViewDialog, { sheetId: ctx.sheetId }));
    expect(html).toContain('title="Térreo">Térreo<');
    expect(html).toContain('title="Térreo · Estrutura">Térreo · Estrutura<');
    expect(html).not.toContain('checked=""');
  });

  it('vinda do arraste com Shift, marca a planta de disciplina solta e não a padrão do nível', () => {
    const arg = encodeInsertArg({ sheetId: ctx.sheetId, view: { kind: 'plan', levelId: 'lv_0', planId: 'pv_est' }, centre: { x: 150, y: 100 } });
    const html = renderToStaticMarkup(createElement(AddViewDialog, { sheetId: arg }));
    expect(html).toMatch(/checked=""[^>]*\/?>\s*<span class="ins-name" title="Térreo · Estrutura">/);
    expect(html).not.toMatch(/checked=""[^>]*\/?>\s*<span class="ins-name" title="Térreo">/);
  });
});
