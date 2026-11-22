import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, makePlanView, makeWall } from '@hestia/model';
import { editor } from './controller.ts';
import { viewKey } from './openViews.ts';
import { DEFAULT_OPTIONS, useUi } from './state.ts';
import { activateView, closeTab, openFaceStudioTab, tabOf } from './viewTabActions.ts';

/** Projeto vazio e opções padrão: o modo de perímetro abre pela ferramenta Piso. */
function iniciar(): void {
  useUi.setState({ options: DEFAULT_OPTIONS });
  editor.load(createEmptyProject(), 'teste.hestia.json');
}

describe('activateView com o modo de perímetro aberto', () => {
  beforeEach(iniciar);

  it('navegação recusada pelo modo não acrescenta a aba', () => {
    editor.setTool('floor');
    const antes = useUi.getState().openViews;
    activateView({ kind: '3d' });
    expect(useUi.getState().view).toBe('plan');
    expect(useUi.getState().openViews).toEqual(antes);
  });

  it('sem o modo, a navegação é aceita e a aba entra', () => {
    activateView({ kind: '3d' });
    expect(useUi.getState().view).toBe('3d');
    expect(useUi.getState().openViews).toContainEqual({ kind: '3d' });
  });

  it('abrir a planta de cobertura de um nível põe a aba de cobertura, distinta da de piso', () => {
    const { levelId } = useUi.getState();
    activateView({ kind: 'plan', levelId });
    activateView({ kind: 'plan', levelId, planKind: 'roof' });
    expect(useUi.getState().planKind).toBe('roof');
    expect(useUi.getState().openViews).toEqual([{ kind: 'plan', levelId }, { kind: 'plan', levelId, planKind: 'roof' }]);
  });

  it('reabrir a vista já ativa com o modo aberto ainda garante a aba', () => {
    editor.setTool('floor');
    const { levelId } = useUi.getState();
    useUi.setState({ openViews: [] });
    activateView({ kind: 'plan', levelId });
    expect(useUi.getState().openViews).toEqual([{ kind: 'plan', levelId }]);
  });

  it('aba de planta de disciplina: nome com a disciplina, ativa e fecha deixando a padrão', () => {
    const p = createEmptyProject();
    p.planViews = [makePlanView({ id: 'pv_e', levelId: 'lv_0', name: 'Fôrmas', discipline: 'estrutura' })];
    editor.load(p, 'teste.hestia.json');
    const pv = { kind: 'plan', levelId: 'lv_0', planViewId: 'pv_e' } as const;
    expect(tabOf(editor.project, pv)).toEqual({ icon: 'plan', label: 'Fôrmas · Estrutura' });
    activateView(pv);
    expect(useUi.getState().planViewId).toBe('pv_e');
    expect(useUi.getState().openViews.map(viewKey)).toEqual(['plan:lv_0', 'pv:pv_e']);
    closeTab(pv);
    expect(useUi.getState().planViewId).toBeNull();
    expect(useUi.getState().openViews.map(viewKey)).toEqual(['plan:lv_0']);
  });

  it('openFaceStudioTab abre a aba do estúdio da face quando o elemento existe e é pintável', () => {
    editor.store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    openFaceStudioTab('w1', 'sideExt', 'all');
    expect(useUi.getState().view).toBe('face');
    expect(useUi.getState().faceView).toEqual({ elementId: 'w1', face: 'sideExt', layer: 'all' });
    expect(tabOf(editor.project, { kind: 'face', elementId: 'w1', face: 'sideExt', layer: 'all' })).toEqual({ icon: 'elevation', label: 'Face · sideExt' });
    expect(tabOf(editor.project, { kind: 'face', elementId: 'missing', face: 'sideExt', layer: 'all' })).toBeNull();
  });
});
