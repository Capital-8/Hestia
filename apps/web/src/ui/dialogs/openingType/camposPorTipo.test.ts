import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPENING_TYPES, openingFamilyOf, type OpeningType } from '@hestia/model';
import { leavesChoicesFor } from '../openingTypeForm.ts';
import { componentToShow, visibleComponents, type OpeningComponentId } from './components.ts';
import { OpeningTypeSections } from './OpeningTypeSections.tsx';

vi.mock('../../../editor/controller.ts', async () => {
  const { ProjectStore, createEmptyProject } = await import('@hestia/model');
  const store = new ProjectStore(createEmptyProject());
  return { editor: { store }, useProject: () => store.project, useProjectVersion: () => store.version };
});

const tipo = (id: string): OpeningType => DEFAULT_OPENING_TYPES.find((t) => t.id === id)!;

/** Renderiza um componente do tipo (cada aba aberta) e devolve o HTML dele. */
function aba(d: OpeningType, active: OpeningComponentId): string {
  const family = openingFamilyOf(d, 'pt')!;
  return renderToStaticMarkup(
    createElement(OpeningTypeSections, { d, onChange: () => {}, family, leaves: leavesChoicesFor(family), materials: {}, active }),
  );
}

/** Rótulos dos campos da aba (só o painel, sem a lista de componentes). */
function rotulos(html: string): string[] {
  const painel = html.slice(html.indexOf('<section'));
  return [...painel.matchAll(/<label[^>]*>([^<]*)<\/label>/g)].map((m) => m[1] ?? '');
}

/** Abas que o diálogo mostra para o tipo, na ordem da lista. */
const abas = (d: OpeningType): OpeningComponentId[] => visibleComponents(d.kind, openingFamilyOf(d, 'pt')?.id ?? null).map((c) => c.id);

// Campos que só existem na porta (maçaneta, dobradiças, folga, soleira, estilo da folha).
const SO_PORTA = ['Maçaneta', 'Dobradiças', 'Folga inferior', 'Soleira', 'Estilo da folha'];

describe('campos que não se aplicam ao tipo (janela x porta)', () => {
  it('a janela não mostra a aba Folha nem os campos exclusivos de porta', () => {
    const j = tipo('ot_j120');
    expect(abas(j)).not.toContain('leaf');
    expect(componentToShow('window', 'window_hinged', 'leaf')).toBe('overview');
    for (const id of abas(j)) {
      const campos = rotulos(aba(j, id));
      // "Soleira saliente" é o peitoril saliente da janela (campo legítimo); a soleira da porta é "Soleira" ou "Soleira: ...".
      for (const campo of SO_PORTA) expect(campos.some((r) => r === campo || r.startsWith(`${campo}:`)), `${id} ${campo}`).toBe(false);
    }
  });

  it('a janela mostra o fator solar e o U na aba Quadro e dados', () => {
    const html = aba(tipo('ot_j120'), 'data');
    expect(html).toContain('Fator solar');
    expect(html).toContain('U (W/m²K)');
  });

  it('a porta mostra maçaneta e folha, e não tem fator solar nem U', () => {
    const p = tipo('ot_p80');
    expect(abas(p)).toContain('leaf');
    expect(aba(p, 'leaf')).toContain('Maçaneta');
    for (const id of abas(p)) {
      const html = aba(p, id);
      expect(html, id).not.toContain('Fator solar');
      expect(html, id).not.toContain('U (W/m²K)');
    }
  });
});
