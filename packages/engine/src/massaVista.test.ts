import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, type Id } from '@hestia/model';
import { gerenciadorDoKernel } from './kernelDespacho.ts';
import { ESTILO_CORTE_MASSA } from './kernelMassa.ts';
import { definirGerenciadorDaMassa, servicoMassa, type LinhaCorteMassaProjeto } from './massaServico.ts';
import { projetoComMassas } from './fixtureMassa.ts';
import { linhasCorteDaMassa, linhasVisiveisMassa, massaNoPonto, massasNaCaixa, temMassaNaVista } from './massaVista.ts';
import type { SectionResult } from './section.ts';

afterEach(() => {
  vi.restoreAllMocks();
  definirGerenciadorDaMassa(gerenciadorDoKernel);
});

/** Seção ao longo de x, de (0, 0) a (10, 0), com a profundidade dada (corte: pequena; elevação: grande). */
const secao = (depth = 3): SectionResult => ({ plano: { a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, depth } }) as unknown as SectionResult;

/** Retângulo (s, z) fechado, como o kernel devolve: o primeiro ponto repetido no fim. */
const anel = (x0: number, z0: number, x1: number, z1: number): Array<{ s: number; z: number }> => [
  { s: x0, z: z0 },
  { s: x1, z: z0 },
  { s: x1, z: z1 },
  { s: x0, z: z1 },
  { s: x0, z: z0 },
];

/** Massa 'm1' cortada entre s 0 e 10 (z 0 a 9); 'm3' cortada entre s 12 e 14 (z 0 a 9) e uma feição aberta no meio dela. */
const LINHAS: LinhaCorteMassaProjeto[] = [
  { massaId: 'm1', copia: 0, estilo: ESTILO_CORTE_MASSA.cortado, pontos: anel(0, 0, 10, 9) },
  { massaId: 'm3', copia: 0, estilo: ESTILO_CORTE_MASSA.cortado, pontos: anel(12, 0, 14, 9) },
  { massaId: 'm3', copia: 0, estilo: ESTILO_CORTE_MASSA.feicao, pontos: [{ s: 13, z: 0 }, { s: 13, z: 9 }] },
];

const semKernel = (): void => {
  definirGerenciadorDaMassa(() => null);
};

describe('massa no corte: linhas do kernel', () => {
  it('sem massa no projeto, não consulta o kernel e devolve null', () => {
    const p = createEmptyProject();
    const corte = vi.spyOn(servicoMassa(), 'corte');
    expect(temMassaNaVista(p)).toBe(false);
    expect(linhasCorteDaMassa(p, secao())).toBeNull();
    expect(corte).not.toHaveBeenCalled();
  });

  it('passa ao kernel a origem, a direção e a profundidade do plano da seção (todos os níveis)', () => {
    const p = projetoComMassas();
    const corte = vi.spyOn(servicoMassa(), 'corte').mockReturnValue(LINHAS);
    const r = linhasCorteDaMassa(p, secao(30));
    expect(corte).toHaveBeenCalledWith(p, null, 0, 0, 10, 0, 30);
    expect(r).toBe(LINHAS);
  });

  it('sem kernel: devolve null e não lança (o corte não desenha a massa)', () => {
    semKernel();
    const p = projetoComMassas();
    expect(temMassaNaVista(p)).toBe(true);
    expect(() => linhasCorteDaMassa(p, secao())).not.toThrow();
    expect(linhasCorteDaMassa(p, secao())).toBeNull();
  });

  it('linhas visíveis tiram a massa oculta na vista', () => {
    expect(linhasVisiveisMassa(LINHAS, new Set<Id>(['m3'])).map((l) => l.massaId)).toEqual(['m1']);
    expect(linhasVisiveisMassa(LINHAS, new Set<Id>())).toHaveLength(3);
  });
});

describe('massa no corte: clique', () => {
  const tol = 0.1;

  it('dentro do contorno cortado de m1: a massa', () => {
    expect(massaNoPonto(LINHAS, new Set(), { x: 5, y: 4.5 }, tol)).toBe('m1');
  });

  it('a até a tolerância do contorno: a massa; além dela: nada', () => {
    expect(massaNoPonto(LINHAS, new Set(), { x: 10.05, y: 4.5 }, tol)).toBe('m1');
    expect(massaNoPonto(LINHAS, new Set(), { x: 10.5, y: 4.5 }, tol)).toBeNull();
  });

  it('oculta na vista não é alvo: o clique cai no vazio', () => {
    expect(massaNoPonto(LINHAS, new Set<Id>(['m1']), { x: 5, y: 4.5 }, tol)).toBeNull();
  });

  it('a feição vale só pela linha: sobre ela é a massa; a 0,5 m dela, nada', () => {
    expect(massaNoPonto([LINHAS[2]!], new Set(), { x: 13, y: 4 }, tol)).toBe('m3');
    expect(massaNoPonto([LINHAS[2]!], new Set(), { x: 13.5, y: 4 }, tol)).toBeNull();
  });

  it('cortado vence projetado no mesmo ponto, mesmo com id maior (a massa da frente)', () => {
    const projetado: LinhaCorteMassaProjeto = { massaId: 'a', copia: 0, estilo: ESTILO_CORTE_MASSA.projetado, pontos: anel(0, 0, 10, 9) };
    const cortado: LinhaCorteMassaProjeto = { massaId: 'z', copia: 0, estilo: ESTILO_CORTE_MASSA.cortado, pontos: anel(0, 0, 10, 9) };
    expect(massaNoPonto([projetado, cortado], new Set(), { x: 5, y: 4 }, tol)).toBe('z');
  });

  it('sem linhas: null', () => {
    expect(massaNoPonto([], new Set(), { x: 0, y: 0 }, tol)).toBeNull();
  });
});

describe('massa no corte: caixa de seleção', () => {
  it('janela: a massa cujas peças cabem inteiras na caixa', () => {
    expect(massasNaCaixa(LINHAS, new Set(), { x: -1, y: -1 }, { x: 11, y: 10 })).toEqual(['m1']);
  });

  it('cruzamento (a caixa vai da direita para a esquerda): toda massa que toca a caixa', () => {
    expect(massasNaCaixa(LINHAS, new Set(), { x: 13, y: 10 }, { x: -1, y: -1 })).toEqual(['m1', 'm3']);
  });

  it('janela não pega a massa que sobra para fora da caixa', () => {
    expect(massasNaCaixa(LINHAS, new Set(), { x: -1, y: -1 }, { x: 13, y: 10 })).toEqual(['m1']);
  });

  it('a feição não entra no critério da janela: m3 cabe mesmo com a linha dentro da caixa', () => {
    expect(massasNaCaixa(LINHAS, new Set(), { x: 11, y: -1 }, { x: 15, y: 10 })).toEqual(['m3']);
  });

  it('oculta na vista não entra', () => {
    expect(massasNaCaixa(LINHAS, new Set<Id>(['m1']), { x: -1, y: -1 }, { x: 11, y: 10 })).toEqual([]);
  });
});
