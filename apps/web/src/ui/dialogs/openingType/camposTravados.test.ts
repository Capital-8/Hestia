import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPENING_TYPES, openingFamilyOf, type OpeningType } from '@hestia/model';
import { leavesChoicesFor } from '../openingTypeForm.ts';
import { OpeningTypeSections } from './OpeningTypeSections.tsx';

vi.mock('../../../editor/controller.ts', async () => {
  const { ProjectStore, createEmptyProject } = await import('@hestia/model');
  const store = new ProjectStore(createEmptyProject());
  return { editor: { store }, useProject: () => store.project, useProjectVersion: () => store.version };
});

const tipo = (id: string): OpeningType => DEFAULT_OPENING_TYPES.find((t) => t.id === id)!;

/** Aba "Batente" (estilo e material do batente) do tipo, como o diálogo a monta. */
function abaBatente(d: OpeningType): string {
  const family = openingFamilyOf(d, 'pt')!;
  return renderToStaticMarkup(
    createElement(OpeningTypeSections, { d, onChange: () => {}, family, leaves: leavesChoicesFor(family), materials: {}, active: 'frame' }),
  );
}

const AVISO = 'Definido pela composição (edite na aba Módulos)';
const TOPO = 'Composição autoral: bandeira, laterais, estilo e material do batente se editam na aba Módulos.';

describe('campos travados pela composição autoral', () => {
  it('desabilita estilo e material do batente com aviso quando o tipo tem composição autoral', () => {
    const html = abaBatente(tipo('ot_pband40_90'));
    expect(html).toMatch(/<select id="op-frame"[^>]*disabled/);
    expect(html).toMatch(/<select id="op-mat"[^>]*disabled/);
    expect(html).toContain(AVISO);
    expect(html).toContain(TOPO);
  });

  it('não trava nada nem mostra a dica quando o tipo não tem composição autoral', () => {
    const html = abaBatente(tipo('ot_p90'));
    expect(html).not.toMatch(/<select id="op-frame"[^>]*disabled/);
    expect(html).not.toMatch(/<select id="op-mat"[^>]*disabled/);
    expect(html).not.toContain(AVISO);
    expect(html).not.toContain(TOPO);
    expect(html).toContain('id="op-frame"');
  });
});
