import { describe, expect, it } from 'vitest';
import { applyCommand as aplicarNoLugar, type Command } from './commands.ts';
import { componentCommandLabel } from './componentCommands.ts';
import { createEmptyProject } from './defaults.ts';
import { FAMILIA_ARMARIO } from './familia/exemplos.ts';
import type { Familia, Parametro } from './familia/tipos.ts';
import type { Ligacao } from './familia/tiposLigacao.ts';
import { ProjectStore } from './history.ts';
import type { Component, Project } from './types.ts';
import { validateProject } from './validate.ts';

const applyCommand = (p: Project, c: Command): Project => {
  const q = structuredClone(p);
  aplicarNoLugar(q, c);
  return q;
};

const lig = (id: string, extra: Partial<Ligacao> = {}): Ligacao => ({
  id,
  nome: id,
  dominio: 'esgoto',
  secao: 'redonda',
  posicao: ['0', '0', '0'],
  direcao: ['0', '0', '1'],
  diametro: '50',
  fluxo: 'ambos',
  ...extra,
});

const diam: Parametro = { id: 'DN', nome: 'Diâmetro', tipo: 'comprimento', escopo: 'instancia', padrao: 50 };

/** Peça de três pontas; a ponta `a` propaga `DN`. */
const FAMILIA_TUBO: Familia = {
  ...structuredClone(FAMILIA_ARMARIO),
  id: 'tubo',
  parametros: [...FAMILIA_ARMARIO.parametros, diam],
  ligacoes: [lig('a', { diametro: 'DN', propagaParametro: 'DN' }), lig('b', { diametro: 'DN' }), lig('c', { diametro: 'DN' })],
};

const FAMILIA_AGUA: Familia = { ...structuredClone(FAMILIA_TUBO), id: 'agua', ligacoes: [lig('a', { dominio: 'agua_fria', diametro: 'DN' })] };

const comp = (id: string, familyId = 'tubo'): Omit<Component, 'order'> => ({
  id,
  kind: 'component',
  familyId,
  typeId: null,
  levelId: 'lv_0',
  x: 0,
  y: 0,
  z: 0,
  rotation: 0,
  mirrored: false,
  mark: id,
});

const base = (ids: string[] = ['t1', 't2', 't3']): Project => {
  let p = createEmptyProject('t');
  p = applyCommand(p, { type: 'upsertFamily', family: structuredClone(FAMILIA_TUBO) });
  p = applyCommand(p, { type: 'upsertFamily', family: structuredClone(FAMILIA_AGUA) });
  for (const id of ids) p = applyCommand(p, { type: 'addComponent', component: comp(id) });
  return p;
};

const liga = (p: Project, a: string, la: string, b: string, lb: string): Project =>
  applyCommand(p, { type: 'connectComponents', a, ligacaoA: la, b, ligacaoB: lb });
const c = (p: Project, id: string): Component => p.elements[id] as Component;
const achados = (p: Project) => validateProject(p).filter((i) => i.code === 'mep-conexao');

