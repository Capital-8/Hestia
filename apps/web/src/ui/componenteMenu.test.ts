import { describe, expect, it } from 'vitest';
import { caixaLocalDoComponente } from '@hestia/engine';
import {
  FAMILIA_ARMARIO,
  ProjectStore,
  createEmptyProject,
  isComponent,
  type Component,
  type Familia,
  type Id,
  type Project,
} from '@hestia/model';
import type { ToolEnv } from '@hestia/tools';
import { buildContextMenu, type ContextMenuCtx, type MenuEntry } from '../editor/contextMenu.ts';
import { DEFAULT_OPTIONS } from '../editor/state.ts';
import { comComponente, executarComandoDeComponente } from './componenteMenu.ts';

const PI = Math.PI;

/** Duas famílias: a de armário e uma cópia com outro id, para testar seleção de famílias diferentes. */
const FAMILIAS: Record<Id, Familia> = {
  [FAMILIA_ARMARIO.id]: FAMILIA_ARMARIO,
  f2: { ...structuredClone(FAMILIA_ARMARIO), id: 'f2', nome: 'Armário bis' },
};

const componente = (id: string, extra: Partial<Component> = {}): Component => ({
  id,
  kind: 'component',
  familyId: FAMILIA_ARMARIO.id,
  typeId: 'A80',
  levelId: 'lv_0',
  order: 1,
  x: 0,
  y: 0,
  z: 0,
  rotation: 0,
  mirrored: false,
  mark: '',
  ...extra,
});

/** Projeto com as famílias e os componentes pedidos. */
const projetoCom = (...cs: Component[]): Project => {
  const p = createEmptyProject('t');
  p.componentFamilies = structuredClone(FAMILIAS);
  for (const c of cs) p.elements[c.id] = c;
  p.nextOrder = cs.length + 1;
  return p;
};

/** Ambiente de teste com projeto, seleção e histórico reais. */
function envDe(store: ProjectStore, selecionados: readonly Id[]) {
  let selection: Id[] = [...selecionados];
  const falas: string[] = [];
  const env: ToolEnv = {
    project: () => store.project,
    levelId: () => 'lv_0',
    selection: () => selection,
    setSelection: (ids) => { selection = [...ids]; },
    exec: (c) => store.exec(c),
    transaction: (label, fn) => store.transaction(label, fn),
    metersPerPixel: () => 1,
    gridStep: () => 0.1,
    say: (m) => { falas.push(m); },
    done: () => {},
    options: () => DEFAULT_OPTIONS,
  };
  return { env, sel: () => selection, falas: () => falas };
}

const ler = (store: ProjectStore, id: Id): Component => store.project.elements[id] as Component;

/** Contexto de menu com a seleção dada (só os `kinds` importam para as entradas de componente). */
const ctxCom = (kinds: string[], lang: 'pt' | 'en' = 'pt'): ContextMenuCtx => ({
  view: 'plan',
  tool: 'select',
  selectionKinds: kinds,
  hasSelection: kinds.length > 0,
  singleType: true,
  recent: [],
  last: null,
  canSelectPrevious: false,
  propsOpen: true,
  browserOpen: false,
  lang,
  reveal: false,
  singleCategory: null,
  hasHidden: false,
  hasClip: false,
  canCopy: true,
});

const ids = (m: MenuEntry[]): string[] => m.map((e) => e.id);
const entrada = (m: MenuEntry[], id: string): MenuEntry => {
  const e = m.find((x) => x.id === id);
  if (!e) throw new Error(`sem entrada ${id}`);
  return e;
};

/** Menu completo (com "Excluir") mais as entradas de componente. */
const menuCom = (cs: Component[], kinds = cs.map(() => 'component'), lang: 'pt' | 'en' = 'pt'): MenuEntry[] =>
  comComponente(buildContextMenu(ctxCom(kinds, lang)), ctxCom(kinds, lang), lang, cs, FAMILIAS);

