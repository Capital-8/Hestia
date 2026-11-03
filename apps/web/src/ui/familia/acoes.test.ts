import { FAMILIA_ARMARIO, type Parametro } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { agruparParametros, controlesDeFlex, lerEntrada, rotuloDoValor, valorEfetivo } from './acoes.ts';

const f = FAMILIA_ARMARIO;
const p = (id: string): Parametro => f.parametros.find((x) => x.id === id)!;

describe('controlesDeFlex', () => {
  it('só parâmetros sem fórmula, na ordem, com o controle certo', () => {
    const c = controlesDeFlex(f);
    expect(c.map((x) => x.param.id)).toEqual(['L', 'A', 'P', 'corpo', 'montagem', 'fundo', 'tampo', 'nPrat', 'nPortas', 'rodape']);
    const por = Object.fromEntries(c.map((x) => [x.param.id, x.controle]));
    expect(por).toMatchObject({ L: 'slider', A: 'slider', P: 'slider', corpo: 'select', montagem: 'select', fundo: 'select', tampo: 'select', nPrat: 'slider', nPortas: 'slider', rodape: 'slider' });
  });
  it('sem faixa vira número; booleano vira check; texto e material viram texto; select sem opções vira texto', () => {
    const g = structuredClone(f);
    g.parametros = [
      { id: 'a', nome: 'a', tipo: 'comprimento', escopo: 'tipo', padrao: 1 },
      { id: 'b', nome: 'b', tipo: 'inteiro', escopo: 'tipo', padrao: 1, min: 5, max: 5 },
      { id: 'c', nome: 'c', tipo: 'booleano', escopo: 'tipo', padrao: true },
      { id: 'd', nome: 'd', tipo: 'texto', escopo: 'tipo', padrao: 'x' },
      { id: 'e', nome: 'e', tipo: 'material', escopo: 'tipo', padrao: 'm' },
      { id: 'f', nome: 'f', tipo: 'enum', escopo: 'tipo', padrao: 'x' },
      { id: 'g', nome: 'g', tipo: 'numero', escopo: 'tipo', padrao: 0, formula: 'a + 1' },
    ];
    expect(controlesDeFlex(g).map((x) => `${x.param.id}:${x.controle}`)).toEqual(['a:numero', 'b:numero', 'c:check', 'd:texto', 'e:texto', 'f:texto']);
  });
});

describe('valorEfetivo', () => {
  it('prioridade: flex, tipo, padrão; tipo nulo ou inexistente é ignorado', () => {
    expect(valorEfetivo(f, 'A60', {}, p('L'))).toBe(600);
    expect(valorEfetivo(f, 'A60', { L: 700 }, p('L'))).toBe(700);
    expect(valorEfetivo(f, null, {}, p('L'))).toBe(800);
    expect(valorEfetivo(f, 'xx', {}, p('L'))).toBe(800);
    expect(valorEfetivo(f, 'A60', {}, p('A'))).toBe(720);
    expect(valorEfetivo(f, 'A120', {}, p('corpo'))).toBe('mdf25');
  });
});

describe('agruparParametros', () => {
  it('por grupo, na ordem da primeira aparição; sem grupo vai para Geral', () => {
    const g = agruparParametros(f.parametros);
    expect(g.map((x) => x.grupo)).toEqual(['Dimensões', 'Material', 'Construção', 'Derivados']);
    expect(g[0]!.params.map((x) => x.id)).toEqual(['L', 'A', 'P', 'rodape']);
    expect(g[2]!.params.map((x) => x.id)).toEqual(['montagem', 'fundo', 'tampo', 'nPrat', 'nPortas']);
    expect(agruparParametros([{ id: 'z', nome: 'z', tipo: 'numero', escopo: 'tipo', padrao: 0 }])).toEqual([{ grupo: 'Geral', params: [{ id: 'z', nome: 'z', tipo: 'numero', escopo: 'tipo', padrao: 0 }] }]);
    expect(agruparParametros([])).toEqual([]);
  });
});

describe('rotuloDoValor e lerEntrada', () => {
  it('rótulo da opção ou o valor', () => {
    expect(rotuloDoValor(p('corpo'), 'mdf18')).toBe('MDF 18 mm');
    expect(rotuloDoValor(p('fundo'), 'pregado')).toBe('Pregado');
    expect(rotuloDoValor(p('fundo'), 'outro')).toBe('outro');
    expect(rotuloDoValor(p('L'), 800)).toBe('800');
  });
  it('lê número, inteiro, opção e booleano; recusa o que não serve', () => {
    expect(lerEntrada(p('L'), '650')).toBe(650);
    expect(lerEntrada(p('L'), ' 650,5 ')).toBe(650.5);
    expect(lerEntrada(p('L'), '650.5')).toBe(650.5);
    expect(lerEntrada(p('L'), 'abc')).toBeNull();
    expect(lerEntrada(p('L'), '')).toBeNull();
    expect(lerEntrada(p('L'), '99999')).toBeNull();
    expect(lerEntrada(p('L'), '10')).toBeNull();
    expect(lerEntrada(p('nPrat'), '3')).toBe(3);
    expect(lerEntrada(p('nPrat'), '2,5')).toBeNull();
    expect(lerEntrada(p('fundo'), 'pregado')).toBe('pregado');
    expect(lerEntrada(p('fundo'), 'xyz')).toBeNull();
    expect(lerEntrada(p('corpo'), 'mdf15')).toBe('mdf15');
    expect(lerEntrada({ id: 'b', nome: 'b', tipo: 'booleano', escopo: 'tipo', padrao: true }, 'true')).toBe(true);
    expect(lerEntrada({ id: 'b', nome: 'b', tipo: 'booleano', escopo: 'tipo', padrao: true }, 'não')).toBeNull();
    expect(lerEntrada({ id: 't', nome: 't', tipo: 'texto', escopo: 'tipo', padrao: '' }, ' olá ')).toBe('olá');
  });
});
