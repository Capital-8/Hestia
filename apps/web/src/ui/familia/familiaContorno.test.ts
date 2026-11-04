import { describe, expect, it } from 'vitest';
import {
  adicionarPonto,
  contornoDePontos,
  moverPonto,
  pontosDoContorno,
  removerPonto,
  validarContorno,
  type PontoContorno,
} from './familiaContorno.ts';

const triangulo: PontoContorno[] = [['0', '0'], ['L', '0'], ['0', 'A']];

describe('pontosDoContorno', () => {
  it('lê os vértices do contorno poligonal', () => {
    expect(pontosDoContorno({ tipo: 'poligono', pontos: [['0', '0'], ['L', '0'], ['0', 'A']] })).toEqual(triangulo);
  });

  it('devolve lista vazia para retângulo ou ausência de contorno', () => {
    expect(pontosDoContorno({ tipo: 'retangulo' })).toEqual([]);
    expect(pontosDoContorno(undefined)).toEqual([]);
  });
});

describe('validarContorno', () => {
  it('recusa menos de 3 vértices com o motivo e a contagem', () => {
    expect(validarContorno([])).toBe('o contorno precisa de pelo menos 3 vértices (tem 0)');
    expect(validarContorno([['0', '0'], ['L', '0']])).toBe('o contorno precisa de pelo menos 3 vértices (tem 2)');
  });

  it('recusa vértice com coordenada vazia', () => {
    expect(validarContorno([['0', '0'], ['L', '0'], [' ', 'A']])).toBe('vértice 3: informe x e y');
  });

  it('recusa fórmula que não compila, dizendo o vértice e o eixo', () => {
    expect(validarContorno([['0', '0'], ['L', '0'], ['0', '(A']])).toContain('vértice 3 (y):');
  });

  it('aceita três vértices com fórmulas válidas', () => {
    expect(validarContorno(triangulo)).toBeNull();
    expect(validarContorno([['0', '0'], ['L - 10', '0'], ['0', 'A / 2']])).toBeNull();
  });
});

describe('edição da lista de vértices', () => {
  it('adiciona ao fim, com 0,0 por padrão', () => {
    expect(adicionarPonto(triangulo)).toEqual([...triangulo, ['0', '0']]);
    expect(adicionarPonto(triangulo, ['10', '20'])).toEqual([...triangulo, ['10', '20']]);
  });

  it('remove o vértice pelo índice e ignora índice fora da faixa', () => {
    expect(removerPonto(triangulo, 1)).toEqual([['0', '0'], ['0', 'A']]);
    expect(removerPonto(triangulo, 9)).toEqual(triangulo);
  });

  it('move o vértice e limita às pontas', () => {
    expect(moverPonto(triangulo, 0, 1)).toEqual([['L', '0'], ['0', '0'], ['0', 'A']]);
    expect(moverPonto(triangulo, 2, 5)).toEqual([['0', '0'], ['L', '0'], ['0', 'A']]);
    expect(moverPonto(triangulo, 1, 0)).toEqual(triangulo);
  });

  it('não altera a lista recebida', () => {
    const original: PontoContorno[] = [['0', '0'], ['L', '0'], ['0', 'A']];
    adicionarPonto(original);
    removerPonto(original, 0);
    moverPonto(original, 0, 1);
    expect(original).toEqual(triangulo);
  });

  it('monta o contorno do modelo sem espaços nas pontas', () => {
    expect(contornoDePontos([[' 0 ', '0 '], [' L', ' 0'], ['0', ' A ']])).toEqual({
      tipo: 'poligono',
      pontos: [['0', '0'], ['L', '0'], ['0', 'A']],
    });
  });
});
