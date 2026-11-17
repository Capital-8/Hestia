import { describe, expect, it } from 'vitest';
import { areaPlanOf, createEmptyProject, makeTerrain, ProjectStore, sectionAnnotationsOf } from '@hestia/model';
import { createAreaPlanAction } from './areaPlanActions.ts';
import { deleteSelectionIn } from './deleteIds.ts';
import { deleteSectionAnnotationsIn } from './sectionHandles.ts';
import { useUi } from './state.ts';

const spot = { id: 'sp1', kind: 'elevation' as const, target: { x: 1, y: 1 }, at: { x: 2, y: 2 } };
const nuvem = { id: 'rc1', points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }], closed: true };
const norte = { id: 'sy1', kind: 'northArrow' as const, at: { x: 5, y: 5 }, rotation: 0 };

describe('apagar cota de ponto, nuvem e símbolo', () => {
  it('na planta de área: apaga os três e o desfazer os devolve num passo', async () => {
    const s = new ProjectStore(createEmptyProject());
    const planId = createAreaPlanAction(s, 'lv_0');
    s.exec({ type: 'addSpot', levelId: 'lv_0', planId, item: spot });
    s.exec({ type: 'addRevisionCloud', levelId: 'lv_0', planId, item: nuvem });
    s.exec({ type: 'addSymbol', levelId: 'lv_0', planId, item: norte });
    useUi.setState({ view: 'plan', planKind: 'area', areaPlanId: planId, levelId: 'lv_0', selection: ['sp1', 'rc1', 'sy1'] });
    await deleteSelectionIn(s);
    const a = areaPlanOf(s.project, planId)!.annotations!;
    expect([a.spots?.length, a.revisionClouds?.length, a.symbols?.length]).toEqual([0, 0, 0]);
    s.undo();
    const b = areaPlanOf(s.project, planId)!.annotations!;
    expect([b.spots?.length, b.revisionClouds?.length, b.symbols?.length]).toEqual([1, 1, 1]);
  });

  it('no corte: apaga os três e o desfazer os devolve num passo', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addView', view: { id: 'sv1', name: 'Corte', kind: 'section', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, depth: 4 } });
    s.exec({ type: 'addSpot', levelId: 'lv_0', sectionId: 'sv1', item: spot });
    s.exec({ type: 'addRevisionCloud', levelId: 'lv_0', sectionId: 'sv1', item: nuvem });
    s.exec({ type: 'addSymbol', levelId: 'lv_0', sectionId: 'sv1', item: norte });
    useUi.setState({ view: 'section', sectionId: 'sv1', levelId: 'lv_0', selection: ['sp1', 'rc1', 'sy1'] });
    expect(deleteSectionAnnotationsIn(s)).toBe(0);
    const a = sectionAnnotationsOf(s.project.views.find((v) => v.id === 'sv1'));
    expect([a.spots?.length ?? 0, a.revisionClouds?.length ?? 0, a.symbols?.length ?? 0]).toEqual([0, 0, 0]);
    s.undo();
    const b = sectionAnnotationsOf(s.project.views.find((v) => v.id === 'sv1'));
    expect([b.spots?.length, b.revisionClouds?.length, b.symbols?.length]).toEqual([1, 1, 1]);
  });

  it('cota de ponto e rótulo de curva do terreno: apaga só o item escolhido, com desfazer', async () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addTerrain', terrain: makeTerrain({ id: 'tn1', levelId: 'lv_0', pontos: [0, 0, 1, 10, 0, 1, 10, 10, 1], linhasRotulo: [1, 1, 3, 1, 1, 2, 3, 2], pontosCotados: [5, 5, 6, 6, 7, 7] }) });
    useUi.setState({ view: 'plan', planKind: 'floor', areaPlanId: null, levelId: 'lv_0', selection: ['tn1#cotado:1', 'tn1#rotulo:0'] });
    await deleteSelectionIn(s);
    const t = s.project.elements.tn1 as { pontosCotados: number[]; linhasRotulo: number[] };
    expect(t.pontosCotados).toEqual([5, 5, 7, 7]);
    expect(t.linhasRotulo).toEqual([1, 2, 3, 2]);
    s.undo();
    const u = s.project.elements.tn1 as { pontosCotados: number[]; linhasRotulo: number[] };
    expect(u.pontosCotados).toEqual([5, 5, 6, 6, 7, 7]);
    expect(u.linhasRotulo).toEqual([1, 1, 3, 1, 1, 2, 3, 2]);
  });
});
