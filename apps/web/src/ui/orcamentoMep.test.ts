import type { QuantitativosMep } from '@hestia/engine';
import { describe, expect, it } from 'vitest';
import { csvInstalacoes, linhasInstalacoes, numeroMep, textoMedidaInstalacao, type RotulosInstalacao } from './orcamentoMep.ts';

const vazio: QuantitativosMep = { tubulacao: [], conexoesTubo: [], reservatorios: [], perfisEstruturais: [], eletrodutos: [] };

const rotulos: RotulosInstalacao = {
  grupos: { tubulacao: 'Tubulação', conexoes: 'Conexões', reservatorios: 'Reservatórios', perfis: 'Perfis', eletrodutos: 'Eletrodutos' },
  semIdentificacao: 'Sem DN ou bitola',
  cabecalho: ['Grupo', 'Item', 'Quantidade', 'Medida', 'Unidade'],
};

describe('orcamentoMep (parte lógica da seção Instalações e estrutura)', () => {
  it('numeroMep: vírgula decimal e sem zeros à direita', () => {
    expect(numeroMep(3.5, 2)).toBe('3,5');
    expect(numeroMep(2, 2)).toBe('2');
    expect(numeroMep(0.1 + 0.2, 2)).toBe('0,3');
    expect(numeroMep(1234.5, 1)).toBe('1234,5');
    expect(numeroMep(50, 0)).toBe('50');
  });

  it('aceitação: 3 trechos de DN50 somam "3,5 m" com quantidade 3', () => {
    const mep: QuantitativosMep = { ...vazio, tubulacao: [{ dn: 50, trechos: 3, comprimentoM: 1 + 1 + 1.5 }] };
    const linhas = linhasInstalacoes(mep);
    expect(linhas).toEqual([{ grupo: 'tubulacao', item: 'DN 50', quantidade: 3, medida: 3.5, unidade: 'm' }]);
    expect(textoMedidaInstalacao(linhas[0]!)).toBe('3,5 m');
  });

  it('linhasInstalacoes: ordem dos grupos, unidades e medidas nulas', () => {
    const mep: QuantitativosMep = {
      tubulacao: [{ dn: null, trechos: 1, comprimentoM: 0.8 }],
      conexoesTubo: [{ familiaId: 'j', tipoId: null, nome: 'Joelho 90', quantidade: 2 }],
      reservatorios: [{ familiaId: 'r', tipoId: 't', nome: 'Caixa', quantidade: 1, volumeUtilL: null }],
      perfisEstruturais: [{ familiaId: 'p', tipoId: null, nome: 'Cantoneira', quantidade: 2, comprimentoM: 4, massaKg: 31.4 }],
      eletrodutos: [{ bitola: 25, trechos: 2, comprimentoM: 1.2 }],
    };
    const linhas = linhasInstalacoes(mep);
    expect(linhas.map((l) => l.grupo)).toEqual(['tubulacao', 'conexoes', 'reservatorios', 'perfis', 'eletrodutos']);
    expect(linhas[0]).toEqual({ grupo: 'tubulacao', item: null, quantidade: 1, medida: 0.8, unidade: 'm' });
    expect(linhas[1]).toEqual({ grupo: 'conexoes', item: 'Joelho 90', quantidade: 2, medida: null, unidade: null });
    expect(linhas[2]).toEqual({ grupo: 'reservatorios', item: 'Caixa', quantidade: 1, medida: null, unidade: null });
    expect(textoMedidaInstalacao(linhas[2]!)).toBe('');
    expect(textoMedidaInstalacao(linhas[3]!)).toBe('31,4 kg');
    expect(linhas[4]).toEqual({ grupo: 'eletrodutos', item: 'Ø 25', quantidade: 2, medida: 1.2, unidade: 'm' });
  });

  it('linhasInstalacoes: mep vazio não gera linhas', () => {
    expect(linhasInstalacoes(vazio)).toEqual([]);
  });

  it('csvInstalacoes: cabeçalho, separador ;, decimal com vírgula e medida vazia quando não há', () => {
    const mep: QuantitativosMep = {
      ...vazio,
      tubulacao: [{ dn: 50, trechos: 3, comprimentoM: 3.5 }],
      conexoesTubo: [{ familiaId: 'j', tipoId: null, nome: 'Joelho 90', quantidade: 2 }],
    };
    expect(csvInstalacoes(linhasInstalacoes(mep), rotulos)).toBe(
      ['Grupo;Item;Quantidade;Medida;Unidade', 'Tubulação;DN 50;3;3,5;m', 'Conexões;Joelho 90;2;;'].join('\n'),
    );
  });

  it('csvInstalacoes: item sem DN usa o rótulo e texto com ; ou aspas vai entre aspas', () => {
    const mep: QuantitativosMep = {
      ...vazio,
      tubulacao: [{ dn: null, trechos: 1, comprimentoM: 0.5 }],
      conexoesTubo: [{ familiaId: 'j', tipoId: null, nome: 'Luva "X";Y', quantidade: 1 }],
    };
    expect(csvInstalacoes(linhasInstalacoes(mep), rotulos).split('\n')).toEqual([
      'Grupo;Item;Quantidade;Medida;Unidade',
      'Tubulação;Sem DN ou bitola;1;0,5;m',
      'Conexões;"Luva ""X"";Y";1;;',
    ]);
  });
});
