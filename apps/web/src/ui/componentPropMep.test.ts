import { describe, expect, it } from 'vitest';
import { createEmptyProject, FAMILIA_ARMARIO, ProjectStore, type Component, type Familia, type Ligacao, type Project } from '@hestia/model';
import {
  aplicarInclinacao,
  desconectarLigacao,
  grausDeRadianos,
  linhasDeLigacao,
  radianosDeGraus,
  renomearSistema,
  sistemaDaLinhas,
} from './componentPropMep.ts';

const lig = (id: string): Ligacao => ({
  id,
  nome: `Ponta ${id.toUpperCase()}`,
  dominio: 'agua_fria',
  secao: 'redonda',
  posicao: ['0', '0', '0'],
  direcao: ['0', '0', '1'],
  diametro: '50',
  fluxo: 'ambos',
});

const FAMILIA_TUBO: Familia = { ...structuredClone(FAMILIA_ARMARIO), id: 'tubo', nome: 'Tubo', ligacoes: [lig('a'), lig('b')] };

const componente = (id: string): Component => ({
  id,
  kind: 'component',
  familyId: 'tubo',
  typeId: null,
  levelId: 'lv_0',
  order: 0,
  x: 0,
  y: 0,
  z: 0,
  rotation: 0,
  mirrored: false,
  mark: '',
});

const projeto = (...componentes: Component[]): Project => {
  const p = createEmptyProject('t');
  p.componentFamilies = { tubo: structuredClone(FAMILIA_TUBO) };
  for (const c of componentes) p.elements[c.id] = c;
  p.nextOrder = componentes.length + 1;
  return p;
};

/** Dois tubos ligados pela ponta `b` do primeiro à ponta `a` do segundo (via comando, como a interface faz). */
const doisTubosLigados = (): ProjectStore => {
  const store = new ProjectStore(projeto(componente('t1'), componente('t2')));
  store.exec({ type: 'connectComponents', a: 't1', ligacaoA: 'b', b: 't2', ligacaoB: 'a' });
  return store;
};

describe('linhasDeLigacao', () => {
  it('seleção de tubo conectado mostra as duas conexões, cada uma com o vizinho', () => {
    const p = doisTubosLigados().project;
    const doT1 = linhasDeLigacao(p, p.elements['t1'] as Component);
    const doT2 = linhasDeLigacao(p, p.elements['t2'] as Component);

    const pontaB = doT1.find((l) => l.ligacao.id === 'b');
    const pontaA = doT2.find((l) => l.ligacao.id === 'a');
    expect(pontaB?.vizinho).toEqual({ id: 't2', familia: 'Tubo', ligacao: 'Ponta A' });
    expect(pontaA?.vizinho).toEqual({ id: 't1', familia: 'Tubo', ligacao: 'Ponta B' });
    expect(doT1.find((l) => l.ligacao.id === 'a')?.conexao).toBeUndefined();
  });

  it('o sistema criado pela conexão aparece nas duas instâncias', () => {
    const p = doisTubosLigados().project;
    const sistemaT1 = sistemaDaLinhas(linhasDeLigacao(p, p.elements['t1'] as Component));
    const sistemaT2 = sistemaDaLinhas(linhasDeLigacao(p, p.elements['t2'] as Component));
    expect(sistemaT1).toBeDefined();
    expect(sistemaT2?.id).toBe(sistemaT1?.id);
  });

  it('família sem ligações devolve lista vazia', () => {
    const p = projeto(componente('t1'));
    p.componentFamilies = { tubo: { ...structuredClone(FAMILIA_TUBO), ligacoes: undefined } };
    expect(linhasDeLigacao(p, p.elements['t1'] as Component)).toEqual([]);
  });
});

describe('desconectarLigacao', () => {
  it('desfaz a conexão nos dois lados numa só transação', () => {
    const store = doisTubosLigados();
    desconectarLigacao(store, ['t1'], 'b', 'mi_undo_desconectar');
    expect((store.project.elements['t1'] as Component).ligacoes?.['b']).toBeUndefined();
    expect((store.project.elements['t2'] as Component).ligacoes?.['a']).toBeUndefined();
  });
});

describe('aplicarInclinacao', () => {
  it('grava o ângulo em radianos e volta com um só desfazer', () => {
    const store = new ProjectStore(projeto(componente('t1'), componente('t2')));
    aplicarInclinacao(store, ['t1', 't2'], 0, 90, 'mi_undo_inclinar');
    const t1 = store.project.elements['t1'] as Component;
    const t2 = store.project.elements['t2'] as Component;
    expect(t1.inclinacao?.[0]).toBeCloseTo(Math.PI / 2, 12);
    expect(t2.inclinacao?.[0]).toBeCloseTo(Math.PI / 2, 12);
    expect(t1.inclinacao?.[1]).toBe(0);

    store.undo();
    expect((store.project.elements['t1'] as Component).inclinacao).toBeUndefined();
  });

  it('o giro (índice 1) não mexe na inclinação', () => {
    const store = new ProjectStore(projeto(componente('t1')));
    aplicarInclinacao(store, ['t1'], 1, 45, 'mi_undo_inclinar');
    const t1 = store.project.elements['t1'] as Component;
    expect(t1.inclinacao?.[0]).toBe(0);
    expect(t1.inclinacao?.[1]).toBeCloseTo(Math.PI / 4, 12);
  });
});

describe('renomearSistema', () => {
  it('troca o nome do sistema da conexão', () => {
    const store = doisTubosLigados();
    const sistema = sistemaDaLinhas(linhasDeLigacao(store.project, store.project.elements['t1'] as Component));
    expect(sistema).toBeDefined();
    renomearSistema(store, sistema!.id, 'Esgoto primário', 'mi_undo_sistema');
    expect(store.project.sistemasMep?.[sistema!.id]?.nome).toBe('Esgoto primário');
  });
});

describe('conversão de ângulos', () => {
  it('graus e radianos são inversos', () => {
    expect(grausDeRadianos(radianosDeGraus(37.5))).toBeCloseTo(37.5, 12);
    expect(radianosDeGraus(180)).toBeCloseTo(Math.PI, 12);
  });
});
