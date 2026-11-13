import { describe, expect, it } from 'vitest';
import { validarPerfil } from './perfis.ts';
import type { PerfilForma } from './estrTypes.ts';

const ok = (p: PerfilForma): void => expect(validarPerfil(p)).toBeNull();
const ruim = (p: PerfilForma): void => expect(validarPerfil(p)).not.toBeNull();
const quadrado = (x0: number, y0: number, x1: number, y1: number): Array<[number, number]> => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

describe('validarPerfil: dimensões (A.2)', () => {
  it('aceita um exemplar válido de cada forma', () => {
    ok({ forma: 'retangular', b: 0.2, h: 0.4 });
    ok({ forma: 'circular', d: 0.3 });
    ok({ forma: 'L', b: 0.1, h: 0.1, tf: 0.01 });
    ok({ forma: 'T', b: 0.1, h: 0.2, tf: 0.01, tw: 0.006 });
    ok({ forma: 'I', b: 0.1, h: 0.2, tf: 0.008, tw: 0.005 });
    ok({ forma: 'U', b: 0.05, h: 0.1, tf: 0.0085, tw: 0.006 });
    ok({ forma: 'tuboRetangular', b: 0.1, h: 0.1, t: 0.005 });
    ok({ forma: 'tuboCircular', d: 0.1, t: 0.004 });
    ok({ forma: 'personalizado', anel: quadrado(0, 0, 1, 1) });
  });

  it('dimensão zero, negativa, NaN ou infinita é recusada em toda forma', () => {
    ruim({ forma: 'retangular', b: 0, h: 0.4 });
    ruim({ forma: 'retangular', b: 0.2, h: -1 });
    ruim({ forma: 'circular', d: Number.NaN });
    ruim({ forma: 'L', b: 0.1, h: 0.1, tf: 0 });
    ruim({ forma: 'T', b: Infinity, h: 0.2, tf: 0.01, tw: 0.006 });
    ruim({ forma: 'I', b: 0.1, h: 0.2, tf: 0.008, tw: 0 });
    ruim({ forma: 'U', b: 0.05, h: 0.1, tf: 0.0085, tw: Number.NaN });
    ruim({ forma: 'tuboRetangular', b: 0.1, h: 0.1, t: 0 });
    ruim({ forma: 'tuboCircular', d: 0, t: 0.004 });
  });

  it('tf*2 < h: duas abas devem caber na altura de I e U (E10)', () => {
    ruim({ forma: 'I', b: 0.1, h: 0.2, tf: 0.1, tw: 0.005 });
    ruim({ forma: 'I', b: 0.1, h: 0.2, tf: 0.1000001, tw: 0.005 });
    ruim({ forma: 'U', b: 0.05, h: 0.1, tf: 0.05, tw: 0.006 });
    ok({ forma: 'I', b: 0.1, h: 0.2, tf: 0.099, tw: 0.005 });
  });

  it('T e L: a aba deve ser menor que a altura (e, no L, que a largura)', () => {
    ruim({ forma: 'T', b: 0.1, h: 0.2, tf: 0.2, tw: 0.006 });
    ruim({ forma: 'L', b: 0.1, h: 0.1, tf: 0.1 });
    ruim({ forma: 'L', b: 0.05, h: 0.2, tf: 0.06 });
  });

  it('tw < b: a alma deve ser mais fina que a largura', () => {
    ruim({ forma: 'I', b: 0.1, h: 0.2, tf: 0.008, tw: 0.1 });
    ruim({ forma: 'T', b: 0.1, h: 0.2, tf: 0.01, tw: 0.12 });
    ruim({ forma: 'U', b: 0.05, h: 0.1, tf: 0.0085, tw: 0.05 });
  });

  it('t*2 < min(b,h): a parede do tubo não pode fechar o vazio', () => {
    ruim({ forma: 'tuboRetangular', b: 0.1, h: 0.2, t: 0.05 });
    ruim({ forma: 'tuboRetangular', b: 0.2, h: 0.1, t: 0.06 });
    ruim({ forma: 'tuboCircular', d: 0.1, t: 0.05 });
    ok({ forma: 'tuboCircular', d: 0.1, t: 0.049 });
  });

  it('forma desconhecida ou entrada que não é perfil nunca lança', () => {
    expect(validarPerfil({ forma: 'x' } as unknown as PerfilForma)).not.toBeNull();
    expect(validarPerfil(undefined as unknown as PerfilForma)).not.toBeNull();
    expect(validarPerfil(null as unknown as PerfilForma)).not.toBeNull();
  });
});

