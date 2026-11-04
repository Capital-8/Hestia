import { describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO, isComponent, type Component } from '@hestia/model';
import { makeEnv, P, tool } from './testEnv.ts';

const comp = (id: string, x: number): Omit<Component, 'order'> => ({
  id,
  kind: 'component',
  familyId: FAMILIA_ARMARIO.id,
  typeId: 'A80',
  levelId: 'lv_0',
  x,
  y: 2,
  z: 0,
  rotation: 0,
  mirrored: false,
  mark: id,
});

/** Projeto com três componentes na fila "Conjunto 1", com linha, e um componente solto. */
function ctxComConjunto() {
  const ctx = makeEnv();
  ctx.store.exec({ type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
  ctx.store.exec({ type: 'addComponent', component: comp('c1', 1) });
  ctx.store.exec({ type: 'addComponent', component: comp('c2', 4) });
  ctx.store.exec({ type: 'addComponent', component: comp('c3', 7) });
  ctx.store.exec({ type: 'addComponent', component: comp('c4', 10) });
  ctx.store.exec({
    type: 'upsertComponentGroup',
    group: { id: 'g1', nome: 'Conjunto 1', levelId: 'lv_0', membros: ['c1', 'c2', 'c3'], linha: { a: { x: 1, y: 2 }, b: { x: 7, y: 2 } } },
  });
  return ctx;
}

const componente = (ctx: ReturnType<typeof makeEnv>, id: string): Component => {
  const c = ctx.store.project.elements[id];
  if (!isComponent(c)) throw new Error('não é componente');
  return c;
};

describe('mover conjunto', () => {
  it('arrastar o conjunto move os três membros e a linha, e um único desfazer volta tudo', () => {
    const ctx = ctxComConjunto();
    ctx.env.setSelection(['c1', 'c2', 'c3']);
    const t = tool('select', ctx.env);
    t.down?.(P(1.4, 2.2));
    t.drag?.(P(3.4, 3.2));
    t.up?.(P(3.4, 3.2));
    expect(componente(ctx, 'c1')).toMatchObject({ x: 3, y: 3 });
    expect(componente(ctx, 'c2')).toMatchObject({ x: 6, y: 3 });
    expect(componente(ctx, 'c3')).toMatchObject({ x: 9, y: 3 });
    expect(componente(ctx, 'c4')).toMatchObject({ x: 10, y: 2 });
    expect(ctx.store.project.componentGroups?.g1?.linha?.a).toEqual({ x: 3, y: 3 });
    expect(ctx.store.project.componentGroups?.g1?.linha?.b).toEqual({ x: 9, y: 3 });
    ctx.store.undo();
    expect(componente(ctx, 'c1')).toMatchObject({ x: 1, y: 2 });
    expect(componente(ctx, 'c2')).toMatchObject({ x: 4, y: 2 });
    expect(componente(ctx, 'c3')).toMatchObject({ x: 7, y: 2 });
    expect(ctx.store.project.componentGroups?.g1?.linha?.a).toEqual({ x: 1, y: 2 });
  });

  it('o solto selecionado junto anda no mesmo passo e o desfazer devolve os dois', () => {
    const ctx = ctxComConjunto();
    ctx.env.setSelection(['c1', 'c2', 'c3', 'c4']);
    const t = tool('select', ctx.env);
    t.down?.(P(1.4, 2.2));
    t.drag?.(P(2.4, 2.2));
    t.up?.(P(2.4, 2.2));
    expect(componente(ctx, 'c1')).toMatchObject({ x: 2, y: 2 });
    expect(componente(ctx, 'c4')).toMatchObject({ x: 11, y: 2 });
    ctx.store.undo();
    expect(componente(ctx, 'c1')).toMatchObject({ x: 1, y: 2 });
    expect(componente(ctx, 'c4')).toMatchObject({ x: 10, y: 2 });
  });
});

describe('mover componente de conjunto que não está inteiro na seleção', () => {
  it('o componente selecionado sozinho (conjunto parcial) também anda', async () => {
    const { FAMILIA_ARMARIO } = await import('@hestia/model');
    const { makeEnv, P, tool } = await import('./testEnv.ts');
    const ctx = makeEnv();
    ctx.store.exec({ type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
    const comp = (id: string, x: number) => ({ id, kind: 'component' as const, familyId: FAMILIA_ARMARIO.id, typeId: 'A80', levelId: 'lv_0', x, y: 2, z: 0, rotation: 0, mirrored: false, mark: id });
    ctx.store.exec({ type: 'addComponent', component: comp('c1', 1) });
    ctx.store.exec({ type: 'addComponent', component: comp('c2', 3) });
    ctx.store.exec({ type: 'upsertComponentGroup', group: { id: 'g1', nome: 'Conjunto 1', levelId: 'lv_0', membros: ['c1', 'c2'] } });
    ctx.env.setSelection(['c1']);
    const t = tool('select', ctx.env);
    t.down?.(P(1.4, 2.2));
    t.drag?.(P(2.4, 2.2));
    t.up?.(P(2.4, 2.2));
    const c1 = ctx.store.project.elements['c1'];
    expect(c1?.kind === 'component' && c1.x).toBeCloseTo(2, 9);
  });
});
