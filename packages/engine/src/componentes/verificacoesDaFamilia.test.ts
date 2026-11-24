import { FAMILIA_ARMARIO, type Familia, type Tipo } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { avaliarVerificacoes, formatarValor, interpolar, tabelaDaFamilia, temErro } from './verificacoesDaFamilia.ts';

/** Família só com L (instância), P (instância) e volume (calculado: L * P / 1000), sem peças nem planos. */
const comParametros = (): Familia => {
  const f = structuredClone(FAMILIA_ARMARIO);
  f.pecas = [];
  f.planos = [];
  f.parametros = [
    { id: 'L', nome: 'Largura', tipo: 'comprimento', escopo: 'instancia', padrao: 600, min: 300, max: 1200 },
    { id: 'P', nome: 'Profundidade', tipo: 'comprimento', escopo: 'instancia', padrao: 560 },
    { id: 'volume', nome: 'Volume', tipo: 'numero', escopo: 'instancia', padrao: 0, formula: 'L * P / 1000' },
  ];
  return f;
};

const TIPOS: Tipo[] = [
  { id: 't1', nome: 'Pequeno', valores: { L: 400 } },
  { id: 't2', nome: 'Médio', valores: { L: 600 } },
  { id: 't3', nome: 'Grande', valores: { L: 800 } },
];

describe('avaliarVerificacoes', () => {
  it('interpola {param} com os valores atuais, inclusive o de um parâmetro calculado', () => {
    const f = comParametros();
    f.verificacoes = [{
      id: 'volMin',
      severidade: 'aviso',
      condicao: 'volume < 400',
      mensagem: 'Volume útil {volume} abaixo do exigido 400 (largura {L})',
    }];

    const diagnosticos = avaliarVerificacoes(f, { L: 600, P: 560 });

    expect(diagnosticos).toEqual([{
      id: 'volMin',
      severidade: 'aviso',
      mensagem: 'Volume útil 336 abaixo do exigido 400 (largura 600)',
      onde: 'verificacao:volMin',
    }]);
  });

  it('condição falsa não gera diagnóstico', () => {
    const f = comParametros();
    f.verificacoes = [{ id: 'volMin', severidade: 'aviso', condicao: 'volume < 400', mensagem: 'baixo' }];

    expect(avaliarVerificacoes(f, { L: 1000, P: 560 })).toEqual([]);
  });

  it('severidade erro é reconhecida por temErro (o painel recusa o valor)', () => {
    const f = comParametros();
    f.verificacoes = [{ id: 'pequeno', severidade: 'erro', condicao: 'L < 500', mensagem: 'Largura {L} abaixo de 500' }];

    const diagnosticos = avaliarVerificacoes(f, { L: 400, P: 560 });

    expect(diagnosticos).toHaveLength(1);
    expect(diagnosticos[0]?.mensagem).toBe('Largura 400 abaixo de 500');
    expect(temErro(diagnosticos)).toBe(true);
    expect(temErro(avaliarVerificacoes(f, { L: 600, P: 560 }))).toBe(false);
  });

  it('condição com fórmula que não avalia vira diagnóstico de erro, sem lançar', () => {
    const f = comParametros();
    f.verificacoes = [{ id: 'quebrada', severidade: 'aviso', condicao: 'L +', mensagem: 'x' }];

    const diagnosticos = avaliarVerificacoes(f, { L: 600, P: 560 });

    expect(diagnosticos).toHaveLength(1);
    expect(diagnosticos[0]).toMatchObject({ id: 'quebrada', severidade: 'erro', onde: 'verificacao:quebrada' });
  });

  it('família sem verificações devolve lista vazia', () => {
    expect(avaliarVerificacoes(comParametros(), { L: 600, P: 560 })).toEqual([]);
  });
});

describe('tabelaDaFamilia', () => {
  it('por tipo: cabeçalho com a coluna Tipo e uma linha por tipo (3 tipos)', () => {
    const f = comParametros();
    f.tabelas = [{
      id: 'dimensoes',
      nome: 'Dimensões',
      porTipo: true,
      colunas: [
        { titulo: 'Largura', valor: 'L' },
        { titulo: 'Volume', valor: 'volume', unidade: 'mm³' },
      ],
    }];

    expect(tabelaDaFamilia(f, 'dimensoes', TIPOS)).toEqual([
      ['Tipo', 'Largura', 'Volume (mm³)'],
      ['Pequeno', '400', '224'],
      ['Médio', '600', '336'],
      ['Grande', '800', '448'],
    ]);
  });

  it('da instância: cabeçalho e uma linha só, com os valores dados', () => {
    const f = comParametros();
    f.tabelas = [{
      id: 'inst',
      nome: 'Instância',
      porTipo: false,
      colunas: [
        { titulo: 'Largura', valor: 'L' },
        { titulo: 'Volume', valor: 'volume' },
      ],
    }];

    expect(tabelaDaFamilia(f, 'inst', TIPOS, { L: 1000, P: 560 })).toEqual([
      ['Largura', 'Volume'],
      ['1000', '560'],
    ]);
  });

  it('coluna com fórmula que não avalia sai como traço, sem lançar', () => {
    const f = comParametros();
    f.tabelas = [{ id: 't', nome: 'T', porTipo: true, colunas: [{ titulo: 'X', valor: 'L +' }] }];

    expect(tabelaDaFamilia(f, 't', TIPOS)[1]).toEqual(['Pequeno', '—']);
  });

  it('tabela inexistente devolve lista vazia', () => {
    expect(tabelaDaFamilia(comParametros(), 'nao_existe', TIPOS)).toEqual([]);
  });
});

describe('interpolar e formatarValor', () => {
  it('formata número sem casas e deixa placeholder desconhecido como está', () => {
    expect(formatarValor(335.6)).toBe('336');
    expect(formatarValor(true)).toBe('true');
    expect(interpolar('{L} e {naoExiste}', { L: 600 })).toBe('600 e {naoExiste}');
  });
});
