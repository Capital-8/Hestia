import { describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO, isComponent, type Component } from '@hestia/model';
import { agruparSelecao, desagruparSelecao } from './componentGroupActions.ts';
import { makeEnv } from './testEnv.ts';

const comp = (id: string, extra: Partial<Omit<Component, 'order'>> = {}): Omit<Component, 'order'> => ({
  id,
  kind: 'component',
  familyId: FAMILIA_ARMARIO.id,
  typeId: 'A80',
  levelId: 'lv_0',
  x: 0,
  y: 0,
  z: 0,
  rotation: 0,
  mirrored: false,
  mark: id,
  ...extra,
});

/** Projeto com a família e os componentes pedidos. */
function ctxComComponentes(ids: string[] = ['c1', 'c2', 'c3']) {
  const ctx = makeEnv();
  ctx.store.exec({ type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
  for (const id of ids) ctx.store.exec({ type: 'addComponent', component: comp(id) });
  return ctx;
}

describe('agrupar a seleção', () => {
  it('cria o conjunto com os membros na ordem da seleção e desfaz num passo', () => {
    const ctx = ctxComComponentes();
    ctx.env.setSelection(['c2', 'c1', 'c3']);
    expect(agruparSelecao(ctx.env)).toBeNull();
    const grupos = Object.values(ctx.store.project.componentGroups ?? {});
    expect(grupos).toHaveLength(1);
    const grupo = grupos[0]!;
    expect(grupo.id.startsWith('g_')).toBe(true);
    expect(grupo.nome).toBe('Conjunto 1');
    expect(grupo.levelId).toBe('lv_0');
    expect(grupo.membros).toEqual(['c2', 'c1', 'c3']);
    for (const id of grupo.membros) {
      const c = ctx.store.project.elements[id];
      expect(isComponent(c) && c.groupId).toBe(grupo.id);
    }
    ctx.store.undo();
    expect(ctx.store.project.componentGroups).toBeUndefined();
  });

  it('usa o próximo número livre no nome', () => {
    const ctx = ctxComComponentes();
    ctx.store.exec({ type: 'upsertComponentGroup', group: { id: 'gx', nome: 'Conjunto 1', levelId: 'lv_0', membros: ['c1'] } });
    ctx.env.setSelection(['c2', 'c3']);
    expect(agruparSelecao(ctx.env)).toBeNull();
    const novo = Object.entries(ctx.store.project.componentGroups ?? {}).find(([id]) => id !== 'gx');
    expect(novo?.[1].nome).toBe('Conjunto 2');
  });

  it('recusa menos de dois componentes sem alterar o projeto', () => {
    const ctx = ctxComComponentes(['c1']);
    ctx.env.setSelection(['c1']);
    expect(agruparSelecao(ctx.env)).toMatch(/ao menos dois/);
    expect(ctx.store.project.componentGroups).toBeUndefined();
  });

  it('recusa componentes de níveis diferentes', () => {
    const ctx = ctxComComponentes(['c1']);
    ctx.store.exec({ type: 'addComponent', component: comp('c2', { levelId: 'lv_1' }) });
    ctx.env.setSelection(['c1', 'c2']);
    expect(agruparSelecao(ctx.env)).toMatch(/níveis diferentes/);
    expect(ctx.store.project.componentGroups).toBeUndefined();
  });

  it('recusa componente que já está em outro conjunto', () => {
    const ctx = ctxComComponentes();
    ctx.store.exec({ type: 'upsertComponentGroup', group: { id: 'gx', nome: 'Conjunto 1', levelId: 'lv_0', membros: ['c1'] } });
    ctx.env.setSelection(['c1', 'c2']);
    const r = agruparSelecao(ctx.env);
    expect(r).toMatch(/já está em outro conjunto/);
    expect(Object.keys(ctx.store.project.componentGroups ?? {})).toEqual(['gx']);
  });
});

describe('desagrupar a seleção', () => {
  it('remove os conjuntos de todos os componentes selecionados num só passo de desfazer', () => {
    const ctx = ctxComComponentes(['c1', 'c2', 'c3', 'c4']);
    ctx.store.exec({ type: 'upsertComponentGroup', group: { id: 'g1', nome: 'Conjunto 1', levelId: 'lv_0', membros: ['c1', 'c2'] } });
    ctx.store.exec({ type: 'upsertComponentGroup', group: { id: 'g2', nome: 'Conjunto 2', levelId: 'lv_0', membros: ['c3', 'c4'] } });
    ctx.env.setSelection(['c1', 'c4']);
    expect(desagruparSelecao(ctx.env)).toBeNull();
    expect(ctx.store.project.componentGroups).toEqual({});
    for (const id of ['c1', 'c2', 'c3', 'c4']) {
      const c = ctx.store.project.elements[id];
      expect(isComponent(c) && c.groupId).toBeUndefined();
    }
    ctx.store.undo();
    expect(Object.keys(ctx.store.project.componentGroups ?? {}).sort()).toEqual(['g1', 'g2']);
    const c1 = ctx.store.project.elements['c1'];
    expect(isComponent(c1) && c1.groupId).toBe('g1');
  });

  it('avisa quando nenhum selecionado está em conjunto', () => {
    const ctx = ctxComComponentes();
    ctx.env.setSelection(['c1', 'c2']);
    expect(desagruparSelecao(ctx.env)).toMatch(/Nenhum componente/);
  });
});
