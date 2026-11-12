import { describe, expect, it } from 'vitest';
import { FLAGS_ESQUADRIA, lerPortasCortina } from './kernelCortina.ts';

/** Saídas da consulta 107 para uma esquadria: a porta da célula (1, 0) de uma cortina de 6 m, vão de 1,529 a 2,971 e de 0 a 2,95. */
const saidas = (over: Partial<Record<'portas' | 'vaos' | 'linhas' | 'linhas_pos', number[]>> = {}) => ({
  portas: [7, 1, 0, 3, 0, 1, 0, 0, 0b1011, FLAGS_ESQUADRIA.soleiraDerivada | FLAGS_ESQUADRIA.regiaoMultipla],
  vaos: [1.529, 2.971, 0, 2.95, 0.1, 0, 1.442, 2.95, 0.6, 0],
  linhas: [7, 1, 0, 0, 7, 1, 0, 1],
  linhas_pos: [1.9, 2.1],
  ...over,
});

describe('lerPortasCortina (consulta 107)', () => {
  it('lê a esquadria, os lados com montante (bits 0 a 3) e as linhas do ajuste', () => {
    const r = lerPortasCortina(saidas());
    expect(r.portas).toHaveLength(1);
    expect(r.portas[0]).toMatchObject({ cortina: 7, i: 1, j: 0, tipoAbertura: 3, grade: false, flipMao: true, flipSentido: false, janela: false, s0: 1.529, s1: 2.971, z0: 0, z1: 2.95, profundidade: 0.1, larguraLivre: 1.442, folhaMinima: 0.6 });
    expect(r.portas[0]!.lados).toEqual({ esquerda: true, direita: true, base: false, topo: true });
    expect(r.portas[0]!.flags & FLAGS_ESQUADRIA.soleiraDerivada).toBeTruthy();
    expect(r.linhas).toEqual([
      { cortina: 7, i: 1, j: 0, eixo: 'u', pos: 1.9 },
      { cortina: 7, i: 1, j: 0, eixo: 'v', pos: 2.1 },
    ]);
  });

  it('vazio: sem esquadria nem linha', () => {
    expect(lerPortasCortina({ portas: [], vaos: [], linhas: [], linhas_pos: [] })).toEqual({ portas: [], linhas: [] });
  });

  it('recusa tamanhos incoerentes, booleano fora de 0 e 1, lados fora de 4 bits, vão invertido ou não finito e saída ausente', () => {
    expect(() => lerPortasCortina(saidas({ portas: [7, 1, 0] }))).toThrow(/10 valores/);
    expect(() => lerPortasCortina(saidas({ vaos: [1, 2] }))).toThrow(/"vaos"/);
    expect(() => lerPortasCortina(saidas({ linhas: [7, 1, 0] }))).toThrow(/4 valores/);
    expect(() => lerPortasCortina(saidas({ linhas_pos: [] }))).toThrow(/linhas_pos/);
    expect(() => lerPortasCortina(saidas({ portas: [7, 1, 0, 3, 2, 1, 0, 0, 0, 0] }))).toThrow(/ajuste/);
    expect(() => lerPortasCortina(saidas({ portas: [7, 1, 0, 3, 0, 1, 0, 0, 16, 0] }))).toThrow(/lados/);
    expect(() => lerPortasCortina(saidas({ vaos: [2.9, 1.5, 0, 2.95, 0.1, 0, 1, 2, 0.6, 0] }))).toThrow(/invertido/);
    expect(() => lerPortasCortina(saidas({ vaos: [1.5, 2.9, 0, Number.NaN, 0.1, 0, 1, 2, 0.6, 0] }))).toThrow(/não é número/);
    expect(() => lerPortasCortina(saidas({ linhas: [7, 1, 0, 2, 7, 1, 0, 1] }))).toThrow(/eixo/);
    const { vaos: _v, ...semVaos } = saidas();
    expect(() => lerPortasCortina(semVaos)).toThrow(/"vaos" não veio/);
  });

  it('janela e ajuste de grade viram booleanos', () => {
    const r = lerPortasCortina(saidas({ portas: [7, 2, 1, 4, 1, 0, 1, 1, 15, 0] }));
    expect(r.portas[0]).toMatchObject({ grade: true, flipMao: false, flipSentido: true, janela: true });
    expect(r.portas[0]!.lados).toEqual({ esquerda: true, direita: true, base: true, topo: true });
  });
});
