import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectStore, createEmptyProject, makeGuardaCorpo, type HospedeiroManual } from '@hestia/model';
import { GuardaCorpoProperties } from './GuardaCorpoProperties.tsx';

const medidas = vi.hoisted(() => ({ lista: [] as Array<{ guardaId: string; codigo: number; trecho: number; indice: number; medido: number; limite: number; x: number; y: number; z: number }> }));

vi.mock('../editor/controller.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../editor/controller.ts')>();
  return { ...actual, useProject: () => actual.editor.project };
});

// O kernel não roda no teste: o serviço devolve as medidas que o teste pôs, como o Rust devolveria.
vi.mock('@hestia/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hestia/engine')>();
  return { ...actual, servicoGuardaCorpo: () => ({ avisos: () => medidas.lista }) };
});

const manual = (): HospedeiroManual => ({ tipo: 'manual', uso: 'borda-laje', caminho: [{ x: 0, y: 0 }, { x: 3, y: 0 }] }) as HospedeiroManual;

describe('painel do guarda-corpo: avisos de geometria', () => {
  it('lista cada aviso de geometria do kernel, com botão que seleciona o guarda-corpo', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc_g1', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: manual() }) });
    const railing = s.project.elements['gc_g1'];
    if (!railing || railing.kind !== 'railing') throw new Error('guarda-corpo não criado');
    const base = { guardaId: 'gc_g1', trecho: 0, indice: 0, x: 0, y: 0, z: 0, limite: 0 };
    medidas.lista = [
      { ...base, codigo: 8, medido: 0 },
      { ...base, codigo: 9, medido: 2 },
      { ...base, codigo: 11, medido: 0 },
      { ...base, codigo: 12, medido: 0.02, limite: 0.01 },
    ];
    const html = renderToStaticMarkup(createElement(GuardaCorpoProperties, { railings: [railing] }));
    expect(html).toContain('vira um ponto');
    expect(html).toContain('2 vértice(s) repetido(s)');
    expect(html).toContain('não tem borda no lado pedido');
    expect(html).toContain('Curva apertada');
    expect(html).not.toContain('Sem avisos.');
    expect(html.match(/class="link"/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('sem avisos de geometria, a lista continua dizendo que não há avisos', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id: 'gc_g2', levelId: 'lv_0', typeId: 'gct_balaustres', hospedeiro: manual() }) });
    const railing = s.project.elements['gc_g2'];
    if (!railing || railing.kind !== 'railing') throw new Error('guarda-corpo não criado');
    medidas.lista = [];
    const html = renderToStaticMarkup(createElement(GuardaCorpoProperties, { railings: [railing] }));
    expect(html).toContain('Sem avisos.');
  });
});
