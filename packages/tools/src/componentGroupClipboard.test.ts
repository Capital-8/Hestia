import { describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO, isComponent, type Component, type ComponentGroup } from '@hestia/model';
import { clipboardFrom, pasteAlignedCommand, pasteComponentsCommand } from './clipboard.ts';
import { setPasteClip } from './pasteTool.ts';
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

/** Projeto com três componentes na fila "Conjunto 1", com linha. */
function ctxComConjunto() {
  const ctx = makeEnv();
  ctx.store.exec({ type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
  ctx.store.exec({ type: 'addComponent', component: comp('c1', 1) });
  ctx.store.exec({ type: 'addComponent', component: comp('c2', 4) });
  ctx.store.exec({ type: 'addComponent', component: comp('c3', 7) });
  ctx.store.exec({
    type: 'upsertComponentGroup',
    group: { id: 'g1', nome: 'Conjunto 1', levelId: 'lv_0', membros: ['c1', 'c2', 'c3'], linha: { a: { x: 1, y: 2 }, b: { x: 7, y: 2 } } },
  });
  return ctx;
}

const grupos = (ctx: ReturnType<typeof makeEnv>): ComponentGroup[] => Object.values(ctx.store.project.componentGroups ?? {});

describe('copiar e colar conjunto', () => {
  it('o buffer leva o conjunto apenas quando todos os membros estão copiados', () => {
    const ctx = ctxComConjunto();
    const inteiro = clipboardFrom(ctx.store.project, ['c1', 'c2', 'c3'])!;
    expect(inteiro.groups).toHaveLength(1);
    expect(inteiro.groups?.[0]?.id).toBe('g1');

    const parte = clipboardFrom(ctx.store.project, ['c1', 'c2'])!;
    expect(parte.groups).toEqual([]);
  });

  it('colar o conjunto cria um conjunto novo com ids novos, nome "(cópia)" e a linha', () => {
    const ctx = ctxComConjunto();
    const clip = clipboardFrom(ctx.store.project, ['c1', 'c2', 'c3'])!;
    const r = pasteAlignedCommand(ctx.store.project, clip, 'lv_0')!;
    ctx.store.exec(r.command);
    expect(grupos(ctx)).toHaveLength(2);
    const novo = grupos(ctx).find((g) => g.id !== 'g1')!;
    expect(novo.nome).toBe('Conjunto 1 (cópia)');
    expect(novo.levelId).toBe('lv_0');
    expect(novo.membros).toEqual(r.componentIds);
    expect(novo.linha).toEqual({ a: { x: 1, y: 2 }, b: { x: 7, y: 2 } });
    for (const id of r.componentIds) {
      const c = ctx.store.project.elements[id];
      expect(isComponent(c) && c.groupId).toBe(novo.id);
    }
    ctx.store.undo();
    expect(grupos(ctx)).toHaveLength(1);
  });

  it('conjunto copiado em parte cola os componentes soltos, sem recriar o conjunto', () => {
    const ctx = ctxComConjunto();
    const clip = clipboardFrom(ctx.store.project, ['c1', 'c2'])!;
    const r = pasteComponentsCommand(ctx.store.project, clip, 'lv_0')!;
    ctx.store.exec(r.command);
    expect(grupos(ctx)).toHaveLength(1);
    for (const id of r.componentIds) {
      const c = ctx.store.project.elements[id];
      expect(isComponent(c) && c.groupId).toBeUndefined();
    }
  });

  it('é compatível com buffers antigos sem `groups`', () => {
    const ctx = ctxComConjunto();
    const clip = clipboardFrom(ctx.store.project, ['c1', 'c2', 'c3'])!;
    delete clip.groups;
    const r = pasteComponentsCommand(ctx.store.project, clip, 'lv_0')!;
    expect(r.componentIds).toHaveLength(3);
    ctx.store.exec(r.command);
    expect(grupos(ctx)).toHaveLength(1);
  });

  it('o Colar com prévia translada a linha junto com o conjunto, num passo de desfazer', () => {
    const ctx = ctxComConjunto();
    setPasteClip(clipboardFrom(ctx.store.project, ['c1', 'c2', 'c3'])!);
    const t = tool('paste', ctx.env);
    t.move(P(5, 5));
    t.click(P(5, 5));
    const novo = grupos(ctx).find((g) => g.id !== 'g1')!;
    const primeiro = ctx.store.project.elements[novo.membros[0]!];
    if (!isComponent(primeiro)) throw new Error('não é componente');
    const dx = primeiro.x - 1;
    const dy = primeiro.y - 2;
    expect(novo.linha?.a.x).toBeCloseTo(1 + dx, 9);
    expect(novo.linha?.a.y).toBeCloseTo(2 + dy, 9);
    ctx.store.undo();
    expect(grupos(ctx)).toHaveLength(1);
    expect(grupos(ctx)[0]?.linha?.a).toEqual({ x: 1, y: 2 });
  });
});
