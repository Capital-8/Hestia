import { FAMILIA_ARMARIO, type Parametro } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { motivoDaEntrada } from './acoes.ts';

const parametro = (id: string): Parametro => {
  const p = FAMILIA_ARMARIO.parametros.find((x) => x.id === id);
  if (p === undefined) throw new Error(`parâmetro ${id} não existe`);
  return p;
};

describe('motivoDaEntrada do padrão de parâmetro', () => {
  it('explica texto, vazio, zero, negativo e fora da faixa', () => {
    const largura = parametro('L');
    expect(motivoDaEntrada(largura, 'abc')).toBe('Valor inválido.');
    expect(motivoDaEntrada(largura, '  ')).toBe('Informe um valor.');
    expect(motivoDaEntrada(largura, '0')).toBe('O valor precisa ser maior que zero.');
    expect(motivoDaEntrada(largura, '-1')).toBe('O valor não pode ser negativo.');
    expect(motivoDaEntrada(largura, '200')).toBe('Fora da faixa: 300 a 1200 mm');
    expect(motivoDaEntrada(largura, '1300')).toBe('Fora da faixa: 300 a 1200 mm');
    expect(motivoDaEntrada(largura, '650')).toBeNull();
  });

  it('inteiro com mínimo zero aceita zero e recusa fração', () => {
    const prateleiras = parametro('nPrat');
    expect(motivoDaEntrada(prateleiras, '0')).toBeNull();
    expect(motivoDaEntrada(prateleiras, '2,5')).toBe('Use um número inteiro.');
    expect(motivoDaEntrada(prateleiras, '7')).toBe('Fora da faixa: 0 a 6');
  });

  it('enum explica opção vazia ou inexistente', () => {
    const fundo = parametro('fundo');
    expect(motivoDaEntrada(fundo, '')).toBe('Escolha uma opção.');
    expect(motivoDaEntrada(fundo, 'xyz')).toBe('Escolha uma opção válida.');
    expect(motivoDaEntrada(fundo, 'sem')).toBeNull();
  });
});
