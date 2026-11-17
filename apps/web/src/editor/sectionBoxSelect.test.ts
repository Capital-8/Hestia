import { afterEach, describe, expect, it, vi } from 'vitest';
import { projetoTerreno, servicoTerreno, type LinhaCorteTN, type SectionResult } from '@hestia/engine';
import { ProjectStore } from '@hestia/model';
import type { MultiPolygon } from '@hestia/geom';
import { gestoDoBotaoNoCorte, idsNaCaixaDoCorte, modoDaCaixa, selecaoComCaixa, terrenosNaCaixaDoCorteDoProjeto } from './sectionBoxSelect.ts';
import { terrenoNoPontoDoCorte } from './sectionPick.ts';

/** Retângulo (t,z) como multipolígono de uma peça só. */
const retangulo = (x0: number, y0: number, x1: number, y1: number): MultiPolygon => [[[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]]];

/** Corte com duas paredes lado a lado: w1 em x 0..1 e w2 em x 3..4, ambas em z 0..1. Só os campos que a seleção lê. */
const corte = {
  cut: [
    { materialId: 'mat', polygons: retangulo(0, 0, 1, 1), sources: [{ wallId: 'w1' }] },
    { materialId: 'mat', polygons: retangulo(3, 0, 4, 1), sources: [{ wallId: 'w2' }] },
  ],
  openings: [],
  beyond: [],
} as unknown as SectionResult;

describe('caixa de seleção na vista de corte (como na planta)', () => {
  it('esquerda→direita é janela; direita→esquerda é cruzamento; mesmo x conta como janela', () => {
    expect(modoDaCaixa({ x: 0, y: 0 }, { x: 2, y: 1 })).toBe('janela');
    expect(modoDaCaixa({ x: 2, y: 0 }, { x: 0, y: 1 })).toBe('cruzamento');
    expect(modoDaCaixa({ x: 1, y: 0 }, { x: 1, y: 5 })).toBe('janela');
  });

  it('o botão esquerdo sem Espaço nem Alt faz caixa; meio, Espaço e Alt arrastam a vista', () => {
    expect(gestoDoBotaoNoCorte({ botao: 0, espaco: false, alt: false })).toBe('caixa');
    expect(gestoDoBotaoNoCorte({ botao: 0, espaco: true, alt: false })).toBe('pan');
    expect(gestoDoBotaoNoCorte({ botao: 0, espaco: false, alt: true })).toBe('pan');
    expect(gestoDoBotaoNoCorte({ botao: 1, espaco: false, alt: false })).toBe('pan');
  });

  it('janela pega só o que está inteiro dentro da caixa', () => {
    expect(idsNaCaixaDoCorte(corte, { x: -0.5, y: -0.5 }, { x: 1.5, y: 1.5 })).toEqual(['w1']);
    expect(idsNaCaixaDoCorte(corte, { x: -1, y: -1 }, { x: 5, y: 5 })).toEqual(['w1', 'w2']);
    // w1 só parcialmente dentro (x 0..1 com a caixa de 0.5 a 2): a janela não a pega.
    expect(idsNaCaixaDoCorte(corte, { x: 0.5, y: -1 }, { x: 2, y: 2 })).toEqual([]);
  });

  it('cruzamento pega o que toca a caixa, mesmo sem estar inteiro dentro', () => {
    // Mesma caixa da janela acima, mas da direita para a esquerda: w1 é tocada.
    expect(idsNaCaixaDoCorte(corte, { x: 2, y: 2 }, { x: 0.5, y: -1 })).toEqual(['w1']);
    // Caixa que só encosta em w2 pela borda esquerda dela.
    expect(idsNaCaixaDoCorte(corte, { x: 3.5, y: 0.5 }, { x: 2, y: 0.5 })).toEqual(['w2']);
  });

  it('Shift/Ctrl somam à seleção atual; sem eles, a caixa substitui', () => {
    expect(selecaoComCaixa(['w1'], ['w2'], true)).toEqual(['w1', 'w2']);
    expect(selecaoComCaixa(['w1', 'w2'], ['w2'], true)).toEqual(['w1', 'w2']);
    expect(selecaoComCaixa(['w1'], ['w2'], false)).toEqual(['w2']);
    expect(selecaoComCaixa(['w1'], [], false)).toEqual([]);
  });
});

