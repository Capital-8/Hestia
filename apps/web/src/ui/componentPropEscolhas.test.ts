import { describe, expect, it } from 'vitest';
import { resolverComponente } from '@hestia/engine';
import {
  FAMILIA_FORMATO,
  FAMILIA_VERSAO,
  ProjectStore,
  createEmptyProject,
  type Component,
  type Escolha,
  type Familia,
  type Project,
} from '@hestia/model';
import { comumDe } from './componentPropAcoes.ts';
import {
  aplicarEscolha,
  escolhasDoComponente,
  opcoesDaEscolha,
  patchDaEscolha,
  valorEfetivo,
} from './componentPropEscolhas.ts';

/*
 * Escolhas do painel de propriedades (ficha ESC-props): enum com rótulo, booleano Sim/Não, inteiro com passo,
 * parâmetro inexistente (omitido), família sem escolhas, valor efetivo com um e com vários componentes e a
 * gravação por `updateComponent` com desfazer em um passo.
 */

const E_PORTA: Escolha = { id: 'e-porta', nome: 'Porta', parametro: 'porta', zona: 'frontal' };
const E_PUX: Escolha = { id: 'e-pux', nome: 'Puxador', parametro: 'puxador', zona: 'frontal' };
const E_GAV: Escolha = { id: 'e-gav', nome: 'Gavetas', parametro: 'nGav', zona: 'caixa' };
const E_QUEBRADA: Escolha = { id: 'e-rota', nome: 'Quebrada', parametro: 'nao-existe', zona: 'caixa' };

const familiaBase = (): Familia => ({
  formato: FAMILIA_FORMATO,
  versao: FAMILIA_VERSAO,
  id: 'fam_teste_escolhas',
  nome: 'Teste de escolhas',
  categoria: 'generico',
  unidade: 'mm',
  hospedagem: 'nivel',
  origem: 'canto',
  parametros: [
    { id: 'L', nome: 'Largura', tipo: 'comprimento', escopo: 'instancia', padrao: 800, min: 300, max: 1200 },
    {
      id: 'porta', nome: 'Porta', tipo: 'enum', escopo: 'instancia', padrao: 'lisa',
      opcoes: [{ valor: 'lisa', rotulo: 'Lisa' }, { valor: 'vidro', rotulo: 'Vidro' }, { valor: 'sem_rotulo' }],
    },
    { id: 'puxador', nome: 'Puxador', tipo: 'booleano', escopo: 'instancia', padrao: true },
    { id: 'nGav', nome: 'Gavetas', tipo: 'inteiro', escopo: 'instancia', padrao: 2, min: 0, max: 6, passo: 2 },
    { id: 'solta', nome: 'Solta', tipo: 'inteiro', escopo: 'instancia', padrao: 0 },
  ],
  planos: [],
  pecas: [],
  aninhados: [],
  ferragens: [],
  escolhas: [E_PORTA, E_PUX, E_GAV, E_QUEBRADA],
  tipos: [],
  tipoPadrao: undefined,
});

const componente = (id: string, extra: Partial<Component> = {}): Component => ({
  id,
  kind: 'component',
  familyId: 'fam_teste_escolhas',
  typeId: null,
  levelId: 'lv_0',
  order: 0,
  x: 0,
  y: 0,
  z: 0,
  rotation: 0,
  mirrored: false,
  mark: '',
  ...extra,
});

const projeto = (f: Familia, ...componentes: Component[]): Project => {
  const p = createEmptyProject('t');
  p.componentFamilies = { [f.id]: f };
  for (const c of componentes) p.elements[c.id] = c;
  p.nextOrder = componentes.length + 1;
  return p;
};

const ler = (store: ProjectStore, id: string): Component => store.project.elements[id] as Component;

describe('escolhasDoComponente', () => {
  it('mantém só as escolhas cujo parâmetro existe e é enum, booleano ou inteiro', () => {
    expect(escolhasDoComponente(familiaBase()).map((e) => e.id)).toEqual(['e-porta', 'e-pux', 'e-gav']);
  });

  it('família sem escolhas (ou indefinida) não oferece nada', () => {
    const sem = familiaBase();
    delete sem.escolhas;
    expect(escolhasDoComponente(sem)).toEqual([]);
    expect(escolhasDoComponente(undefined)).toEqual([]);
  });
});

