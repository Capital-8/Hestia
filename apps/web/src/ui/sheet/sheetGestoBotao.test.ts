import { describe, expect, it } from 'vitest';
import { gestoDoBotaoNaPrancha, type EntradaGestoBotao } from './sheetGestoBotao.ts';

/** Clique esquerdo sem teclas, sem ferramenta, fora de vistas e de alças. */
const base: EntradaGestoBotao = { botao: 0, espaco: false, alt: false, sobreVista: false, alca: false, ferramenta: false };

describe('gesto do botão na prancha: Espaço + arrastar', () => {
  it('Espaço + arrastar sobre uma vista faz o pan do conteúdo (como o Alt)', () => {
    expect(gestoDoBotaoNaPrancha({ ...base, espaco: true, sobreVista: true })).toBe('conteudo');
    expect(gestoDoBotaoNaPrancha({ ...base, alt: true, sobreVista: true })).toBe('conteudo');
  });

  it('Espaço + arrastar sobre a folha vazia move a câmera, sem mexer na seleção', () => {
    expect(gestoDoBotaoNaPrancha({ ...base, espaco: true })).toBe('camera');
  });

  it('Espaço sobre a alça da vista selecionada continua sendo pan da câmera, não redimensionamento', () => {
    expect(gestoDoBotaoNaPrancha({ ...base, espaco: true, sobreVista: true, alca: true })).toBe('camera');
  });

  it('Espaço vence a ferramenta Alinhar ou Mover: o clique com Espaço é pan, não alinhamento', () => {
    expect(gestoDoBotaoNaPrancha({ ...base, espaco: true, sobreVista: true, ferramenta: true })).toBe('conteudo');
    expect(gestoDoBotaoNaPrancha({ ...base, espaco: true, ferramenta: true })).toBe('camera');
  });

  it('o botão do meio move a câmera, com ou sem Espaço e vista embaixo', () => {
    expect(gestoDoBotaoNaPrancha({ ...base, botao: 1, sobreVista: true })).toBe('camera');
    expect(gestoDoBotaoNaPrancha({ ...base, botao: 1, espaco: true, sobreVista: true })).toBe('camera');
  });
});

describe('gesto do botão na prancha: Alt continua funcionando', () => {
  it('Alt + arrastar sobre uma vista faz o pan do conteúdo', () => {
    expect(gestoDoBotaoNaPrancha({ ...base, alt: true, sobreVista: true })).toBe('conteudo');
  });

  it('Alt sobre a folha vazia move a câmera', () => {
    expect(gestoDoBotaoNaPrancha({ ...base, alt: true })).toBe('camera');
  });

  it('Alt sobre a alça da vista selecionada segue para o redimensionamento', () => {
    expect(gestoDoBotaoNaPrancha({ ...base, alt: true, sobreVista: true, alca: true })).toBe('selecao');
  });

  it('Alt com Alinhar ou Mover ativo é o clique da ferramenta, como antes', () => {
    expect(gestoDoBotaoNaPrancha({ ...base, alt: true, sobreVista: true, ferramenta: true })).toBe('ferramenta');
  });
});

describe('gesto do botão na prancha: sem tecla', () => {
  it('clique esquerdo comum segue para a seleção, o movimento e as alças', () => {
    expect(gestoDoBotaoNaPrancha(base)).toBe('selecao');
    expect(gestoDoBotaoNaPrancha({ ...base, sobreVista: true })).toBe('selecao');
  });

  it('com Alinhar ou Mover ativo, o clique esquerdo é da ferramenta', () => {
    expect(gestoDoBotaoNaPrancha({ ...base, ferramenta: true, sobreVista: true })).toBe('ferramenta');
  });

  it('botão direito não tem gesto na prancha', () => {
    expect(gestoDoBotaoNaPrancha({ ...base, botao: 2, espaco: true, sobreVista: true })).toBe('nada');
    expect(gestoDoBotaoNaPrancha({ ...base, botao: 2 })).toBe('nada');
  });
});