describe('connectComponents', () => {
  it('grava os dois lados e cria o sistema do domínio', () => {
    const p = liga(base(), 't1', 'b', 't2', 'a');
    const s = c(p, 't1').ligacoes?.b?.sistemaId;
    expect(s).toBeDefined();
    expect(c(p, 't1').ligacoes?.b).toEqual({ componenteId: 't2', ligacaoId: 'a', sistemaId: s });
    expect(c(p, 't2').ligacoes?.a).toEqual({ componenteId: 't1', ligacaoId: 'b', sistemaId: s });
    expect(p.sistemasMep?.[s ?? '']?.dominio).toBe('esgoto');
    expect(achados(p)).toEqual([]);
  });

  it('desfaz, refaz e tem rótulo', () => {
    const s = new ProjectStore(base());
    const antes = s.project;
    s.exec({ type: 'connectComponents', a: 't1', ligacaoA: 'b', b: 't2', ligacaoB: 'a' });
    expect(c(s.project, 't2').ligacoes?.a?.componenteId).toBe('t1');
    s.undo();
    expect(s.project).toEqual(antes);
    s.redo();
    expect(c(s.project, 't1').ligacoes?.b?.componenteId).toBe('t2');
    expect(componentCommandLabel({ type: 'connectComponents', a: 'x', ligacaoA: 'a', b: 'y', ligacaoB: 'a' })).toBe('Conectar ligações');
  });

  it('funde sistemas diferentes: o da instância arrastada vira o do alvo', () => {
    let p = base(['t1', 't2', 't3', 't4']);
    p = liga(p, 't1', 'b', 't2', 'a');
    p = liga(p, 't3', 'b', 't4', 'a');
    const s34 = c(p, 't3').ligacoes?.b?.sistemaId;
    expect(c(p, 't1').ligacoes?.b?.sistemaId).not.toBe(s34);
    p = liga(p, 't2', 'b', 't3', 'a'); // t2 (arrastado) vai ao alvo t3
    for (const [id, l] of [['t1', 'b'], ['t2', 'a'], ['t2', 'b'], ['t3', 'a'], ['t3', 'b'], ['t4', 'a']] as const) {
      expect(c(p, id).ligacoes?.[l]?.sistemaId).toBe(s34);
    }
    expect(Object.keys(p.sistemasMep ?? {})).toEqual([s34]);
    expect(achados(p)).toEqual([]);
  });

  it('recusa ligação já conectada, inexistente, a si mesmo e fusão de domínios diferentes', () => {
    let p = liga(base(), 't1', 'b', 't2', 'a');
    expect(() => liga(p, 't1', 'b', 't3', 'a')).toThrow(/já está conectada/);
    expect(() => liga(p, 't3', 'zzz', 't1', 'c')).toThrow(/não existe na família/);
    expect(() => liga(p, 't3', 'a', 't3', 'b')).toThrow(/a si mesmo/);
    p = applyCommand(p, { type: 'addComponent', component: comp('w1', 'agua') });
    p = applyCommand(p, { type: 'addComponent', component: comp('t9') });
    p = liga(p, 'w1', 'a', 't9', 'a'); // sistema de água fria
    // t2 (sistema de esgoto) com t9 (água fria): domínios diferentes
    expect(() => liga(p, 't2', 'b', 't9', 'b')).toThrow(/domínios diferentes/);
  });

  it('propaga a bitola da ponta conectada (mm, inteiro) nas duas direções', () => {
    let p = base();
    p = applyCommand(p, { type: 'updateComponent', id: 't2', patch: { values: { DN: 75.4 } } });
    p = liga(p, 't1', 'a', 't2', 'b'); // t1.a propaga DN; t2.b é redonda de 75,4 mm
    expect(c(p, 't1').values?.DN).toBe(75);
    expect(c(p, 't2').values?.DN).toBe(75.4); // t2.b não propaga
    p = applyCommand(p, { type: 'updateComponent', id: 't3', patch: { values: { DN: 110 } } });
    p = liga(p, 't2', 'a', 't3', 'b'); // t2.a propaga: recebe 110
    expect(c(p, 't2').values?.DN).toBe(110);
  });

  it('a propagação desfaz junto com a conexão', () => {
    const s = new ProjectStore(applyCommand(base(), { type: 'updateComponent', id: 't2', patch: { values: { DN: 90 } } }));
    s.exec({ type: 'connectComponents', a: 't1', ligacaoA: 'a', b: 't2', ligacaoB: 'b' });
    expect(c(s.project, 't1').values?.DN).toBe(90);
    s.undo();
    expect(c(s.project, 't1').values?.DN).toBeUndefined();
    expect(c(s.project, 't1').ligacoes).toBeUndefined();
  });
});