describe('entradas de componente no menu', () => {
  it('sem seleção de componente, o menu sai igual', () => {
    const itens = buildContextMenu(ctxCom([]));
    expect(comComponente(itens, ctxCom([]), 'pt', [], FAMILIAS)).toBe(itens);
  });

  it('seleção mista (parede e componente) não acrescenta nada', () => {
    const itens = buildContextMenu(ctxCom(['wall', 'component']));
    expect(comComponente(itens, ctxCom(['wall', 'component']), 'pt', [componente('c1')], FAMILIAS)).toBe(itens);
  });

  it('grupo entra antes de "Excluir", separado por linha, com ids estáveis', () => {
    const m = ids(menuCom([componente('c1')]));
    const esperado = ['comp:rot90', 'comp:rotm90', 'comp:mirror', 'comp:dup', 'comp:tipo', 'comp:group', 'comp:ungroup'];
    for (const id of esperado) expect(m).toContain(id);
    expect(m.indexOf('comp:ungroup')).toBeLessThan(m.indexOf('delete'));
    expect(entrada(menuCom([componente('c1')]), 'comp:rot90').separatorBefore).toBe(true);
  });

  it('rótulos em português e em inglês', () => {
    const pt = menuCom([componente('c1')]);
    expect(entrada(pt, 'comp:rot90').label).toBe('Girar 90°');
    expect(entrada(pt, 'comp:dup').label).toBe('Duplicar ao lado');
    const en = menuCom([componente('c1')], ['component'], 'en');
    expect(entrada(en, 'comp:rot90').label).toBe('Rotate 90°');
    expect(entrada(en, 'comp:dup').label).toBe('Duplicate to the Side');
  });

  it('Tipo lista os tipos da família e marca o atual', () => {
    const tipo = entrada(menuCom([componente('c1', { typeId: 'A100' })]), 'comp:tipo');
    expect(tipo.children?.map((c) => c.id)).toEqual(['comp:tipo:A60', 'comp:tipo:A80', 'comp:tipo:A100', 'comp:tipo:A120']);
    expect(tipo.children?.map((c) => c.checked)).toEqual([false, false, true, false]);
  });

  it('Tipo com vários da mesma família: marca quando todos têm o mesmo tipo', () => {
    const iguais = entrada(menuCom([componente('c1', { typeId: 'A60' }), componente('c2', { typeId: 'A60' })]), 'comp:tipo');
    expect(iguais.children?.filter((c) => c.checked).map((c) => c.id)).toEqual(['comp:tipo:A60']);
    const variados = entrada(menuCom([componente('c1', { typeId: 'A60' }), componente('c2', { typeId: 'A80' })]), 'comp:tipo');
    expect(variados.children?.some((c) => c.checked)).toBe(false);
  });

  it('famílias diferentes desabilitam o Tipo com o motivo', () => {
    const tipo = entrada(menuCom([componente('c1'), componente('c2', { familyId: 'f2' })]), 'comp:tipo');
    expect(tipo.disabled).toBe(true);
    expect(tipo.hint).toBe('Selecione componentes de uma só família');
    expect(tipo.children).toEqual([]);
  });

  it('Agrupar pede dois componentes soltos; Desagrupar pede componente de conjunto', () => {
    const um = entrada(menuCom([componente('c1')]), 'comp:group');
    expect(um.disabled).toBe(true);
    expect(um.hint).toBe('Selecione ao menos dois componentes soltos');
    const dous = entrada(menuCom([componente('c1'), componente('c2')]), 'comp:group');
    expect(dous.disabled).toBe(false);
    expect(dous.hint).toBeUndefined();
    expect(entrada(menuCom([componente('c1'), componente('c2')]), 'comp:ungroup').disabled).toBe(true);
    const emConjunto = entrada(menuCom([componente('c1', { groupId: 'g1' }), componente('c2', { groupId: 'g1' })]), 'comp:ungroup');
    expect(emConjunto.disabled).toBe(false);
    expect(entrada(menuCom([componente('c1', { groupId: 'g1' }), componente('c2', { groupId: 'g1' })]), 'comp:group').disabled).toBe(true);
  });
});

