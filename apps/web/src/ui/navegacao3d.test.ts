import { describe, expect, it } from 'vitest';
import {
  classificarGestoPonteiro,
  deltaZoom,
  deslocamentoDoPontoMedio,
  deveAproximarNoCursor,
  fatorAproximacaoCursor,
  moverAlvoParaPonto,
  ndcDoCursor,
  zoomDoPinch,
} from './navegacao3d.ts';

const sem = { shift: false, alt: false, espaco: false };

describe('classificarGestoPonteiro', () => {
  it.each([
    ['esquerdo sem modificador orbita', { botao: 0, ...sem }, 'orbitar'],
    ['esquerdo + Alt orbita', { botao: 0, ...sem, alt: true }, 'orbitar'],
    ['esquerdo + Espaço faz pan', { botao: 0, ...sem, espaco: true }, 'pan'],
    ['esquerdo + Espaço + Shift faz pan', { botao: 0, ...sem, espaco: true, shift: true }, 'pan'],
    ['esquerdo + Shift orbita (no 3D, Shift não faz pan)', { botao: 0, ...sem, shift: true }, 'orbitar'],
    ['esquerdo + Alt + Shift orbita (órbita tem precedência)', { botao: 0, ...sem, alt: true, shift: true }, 'orbitar'],
    ['esquerdo + Alt + Espaço orbita (órbita tem precedência)', { botao: 0, ...sem, alt: true, espaco: true }, 'orbitar'],
    ['direito + Espaço não navega', { botao: 2, ...sem, espaco: true }, 'nenhum'],
    ['meio sem modificador faz pan', { botao: 1, ...sem }, 'pan'],
    ['meio + Shift orbita', { botao: 1, ...sem, shift: true }, 'orbitar'],
    ['meio + Alt faz pan', { botao: 1, ...sem, alt: true }, 'pan'],
    ['meio + Espaço faz pan', { botao: 1, ...sem, espaco: true }, 'pan'],
    ['direito não navega', { botao: 2, ...sem }, 'nenhum'],
    ['direito + Shift não navega', { botao: 2, ...sem, shift: true }, 'nenhum'],
    ['outro botão não navega', { botao: 3, ...sem }, 'nenhum'],
  ])('%s', (_nome, entrada, esperado) => {
    expect(classificarGestoPonteiro(entrada)).toBe(esperado);
  });
});

describe('ndcDoCursor', () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };

  it('canto superior esquerdo vira (-1, 1)', () => {
    expect(ndcDoCursor(rect, 100, 50)).toEqual({ x: -1, y: 1 });
  });

  it('canto inferior direito vira (1, -1)', () => {
    expect(ndcDoCursor(rect, 300, 150)).toEqual({ x: 1, y: -1 });
  });

  it('centro vira (0, 0)', () => {
    expect(ndcDoCursor(rect, 200, 100)).toEqual({ x: 0, y: 0 });
  });

  it('retângulo sem área devolve null', () => {
    expect(ndcDoCursor({ left: 0, top: 0, width: 0, height: 100 }, 5, 5)).toBeNull();
    expect(ndcDoCursor({ left: 0, top: 0, width: 100, height: 0 }, 5, 5)).toBeNull();
  });
});

describe('deltaZoom', () => {
  it('mantém o sinal do deltaY', () => {
    expect(deltaZoom(120)).toBe(120);
    expect(deltaZoom(-120)).toBe(-120);
    expect(deltaZoom(0)).toBe(0);
  });
});

describe('fatorAproximacaoCursor', () => {
  it('segue |deltaY| * 0.001 abaixo do limite', () => {
    expect(fatorAproximacaoCursor(50)).toBeCloseTo(0.05);
    expect(fatorAproximacaoCursor(-50)).toBeCloseTo(0.05);
  });

  it('limita o fator em 0.12', () => {
    expect(fatorAproximacaoCursor(120)).toBeCloseTo(0.12);
    expect(fatorAproximacaoCursor(10_000)).toBe(0.12);
  });

  it('é zero sem rolagem', () => {
    expect(fatorAproximacaoCursor(0)).toBe(0);
  });
});

describe('deveAproximarNoCursor', () => {
  it('aproxima só com deltaY negativo', () => {
    expect(deveAproximarNoCursor(-1)).toBe(true);
    expect(deveAproximarNoCursor(1)).toBe(false);
    expect(deveAproximarNoCursor(0)).toBe(false);
  });
});

describe('zoomDoPinch', () => {
  it('afastar os dedos (distância cresce) dá valor negativo, que aproxima a câmera', () => {
    expect(zoomDoPinch(100, 130)).toBe(-90);
  });

  it('aproximar os dedos (distância diminui) dá valor positivo, que afasta a câmera', () => {
    expect(zoomDoPinch(130, 100)).toBe(90);
  });

  it('é a mesma conta do 3D: -(atual - anterior) * 3', () => {
    const anterior = 87.5;
    const atual = 142.25;
    expect(zoomDoPinch(anterior, atual)).toBe(-(atual - anterior) * 3);
  });

  it('dedos parados dão zero, sem infinito nem NaN', () => {
    expect(zoomDoPinch(0, 0)).toBe(0);
    expect(zoomDoPinch(50, 50)).toBe(0);
    expect(Number.isFinite(zoomDoPinch(0, 300))).toBe(true);
    expect(Number.isFinite(zoomDoPinch(300, 0))).toBe(true);
  });
});

describe('deslocamentoDoPontoMedio', () => {
  it('movimento simples: devolve a diferença do ponto médio em x e y', () => {
    expect(deslocamentoDoPontoMedio({ x: 100, y: 200 }, { x: 110, y: 185 })).toEqual({ dx: 10, dy: -15 });
  });

  it('sem movimento devolve zero', () => {
    expect(deslocamentoDoPontoMedio({ x: 4, y: 4 }, { x: 4, y: 4 })).toEqual({ dx: 0, dy: 0 });
  });

  it('não altera os pontos de entrada', () => {
    const anterior = { x: 1, y: 2 };
    const atual = { x: 3, y: 5 };
    deslocamentoDoPontoMedio(anterior, atual);
    expect(anterior).toEqual({ x: 1, y: 2 });
    expect(atual).toEqual({ x: 3, y: 5 });
  });
});

describe('moverAlvoParaPonto', () => {
  it('interpola alvo em direção ao ponto pelo fator', () => {
    expect(moverAlvoParaPonto({ x: 0, y: 0 }, { x: 10, y: -20 }, 0.5)).toEqual({ x: 5, y: -10 });
  });

  it('com fator zero mantém o alvo', () => {
    expect(moverAlvoParaPonto({ x: 3, y: 4 }, { x: 10, y: 10 }, 0)).toEqual({ x: 3, y: 4 });
  });

  it('com fator um vai ao ponto', () => {
    expect(moverAlvoParaPonto({ x: 3, y: 4 }, { x: 10, y: -2 }, 1)).toEqual({ x: 10, y: -2 });
  });

  it('não altera os objetos de entrada', () => {
    const alvo = { x: 1, y: 1 };
    const ponto = { x: 5, y: 5 };
    moverAlvoParaPonto(alvo, ponto, 0.5);
    expect(alvo).toEqual({ x: 1, y: 1 });
    expect(ponto).toEqual({ x: 5, y: 5 });
  });
});
