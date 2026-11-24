import { FAMILIA_ARMARIO, type Component, type Familia, type Ligacao } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { avaliarDerivacao, avaliarEncontro, conexaoParaDerivacao, conexaoParaEncontro, CONEXOES_POR_DOMINIO, idTuboDoProjeto, posicionarConexao, type ConexaoEncontro, type TrechoEncontro } from './conexoesAutomaticas.ts';
import { ligacaoNoMundo } from './ligacoesEncaixe.ts';
import { resolverFamilia } from './resolver.ts';

const regras = CONEXOES_POR_DOMINIO.esgoto!;

const lig = (id: string, direcao: [string, string, string], diametro = 'DN'): Ligacao => ({ id, nome: id, dominio: 'esgoto', secao: 'redonda', posicao: ['0', '0', '0'], direcao, diametro, fluxo: 'ambos' });

/** Fixture: conexão sem corpo, só com ligações (posição na origem) e os parâmetros DN e DN2. */
function conexao(id: string, ligacoes: Ligacao[]): Familia {
  return {
    ...structuredClone(FAMILIA_ARMARIO),
    id,
    nome: id,
    pecas: [], ferragens: [], conectores: [], planos: [], escolhas: [], tipos: [], tipoPadrao: undefined, corpos: [],
    parametros: [
      ...FAMILIA_ARMARIO.parametros.filter((q) => ['L', 'A', 'P'].includes(q.id)),
      { id: 'DN', nome: 'DN', tipo: 'comprimento', escopo: 'instancia', padrao: 50 },
      { id: 'DN2', nome: 'DN2', tipo: 'comprimento', escopo: 'instancia', padrao: 50 },
    ],
    ligacoes,
  };
}

const CURVA90 = conexao('c90', [lig('a', ['1', '0', '0']), lig('b', ['0', '1', '0'])]);
// Curva 45: as duas bocas formam 135° entre si.
const CURVA45 = conexao('c45', [lig('a', ['1', '0', '0']), lig('b', ['-0.7071067811865476', '0.7071067811865476', '0'])]);
const LUVA = conexao('luva', [lig('a', ['0', '0', '1']), lig('b', ['0', '0', '-1'])]);
const REDUCAO = conexao('red', [lig('g', ['0', '0', '1'], 'DN'), lig('p', ['0', '0', '-1'], 'DN2')]);
const TE = conexao('te', [lig('p1', ['-1', '0', '0']), lig('p2', ['1', '0', '0']), lig('r', ['0', '1', '0'], 'DN2')]);
const JUNCAO = conexao('j45', [lig('p1', ['-1', '0', '0']), lig('p2', ['1', '0', '0']), lig('r', ['0.7071067811865476', '0.7071067811865476', '0'], 'DN2')]);

const tr = (a: [number, number, number], b: [number, number, number], dn = 50): TrechoEncontro => ({ a, b, dn });

/** Confere que a instância posicionada deixa cada ligação apontando para a direção pedida, no mundo. */
function confere(f: Familia, ponto: [number, number, number], c: ConexaoEncontro): void {
  const pos = posicionarConexao(f, ponto, c);
  expect(pos).not.toBeNull();
  const inst = { id: 'x', kind: 'component', familyId: f.id, typeId: null, levelId: 'l', x: pos!.x, y: pos!.y, z: pos!.z, rotation: pos!.rotation, inclinacao: pos!.inclinacao, mirrored: false, values: pos!.values, mark: '', order: 0 } as Component;
  const resolvidas = resolverFamilia(f, { valores: { ...pos!.values, L: 1000 } }).ligacoes ?? [];
  c.direcoes.forEach((d, k) => {
    const l = resolvidas.find((x) => x.id === pos!.ligacoes[k])!;
    const m = ligacaoNoMundo(l, inst);
    for (let i = 0; i < 3; i++) expect(m.direcaoMundo[i]!).toBeCloseTo(d[i]!, 9);
  });
}

describe('conexaoParaEncontro', () => {
  it('colinear com o mesmo DN: luva', () => {
    const c = conexaoParaEncontro(tr([0, 0, 0], [1, 0, 0]), 'b', tr([1, 0, 0], [3, 0, 0]), 'a', regras);
    expect(c?.tipo).toBe('luva');
    expect(c?.familiaId).toBe(regras.luva);
  });

  it('90°: curva 90°, em qualquer plano', () => {
    expect(conexaoParaEncontro(tr([0, 0, 0], [1, 0, 0]), 'b', tr([1, 0, 0], [1, 2, 0]), 'a', regras)?.tipo).toBe('curva90');
    expect(conexaoParaEncontro(tr([0, 0, 0], [1, 0, 0]), 'b', tr([1, 0, 0], [1, 0, -2]), 'a', regras)?.tipo).toBe('curva90');
  });

  it('45° de desvio: curva 45°', () => {
    const c = conexaoParaEncontro(tr([0, 0, 0], [1, 0, 0]), 'b', tr([1, 0, 0], [2, 1, 0]), 'a', regras);
    expect(c?.tipo).toBe('curva45');
    expect(c?.familiaId).toBe(regras.curva45);
  });

  it('DN diferente em linha reta: redução; em curva: sem conexão e com aviso', () => {
    expect(conexaoParaEncontro(tr([0, 0, 0], [1, 0, 0], 100), 'b', tr([1, 0, 0], [3, 0, 0], 50), 'a', regras)?.tipo).toBe('reducao');
    const r = avaliarEncontro(tr([0, 0, 0], [1, 0, 0], 100), 'b', tr([1, 0, 0], [1, 2, 0], 50), 'a', regras);
    expect(r.conexao).toBeNull();
    expect(r.aviso).toMatch(/bitolas diferentes/);
  });

  it('outros ângulos: null com aviso', () => {
    const r = avaliarEncontro(tr([0, 0, 0], [1, 0, 0]), 'b', tr([1, 0, 0], [2, 2, 0]), 'a', regras);
    expect(r.conexao).toBeNull();
    expect(r.aviso).toMatch(/sem conexão automática/);
  });

  it('as pontas valem nos dois sentidos (ponta a do primeiro trecho)', () => {
    expect(conexaoParaEncontro(tr([1, 0, 0], [3, 0, 0]), 'a', tr([1, 0, 0], [1, 2, 0]), 'a', regras)?.tipo).toBe('curva90');
  });
});