describe('girar e espelhar pelo menu', () => {
  it('Girar 90° soma π/2 à rotação em torno da própria inserção', () => {
    const store = new ProjectStore(projetoCom(componente('c1', { rotation: PI / 2 })));
    const { env } = envDe(store, ['c1']);
    executarComandoDeComponente('comp:rot90', env);
    expect(ler(store, 'c1').rotation).toBeCloseTo(PI);
    expect(ler(store, 'c1').x).toBe(0);
    executarComandoDeComponente('comp:rot90', env);
    expect(ler(store, 'c1').rotation).toBeCloseTo(-PI / 2);
  });

  it('Girar −90° e Espelhar mudam rotação e espelho num passo de desfazer cada', () => {
    const store = new ProjectStore(projetoCom(componente('c1'), componente('c2', { x: 2 })));
    const { env } = envDe(store, ['c1', 'c2']);
    executarComandoDeComponente('comp:rotm90', env);
    expect(ler(store, 'c1').rotation).toBeCloseTo(-PI / 2);
    expect(ler(store, 'c2').rotation).toBeCloseTo(-PI / 2);
    store.undo();
    expect(ler(store, 'c1').rotation).toBe(0);
    executarComandoDeComponente('comp:mirror', env);
    expect(ler(store, 'c1').mirrored).toBe(true);
    expect(ler(store, 'c2').mirrored).toBe(true);
    store.undo();
    expect(ler(store, 'c1').mirrored).toBe(false);
    expect(ler(store, 'c2').mirrored).toBe(false);
  });

  it('conjunto selecionado gira em torno do centro do conjunto (com a rotação somada)', () => {
    const store = new ProjectStore(projetoCom(componente('c1'), componente('c2', { x: 1 })));
    store.exec({ type: 'upsertComponentGroup', group: { id: 'g1', nome: 'Conjunto 1', levelId: 'lv_0', membros: ['c1', 'c2'] } });
    const { env } = envDe(store, ['c1', 'c2']);
    executarComandoDeComponente('comp:rot90', env);
    // Centro (0.5, 0): (0,0) → (0.5,−0.5) e (1,0) → (0.5,0.5), ambos girados 90°.
    expect(ler(store, 'c1').x).toBeCloseTo(0.5);
    expect(ler(store, 'c1').y).toBeCloseTo(-0.5);
    expect(ler(store, 'c2').x).toBeCloseTo(0.5);
    expect(ler(store, 'c2').y).toBeCloseTo(0.5);
    expect(ler(store, 'c1').rotation).toBeCloseTo(PI / 2);
    store.undo();
    expect(ler(store, 'c1').x).toBe(0);
    expect(ler(store, 'c2').x).toBe(1);
  });
});

