import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEmptyProject, makeWall, ProjectStore, type Project } from '@hestia/model';
import { useUi } from '../editor/state.ts';

/** Projeto em memória e uma parede (w1) para os painéis lerem; o controlador é trocado por um stub (sem DOM). */
const estado = vi.hoisted(() => ({ project: null as unknown, store: null as unknown }));
vi.mock('../editor/controller.ts', () => ({
  useProject: () => estado.project,
  editor: { get project() { return estado.project as Project; }, get store() { return estado.store as ProjectStore; } },
}));

const { PlacementProperties } = await import('./PlacementProperties.tsx');
const { WallTiltDialog } = await import('./dialogs/WallTiltDialog.tsx');

const projeto = (): Project => {
  const p = createEmptyProject('vazio');
  const store = new ProjectStore(p);
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: p.defaults.wallTypeId, levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  estado.project = store.project;
  estado.store = store;
  return store.project;
};

describe('campo Inclinação no painel de colocação da parede', () => {
  // O render estático do zustand lê o estado inicial (não o gravado com setState): aqui se confere o campo, a unidade
  // em graus e o zero padrão. O valor gravado vai pelo mesmo conversor testado em `wallTiltActions.test.ts`.
  it('mostra o campo de ângulo em graus (unidade °), com zero quando a parede não é inclinada', () => {
    projeto();
    const html = renderToStaticMarkup(createElement(PlacementProperties, { tool: 'wall' }));
    expect(html).toContain('id="place-wall-tilt"');
    expect(html).toContain('Inclinação');
    expect(html).toMatch(/id="place-wall-tilt"[^>]*value="0"[^>]*\/><span class="unit">°<\/span>/);
  });
});

describe('diálogo Inclinar paredes (ação da aba Modificar | Paredes)', () => {
  it('com a parede selecionada, o diálogo abre com o campo de ângulo e o botão Aplicar habilitado', () => {
    projeto();
    useUi.setState({ selection: ['w1'], dialog: 'wallTilt' });
    const html = renderToStaticMarkup(createElement(WallTiltDialog));
    expect(html).toContain('Inclinar paredes');
    expect(html).toContain('id="wt-angle"');
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>Aplicar/);
  });

  it('sem parede na seleção, o botão Aplicar fica desabilitado', () => {
    projeto();
    useUi.setState({ selection: [], dialog: 'wallTilt' });
    const html = renderToStaticMarkup(createElement(WallTiltDialog));
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Aplicar/);
  });
});
