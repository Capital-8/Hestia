import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// `useProject` depende de useSyncExternalStore (sem obtentor para o servidor). Para a renderização estática a barra lê o
// projeto direto do store; o resto do controlador (e o `editor` real, usado para editar e desfazer) continua igual.
vi.mock('../editor/controller.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../editor/controller.ts')>();
  return { ...actual, useProject: () => actual.editor.store.project, useProjectVersion: () => 0 };
});

// O estado da UI é um store zustand: na renderização estática o React lê o estado INICIAL. O mock entrega o estado atual
// (a vista 3D escolhida no teste), mantendo `getState`/`setState` reais.
vi.mock('../editor/state.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../editor/state.ts')>();
  const useUi = Object.assign(
    (selector: (s: ReturnType<typeof actual.useUi.getState>) => unknown) => selector(actual.useUi.getState()),
    actual.useUi,
  ) as unknown as typeof actual.useUi;
  return { ...actual, useUi };
});

import { editor } from '../editor/controller.ts';
import { editView3D, showLevelsOn } from '../editor/graphicsActions.ts';
import { useUi } from '../editor/state.ts';
import { View3DGroup } from './GraphicsProps.tsx';
import { ViewControlBar } from './ViewControlBar.tsx';

const LEVELS_LABEL = 'Mostrar/ocultar níveis de referência';

/** HTML da barra na vista 3D (o padrão dos testes de UI é a renderização estática). */
const render3d = (): string => renderToStaticMarkup(createElement(ViewControlBar));

/** Só o botão de níveis, com o conteúdo (ícone ou rótulo) entre as tags. */
const levelsButton = (html: string): string => html.match(/<button[^>]*aria-label="[^"]*níveis de referência[^"]*"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? '';

beforeEach(() => useUi.setState({ view: '3d' }));
afterEach(() => {
  useUi.setState({ view: 'plan', viewTemp: {} });
  if (editor.store.project.view3d) editor.store.exec({ type: 'resetView3D' });
});

describe('showLevelsOn (níveis de referência do 3D)', () => {
  it('sem o campo salvo, ligados; só `false` desliga', () => {
    expect(showLevelsOn(undefined)).toBe(true);
    expect(showLevelsOn({})).toBe(true);
    expect(showLevelsOn({ showLevels: true })).toBe(true);
    expect(showLevelsOn({ showLevels: false })).toBe(false);
  });
});

describe('seletor de disciplina nas propriedades da vista 3D', () => {
  it('começa em "Todas" (campo ausente) e mostra a disciplina gravada', () => {
    const semDisciplina = renderToStaticMarkup(createElement(View3DGroup));
    expect(semDisciplina).toContain('id="v3-discipline"');
    expect(semDisciplina).toContain('<option value="" selected="">Todas</option>');
    editor.store.exec({ type: 'setView3dDiscipline', discipline: 'estrutura' });
    const comDisciplina = renderToStaticMarkup(createElement(View3DGroup));
    expect(comDisciplina).toContain('<option value="estrutura" selected="">Estrutura</option>');
  });
});

describe('botão de níveis na barra de controle da vista 3D', () => {
  it('aparece só com ícone, ligado e com aria-pressed, sem rótulo visível', () => {
    const html = render3d();
    const btn = levelsButton(html);
    expect(btn).not.toBe('');
    expect(btn).toContain(`aria-label="${LEVELS_LABEL}"`);
    expect(btn).toContain(`title="${LEVELS_LABEL}"`);
    expect(btn).toContain('aria-pressed="true"');
    expect(btn).toContain('class="vcb-btn on"');
    expect(btn).not.toContain('<span');
    expect(btn).toContain('<svg');
  });

  it('mostra o botão de Revelar elementos ocultos e o estado ligado/desligado', () => {
    const findReveal = (html: string): string => html.match(/<button[^>]*aria-label="[^"]*Revelar elementos ocultos[^"]*"[^>]*>[\s\S]*?<\/button>/)?.[0] ?? '';
    const off = findReveal(render3d());
    expect(off).toContain('aria-label="Revelar elementos ocultos (RH)"');
    expect(off).toContain('aria-pressed="false"');
    expect(off).toContain('<svg');
    useUi.setState({ viewTemp: { '3d': { reveal: true } } });
    const on = findReveal(render3d());
    expect(on).toContain('aria-label="Sair de Revelar elementos ocultos (RH)"');
    expect(on).toContain('aria-pressed="true"');
    expect(on).toContain('class="vcb-btn on"');
  });

  it('o clique lógica (editView3D) desliga e o aria-pressed acompanha; desfazer restaura', () => {
    expect(editView3D(editor.store, { showLevels: false })).toEqual({ ok: true, error: null });
    expect(showLevelsOn(editor.store.project.view3d)).toBe(false);
    const off = levelsButton(render3d());
    expect(off).toContain('aria-pressed="false"');
    expect(off).not.toContain('class="vcb-btn on"');
    editor.store.undo();
    expect(showLevelsOn(editor.store.project.view3d)).toBe(true);
    expect(levelsButton(render3d())).toContain('aria-pressed="true"');
  });
});