describe('validarPerfil: perfil personalizado (A.2)', () => {
  it('anel com menos de 3 vértices ou vértice não numérico é recusado', () => {
    ruim({ forma: 'personalizado', anel: [[0, 0], [1, 0]] });
    ruim({ forma: 'personalizado', anel: [[0, 0], [1, 0], [Number.NaN, 1]] });
    ruim({ forma: 'personalizado', anel: [] });
  });

  it('anel com autointerseção (gravata) é recusado (E10)', () => {
    ruim({ forma: 'personalizado', anel: [[0, 0], [1, 1], [1, 0], [0, 1]] });
  });

  it('anel com espinho (aresta que volta sobre si) é recusado', () => {
    ruim({ forma: 'personalizado', anel: [[0, 0], [1, 0], [2, 0], [1, 0.0], [1, 1]] });
  });

  it('área abaixo de 1e-6 m² é recusada; o L de 6 vértices (E9) é aceito em qualquer sentido', () => {
    ruim({ forma: 'personalizado', anel: quadrado(0, 0, 0.001, 0.0009) });
    ruim({ forma: 'personalizado', anel: [[0, 0], [1, 0], [2, 0]] });
    const L: Array<[number, number]> = [[0, 0], [0.2, 0], [0.2, 0.04], [0.04, 0.04], [0.04, 0.2], [0, 0.2]];
    ok({ forma: 'personalizado', anel: L });
    ok({ forma: 'personalizado', anel: [...L].reverse() });
  });

  it('furo dentro do anel é aceito; furo fora, tocando ou cruzando o anel é recusado', () => {
    const anel = quadrado(0, 0, 1, 1);
    ok({ forma: 'personalizado', anel, furos: [quadrado(0.2, 0.2, 0.4, 0.4)] });
    ruim({ forma: 'personalizado', anel, furos: [quadrado(2, 2, 3, 3)] });
    ruim({ forma: 'personalizado', anel, furos: [quadrado(0, 0.2, 0.4, 0.4)] });
    ruim({ forma: 'personalizado', anel, furos: [quadrado(0.8, 0.2, 1.2, 0.4)] });
  });

  it('furo degenerado (menos de 3 vértices ou com cruzamento) é recusado', () => {
    const anel = quadrado(0, 0, 1, 1);
    ruim({ forma: 'personalizado', anel, furos: [[[0.2, 0.2], [0.4, 0.2]]] });
    ruim({ forma: 'personalizado', anel, furos: [[[0.2, 0.2], [0.4, 0.4], [0.4, 0.2], [0.2, 0.4]]] });
  });

  it('furos que se tocam ou um dentro do outro são recusados; furos separados são aceitos', () => {
    const anel = quadrado(0, 0, 1, 1);
    ok({ forma: 'personalizado', anel, furos: [quadrado(0.1, 0.1, 0.3, 0.3), quadrado(0.5, 0.5, 0.8, 0.8)] });
    ruim({ forma: 'personalizado', anel, furos: [quadrado(0.1, 0.1, 0.5, 0.5), quadrado(0.4, 0.4, 0.8, 0.8)] });
    ruim({ forma: 'personalizado', anel, furos: [quadrado(0.1, 0.1, 0.9, 0.9), quadrado(0.3, 0.3, 0.6, 0.6)] });
  });

  it('a mensagem sai no idioma pedido', () => {
    const p: PerfilForma = { forma: 'circular', d: 0 };
    expect(validarPerfil(p, 'en')).toMatch(/greater than zero/);
    expect(validarPerfil(p, 'pt')).toMatch(/maiores que zero/);
  });
});
