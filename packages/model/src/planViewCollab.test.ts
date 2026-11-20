import { describe, expect, it } from 'vitest';
import type { Patch } from 'immer';
import { ProjectStore, createEmptyProject, makePlanView, makeWall } from './index.ts';
import { checkModelIntegrityForCollab, extractTouchedIds } from './collabHistory.ts';

describe('colaboração: planViews é coleção', () => {
  it('extractTouchedIds trata planViews como coleção (índice vira planViews:N; lista inteira vira __planViews__)', () => {
    const patches: Patch[] = [
      { op: 'add', path: ['planViews', 0], value: {} },
      { op: 'replace', path: ['planViews', 1, 'name'], value: 'X' },
      { op: 'replace', path: ['planViews', 'length'], value: 2 },
    ];
    expect(extractTouchedIds(patches)).toEqual(['planViews:0', 'planViews:1', '__planViews__']);
  });

  it('criar a primeira planta toca a coleção (campo novo vira patch na raiz)', () => {
    const store = new ProjectStore(createEmptyProject());
    const d = store.execAsAuthor('ana', 'Ana', [{ type: 'addPlanView', plan: makePlanView({ id: 'pv1', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura' }) }]);
    expect(d).not.toBeNull();
    expect(d!.touchedIds).toEqual(['__planViews__']);
  });

  it('Ana cria a planta, Bruno a altera: o desfazer de Ana conflita; depois que Bruno desfaz, Ana desfaz', () => {
    const store = new ProjectStore(createEmptyProject());
    store.execAsAuthor('ana', 'Ana', [{ type: 'addPlanView', plan: makePlanView({ id: 'pv1', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura' }) }]);
    store.execAsAuthor('bruno', 'Bruno', [{ type: 'updatePlanView', id: 'pv1', patch: { name: 'Fôrmas' } }]);
    const res = store.undoByAuthor('ana');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res).toMatchObject({ reason: 'conflict', conflictAuthor: 'Bruno' });
    expect(store.project.planViews![0]!.name).toBe('Fôrmas');
    expect(store.undoByAuthor('bruno').ok).toBe(true);
    expect(store.undoByAuthor('ana').ok).toBe(true);
    expect(store.project.planViews).toBeUndefined();
  });

  it('autores diferentes em plantas adicionais diferentes não conflitam', () => {
    const store = new ProjectStore(createEmptyProject());
    store.execAsAuthor('ana', 'Ana', [{ type: 'addPlanView', plan: makePlanView({ id: 'pv1', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura' }) }]);
    store.execAsAuthor('bruno', 'Bruno', [{ type: 'addPlanView', plan: makePlanView({ id: 'pv2', levelId: 'lv_0', name: 'HVAC', discipline: 'hvac' }) }]);
    store.execAsAuthor('bruno', 'Bruno', [{ type: 'setPlanGraphics', planId: 'pv2', patch: { scale: 50 } }]);
    // Bruno mexeu no índice 1; a criação de Ana tocou o índice 0 e a raiz da lista: o conflito, se houver, é só pela raiz.
    const res = store.undoByAuthor('bruno');
    expect(res.ok).toBe(true);
    expect(store.project.planViews!.map((v) => v.id)).toEqual(['pv1', 'pv2']);
    expect(store.project.planViews![1]!.graphics).toBeUndefined();
  });

  it('integridade: etiqueta nas anotações da planta adicional apontando para elemento ausente é órfã', () => {
    const p = createEmptyProject();
    p.elements.w1 = makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) as never;
    p.planViews = [makePlanView({ id: 'pv1', levelId: 'lv_0', name: 'E', discipline: 'estrutura', annotations: { dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [{ id: 'ok', hostId: 'w1', at: { x: 0, y: 0 }, property: 'name' }, { id: 'orfa', hostId: 'sumiu', at: { x: 0, y: 0 }, property: 'name' }] } })];
    expect(checkModelIntegrityForCollab(p)).toEqual({ ok: false, orphanIds: ['orfa'] });
  });
});
