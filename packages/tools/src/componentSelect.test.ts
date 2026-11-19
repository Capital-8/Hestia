import { describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO, isComponent } from '@hestia/model';
import { makeEnv, P, tool } from './testEnv.ts';

/** Projeto com a família e um componente A80 em (1, 2). */
function ctxComComponente() {
  const ctx = makeEnv();
  ctx.store.exec({ type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
  ctx.store.exec({
    type: 'addComponent',
    component: {
      id: 'c1',
      kind: 'component',
      familyId: FAMILIA_ARMARIO.id,
      typeId: 'A80',
      levelId: 'lv_0',
      x: 1,
      y: 2,
      z: 0,
      rotation: 0,
      mirrored: false,
      mark: 'M-01',
    },
  });
  return ctx;
}

describe('seleção de componente', () => {
  it('o clique seleciona o componente pela pegada', () => {
    const ctx = ctxComComponente();
    const t = tool('select', ctx.env);
    t.down?.(P(1.4, 2.2));
    t.up?.(P(1.4, 2.2));
    expect(ctx.sel()).toEqual(['c1']);
  });

  it('o arrasto move o componente e um único desfazer volta', () => {
    const ctx = ctxComComponente();
    ctx.env.setSelection(['c1']);
    const t = tool('select', ctx.env);
    t.down?.(P(1.4, 2.2));
    t.drag?.(P(2.4, 2.2));
    t.up?.(P(2.4, 2.2));
    const depois = ctx.store.project.elements['c1'];
    expect(isComponent(depois) && depois.x).toBeCloseTo(2, 9);
    expect(isComponent(depois) && depois.y).toBeCloseTo(2, 9);
    ctx.store.undo();
    const antes = ctx.store.project.elements['c1'];
    expect(isComponent(antes) && antes.x).toBeCloseTo(1, 9);
  });

  it('a janela seleciona o componente com a pegada inteira dentro', () => {
    const ctx = ctxComComponente();
    const t = tool('select', ctx.env);
    t.down?.(P(0, 1));
    t.drag?.(P(3, 4));
    t.up?.(P(3, 4));
    expect(ctx.sel()).toEqual(['c1']);

    ctx.env.setSelection([]);
    const fora = tool('select', ctx.env);
    fora.down?.(P(1.5, 2.2));
    fora.drag?.(P(3, 4));
    fora.up?.(P(3, 4));
    expect(ctx.sel()).toEqual([]);
  });
});