describe('opcoesDaEscolha', () => {
  it('enum: valores e rótulos vindos do parâmetro (sem rótulo, o próprio valor)', () => {
    expect(opcoesDaEscolha(familiaBase(), E_PORTA)).toEqual([
      { valor: 'lisa', rotulo: 'Lisa' },
      { valor: 'vidro', rotulo: 'Vidro' },
      { valor: 'sem_rotulo', rotulo: 'sem_rotulo' },
    ]);
  });

  it('booleano: Sim/Não', () => {
    expect(opcoesDaEscolha(familiaBase(), E_PUX)).toEqual([
      { valor: true, rotulo: 'Sim' },
      { valor: false, rotulo: 'Não' },
    ]);
  });

  it('inteiro com faixa: sequência de min a max no passo', () => {
    expect(opcoesDaEscolha(familiaBase(), E_GAV)).toEqual([
      { valor: 0, rotulo: '0' },
      { valor: 2, rotulo: '2' },
      { valor: 4, rotulo: '4' },
      { valor: 6, rotulo: '6' },
    ]);
  });

  it('inteiro sem faixa ou escolha quebrada: lista vazia', () => {
    const f = familiaBase();
    expect(opcoesDaEscolha(f, { id: 'e-solta', nome: 'Solta', parametro: 'solta', zona: 'caixa' })).toEqual([]);
    expect(opcoesDaEscolha(f, E_QUEBRADA)).toEqual([]);
  });
});

describe('valorEfetivo', () => {
  it('é o valor da resolução, não o texto cru da instância', () => {
    const f = familiaBase();
    const c = componente('c1', { values: { porta: 'vidro', nGav: 4 } });
    const p = projeto(f, c);
    expect(valorEfetivo(p, c, E_PORTA)).toBe('vidro');
    expect(valorEfetivo(p, c, E_GAV)).toBe(4);
    expect(valorEfetivo(p, c, E_PUX)).toBe(true);
    expect(valorEfetivo(p, componente('c_sem_values'), E_PORTA)).toBe('lisa');
  });

  it('vários componentes: comum quando iguais, misto quando diferentes', () => {
    const f = familiaBase();
    const a = componente('a', { values: { porta: 'vidro' } });
    const pIguais = projeto(f, a, componente('b', { values: { porta: 'vidro' } }));
    const iguais = comumDe([a, pIguais.elements['b'] as Component], (c) => valorEfetivo(pIguais, c, E_PORTA));
    expect(iguais).toEqual({ valor: 'vidro', misto: false });
    const pDiferentes = projeto(f, a, componente('b', { values: { porta: 'lisa' } }));
    const diferentes = comumDe([a, pDiferentes.elements['b'] as Component], (c) => valorEfetivo(pDiferentes, c, E_PORTA));
    expect(diferentes.misto).toBe(true);
  });
});

describe('patchDaEscolha', () => {
  it('grava o valor escolhendo preservando os demais valores', () => {
    const c = componente('c1', { values: { L: 900, porta: 'lisa' } });
    expect(patchDaEscolha(c, E_PORTA, 'vidro')).toEqual({ values: { L: 900, porta: 'vidro' } });
  });

  it('null remove o valor da escolha (volta ao tipo)', () => {
    const c = componente('c1', { values: { L: 900, porta: 'vidro' } });
    expect(patchDaEscolha(c, E_PORTA, null)).toEqual({ values: { L: 900 } });
    expect(patchDaEscolha(componente('c2'), E_PORTA, null)).toEqual({ values: undefined });
  });
});

describe('aplicarEscolha', () => {
  it('grava em todos via updateComponent, resolve o novo valor e desfaz em um passo', () => {
    const f = familiaBase();
    const store = new ProjectStore(projeto(f, componente('c1'), componente('c2')));
    aplicarEscolha(store, [ler(store, 'c1'), ler(store, 'c2')], E_PORTA, 'vidro');
    expect(ler(store, 'c1').values).toEqual({ porta: 'vidro' });
    expect(ler(store, 'c2').values).toEqual({ porta: 'vidro' });
    expect(resolverComponente(store.project, ler(store, 'c1')).env.porta).toBe('vidro');
    store.undo();
    expect(ler(store, 'c1').values).toBeUndefined();
    expect(ler(store, 'c2').values).toBeUndefined();
  });

  it('↺ remove o valor e volta ao padrão; desfazer restaura', () => {
    const f = familiaBase();
    const store = new ProjectStore(projeto(f, componente('c1', { values: { porta: 'vidro', nGav: 4 } })));
    aplicarEscolha(store, [ler(store, 'c1')], E_PORTA, null);
    expect(ler(store, 'c1').values).toEqual({ nGav: 4 });
    expect(resolverComponente(store.project, ler(store, 'c1')).env.porta).toBe('lisa');
    store.undo();
    expect(ler(store, 'c1').values).toEqual({ porta: 'vidro', nGav: 4 });
  });

  it('seleção vazia não abre transação nem mexe no projeto', () => {
    const f = familiaBase();
    const store = new ProjectStore(projeto(f, componente('c1')));
    const antes = store.project;
    aplicarEscolha(store, [], E_PORTA, 'vidro');
    expect(store.project).toBe(antes);
  });
});