describe('conexaoParaDerivacao', () => {
  it('ramal a 90° no meio do principal: tê', () => {
    const c = conexaoParaDerivacao(tr([0, 0, 0], [4, 0, 0]), [2, 0, 0], tr([2, 0, 0], [2, 3, 0]), 'a', regras);
    expect(c?.tipo).toBe('te');
    expect(c?.familiaId).toBe(regras.te);
  });

  it('ramal a 45°: junção 45°; a 60°: null com aviso', () => {
    expect(conexaoParaDerivacao(tr([0, 0, 0], [4, 0, 0]), [2, 0, 0], tr([2, 0, 0], [3, 1, 0]), 'a', regras)?.tipo).toBe('juncao45');
    const r = avaliarDerivacao(tr([0, 0, 0], [4, 0, 0]), [2, 0, 0], tr([2, 0, 0], [2.5, 0.866, 0]), 'a', regras);
    expect(r.conexao).toBeNull();
    expect(r.aviso).not.toBeNull();
  });
});

describe('posicionarConexao', () => {
  it('curva 90°, curva 45° e luva alinham as bocas às direções dos trechos', () => {
    confere(CURVA90, [1, 0, 0], conexaoParaEncontro(tr([0, 0, 0], [1, 0, 0]), 'b', tr([1, 0, 0], [1, 2, 0]), 'a', regras)!);
    confere(CURVA90, [1, 0, 0.5], conexaoParaEncontro(tr([0, 0, 0.5], [1, 0, 0.5]), 'b', tr([1, 0, 0.5], [1, 0, 3]), 'a', regras)!);
    confere(CURVA45, [1, 0, 0], conexaoParaEncontro(tr([0, 0, 0], [1, 0, 0]), 'b', tr([1, 0, 0], [2, 1, 0]), 'a', regras)!);
    confere(LUVA, [1, 0, 0], conexaoParaEncontro(tr([0, 0, 0], [1, 0, 0]), 'b', tr([1, 0, 0], [3, 0, 0]), 'a', regras)!);
  });

  it('redução casa a boca maior com o trecho de maior DN', () => {
    const c = conexaoParaEncontro(tr([0, 0, 0], [1, 0, 0], 50), 'b', tr([1, 0, 0], [3, 0, 0], 100), 'a', regras)!;
    confere(REDUCAO, [1, 0, 0], c);
    const pos = posicionarConexao(REDUCAO, [1, 0, 0], c)!;
    expect(pos.values).toEqual({ DN: 100, DN2: 50 });
    expect(pos.ligacoes).toEqual(['p', 'g']);
  });

  it('tê e junção 45° alinham as três bocas', () => {
    confere(TE, [2, 0, 0], conexaoParaDerivacao(tr([0, 0, 0], [4, 0, 0]), [2, 0, 0], tr([2, 0, 0], [2, 3, 0]), 'a', regras)!);
    confere(TE, [2, 0, 1], conexaoParaDerivacao(tr([0, 0, 1], [4, 0, 1]), [2, 0, 1], tr([2, 0, 1], [2, -3, 1]), 'a', regras)!);
    confere(JUNCAO, [2, 0, 0], conexaoParaDerivacao(tr([0, 0, 0], [4, 0, 0]), [2, 0, 0], tr([2, 0, 0], [3, 1, 0]), 'a', regras)!);
  });

  it('família sem as ligações necessárias devolve null', () => {
    const c = conexaoParaEncontro(tr([0, 0, 0], [1, 0, 0]), 'b', tr([1, 0, 0], [1, 2, 0]), 'a', regras)!;
    expect(posicionarConexao(LUVA, [1, 0, 0], c)).toBeNull();
  });
});

describe('idTuboDoProjeto', () => {
  it('acha o tubo real do domínio ou devolve undefined', () => {
    expect(idTuboDoProjeto({ [regras.tubo]: {} })).toBe(regras.tubo);
    expect(idTuboDoProjeto({ outro: {} })).toBeUndefined();
    expect(idTuboDoProjeto(undefined)).toBeUndefined();
  });
});
