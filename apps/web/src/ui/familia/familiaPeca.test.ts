import { FAMILIA_ARMARIO, type Familia } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { espessuraPadrao, idAdicionado, idPadraoDeNome, medidasPadrao, normalizarIdPeca, pecaNova, rotuloDoPapel } from './familiaPeca.ts';

const familia = (): Familia => structuredClone(FAMILIA_ARMARIO);

describe('normalizarIdPeca e idPadraoDeNome', () => {
  it('tira acento, troca o que não é letra/dígito por _ e prefixa quando começa com número', () => {
    expect(normalizarIdPeca('Divisória central')).toBe('divisoria_central');
    expect(normalizarIdPeca('  Porta  de  Correr  ')).toBe('porta_de_correr');
    expect(normalizarIdPeca('2 portas')).toBe('p_2_portas');
    expect(normalizarIdPeca('!!!')).toBe('peca');
  });

  it('sufixa _2, _3… até achar um id livre', () => {
    expect(idPadraoDeNome('Divisória', ['base', 'latE'])).toBe('divisoria');
    expect(idPadraoDeNome('Divisória', ['divisoria'])).toBe('divisoria_2');
    expect(idPadraoDeNome('Divisória', ['divisoria', 'divisoria_2'])).toBe('divisoria_3');
  });
});

describe('idAdicionado', () => {
  it('devolve só o id que apareceu depois e null quando nada foi criado', () => {
    expect(idAdicionado(['a', 'b'], ['a', 'b', 'c'])).toBe('c');
    expect(idAdicionado(['a', 'b'], ['a', 'b'])).toBeNull();
    expect(idAdicionado(['a', 'b'], ['b', 'a', 'd'])).toBe('d');
  });
});

describe('padrões da peça nova', () => {
  it('medidas por eixo, como a convenção de Peca.tamanho', () => {
    expect(medidasPadrao('x')).toEqual({ a: 'P', b: 'A' });
    expect(medidasPadrao('y')).toEqual({ a: 'L', b: 'A' });
    expect(medidasPadrao('z')).toEqual({ a: 'L', b: 'P' });
  });

  it('espessura usa o parâmetro esp quando existe; senão 18', () => {
    expect(espessuraPadrao(familia())).toBe('esp');
    const semEsp = familia();
    semEsp.parametros = semEsp.parametros.filter((p) => p.id !== 'esp');
    expect(espessuraPadrao(semEsp)).toBe('18');
  });

  it('pecaNova junta papel, nome, id, eixo e origens zeradas', () => {
    const p = pecaNova(familia(), 'lateral', 'x', 'Lateral', 'lateral_2');
    expect(p).toMatchObject({
      id: 'lateral_2',
      nome: 'Lateral',
      papel: 'lateral',
      eixo: 'x',
      origem: ['0', '0', '0'],
      tamanho: ['P', 'A'],
      espessura: 'esp',
    });
  });

  it('rótulo do papel em português', () => {
    expect(rotuloDoPapel('frente_gaveta')).toBe('Frente de gaveta');
    expect(rotuloDoPapel('divisoria')).toBe('Divisória');
  });
});
