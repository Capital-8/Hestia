import type { QuantitativosEletricos } from '@hestia/engine';
import { describe, expect, it } from 'vitest';
import { bitolaTexto, csvQuantitativoEletrico, linhasQuantitativoEletrico, textoMedidaQuantitativo } from './quantitativosEletricosTexto.ts';

/* Parte pura do diálogo Quantitativos elétricos (ficha C6): linhas, medidas e CSV a partir de um quantitativo montado à mão. */
const VAZIO: QuantitativosEletricos = {
  eletrodutos: [],
  curvas: [],
  luvas: [],
  caixas: [],
  quadros: [],
  pontos: { tomadas: 0, interruptores: 0, luminarias: 0, outros: 0 },
  outros: [],
  circuitos: [],
};
const COM_DADOS: QuantitativosEletricos = {
  ...VAZIO,
  eletrodutos: [
    { bitola: 20, trechos: 2, comprimentoM: 4 },
    { bitola: 25, trechos: 1, comprimentoM: 2.5 },
  ],
  curvas: [{ bitola: 20, quantidade: 3 }],
  luvas: [{ bitola: null, quantidade: 1 }],
  caixas: [{ familiaId: 'fam_caixa_4x4', nome: 'Caixa de embutir 4×4', quantidade: 1 }],
  quadros: [{ id: 'qd', nome: 'QD 1', posicoes: 12 }],
  pontos: { tomadas: 2, interruptores: 1, luminarias: 0, outros: 0 },
  circuitos: [
    {
      circuitoId: 'cir_1',
      nome: 'C1',
      tipo: 'tomadas_uso_geral',
      rotuloTipo: 'Tomadas de uso geral',
      quadroNome: 'QD 1',
      totalVA: 900,
      pontos: { tomadas: 2, interruptores: 0, luminarias: 0, outros: 0 },
      semCaminho: 1,
      eletrodutos: [{ bitola: 20, trechos: 2, comprimentoM: 4 }],
      curvas: [],
      luvas: [],
      caixas: [],
    },
  ],
};

describe('quantitativos elétricos: linhas do diálogo', () => {
  it('projeto vazio não gera linha nenhuma', () => {
    expect(linhasQuantitativoEletrico(VAZIO)).toEqual([]);
  });
  it('eletrodutos do projeto saem por bitola com trechos e comprimento em m', () => {
    const linhas = linhasQuantitativoEletrico(COM_DADOS).filter((l) => l.grupo === 'Eletroduto' && l.escopo === 'Projeto');
    expect(linhas).toEqual([
      { escopo: 'Projeto', grupo: 'Eletroduto', item: 'DN 20', quantidade: 2, medida: 4, unidade: 'm' },
      { escopo: 'Projeto', grupo: 'Eletroduto', item: 'DN 25', quantidade: 1, medida: 2.5, unidade: 'm' },
    ]);
  });
  it('quadro sai com as posições; pontos só aparecem quando há quantidade', () => {
    const linhas = linhasQuantitativoEletrico(COM_DADOS).filter((l) => l.escopo === 'Projeto');
    expect(linhas.find((l) => l.grupo === 'Quadro')).toMatchObject({ item: 'QD 1, 12 posições', quantidade: 1 });
    expect(linhas.filter((l) => l.grupo === 'Ponto').map((l) => [l.item, l.quantidade])).toEqual([
      ['Tomada', 2],
      ['Interruptor', 1],
    ]);
  });
  it('circuito traz quadro, potência em VA, pontos, eletrodutos e o aviso de ponto sem caminho', () => {
    const c1 = linhasQuantitativoEletrico(COM_DADOS).filter((l) => l.escopo === 'C1');
    expect(c1.map((l) => l.grupo)).toEqual(['Quadro', 'Potência', 'Ponto', 'Eletroduto', 'Sem caminho']);
    expect(c1.find((l) => l.grupo === 'Potência')).toMatchObject({ quantidade: 2, medida: 900, unidade: 'VA' });
    expect(c1.find((l) => l.grupo === 'Sem caminho')).toMatchObject({ quantidade: 1 });
  });
});

describe('quantitativos elétricos: medidas, bitolas e CSV', () => {
  it('bitola sem DN aparece como "sem bitola"; com DN como "DN 20"', () => {
    expect(bitolaTexto(20)).toBe('DN 20');
    expect(bitolaTexto(null)).toBe('sem bitola');
  });
  it('medida em m com 3 casas e vírgula; VA sem casas; sem unidade, vazio', () => {
    expect(textoMedidaQuantitativo({ medida: 4, unidade: 'm' })).toBe('4 m');
    expect(textoMedidaQuantitativo({ medida: 2.5, unidade: 'm' })).toBe('2,5 m');
    expect(textoMedidaQuantitativo({ medida: 900, unidade: 'VA' })).toBe('900 VA');
    expect(textoMedidaQuantitativo({ medida: null, unidade: null })).toBe('');
  });
  it('CSV: cabeçalho com seis colunas, separador ; e decimal com vírgula', () => {
    const csv = csvQuantitativoEletrico(linhasQuantitativoEletrico(COM_DADOS));
    const [cabecalho, primeira] = csv.split('\n');
    expect(cabecalho).toBe('Escopo;Grupo;Item;Quantidade;Medida;Unidade');
    expect(primeira).toBe('Projeto;Eletroduto;DN 20;2;4;m');
    expect(csv).toContain('Projeto;Eletroduto;DN 25;1;2,5;m');
  });
  it('CSV entre aspas quando o texto tem ponto e vírgula, sem quebrar as colunas', () => {
    const csv = csvQuantitativoEletrico([{ escopo: 'C;1', grupo: 'Quadro', item: 'QD "A"', quantidade: 1, medida: null, unidade: null }]);
    expect(csv.split('\n')[1]).toBe('"C;1";Quadro;"QD ""A""";1;;');
  });
});
