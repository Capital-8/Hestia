import { beforeEach, describe, expect, it } from 'vitest';
import { activeViewOf, addView, closeView, defaultOpenViews, hasView, levelToRelease, neighborOf, pruneViews, removeView, sameView, viewKey, type OpenView } from './openViews.ts';
import { DEFAULT_OPEN_VIEWS, useUi } from './state.ts';

const T0: OpenView = { kind: 'plan', viewId: 'pv_lv_0' };
const T1: OpenView = { kind: 'plan', viewId: 'pv_lv_1' };
const T2: OpenView = { kind: 'plan', viewId: 'pv_lv_2' };
const V3D: OpenView = { kind: '3d' };
const SEC: OpenView = { kind: 'section', viewId: 'sv_1' };
const SHEET: OpenView = { kind: 'sheet', sheetId: 'sh_1' };

describe('chave e comparação de vistas', () => {
  it('cada tipo de vista tem chave própria', () => {
    expect(viewKey(T0)).toBe('plan:pv_lv_0');
    expect(viewKey(V3D)).toBe('3d');
    expect(viewKey(SEC)).toBe('section:sv_1');
    expect(viewKey(SHEET)).toBe('sheet:sh_1');
  });

  it('planta de nível diferente não é a mesma vista', () => {
    expect(sameView(T0, T1)).toBe(false);
    expect(sameView(T0, { kind: 'plan', viewId: 'pv_lv_0' })).toBe(true);
  });
});

describe('abrir (addView)', () => {
  it('acrescenta ao fim quando a vista ainda não está aberta', () => {
    expect(addView([T0], T1)).toEqual([T0, T1]);
  });

  it('vista já aberta não é duplicada e a lista volta a mesma', () => {
    const list = [T0, T1];
    expect(addView(list, T0)).toBe(list);
  });

  it('com a lista vazia (sem vista aberta), abrir uma vista a põe na lista', () => {
    expect(addView([], V3D)).toEqual([V3D]);
  });

  it('não muta a lista recebida', () => {
    const list = [T0];
    addView(list, T1);
    expect(list).toEqual([T0]);
  });
});

describe('fechar sem efeitos (closeView)', () => {
  it('a última vista aberta pode fechar: a lista fica vazia e nenhuma vista é ativada', () => {
    const r = closeView([T0], T0, T0);
    expect(r).toEqual({ list: [], activate: null });
  });

  it('fechar o 3D quando é a única aba deixa a lista vazia (sem vizinha)', () => {
    expect(closeView([V3D], V3D, V3D)).toEqual({ list: [], activate: null });
  });

  it('fechar a ativa devolve a vizinha da direita para ativar', () => {
    const r = closeView([T0, T1, T2], T1, T1);
    expect(r).toEqual({ list: [T0, T2], activate: T2 });
  });

  it('fechar a ativa na última posição ativa a vizinha da esquerda', () => {
    const r = closeView([T0, T1, T2], T2, T2);
    expect(r).toEqual({ list: [T0, T1], activate: T1 });
  });

  it('fechar outra vista (não ativa) só tira da lista e não muda a ativa', () => {
    const r = closeView([T0, T1, T2], T0, T2);
    expect(r).toEqual({ list: [T1, T2], activate: null });
  });

  it('vista que não está aberta não altera a lista', () => {
    const r = closeView([T0, T1], T2, T0);
    expect(r).toEqual({ list: [T0, T1], activate: null });
  });

  it('fechar a ativa com duas abas ativa a outra', () => {
    const r = closeView([T0, SEC], SEC, SEC);
    expect(r).toEqual({ list: [T0], activate: T0 });
  });

  it('não muta a lista recebida', () => {
    const list = [T0, T1];
    closeView(list, T0, T0);
    expect(list).toEqual([T0, T1]);
  });
});

describe('vizinha, remoção e possibilidade de fechar', () => {
  it('neighborOf prefere a direita e cai na esquerda na última posição', () => {
    expect(neighborOf([T0, T1, T2], T0)).toEqual(T1);
    expect(neighborOf([T0, T1, T2], T2)).toEqual(T1);
  });

  it('neighborOf é null quando a vista não está na lista ou é a única', () => {
    expect(neighborOf([T0], T0)).toBeNull();
    expect(neighborOf([T0, T1], T2)).toBeNull();
  });

  it('removeView tira a vista e mantém a ordem das demais', () => {
    expect(removeView([T0, V3D, T1], V3D)).toEqual([T0, T1]);
    expect(removeView([T0], T1)).toEqual([T0]);
  });

  it('levelToRelease: só a planta devolve o nível a liberar', () => {
    expect(levelToRelease(T1)).toBe('lv_1');
    expect(levelToRelease(V3D)).toBeNull();
    expect(levelToRelease(SEC)).toBeNull();
    expect(levelToRelease(SHEET)).toBeNull();
  });

  it('hasView identifica vista presente', () => {
    expect(hasView([T0, SEC], SEC)).toBe(true);
    expect(hasView([T0], SHEET)).toBe(false);
  });
});

