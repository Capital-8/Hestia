import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectStore, createEmptyProject, isGuardaCorpo, makeGuardaCorpo, type HospedeiroManual } from '@hestia/model';
import { GuardaCorpoProperties } from './GuardaCorpoProperties.tsx';

// O painel real assina o projeto pelo editor; no teste basta o projeto atual (sem `getServerSnapshot` no render de servidor).
vi.mock('../editor/controller.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../editor/controller.ts')>();
  return { ...actual, useProject: () => actual.editor.project };
});

const manual = (): HospedeiroManual => ({
  tipo: 'manual',
  uso: 'borda-laje',
  caminho: [
    { x: 0, y: 0 },
    { x: 3, y: 0 },
  ],
} as HospedeiroManual);

describe('painel de propriedades do guarda-corpo', () => {
  it('abre com o cabeçalho de tipo da parede (família e "Editar" logo abaixo), antes das demais propriedades', () => {
    const s = new ProjectStore(createEmptyProject());
    const g = makeGuardaCorpo({ id: 'gc_p1', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: manual() });
    s.exec({ type: 'addGuardaCorpo', guardaCorpo: g });
    const railing = s.project.elements['gc_p1'];
    if (!railing || railing.kind !== 'railing') throw new Error('guarda-corpo não criado');

    const html = renderToStaticMarkup(createElement(GuardaCorpoProperties, { railings: [railing] }));
    const edita = html.indexOf('id="prop-gctype-edit"');
    expect(html).toContain('id="prop-gctype"');
    expect(edita).toBeGreaterThan(-1);
    // o botão "Editar" vem antes do deslocamento, da altura e dos avisos
    expect(edita).toBeLessThan(html.indexOf('id="gc-offset"'));
    expect(edita).toBeLessThan(html.indexOf('id="gc-height"'));
    // o seletor antigo (lista nativa e botão solto) saiu
    expect(html).not.toContain('id="gc-type"');
  });

  it('com tipos diferentes na seleção, o cabeçalho mostra o tipo variado e o "Editar" fica desativado', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc_p2', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: manual() }) });
    s.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc_p3', levelId: 'lv_0', typeId: 'gct_vidro', hospedeiro: manual() }) });
    const railings = ['gc_p2', 'gc_p3'].map((id) => s.project.elements[id]).filter((e) => e !== undefined && isGuardaCorpo(e));
    const html = renderToStaticMarkup(createElement(GuardaCorpoProperties, { railings }));
    expect(html).toMatch(/id="prop-gctype-edit"[^>]*disabled/);
  });
});
