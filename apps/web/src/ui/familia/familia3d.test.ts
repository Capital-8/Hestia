import type { PecaResolvida } from '@hestia/engine';
import { describe, expect, it } from 'vitest';
import { indiceDaPeca, limitesDaFamilia, limitarPosicao } from './familia3d.ts';

function peca(extra: Partial<PecaResolvida> & Pick<PecaResolvida, 'origem' | 'extensao'>): PecaResolvida {
  const [sx, sy, sz] = extra.extensao;
  return {
    id: 'p', nome: 'p', indice: 1, papel: 'painel', eixo: 'z', vazio: false,
    tamanho: [sx, sy], espessura: sz, contorno: null, material: null,
    fita: null, veio: null, grupo: null, deAninhado: null, ...extra,
  };
}

describe('indiceDaPeca', () => {
  const pecas = [
    peca({ id: 'lat', origem: [0, 0, 0], extensao: [0.018, 0.5, 0.7] }),
    peca({ id: 'base', origem: [0, 0, 0], extensao: [0.8, 0.5, 0.018] }),
    peca({ id: 'lat', origem: [0.782, 0, 0], extensao: [0.018, 0.5, 0.7] }),
  ];

  it('acha a primeira peça com o id pedido', () => {
    expect(indiceDaPeca(pecas, 'lat')).toBe(0);
    expect(indiceDaPeca(pecas, 'base')).toBe(1);
  });

  it('id nulo ou inexistente devolve null', () => {
    expect(indiceDaPeca(pecas, null)).toBeNull();
    expect(indiceDaPeca(pecas, 'nao_existe')).toBeNull();
    expect(indiceDaPeca([], 'lat')).toBeNull();
  });
});

describe('limitesDaFamilia', () => {
  it('usa a caixa envolvente das peças não vazias em cada eixo', () => {
    const a = peca({ origem: [-0.1, 0, 0.2], extensao: [0.5, 0.6, 0.3] });
    const b = peca({ origem: [0.2, -0.4, 0.1], extensao: [0.8, 0.1, 0.9] });
    const vazio = peca({ origem: [9, 9, 9], extensao: [1, 1, 1], vazio: true });
    expect(limitesDaFamilia([a, b, vazio])).toEqual({
      x: { min: -0.1, max: 1 },
      y: { min: -0.4, max: 0.6 },
      z: { min: 0.1, max: 1 },
    });
  });

  it('sem peças (ou só vazias) os três eixos ficam nulos', () => {
    expect(limitesDaFamilia([])).toEqual({ x: null, y: null, z: null });
    const vazio = peca({ origem: [0, 0, 0], extensao: [1, 1, 1], vazio: true });
    expect(limitesDaFamilia([vazio])).toEqual({ x: null, y: null, z: null });
  });
});

describe('limitarPosicao', () => {
  const limites = { min: -0.2, max: 0.8 };

  it('prende a posição ao intervalo', () => {
    expect(limitarPosicao(0.3, limites)).toBe(0.3);
    expect(limitarPosicao(-1, limites)).toBe(-0.2);
    expect(limitarPosicao(2, limites)).toBe(0.8);
  });

  it('sem limites mantém a posição finita e zera o resto', () => {
    expect(limitarPosicao(0.3, null)).toBe(0.3);
    expect(limitarPosicao(Number.NaN, null)).toBe(0);
  });

  it('posição não finita cai no mínimo quando há limites', () => {
    expect(limitarPosicao(Number.POSITIVE_INFINITY, limites)).toBe(-0.2);
  });
});