describe('terreno no corte: seleção por caixa e por clique (kernel simulado)', () => {
  const pt = (s: number, z: number) => ({ s, z });
  /** Solo cortado fechado de 0 a 20 em z 5..10 e o perfil existente em z = 10 (T5 em corte). */
  const LINHAS: LinhaCorteTN[] = [
    { terrenoId: 'tn_t5', papel: 'cortado', fechada: true, pontos: [pt(0, 10), pt(20, 10), pt(20, 5), pt(0, 5)] },
    { terrenoId: 'tn_t5', papel: 'perfilExistente', fechada: false, pontos: [pt(0, 10), pt(20, 10)] },
  ];
  const secao = { length: 20, zMin: 0, zMax: 12, cut: [], silhouette: [], beyond: [], openings: [], membranes: [], levels: [], plano: { a: { x: 0, y: 10 }, b: { x: 20, y: 10 }, depth: 12 } } as unknown as SectionResult;
  const falso = (linhas: LinhaCorteTN[]) => vi.spyOn(servicoTerreno(), 'corte').mockReturnValue(linhas);
  afterEach(() => vi.restoreAllMocks());

  it('janela pega o terreno só quando todas as linhas estão dentro; cruzamento, quando alguma toca', () => {
    falso(LINHAS);
    const p = projetoTerreno('T5');
    expect(terrenosNaCaixaDoCorteDoProjeto(p, secao, { x: -1, y: 4 }, { x: 21, y: 11 }, undefined, 60)).toEqual(['tn_t5']);
    expect(terrenosNaCaixaDoCorteDoProjeto(p, secao, { x: 5, y: 4 }, { x: 15, y: 11 }, undefined, 60)).toEqual([]);
    expect(terrenosNaCaixaDoCorteDoProjeto(p, secao, { x: 15, y: 11 }, { x: 5, y: 4 }, undefined, 60)).toEqual(['tn_t5']);
    expect(terrenosNaCaixaDoCorteDoProjeto(p, secao, { x: 30, y: 30 }, { x: 25, y: 20 }, undefined, 60)).toEqual([]);
  });

  it('terreno oculto na vista não é pego pela caixa', () => {
    falso(LINHAS);
    expect(terrenosNaCaixaDoCorteDoProjeto(projetoTerreno('T5'), secao, { x: -1, y: 4 }, { x: 21, y: 11 }, new Set(['tn_t5']), 60)).toEqual([]);
  });

  it('categoria site desligada no corte: nada é pego', () => {
    falso(LINHAS);
    const s = new ProjectStore(projetoTerreno('T5'));
    s.exec({ type: 'setSectionGraphics', patch: { overrides: { site: { visible: false } } } });
    expect(terrenosNaCaixaDoCorteDoProjeto(s.project, secao, { x: -1, y: 4 }, { x: 21, y: 11 }, undefined, 60)).toEqual([]);
  });

  it('clique: no interior do solo cortado acha o terreno (kind site); fora dele, nada; o elemento do edifício vence na ordem de quem chama', () => {
    falso(LINHAS);
    const p = projetoTerreno('T5');
    expect(terrenoNoPontoDoCorte(p, secao, undefined, 60, { x: 10, y: 7 })).toEqual({ id: 'tn_t5', kind: 'site' });
    expect(terrenoNoPontoDoCorte(p, secao, undefined, 60, { x: 10, y: 11 })).toBeNull();
    expect(terrenoNoPontoDoCorte(p, secao, new Set(['tn_t5']), 60, { x: 10, y: 7 })).toBeNull();
  });

  it('sem kernel (corte devolve null) nenhum terreno é achado', () => {
    vi.spyOn(servicoTerreno(), 'corte').mockReturnValue(null);
    expect(terrenoNoPontoDoCorte(projetoTerreno('T5'), secao, undefined, 60, { x: 10, y: 7 })).toBeNull();
  });
});