describe('duplicar ao lado e trocar tipo pelo menu', () => {
  const larguraDaFamilia = (c: Component, p: Project): number => {
    const caixa = caixaLocalDoComponente(p, c);
    if (!caixa) throw new Error('família sem peças');
    return caixa.max[0]! - caixa.min[0]!;
  };

  it('cria um componente igual a `largura` à direita, solto, sem marca e selecionado', () => {
    const c1 = componente('c1', { typeId: 'A100', values: { L: 900 } });
    const p = projetoCom(c1);
    const store = new ProjectStore(p);
    const esperado = larguraDaFamilia(c1, p);
    expect(esperado).toBeGreaterThan(0);
    const { env, sel } = envDe(store, ['c1']);
    executarComandoDeComponente('comp:dup', env);
    const novos = Object.keys(store.project.elements).filter((id) => id !== 'c1');
    expect(novos).toHaveLength(1);
    const copia = ler(store, novos[0]!);
    expect(isComponent(copia)).toBe(true);
    expect(copia.x).toBeCloseTo(esperado);
    expect(copia.y).toBe(0);
    expect(copia.familyId).toBe(FAMILIA_ARMARIO.id);
    expect(copia.typeId).toBe('A100');
    expect(copia.values).toEqual({ L: 900 });
    expect(copia.mark).toBe('');
    expect(copia.groupId).toBeUndefined();
    expect(sel()).toEqual(novos);
  });

  it('duplica girado no eixo x local e desfaz os dois em um passo', () => {
    const store = new ProjectStore(projetoCom(componente('c1', { rotation: PI / 2 }), componente('c2', { x: 3, rotation: PI / 2 })));
    const largura = larguraDaFamilia(componente('c1'), store.project);
    const { env } = envDe(store, ['c1', 'c2']);
    executarComandoDeComponente('comp:dup', env);
    expect(Object.keys(store.project.elements)).toHaveLength(4);
    const copia1 = ler(store, env.selection()[0]!);
    expect(copia1.x).toBeCloseTo(0);
    expect(copia1.y).toBeCloseTo(largura);
    store.undo();
    expect(Object.keys(store.project.elements)).toHaveLength(2);
  });

  it('Tipo aplicado pelo menu troca o typeId dos selecionados num passo de desfazer', () => {
    const store = new ProjectStore(projetoCom(componente('c1'), componente('c2', { x: 1 })));
    const { env } = envDe(store, ['c1', 'c2']);
    executarComandoDeComponente('comp:tipo:A120', env);
    expect(ler(store, 'c1').typeId).toBe('A120');
    expect(ler(store, 'c2').typeId).toBe('A120');
    store.undo();
    expect(ler(store, 'c1').typeId).toBe('A80');
    expect(ler(store, 'c2').typeId).toBe('A80');
  });

  it('tipo que não existe na família da instância fica de fora', () => {
    const store = new ProjectStore(projetoCom(componente('c1'), componente('c2', { x: 1, familyId: 'f2' })));
    const { env } = envDe(store, ['c1', 'c2']);
    executarComandoDeComponente('comp:tipo:inexistente', env);
    expect(ler(store, 'c1').typeId).toBe('A80');
    expect(store.canUndo).toBe(false);
  });
});

describe('agrupar e desagrupar pelo menu', () => {
  it('Agrupar cria o conjunto da seleção (mesma ação da faixa) e um Ctrl+Z desfaz', () => {
    const store = new ProjectStore(projetoCom(componente('c1'), componente('c2', { x: 1 })));
    const { env } = envDe(store, ['c1', 'c2']);
    executarComandoDeComponente('comp:group', env);
    const grupos = Object.values(store.project.componentGroups ?? {});
    expect(grupos.map((g) => g.membros)).toEqual([['c1', 'c2']]);
    store.undo();
    expect(store.project.componentGroups).toBeUndefined();
  });

  it('Desagrupar remove o conjunto dos selecionados num passo', () => {
    const store = new ProjectStore(projetoCom(componente('c1'), componente('c2', { x: 1 })));
    store.exec({ type: 'upsertComponentGroup', group: { id: 'g1', nome: 'Conjunto 1', levelId: 'lv_0', membros: ['c1', 'c2'] } });
    const { env } = envDe(store, ['c1', 'c2']);
    executarComandoDeComponente('comp:ungroup', env);
    expect(Object.keys(store.project.componentGroups ?? {})).toEqual([]);
    expect(ler(store, 'c1').groupId).toBeUndefined();
    expect(ler(store, 'c2').groupId).toBeUndefined();
    store.undo();
    expect(Object.keys(store.project.componentGroups ?? {})).toEqual(['g1']);
    expect(ler(store, 'c1').groupId).toBe('g1');
  });

  it('comando de fora do menu é ignorado', () => {
    const store = new ProjectStore(projetoCom(componente('c1')));
    const { env } = envDe(store, ['c1']);
    executarComandoDeComponente('delete', env);
    executarComandoDeComponente('comp:', env);
    expect(Object.keys(store.project.elements)).toEqual(['c1']);
    expect(store.canUndo).toBe(false);
  });
});