describe('disconnectComponents e renameMepSystem', () => {
  it('apaga os dois lados e o sistema vazio, com desfazer', () => {
    const s = new ProjectStore(liga(base(), 't1', 'b', 't2', 'a'));
    s.exec({ type: 'disconnectComponents', a: 't2', ligacaoA: 'a' });
    expect(c(s.project, 't1').ligacoes).toBeUndefined();
    expect(c(s.project, 't2').ligacoes).toBeUndefined();
    expect(s.project.sistemasMep).toEqual({});
    s.undo();
    expect(c(s.project, 't1').ligacoes?.b?.componenteId).toBe('t2');
    expect(() => applyCommand(s.project, { type: 'disconnectComponents', a: 't3', ligacaoA: 'a' })).toThrow(/não está conectada/);
  });

  it('renomeia o sistema e recusa nome vazio ou id inexistente', () => {
    const p = liga(base(), 't1', 'b', 't2', 'a');
    const id = c(p, 't1').ligacoes?.b?.sistemaId ?? '';
    const q = applyCommand(p, { type: 'renameMepSystem', id, nome: '  Esgoto primário ' });
    expect(q.sistemasMep?.[id]?.nome).toBe('Esgoto primário');
    expect(() => applyCommand(p, { type: 'renameMepSystem', id, nome: ' ' })).toThrow();
    expect(() => applyCommand(p, { type: 'renameMepSystem', id: 'nada', nome: 'x' })).toThrow(/inexistente/);
  });
});

describe('excluir, copiar, mover e projeto corrompido', () => {
  it('excluir no meio da rede desconecta as vizinhas num só passo de desfazer', () => {
    let p = base();
    p = liga(p, 't1', 'b', 't2', 'a');
    p = liga(p, 't2', 'b', 't3', 'a');
    const s = new ProjectStore(p);
    s.exec({ type: 'deleteElements', ids: ['t2'] });
    expect(c(s.project, 't1').ligacoes).toBeUndefined();
    expect(c(s.project, 't3').ligacoes).toBeUndefined();
    expect(s.project.sistemasMep).toEqual({});
    expect(achados(s.project)).toEqual([]);
    s.undo();
    expect(s.project).toEqual(p);
  });

  it('copiar não leva as ligações; mover mantém a conexão', () => {
    const p = liga(base(), 't1', 'b', 't2', 'a');
    const copiado = applyCommand(p, {
      type: 'transform',
      ids: ['t1'],
      transform: { kind: 'translate', d: { x: 1, y: 0 } },
      copy: { idMap: { t1: 't7' } },
    });
    expect(c(copiado, 't7')).toBeDefined();
    expect(c(copiado, 't7').ligacoes).toBeUndefined();
    expect(c(copiado, 't1').ligacoes?.b?.componenteId).toBe('t2');
    const movido = applyCommand(p, { type: 'updateComponent', id: 't1', patch: { x: 5 } });
    expect(c(movido, 't1').ligacoes?.b?.componenteId).toBe('t2');
    expect(achados(movido)).toEqual([]);
  });

  it('recusa conexão sem reciprocidade, a instância ou ligação inexistente', () => {
    const p = base();
    const ligar = (cx: { componenteId: string; ligacaoId: string }) =>
      applyCommand(p, { type: 'updateComponent', id: 't1', patch: { ligacoes: { b: cx } } });
    expect(() => ligar({ componenteId: 't2', ligacaoId: 'a' })).toThrow(/recíproca/);
    expect(() => ligar({ componenteId: 'fantasma', ligacaoId: 'a' })).toThrow(/não existe/);
    expect(() => ligar({ componenteId: 't2', ligacaoId: 'zzz' })).toThrow(/não existe/);
  });

  it('a verificação do modelo aponta projeto corrompido', () => {
    const ruim = structuredClone(liga(base(), 't1', 'b', 't2', 'a'));
    delete (ruim.elements.t2 as Component).ligacoes;
    expect(achados(ruim).map((i) => i.elementId)).toEqual(['t1']);
  });
});
