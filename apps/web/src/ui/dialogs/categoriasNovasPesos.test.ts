import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// `useProject` depende de useSyncExternalStore (sem obtentor para o servidor). A renderização estática lê o projeto
// direto do store; o resto do controlador (e o `editor` real) continua igual.
vi.mock('../../editor/controller.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../editor/controller.ts')>();
  return { ...actual, useProject: () => actual.editor.store.project, useProjectVersion: () => 0 };
});

import { createEmptyProject, graphicsOf, type GraphicsCategory } from '@hestia/model';
import { editor } from '../../editor/controller.ts';
import { editProjectGraphics, type ProjectGraphicsPatch } from '../../editor/graphicsActions.ts';
import { useI18n } from '../../editor/i18n.ts';
import { LineWeightsDialog } from './LineWeightsDialog.tsx';

const html = (): string => renderToStaticMarkup(createElement(LineWeightsDialog));

/** Categorias novas, rótulo PT e pesos padrão escritos à mão. */
const NOVAS: Array<[GraphicsCategory, string, number, number]> = [
  ['column', 'Pilar', 5, 2],
  ['beam', 'Viga', 4, 1],
  ['footing', 'Sapata', 4, 1],
  ['ceiling', 'Forro', 3, 1],
  ['ramp', 'Rampa', 4, 2],
  ['component', 'Componente', 2, 1],
  ['plumbingFixture', 'Aparelho hidrossanitário', 2, 1],
  ['electricalFixture', 'Dispositivo elétrico', 2, 1],
  ['mechanicalEquipment', 'Equipamento de HVAC', 2, 1],
];

/** Pesos novos, escolhidos à mão para cada categoria. */
const EDICOES: Array<[GraphicsCategory, number, number]> = [
  ['column', 7, 3],
  ['beam', 8, 2],
  ['footing', 6, 4],
  ['ceiling', 5, 2],
  ['ramp', 9, 1],
  ['component', 3, 3],
  ['plumbingFixture', 4, 5],
  ['electricalFixture', 6, 2],
  ['mechanicalEquipment', 8, 4],
];

const pesoId = (c: GraphicsCategory, key: 'cutWeight' | 'projectionWeight'): string => `id="lwc-${c}-${key}"`;

describe('diálogo de pesos de linha lista e edita as categorias novas (etapa 4.5d)', () => {
  beforeEach(() => {
    useI18n.setState({ lang: 'pt' });
    editor.load(createEmptyProject(), 'teste.hestia.json');
  });

  it('lista as nove categorias novas com rótulo traduzido, nos grupos certos', () => {
    const out = html();
    for (const [c, rotulo] of NOVAS) {
      expect(out).toContain(`data-category="${c}"`);
      expect(out).toContain(pesoId(c, 'cutWeight'));
      expect(out).toContain(pesoId(c, 'projectionWeight'));
      expect(out).toContain(rotulo);
    }
    expect(out).toContain('data-category-group="structure"');
    expect(out).toContain('data-category-group="components"');
    expect(out).toContain('Estrutura');
    expect(out).toContain('Componentes por disciplina');
  });

  it('mostra os pesos padrão de cada categoria nova', () => {
    const out = html();
    for (const [c, , cut, proj] of NOVAS) {
      expect(out).toContain(pesoId(c, 'cutWeight'));
      expect(out).toContain(pesoId(c, 'projectionWeight'));
      expect(out).toMatch(new RegExp(`<select id="lwc-${c}-cutWeight"[^>]*>[\\s\\S]*?<option value="${cut}" selected="">${cut}</option>`));
      expect(out).toMatch(new RegExp(`<select id="lwc-${c}-projectionWeight"[^>]*>[\\s\\S]*?<option value="${proj}" selected="">${proj}</option>`));
    }
  });

  it.each(EDICOES)('edita os pesos de %s (corte %i, projeção %i)', (c, cut, proj) => {
    const categories = { [c]: { cutWeight: cut, projectionWeight: proj } } as ProjectGraphicsPatch['categories'];
    const r = editProjectGraphics(editor.store, { categories });
    expect(r.error).toBeNull();
    expect(graphicsOf(editor.project).categories[c]).toEqual({ cutWeight: cut, projectionWeight: proj });
    const out = html();
    expect(out).toMatch(new RegExp(`<select id="lwc-${c}-cutWeight"[^>]*>[\\s\\S]*?<option value="${cut}" selected="">${cut}</option>`));
    expect(out).toMatch(new RegExp(`<select id="lwc-${c}-projectionWeight"[^>]*>[\\s\\S]*?<option value="${proj}" selected="">${proj}</option>`));
  });
});
