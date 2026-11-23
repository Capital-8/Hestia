import { describe, expect, it } from 'vitest';
import { podeEditar, type Element, type Project } from './index.ts';

/*
 * Editabilidade por disciplina (plano de UX das disciplinas, 2026-11-23): visibilidade ≠ permissão. Terreno e lote são
 * de Arquitetura. Valores de referência LITERAIS, escritos à mão a partir do plano.
 */

const p = { componentFamilies: {} } as unknown as Pick<Project, 'componentFamilies'>;
const parede = { kind: 'wall' } as unknown as Element;
const pilar = { kind: 'column' } as unknown as Element;
const terreno = { kind: 'terrain' } as unknown as Element;
const cad = { kind: 'cad' } as unknown as Element;

describe('podeEditar', () => {
  it('parede em Estrutura: travada sem liberar e editável com liberar', () => {
    expect(podeEditar(p, parede, 'estrutura', false)).toBe(false);
    expect(podeEditar(p, parede, 'estrutura', true)).toBe(true);
    expect(podeEditar(p, parede, 'arquitetura', false)).toBe(true);
  });

  it('pilar em Estrutura é editável', () => {
    expect(podeEditar(p, pilar, 'estrutura', false)).toBe(true);
    expect(podeEditar(p, pilar, 'arquitetura', false)).toBe(false);
  });

  it('terreno em Arquitetura é editável e em Estrutura é travado', () => {
    expect(podeEditar(p, terreno, 'arquitetura', false)).toBe(true);
    expect(podeEditar(p, terreno, 'estrutura', false)).toBe(false);
  });

  it('trabalho "todas" libera qualquer elemento', () => {
    expect(podeEditar(p, parede, 'todas', false)).toBe(true);
    expect(podeEditar(p, terreno, 'todas', false)).toBe(true);
  });

  it('geral só edita elementos gerais (CAD sem classe IFC) ou com liberar', () => {
    expect(podeEditar(p, cad, 'geral', false)).toBe(true);
    expect(podeEditar(p, cad, 'arquitetura', false)).toBe(false);
    expect(podeEditar(p, cad, 'estrutura', true)).toBe(true);
  });

  it('nunca lança com elemento malformado', () => {
    expect(() => podeEditar(p, null as unknown as Element, 'estrutura', false)).not.toThrow();
    expect(podeEditar(p, null as unknown as Element, 'estrutura', false)).toBe(false);
    expect(podeEditar(p, null as unknown as Element, 'estrutura', true)).toBe(true);
  });
});
