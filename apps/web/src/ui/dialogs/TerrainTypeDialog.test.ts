import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../editor/controller.ts', async () => {
  const { ProjectStore, createEmptyProject, TERRAIN_TYPES_DEFAULT } = await import('@hestia/model');
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'upsertTerrainType', tipo: { ...TERRAIN_TYPES_DEFAULT[0]!, id: 'tt_s', suavizarCurvas: true, toleranciaSuavizacao: 0.005 } });
  return { editor: { store }, useProject: () => store.project, useProjectVersion: () => store.version };
});

import { TerrainTypeDialog } from './TerrainTypeDialog.tsx';
import { useUi } from '../../editor/state.ts';

/** A tag `<input>` (ou `<select>`) com o id dado, da marcação renderizada. */
const tag = (html: string, id: string): string => html.match(new RegExp(`<(input|select)[^>]*id="${id}"[^>]*>`))?.[0] ?? '';

describe('Editar tipo do terreno: suavização das curvas (componente)', () => {
  it('tipo exato (padrão): opção Exata marcada e a tolerância desabilitada', () => {
    useUi.setState({ dialogArg: 'tntype_std' });
    const html = renderToStaticMarkup(createElement(TerrainTypeDialog));
    expect(html).toContain('<option value="exata" selected="">');
    expect(html).not.toContain('<option value="suave" selected="">');
    expect(tag(html, 'tt-suavizar')).toContain('id="tt-suavizar"');
    expect(tag(html, 'tt-tolerancia')).toContain('disabled=""');
  });

  it('tipo suavizado com tolerância 0,005 m: opção Suavizada marcada e a tolerância habilitada', () => {
    useUi.setState({ dialogArg: 'tt_s' });
    const html = renderToStaticMarkup(createElement(TerrainTypeDialog));
    expect(html).toContain('<option value="suave" selected="">');
    expect(tag(html, 'tt-tolerancia')).not.toContain('disabled');
    expect(tag(html, 'tt-tolerancia')).toContain('value="0,005"');
    expect(html).not.toMatch(/\(cm\)/);
  });
});
