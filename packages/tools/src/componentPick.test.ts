import { describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO, makeLevel, type Component } from '@hestia/model';
import { componentAt } from './pick.ts';
import { makeEnv } from './testEnv.ts';

const MPP = 0.01; // 4 px = 4 cm

/** Projeto com a família do armário: a pegada padrão (A80) cobre x 1..1,8 e y 1,98..2,56. */
function ctxComFamilia() {
  const ctx = makeEnv();
  ctx.store.exec({ type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
  return ctx;
}

const comp = (id: string, extra: Partial<Component> = {}): Omit<Component, 'order'> => ({
  id,
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
  ...extra,
});

describe('componentAt', () => {
  it('acha o componente com o ponto dentro da pegada', () => {
    const ctx = ctxComFamilia();
    ctx.store.exec({ type: 'addComponent', component: comp('c1') });
    expect(componentAt(ctx.store.project, 'lv_0', { x: 1.4, y: 2.2 }, MPP)).toBe('c1');
  });

  it('aceita o clique na borda com a tolerância de 4 px', () => {
    const ctx = ctxComFamilia();
    ctx.store.exec({ type: 'addComponent', component: comp('c1') });
    expect(componentAt(ctx.store.project, 'lv_0', { x: 0.98, y: 2.2 }, MPP)).toBe('c1');
    expect(componentAt(ctx.store.project, 'lv_0', { x: 1.8 + 0.03, y: 2.2 }, MPP)).toBe('c1');
  });

  it('fora da pegada não acha nada', () => {
    const ctx = ctxComFamilia();
    ctx.store.exec({ type: 'addComponent', component: comp('c1') });
    expect(componentAt(ctx.store.project, 'lv_0', { x: 0.9, y: 2.2 }, MPP)).toBeNull();
    expect(componentAt(ctx.store.project, 'lv_0', { x: 1.4, y: 3 }, MPP)).toBeNull();
  });

  it('ignora componente de outro nível', () => {
    const ctx = ctxComFamilia();
    ctx.store.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pav. 1', elevation: 3 }) });
    ctx.store.exec({ type: 'addComponent', component: comp('c1', { levelId: 'lv_1' }) });
    expect(componentAt(ctx.store.project, 'lv_0', { x: 1.4, y: 2.2 }, MPP)).toBeNull();
    expect(componentAt(ctx.store.project, 'lv_1', { x: 1.4, y: 2.2 }, MPP)).toBe('c1');
  });

  it('entre sobrepostos vence o de menor área', () => {
    const ctx = ctxComFamilia();
    ctx.store.exec({ type: 'addComponent', component: comp('grande', { typeId: 'A80' }) });
    ctx.store.exec({ type: 'addComponent', component: comp('pequeno', { typeId: 'A60' }) });
    expect(componentAt(ctx.store.project, 'lv_0', { x: 1.4, y: 2.2 }, MPP)).toBe('pequeno');
  });
});
