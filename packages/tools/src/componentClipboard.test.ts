import { describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO, ProjectStore, createEmptyProject, isComponent } from '@hestia/model';
import { clipboardFrom, copyableIds, pasteAlignedCommand, pasteComponentsCommand } from './clipboard.ts';
import { setPasteClip } from './pasteTool.ts';
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
      rotation: Math.PI / 2,
      mirrored: true,
      values: { L: 800 },
      mark: 'M-01',
    },
  });
  return ctx;
}

const componentes = (store: ProjectStore) => Object.values(store.project.elements).filter(isComponent);

describe('copiar e colar componentes', () => {
  it('clipboardFrom leva o componente e a família; copyableIds o inclui', () => {
    const ctx = ctxComComponente();
    const clip = clipboardFrom(ctx.store.project, ['c1'])!;
    expect(clip.components).toHaveLength(1);
    expect(clip.componentFamilies?.map((f) => f.id)).toEqual([FAMILIA_ARMARIO.id]);
    expect(copyableIds(ctx.store.project, ['c1'])).toEqual(['c1']);
  });

  it('colar no mesmo projeto clona com id novo, marca vazia e mesmos valores', () => {
    const ctx = ctxComComponente();
    const clip = clipboardFrom(ctx.store.project, ['c1'])!;
    const r = pasteAlignedCommand(ctx.store.project, clip, 'lv_0')!;
    expect(r.componentIds).toHaveLength(1);
    ctx.store.exec(r.command);
    const novo = ctx.store.project.elements[r.componentIds[0]!];
    expect(isComponent(novo)).toBe(true);
    if (!isComponent(novo)) throw new Error('não é componente');
    expect(novo.id).not.toBe('c1');
    expect(novo.familyId).toBe(FAMILIA_ARMARIO.id);
    expect(novo.typeId).toBe('A80');
    expect(novo.values).toEqual({ L: 800 });
    expect(novo.mark).toBe('');
    expect(novo.rotation).toBeCloseTo(Math.PI / 2, 9);
    expect(novo.mirrored).toBe(true);
    expect(componentes(ctx.store)).toHaveLength(2);
    ctx.store.undo();
    expect(componentes(ctx.store)).toHaveLength(1);
  });

  it('colar num projeto sem a família leva a família junto por upsertFamily', () => {
    const origem = ctxComComponente();
    const clip = clipboardFrom(origem.store.project, ['c1'])!;
    const destino = new ProjectStore(createEmptyProject('Destino'));
    const r = pasteComponentsCommand(destino.project, clip, 'lv_0')!;
    expect(r.command.type).toBe('batch');
    if (r.command.type !== 'batch') throw new Error('esperava um lote');
    expect(r.command.commands[0]?.type).toBe('upsertFamily');
    destino.exec(r.command);
    expect(destino.project.componentFamilies?.[FAMILIA_ARMARIO.id]).toEqual(FAMILIA_ARMARIO);
    expect(componentes(destino)).toHaveLength(1);
  });

  it('o buffer é um retrato: mexer no original depois não muda a cópia', () => {
    const ctx = ctxComComponente();
    const clip = clipboardFrom(ctx.store.project, ['c1'])!;
    ctx.store.exec({ type: 'updateComponent', id: 'c1', patch: { x: 9, y: 9 } });
    const r = pasteComponentsCommand(ctx.store.project, clip, 'lv_0')!;
    ctx.store.exec(r.command);
    const novo = ctx.store.project.elements[r.componentIds[0]!];
    expect(isComponent(novo) && novo.x).toBe(1);
    expect(isComponent(novo) && novo.y).toBe(2);
  });

  it('o Colar com prévia posiciona o componente e desfaz num passo só', () => {
    const ctx = ctxComComponente();
    setPasteClip(clipboardFrom(ctx.store.project, ['c1'])!);
    const t = tool('paste', ctx.env);
    t.move(P(1.4, 2.27));
    expect(t.preview().some((i) => i.kind === 'polygon')).toBe(true);
    t.click(P(1.4, 2.27));
    expect(componentes(ctx.store)).toHaveLength(2);
    ctx.store.undo();
    expect(componentes(ctx.store)).toHaveLength(1);
  });
});
