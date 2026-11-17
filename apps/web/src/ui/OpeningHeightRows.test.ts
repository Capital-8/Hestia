import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { buildTemplate, isOpening, ProjectStore, type Opening } from '@hestia/model';

vi.mock('../editor/controller.ts', async () => {
  const { buildTemplate: monta, ProjectStore: Loja } = await import('@hestia/model');
  const store = new Loja(monta('house2'));
  return { editor: { store }, useProject: () => store.project, useProjectVersion: () => store.version };
});

const { AlturaDaAbertura } = await import('./OpeningHeightRows.tsx');

/** Janela da casa de teste com a altura própria (ou não) e o tipo dela. */
function janela(alturaPropria: number | null) {
  const store = new ProjectStore(buildTemplate('house2'));
  const win = Object.values(store.project.elements).find((e): e is Opening => isOpening(e) && e.kind === 'window')!;
  if (alturaPropria !== null) store.exec({ type: 'updateElements', ids: [win.id], patch: { heightOverride: alturaPropria } });
  const abertura = store.project.elements[win.id] as Opening;
  return { abertura, tipo: store.project.openingTypes[abertura.typeId]! };
}

describe('altura da abertura no painel de propriedades', () => {
  it('mostra o selo "Altura própria" e o botão "Usar altura do tipo" quando há altura própria', () => {
    const { abertura, tipo } = janela(1.5);
    const html = renderToStaticMarkup(createElement(AlturaDaAbertura, { ids: [abertura.id], abertura, tipo }));
    expect(html).toContain('Altura própria');
    expect(html).toContain('Usar altura do tipo');
    expect(html).toContain('value="1,5"');
  });

  it('sem altura própria, mostra a altura do tipo e não mostra selo nem botão', () => {
    const { abertura, tipo } = janela(null);
    const html = renderToStaticMarkup(createElement(AlturaDaAbertura, { ids: [abertura.id], abertura, tipo }));
    expect(html).not.toContain('Altura própria');
    expect(html).not.toContain('Usar altura do tipo');
    expect(html).toContain('value="1,2"');
  });
});
