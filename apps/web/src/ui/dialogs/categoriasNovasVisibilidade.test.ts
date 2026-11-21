import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// `useProject` depende de useSyncExternalStore (sem obtentor para o servidor). A renderização estática lê o projeto
// direto do store; o resto do controlador (e o `editor` real) continua igual.
vi.mock('../../editor/controller.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../editor/controller.ts')>();
  return { ...actual, useProject: () => actual.editor.store.project, useProjectVersion: () => 0 };
});

import { createEmptyProject, type GraphicsCategory } from '@hestia/model';
import { editor } from '../../editor/controller.ts';
import { useI18n } from '../../editor/i18n.ts';
import { GraphicsVisibilityDialog } from './GraphicsVisibilityDialog.tsx';

const html = (target: string): string => renderToStaticMarkup(createElement(GraphicsVisibilityDialog, { target }));

/** Nove categorias novas e o rótulo PT escrito à mão. */
const NOVAS: Array<[GraphicsCategory, string]> = [
  ['column', 'Pilar'],
  ['beam', 'Viga'],
  ['footing', 'Sapata'],
  ['ceiling', 'Forro'],
  ['ramp', 'Rampa'],
  ['component', 'Componente'],
  ['plumbingFixture', 'Aparelho hidrossanitário'],
  ['electricalFixture', 'Dispositivo elétrico'],
  ['mechanicalEquipment', 'Equipamento de HVAC'],
];

function carregarComPlanta(): void {
  editor.load(createEmptyProject(), 'teste.hestia.json');
  editor.store.exec({ type: 'addPlanView', plan: { id: 'pv_est', levelId: 'lv_0', discipline: 'estrutura', name: 'Térreo - Estrutura' } });
}

describe('diálogo de visibilidade lista as categorias novas (etapa 4.5d)', () => {
  beforeEach(() => {
    useI18n.setState({ lang: 'pt' });
    carregarComPlanta();
  });

  it.each([
    ['planta', 'lv_0'],
    ['planta de disciplina', 'pv:pv_est'],
    ['3D', '3d'],
  ])('na %s há uma linha marcável por categoria nova, com o rótulo traduzido', (_nome, target) => {
    const out = html(target);
    for (const [c, rotulo] of NOVAS) {
      expect(out).toContain(`data-category="${c}"`);
      expect(out).toContain(`id="gv-${c}-vis"`);
      expect(out).toContain(rotulo);
    }
  });

  it('agrupa as categorias: estrutura junta e componentes por disciplina', () => {
    const out = html('lv_0');
    expect(out).toContain('data-category-group="structure"');
    expect(out).toContain('data-category-group="components"');
    expect(out).toContain('data-category-group="architecture"');
    expect(out).toContain('data-category-group="general"');
    expect(out).toContain('Componentes por disciplina');
    expect(out).toContain('Estrutura');
  });

  it('cada linha traz a caixa de visibilidade marcada e os pesos por categoria', () => {
    const out = html('lv_0');
    expect(out.match(/id="gv-[A-Za-z]+-vis"/g)).toHaveLength(23);
    expect(out).toMatch(/id="gv-column-vis"[^>]*checked=""/);
    expect(out).toContain('id="gv-column-cut"');
    expect(out).toContain('id="gv-column-proj"');
  });
});
