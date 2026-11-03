import { FAMILIA_ARMARIO, type Familia } from '@hestia/model';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolucaoCorrente, useFamilia } from './familiaStore.ts';

const clone = (): Familia => structuredClone(FAMILIA_ARMARIO);
const estado = () => useFamilia.getState();

beforeEach(() => { estado().novaFamilia(clone()); estado().ocultar(); });

describe('estado inicial e abertura', () => {
  it('abre com o armário, tipo padrão, sem valores de flex e sem seleção', () => {
    const s = estado();
    expect(s.familia()).toEqual(FAMILIA_ARMARIO);
    expect(s.tipoId).toBe('A80');
    expect(s.valores).toEqual({});
    expect(s.sel).toBeNull();
    expect(s.aberta).toBe(false);
    s.abrir();
    expect(estado().aberta).toBe(true);
    estado().ocultar();
    expect(estado().aberta).toBe(false);
    expect(estado().familia()).toEqual(FAMILIA_ARMARIO);
  });
  it('valores padrão da interface', () => {
    const s = estado();
    expect([s.vista, s.explodir, s.portas, s.detalhe, s.opacidade, s.dialogo, s.ferramenta]).toEqual(['3d', 0, true, 'fino', 1, null, null]);
    expect(s.corte).toEqual({ ativo: false, eixo: 'y', posicao: 0.3 });
  });
});

describe('executar, desfazer e refazer', () => {
  it('um passo por chamada, com rótulos, versão e desfazer/refazer', () => {
    const v0 = estado().versao;
    expect(estado().executar('Renomear', (f) => { f.nome = 'Outro'; return null; })).toBeNull();
    expect(estado().familia().nome).toBe('Outro');
    expect(estado().versao).toBeGreaterThan(v0);
    expect(estado().historico.rotuloDesfazer).toBe('Renomear');
    expect(estado().desfazer()).toBe(true);
    expect(estado().familia().nome).toBe('Armário baixo');
    expect(estado().historico.rotuloRefazer).toBe('Renomear');
    expect(estado().refazer()).toBe(true);
    expect(estado().familia().nome).toBe('Outro');
    expect(estado().desfazer()).toBe(true);
    expect(estado().desfazer()).toBe(false);
  });
  it('erro devolvido pela receita desfaz tudo e volta o motivo', () => {
    const v0 = estado().versao;
    const r = estado().executar('Falha', (f) => { f.nome = 'meio'; return 'não pode'; });
    expect(r).toBe('não pode');
    expect(estado().familia().nome).toBe('Armário baixo');
    expect(estado().versao).toBe(v0);
    expect(estado().historico.podeDesfazer).toBe(false);
  });
  it('exceção da receita propaga e não deixa rastro', () => {
    expect(() => estado().executar('Boom', () => { throw new Error('boom'); })).toThrow('boom');
    expect(estado().historico.podeDesfazer).toBe(false);
  });
  it('agrupar junta vários executar num passo', () => {
    estado().agrupar('Dois', () => {
      estado().executar('a', (f) => { f.nome = 'A'; return null; });
      estado().executar('b', (f) => { f.descricao = 'B'; return null; });
    });
    expect(estado().historico.rotuloDesfazer).toBe('Dois');
    estado().desfazer();
    expect(estado().familia()).toEqual(FAMILIA_ARMARIO);
  });
  it('a interface é avisada a cada mudança (zustand)', () => {
    const ouvinte = vi.fn();
    const cancela = useFamilia.subscribe(ouvinte);
    estado().executar('x', (f) => { f.nome = 'X'; return null; });
    estado().desfazer();
    expect(ouvinte.mock.calls.length).toBeGreaterThanOrEqual(2);
    cancela();
  });
});

describe('flex, tipo e seleção', () => {
  it('setValor e limparValor mexem só no flex, fora do histórico', () => {
    estado().setValor('L', 1000);
    expect(estado().valores).toEqual({ L: 1000 });
    expect(estado().historico.podeDesfazer).toBe(false);
    expect(estado().familia()).toEqual(FAMILIA_ARMARIO);
    estado().limparValor('L');
    expect(estado().valores).toEqual({});
  });
  it('escolherTipo troca o tipo e zera o flex; tipo inexistente é ignorado', () => {
    estado().setValor('L', 1000);
    estado().escolherTipo('A60');
    expect(estado().tipoId).toBe('A60');
    expect(estado().valores).toEqual({});
    estado().escolherTipo('nao_existe');
    expect(estado().tipoId).toBe('A60');
  });
  it('selecionarPeca guarda o id e aceita null', () => {
    estado().selecionarPeca('latE');
    expect(estado().sel).toBe('latE');
    estado().selecionarPeca(null);
    expect(estado().sel).toBeNull();
  });
  it('excluir a peça selecionada pelo histórico não deixa seleção fantasma ao desfazer e refazer', () => {
    estado().selecionarPeca('latE');
    estado().executar('Excluir', (f) => { f.pecas = f.pecas.filter((p) => p.id !== 'latE'); return null; });
    expect(estado().sel).toBeNull();
    estado().desfazer();
    expect(estado().familia().pecas.some((p) => p.id === 'latE')).toBe(true);
  });
});

describe('novaFamilia e resolução corrente', () => {
  it('novaFamilia troca o documento, zera histórico, flex e seleção', () => {
    estado().executar('x', (f) => { f.nome = 'X'; return null; });
    estado().setValor('L', 900);
    estado().selecionarPeca('base');
    const outra = clone();
    outra.id = 'outra';
    outra.nome = 'Outra';
    outra.tipoPadrao = 'A60';
    estado().novaFamilia(outra);
    expect(estado().familia().id).toBe('outra');
    expect(estado().tipoId).toBe('A60');
    expect(estado().valores).toEqual({});
    expect(estado().sel).toBeNull();
    expect(estado().historico.podeDesfazer).toBe(false);
  });
  it('novaFamilia sem tipoPadrao usa o primeiro tipo; sem tipos, null', () => {
    const f = clone();
    delete f.tipoPadrao;
    estado().novaFamilia(f);
    expect(estado().tipoId).toBe('A60');
    const g = clone();
    g.tipos = [];
    delete g.tipoPadrao;
    estado().novaFamilia(g);
    expect(estado().tipoId).toBeNull();
  });
  it('resolucaoCorrente resolve com tipo e flex e é memoizada por versão, tipo e valores', () => {
    const a = resolucaoCorrente();
    expect(a.erros).toEqual([]);
    expect(a.pecas).toHaveLength(11);
    expect(resolucaoCorrente()).toBe(a);
    estado().setValor('L', 1000);
    const b = resolucaoCorrente();
    expect(b).not.toBe(a);
    expect(b.env.L).toBe(1000);
    estado().escolherTipo('A60');
    expect(resolucaoCorrente().env.L).toBe(600);
    estado().executar('mexe', (f) => { f.pecas = f.pecas.filter((p) => p.id !== 'tampo'); return null; });
    expect(resolucaoCorrente().pecas.some((p) => p.id === 'tampo')).toBe(false);
  });
});
