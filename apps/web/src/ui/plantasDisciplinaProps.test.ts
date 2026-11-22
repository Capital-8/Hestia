import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// `useProject` depende de useSyncExternalStore (sem obtentor para o servidor). A renderização estática lê o projeto
// direto do store; o resto do controlador (e o `editor` real, usado para criar e editar) continua igual.
vi.mock('../editor/controller.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../editor/controller.ts')>();
  return { ...actual, useProject: () => actual.editor.store.project, useProjectVersion: () => 0 };
});

// O estado da UI é um store zustand: o mock entrega o estado ATUAL (inclusive o sem seletor, usado em Properties).
vi.mock('../editor/state.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../editor/state.ts')>();
  const useUi = Object.assign(
    (selector?: (s: ReturnType<typeof actual.useUi.getState>) => unknown) => (selector ? selector(actual.useUi.getState()) : actual.useUi.getState()),
    actual.useUi,
  ) as unknown as typeof actual.useUi;
  return { ...actual, useUi };
});

import { createEmptyProject, planGraphicsOf } from '@hestia/model';
import { editor } from '../editor/controller.ts';
import { editPlanGraphics, restorePlanGraphicsDefault } from '../editor/graphicsActions.ts';
import { useUi } from '../editor/state.ts';
import { Properties } from './Properties.tsx';
import { ViewControlBar } from './ViewControlBar.tsx';

const abrirPlantaDeEstrutura = (): void => {
  editor.store.exec({ type: 'addPlanView', plan: { id: 'pv_est', levelId: 'lv_0', discipline: 'estrutura', name: 'Térreo - Estrutura' } });
  useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', areaPlanId: null, planViewId: 'pv_est', selection: [], sectionId: null });
};

beforeEach(() => {
  editor.load(createEmptyProject(), 'teste.hestia.json');
});

describe('barra de vista na planta de disciplina (etapa 4.2)', () => {
  it('mostra a disciplina da planta e o atalho para a aba de tons', () => {
    abrirPlantaDeEstrutura();
    const out = renderToStaticMarkup(createElement(ViewControlBar));
    expect(out).toContain('>Estrutura<');
    expect(out).toContain('aria-label="Tons por disciplina"');
    expect(out).toContain('>Tons<');
  });

  it('na planta padrão a barra fica como hoje: sem disciplina e sem o atalho de tons', () => {
    useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', areaPlanId: null, planViewId: null });
    const out = renderToStaticMarkup(createElement(ViewControlBar));
    expect(out).not.toContain('Tons por disciplina');
    expect(out).not.toContain('>Estrutura<');
  });
});

describe('propriedades da planta de disciplina (etapa 4.2)', () => {
  it('mostram o nome editável, a disciplina somente leitura, a escala e o estilo da planta ativa', () => {
    abrirPlantaDeEstrutura();
    editPlanGraphics(editor.store, { levelId: 'lv_0', planId: 'pv_est' }, { scale: 50, detail: 'fine', style: 'shaded' });
    const out = renderToStaticMarkup(createElement(Properties));
    expect(out).toContain('Térreo - Estrutura · Térreo');
    expect(out).toMatch(/id="v-plan-name"[^>]*value="Térreo - Estrutura"/);
    expect(out).toContain('>Disciplina<');
    expect(out).toContain('>Estrutura<');
    expect(out).toMatch(/<option value="50" selected="">1:50<\/option>/);
    expect(out).toMatch(/<option value="fine" selected="">Fino<\/option>/);
    expect(out).toMatch(/<option value="shaded" selected="">Sombreado<\/option>/);
  });

  it('"Restaurar padrão" age na planta ativa; o Level.graphics continua intocado', () => {
    abrirPlantaDeEstrutura();
    editPlanGraphics(editor.store, { levelId: 'lv_0', planId: 'pv_est' }, { scale: 50 });
    expect(planGraphicsOf(editor.store.project, 'lv_0', 'pv_est').scale).toBe(50);
    expect(editor.store.project.levels[0]!.graphics).toBeUndefined();
    expect(restorePlanGraphicsDefault(editor.store, { levelId: 'lv_0', planId: 'pv_est' })).toEqual({ ok: true, error: null });
    expect(planGraphicsOf(editor.store.project, 'lv_0', 'pv_est').scale).toBe(100);
    expect(editor.store.project.levels[0]!.graphics).toBeUndefined();
  });

  it('na planta padrão o título não mostra planta de disciplina e a escala vem de Level.graphics', () => {
    useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', areaPlanId: null, planViewId: null, selection: [], sectionId: null });
    editPlanGraphics(editor.store, { levelId: 'lv_0' }, { scale: 50 });
    const out = renderToStaticMarkup(createElement(Properties));
    expect(out).toContain('>Planta · Térreo<');
    expect(out).not.toContain('id="v-plan-name"');
    expect(out).not.toContain('>Disciplina<');
    expect(out).toMatch(/<option value="50" selected="">1:50<\/option>/);
    expect(editor.store.project.levels[0]!.graphics?.scale).toBe(50);
    expect(editor.store.project.planViews).toBeUndefined();
  });
});
