import { describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO, type Component } from '@hestia/model';
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

/** Projeto com três componentes agrupados em "Conjunto 1". */
function ctxComConjunto() {
  const ctx = makeEnv();
  ctx.store.exec({ type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
  ctx.store.exec({ type: 'addComponent', component: comp('c1', 1) });
  ctx.store.exec({ type: 'addComponent', component: comp('c2', 4) });
  ctx.store.exec({ type: 'addComponent', component: comp('c3', 7) });
  ctx.store.exec({ type: 'upsertComponentGroup', group: { id: 'g1', nome: 'Conjunto 1', levelId: 'lv_0', membros: ['c1', 'c2', 'c3'] } });
  return ctx;
}

describe('seleção de conjunto', () => {
  it('clicar num membro seleciona o conjunto inteiro', () => {
    const ctx = ctxComConjunto();
    const t = tool('select', ctx.env);
    t.down?.(P(1.4, 2.2));
    t.up?.(P(1.4, 2.2));
    expect(ctx.sel()).toEqual(['c1', 'c2', 'c3']);
  });

  it('com Shift alterna o conjunto inteiro', () => {
    const ctx = ctxComConjunto();
    const t = tool('select', ctx.env);
    t.down?.(P(4.4, 2.2, { shift: true }));
    t.up?.(P(4.4, 2.2, { shift: true }));
    expect(ctx.sel()).toEqual(['c1', 'c2', 'c3']);
    t.down?.(P(4.4, 2.2, { shift: true }));
    t.up?.(P(4.4, 2.2, { shift: true }));
    expect(ctx.sel()).toEqual([]);
  });

  it('a janela que pega um membro pega o conjunto todo', () => {
    const ctx = ctxComConjunto();
    const t = tool('select', ctx.env);
    t.down?.(P(0, 1));
    t.drag?.(P(2.5, 3));
    t.up?.(P(2.5, 3));
    expect(ctx.sel()).toEqual(['c1', 'c2', 'c3']);
  });
});
