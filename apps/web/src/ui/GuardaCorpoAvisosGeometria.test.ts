import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectStore, createEmptyProject, makeGuardaCorpo, type HospedeiroManual } from '@hestia/model';
import { avisosGeometriaGuardaCorpo } from '../editor/useIssues.ts';
import { GuardaCorpoProperties } from './GuardaCorpoProperties.tsx';

const medidas = vi.hoisted(() => ({ lista: [] as Array<{ guardaId: string; codigo: number; trecho: number; indice: number; medido: number; limite: number; x: number; y: number; z: number }> }));

vi.mock('../editor/controller.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../editor/controller.ts')>();
  return { ...actual, useProject: () => actual.editor.project };
});

// O kernel não roda no teste: o serviço devolve as medidas que o teste pôs, como o Rust devolveria.
vi.mock('@hestia/engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@hestia/engine')>();
  return { ...actual, servicoGuardaCorpo: () => ({ avisos: () => medidas.lista, aoMudarPronto: () => () => undefined }) };
});

const manual = (): HospedeiroManual => ({ tipo: 'manual', uso: 'borda-laje', caminho: [{ x: 0, y: 0 }, { x: 3, y: 0 }] }) as HospedeiroManual;
const base = { trecho: 0, indice: 0, x: 0, y: 0, z: 0, limite: 0 };

function projeto(id: string, typeId = 'gct_balaustres') {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addGuardaCorpo', guardaCorpo: makeGuardaCorpo({ id, levelId: 'lv_0', typeId, hospedeiro: manual() }) });
  const railing = s.project.elements[id];
  if (!railing || railing.kind !== 'railing') throw new Error('guarda-corpo não criado');
  return { s, railing };
}

describe('avisos do guarda-corpo: vão para a lista de avisos do projeto, não para o painel de Propriedades', () => {
  it('o painel de Propriedades não lista avisos, mesmo com avisos de geometria e de norma medidos', () => {
    const { railing } = projeto('gc_g1');
    medidas.lista = [
      { ...base, guardaId: 'gc_g1', codigo: 8, medido: 0 },
      { ...base, guardaId: 'gc_g1', codigo: 9, medido: 2 },
      { ...base, guardaId: 'gc_g1', codigo: 4, medido: 0, limite: 0.3 },
      { ...base, guardaId: 'gc_g1', codigo: 12, medido: 0.02, limite: 0.01 },
    ];
    const html = renderToStaticMarkup(createElement(GuardaCorpoProperties, { railings: [railing] }));
    expect(html).not.toContain('class="gc-issues"');
    expect(html).not.toContain('Extensão do corrimão');
    expect(html).not.toContain('Curva apertada');
    expect(html).not.toContain('Sem avisos.');
    expect(html).not.toContain('<h3');
  });

  it('a lista de avisos do projeto (a mesma da barra de status) leva os avisos de geometria e de norma do kernel', () => {
    const { s } = projeto('gc_g2');
    medidas.lista = [
      { ...base, guardaId: 'gc_g2', codigo: 8, medido: 0 },
      { ...base, guardaId: 'gc_g2', codigo: 4, medido: 0, limite: 0.3 },
      { ...base, guardaId: 'gc_g2', codigo: 1, medido: 0.12, limite: 0.11 },
    ];
    const r = avisosGeometriaGuardaCorpo(s.project, 'pt');
    expect(r.map((i) => i.code).sort()).toEqual(['gc-corrimao-extensao', 'gc-trecho-curto', 'gc-vao-grande']);
    expect(r.every((i) => i.elementId === 'gc_g2' && i.severity === 'warning')).toBe(true);
  });

  it('o mesmo aviso repetido por lado e por ponta aparece uma vez, com a contagem', () => {
    const { s } = projeto('gc_g3', 'gct_madeira');
    const ext = (trecho: number, indice: number) => ({ ...base, guardaId: 'gc_g3', codigo: 4, trecho, indice, medido: 0, limite: 0.3 });
    medidas.lista = [ext(0, 0), ext(0, 1), ext(1, 0), ext(1, 1)];
    const r = avisosGeometriaGuardaCorpo(s.project, 'pt');
    expect(r).toHaveLength(1);
    expect(r[0]!.message).toContain('(4 ocorrências)');
  });

  it('sem medidas do kernel não há aviso nenhum', () => {
    const { s } = projeto('gc_g4');
    medidas.lista = [];
    expect(avisosGeometriaGuardaCorpo(s.project, 'pt')).toEqual([]);
  });
});
