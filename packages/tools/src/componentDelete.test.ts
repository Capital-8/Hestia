import { describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO, isComponent } from '@hestia/model';
import { makeEnv } from './testEnv.ts';

describe('excluir componente', () => {
  it('deleteElements remove o componente e o desfazer o devolve', () => {
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
        mark: '',
      },
    });
    ctx.store.exec({ type: 'deleteElements', ids: ['c1'] });
    expect(ctx.store.project.elements['c1']).toBeUndefined();
    ctx.store.undo();
    expect(isComponent(ctx.store.project.elements['c1'])).toBe(true);
  });
});
