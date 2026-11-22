import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// `useProject` depende de useSyncExternalStore (sem obtentor para o servidor). A renderização estática lê o projeto
// direto do store; o resto do controlador (e o `editor` real) continua igual.
vi.mock('../../editor/controller.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../editor/controller.ts')>();
  return { ...actual, useProject: () => actual.editor.store.project, useProjectVersion: () => 0 };
});

import { createEmptyProject, type PlanView } from '@hestia/model';
import { editor } from '../../editor/controller.ts';
import { useI18n } from '../../editor/i18n.ts';
import { planTonesDialogTarget } from '../../editor/viewIdentity.ts';
import { GraphicsVisibilityDialog } from './GraphicsVisibilityDialog.tsx';

const html = (target: string): string => renderToStaticMarkup(createElement(GraphicsVisibilityDialog, { target }));

const comPlantaDeEstrutura = (tones?: PlanView['tones']): void => {
  editor.store.exec({
    type: 'addPlanView',
    plan: { id: 'pv_est', levelId: 'lv_0', discipline: 'estrutura', name: 'Térreo - Estrutura', ...(tones ? { tones } : {}) },
  });
};

describe('aba Disciplinas do diálogo de visibilidade (decisão 0060 §4.2)', () => {
  beforeEach(() => {
    useI18n.setState({ lang: 'pt' });
    editor.load(createEmptyProject(), 'teste.hestia.json');
  });

  it('na planta de disciplina mostra o predefinido e destaca o desvio', () => {
    comPlantaDeEstrutura({ arquitetura: 'normal' });
    const out = html(planTonesDialogTarget('lv_0', 'pv_est'));
    expect(out).toContain('data-tab="tones" aria-selected="true"');
    expect(out).toContain('data-readonly="false"');
    expect(out).toContain('data-disc="arquitetura" data-deviation="true"');
    expect(out).toContain('data-disc="estrutura" data-deviation="false"');
    expect(out).toMatch(/<option value="normal" selected="">Normal<\/option>/);
    expect(out).toContain('Meio-tom'); // predefinido de Arquitetura na planta de Estrutura
    expect(out).toContain('>Desvio<');
    expect(out).toContain('Restaurar predefinido');
    expect(out).toContain('Restaurar todos os predefinidos');
  });

  it('sem desvio, todos os tons seguem o predefinido da planta', () => {
    comPlantaDeEstrutura();
    const out = html(planTonesDialogTarget('lv_0', 'pv_est'));
    expect(out.match(/data-deviation="true"/g)).toBeNull();
    expect(out.match(/data-deviation="false"/g)).toHaveLength(5);
    expect(out).toContain('Oculto');
  });

  it('na planta padrão mostra os tons de Arquitetura como somente leitura', () => {
    comPlantaDeEstrutura();
    const out = html(planTonesDialogTarget('lv_0'));
    expect(out).toContain('data-readonly="true"');
    expect(out.match(/data-disc="/g)).toHaveLength(5);
    expect(out).not.toContain('<select');
    expect(out).not.toContain('>Desvio<');
    expect(out).not.toContain('Restaurar todos os predefinidos');
    expect(out).toContain('Arquitetura');
    expect(out).toContain('A planta padrão usa os tons predefinidos de Arquitetura; ela não grava tons.');
  });

  it('abrir pelo botão das categorias continua na tabela de categorias', () => {
    comPlantaDeEstrutura();
    const out = html('pv:pv_est');
    expect(out).toContain('data-tab="categories" aria-selected="true"');
    expect(out).toContain('Visibilidade e gráficos por categoria');
    expect(out).toContain('Transparência');
  });

  it('sem plantas de disciplina no projeto, o diálogo fica como hoje: sem abas e sem tons', () => {
    const out = html('lv_0');
    expect(out).not.toContain('role="tablist"');
    expect(out).not.toContain('Tons por disciplina');
    expect(out).toContain('Visibilidade e gráficos por categoria');
  });
});
