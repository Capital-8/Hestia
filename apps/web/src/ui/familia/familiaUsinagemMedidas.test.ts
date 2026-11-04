import type { Peca, Usinagem, Valor } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { validarUsinagem } from './familiaUsinagem.ts';

const peca = (extra: Partial<Peca> = {}): Peca => ({
  id: 'p',
  nome: 'Peça',
  papel: 'lateral',
  eixo: 'x',
  origem: ['0', '0', '0'],
  tamanho: ['100', '50'],
  espessura: '18',
  ...extra,
});

const furo = (extra: Partial<Usinagem> = {}): Usinagem => ({
  id: 'furo',
  tipo: 'furo',
  face: 'a',
  posicao: ['50', '25'],
  diametro: '8',
  profundidade: 'passante',
  ...extra,
});

const rasgo = (extra: Partial<Usinagem> = {}): Usinagem => ({
  id: 'rasgo',
  tipo: 'rasgo',
  face: 'a',
  posicao: ['10', '10'],
  largura: '20',
  comprimento: '30',
  profundidade: '10',
  ...extra,
});

describe('validarUsinagem confere as medidas contra a peça', () => {
  it('aceita usinagem dentro da chapa', () => {
    expect(validarUsinagem(peca(), furo())).toBeNull();
    expect(validarUsinagem(peca(), rasgo())).toBeNull();
  });

  it('recusa diâmetro e profundidade que não são maiores que zero', () => {
    expect(validarUsinagem(peca(), furo({ diametro: '0' }))).toMatch(/diâmetro.*maior que zero/);
    expect(validarUsinagem(peca(), furo({ diametro: '-8' }))).toMatch(/diâmetro.*maior que zero/);
    expect(validarUsinagem(peca(), furo({ profundidade: '0' }))).toMatch(/profundidade.*maior que zero/);
    expect(validarUsinagem(peca(), furo({ profundidade: '-5' }))).toMatch(/profundidade.*maior que zero/);
  });

  it('recusa furo que sai da chapa e profundidade maior que a espessura', () => {
    expect(validarUsinagem(peca(), furo({ posicao: ['2', '25'] }))).toMatch(/furo fora da peça/);
    expect(validarUsinagem(peca(), furo({ posicao: ['50', '2'] }))).toMatch(/furo fora da peça/);
    expect(validarUsinagem(peca(), furo({ profundidade: '30' }))).toMatch(/passar da espessura/);
    expect(validarUsinagem(peca(), furo({ profundidade: '10' }))).toBeNull();
  });

  it('recusa rasgo/recorte com medida zero ou para fora da chapa', () => {
    expect(validarUsinagem(peca(), rasgo({ largura: '0' }))).toMatch(/largura.*maior que zero/);
    expect(validarUsinagem(peca(), rasgo({ comprimento: '-1' }))).toMatch(/comprimento.*maior que zero/);
    expect(validarUsinagem(peca(), rasgo({ posicao: ['90', '10'] }))).toMatch(/fora da peça/);
  });

  it('resolve as dimensões da peça com o ambiente da família', () => {
    const env: Record<string, Valor> = { L: 600, A: 400, esp: 18 };
    const comParametros = peca({ tamanho: ['L', 'A'], espessura: 'esp' });
    expect(validarUsinagem(comParametros, furo({ posicao: ['300', '200'] }), undefined, env)).toBeNull();
    expect(validarUsinagem(comParametros, furo({ posicao: ['2', '200'] }), undefined, env)).toMatch(/fora da peça/);
    expect(validarUsinagem(comParametros, furo({ posicao: ['300', '200'], profundidade: '30' }), undefined, env)).toMatch(/passar da espessura/);
  });

  it('furo de borda é conferido contra o comprimento da borda e a espessura', () => {
    const naBorda = peca();
    expect(validarUsinagem(naBorda, furo({ face: 'n', posicao: ['50', '9'] }))).toBeNull();
    expect(validarUsinagem(naBorda, furo({ face: 'n', posicao: ['50', '17'] }))).toMatch(/fora da peça/);
    expect(validarUsinagem(naBorda, furo({ face: 'l', posicao: ['2', '9'] }))).toMatch(/fora da peça/);
  });
});
