import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEmptyProject, makeMass, ProjectStore, secaoCirculo, type Project } from '@hestia/model';
import { MassSecoesDialog } from './MassSecoesDialog.tsx';

let atual: Project = createEmptyProject();
vi.mock('../../editor/controller.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../editor/controller.ts')>();
  return { ...actual, useProject: () => atual };
});

function comMassa(secoes = [secaoCirculo(0, 3), { ...secaoCirculo(8, 5), dx: 2 }, secaoCirculo(16, 2)]): void {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addMass', mass: makeMass({ id: 'ms_d1', levelId: 'lv_0', name: 'Bulbo', secoes }) });
  atual = s.project;
}

describe('diálogo "Seções da massa"', () => {
  it('mostra uma linha por seção com z, forma, dimensões, rotação, escala, dx e dy', () => {
    comMassa();
    const html = renderToStaticMarkup(createElement(MassSecoesDialog, { massaId: 'ms_d1' }));
    for (let i = 0; i < 3; i++) for (const c of ['z', 'forma', 'raio', 'rot', 'escala', 'dx', 'dy', 'dup', 'del']) expect(html, `s${i}-${c}`).toContain(`id="ms-s${i}-${c}"`);
    expect(html).not.toContain('id="ms-s3-z"');
    expect(html).toContain('id="ms-add"');
    expect(html).toContain('id="ms-aplicar"');
  });

  it('desenha a prévia: um contorno por seção, sobrepostos', () => {
    comMassa();
    const html = renderToStaticMarkup(createElement(MassSecoesDialog, { massaId: 'ms_d1' }));
    expect((html.match(/<polygon /g) ?? []).length).toBe(3);
    expect(html).toContain('role="img"');
  });

  it('pilha válida: sem mensagem de erro e "Aplicar" desligado até haver mudança', () => {
    comMassa();
    const html = renderToStaticMarkup(createElement(MassSecoesDialog, { massaId: 'ms_d1' }));
    expect(html).not.toContain('role="alert"');
    expect(html).toMatch(/id="ms-aplicar"[^>]*disabled/);
  });

  it('remover fica desligado com 2 seções (limite mínimo)', () => {
    comMassa([secaoCirculo(0, 3), secaoCirculo(10, 3)]);
    const html = renderToStaticMarkup(createElement(MassSecoesDialog, { massaId: 'ms_d1' }));
    expect(html).toMatch(/id="ms-s0-del"[^>]*disabled/);
    expect(html).toMatch(/id="ms-s1-del"[^>]*disabled/);
  });

  it('massa que não existe mais: mostra o aviso em vez da tabela', () => {
    atual = createEmptyProject();
    const html = renderToStaticMarkup(createElement(MassSecoesDialog, { massaId: 'ms_nada' }));
    expect(html).toContain('A massa não existe mais.');
    expect(html).not.toContain('id="ms-add"');
  });
});