describe('overflow e limpeza (pruneViews)', () => {
  it('mantém a ordem e tira as vistas que não existem mais', () => {
    const live = pruneViews([T0, T1, T2, SEC], (v) => !(v.kind === 'plan' && v.viewId === 'pv_lv_1') && v !== SEC);
    expect(live).toEqual([T0, T2]);
  });

  it('com muitas plantas, a lista cresce sem limite fixo e cada uma tem chave única', () => {
    const many: OpenView[] = Array.from({ length: 10 }, (_, i) => ({ kind: 'plan' as const, viewId: `pv_lv_${i}` }));
    const keys = new Set(many.map(viewKey));
    expect(keys.size).toBe(10);
    expect(pruneViews(many, () => true)).toHaveLength(10);
  });
});

describe('vista ativa (activeViewOf)', () => {
  const base = { view: 'plan' as const, levelId: 'lv_0', planViewId: 'pv_lv_0', sectionId: null, sheetId: null };

  it('planta usa a vista de planta ativa (planViewId)', () => {
    expect(activeViewOf(base)).toEqual(T0);
  });

  it('3D não depende de id', () => {
    expect(activeViewOf({ ...base, view: '3d' })).toEqual(V3D);
  });

  it('corte sem id definido não tem vista ativa', () => {
    expect(activeViewOf({ ...base, view: 'section' })).toBeNull();
    expect(activeViewOf({ ...base, view: 'section', sectionId: 'sv_1' })).toEqual(SEC);
  });

  it('prancha sem id definido não tem vista ativa', () => {
    expect(activeViewOf({ ...base, view: 'sheet' })).toBeNull();
    expect(activeViewOf({ ...base, view: 'sheet', sheetId: 'sh_1' })).toEqual(SHEET);
  });
});

describe('planta de cobertura (viewId)', () => {
  const R0: OpenView = { kind: 'plan', viewId: 'pvr_lv_0' };

  it('piso e cobertura do mesmo nível têm chaves diferentes', () => {
    expect(viewKey(R0)).toBe('plan:pvr_lv_0');
    expect(viewKey(T0)).toBe('plan:pv_lv_0');
    expect(viewKey({ kind: 'plan', viewId: 'pv_lv_0' })).toBe('plan:pv_lv_0');
    expect(sameView(R0, T0)).toBe(false);
  });

  it('activeViewOf: a cobertura só aparece quando a vista de planta é a de cobertura', () => {
    const base = { view: 'plan' as const, levelId: 'lv_0', sectionId: null, sheetId: null };
    expect(activeViewOf({ ...base, planViewId: 'pvr_lv_0' })).toEqual(R0);
    expect(activeViewOf({ ...base, planViewId: 'pv_lv_0' })).toEqual(T0);
  });

  it('levelToRelease: a cobertura não libera o nível (a planta de piso pode estar aberta ao lado)', () => {
    expect(levelToRelease(R0)).toBeNull();
    expect(levelToRelease(T0)).toBe('lv_0');
  });

  it('fechar a cobertura ativa deixa a planta de piso do mesmo nível como vizinha', () => {
    const r = closeView([T0, R0], R0, R0);
    expect(r.list).toEqual([T0]);
    expect(r.activate).toEqual(T0);
  });
});

describe('padrão ao abrir o projeto (defaultOpenViews)', () => {
  it('abre só o primeiro nível do projeto', () => {
    expect(defaultOpenViews(['lv_2', 'lv_0'])).toEqual([{ kind: 'plan', viewId: 'pv_lv_2' }]);
  });

  it('sem níveis, usa o nível padrão', () => {
    expect(defaultOpenViews([])).toEqual([T0]);
  });
});

describe('estado de vistas abertas no store (sessão)', () => {
  beforeEach(() => {
    useUi.setState({ view: 'plan', levelId: 'lv_0', planViewId: 'pv_lv_0', sectionId: null, sheetId: null, openViews: DEFAULT_OPEN_VIEWS.map((v) => ({ ...v })) });
  });

  it('trocar o tipo da planta do mesmo nível abre a aba de cobertura ao lado da de piso', () => {
    useUi.setState({ planViewId: 'pvr_lv_0' });
    expect(useUi.getState().openViews).toEqual([T0, { kind: 'plan', viewId: 'pvr_lv_0' }]);
  });

  it('o padrão ao abrir é só o nível ativo', () => {
    expect(useUi.getState().openViews).toEqual([T0]);
  });

  it('mudar de nível abre a nova planta sem remover as já abertas', () => {
    useUi.setState({ levelId: 'lv_1', planViewId: 'pv_lv_1' });
    expect(useUi.getState().openViews).toEqual([T0, T1]);
  });

  it('voltar a um nível já aberto só ativa (não duplica)', () => {
    useUi.setState({ levelId: 'lv_1', planViewId: 'pv_lv_1' });
    useUi.setState({ levelId: 'lv_0', planViewId: 'pv_lv_0' });
    expect(useUi.getState().openViews).toEqual([T0, T1]);
  });

  it('ir para o 3D e para um corte abre essas vistas', () => {
    useUi.setState({ view: '3d' });
    useUi.setState({ view: 'section', sectionId: 'sv_1' });
    expect(useUi.getState().openViews).toEqual([T0, V3D, SEC]);
  });

  it('o padrão ao abrir o projeto vem de defaultOpenViews (ver testes da seção padrão)', () => {
    expect(defaultOpenViews(['lv_0'])).toEqual(DEFAULT_OPEN_VIEWS);
  });

  it('mudar só a seleção ou a ferramenta não altera a lista', () => {
    const before = useUi.getState().openViews;
    useUi.setState({ selection: ['x'], tool: 'wall' });
    expect(useUi.getState().openViews).toBe(before);
  });
});
