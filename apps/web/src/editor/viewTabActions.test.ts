import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall } from '@hestia/model';
import { editor } from './controller.ts';
import { DEFAULT_OPTIONS, useUi } from './state.ts';
import { activateView, openFaceStudioTab, tabOf } from './viewTabActions.ts';

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

  it('openFaceStudioTab abre a aba do estúdio da face quando o elemento existe e é pintável', () => {
    editor.store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    openFaceStudioTab('w1', 'sideExt', 'all');
    expect(useUi.getState().view).toBe('face');
    expect(useUi.getState().faceView).toEqual({ elementId: 'w1', face: 'sideExt', layer: 'all' });
    expect(tabOf(editor.project, { kind: 'face', elementId: 'w1', face: 'sideExt', layer: 'all' })).toEqual({ icon: 'elevation', label: 'Face · sideExt' });
    expect(tabOf(editor.project, { kind: 'face', elementId: 'missing', face: 'sideExt', layer: 'all' })).toBeNull();
  });
});
