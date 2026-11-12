import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, floorViewId, roofViewId } from '@hestia/model';
import { editor } from './controller.ts';
import { DEFAULT_OPTIONS, useUi } from './state.ts';
import { activateView } from './viewTabActions.ts';

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
    activateView({ kind: 'plan', viewId: floorViewId(levelId) });
    activateView({ kind: 'plan', viewId: roofViewId(levelId) });
    expect(useUi.getState().planViewId).toBe(roofViewId(levelId));
    expect(useUi.getState().openViews).toEqual([{ kind: 'plan', viewId: floorViewId(levelId) }, { kind: 'plan', viewId: roofViewId(levelId) }]);
  });

  it('reabrir a vista já ativa com o modo aberto ainda garante a aba', () => {
    editor.setTool('floor');
    const { levelId } = useUi.getState();
    useUi.setState({ openViews: [] });
    activateView({ kind: 'plan', viewId: floorViewId(levelId) });
    expect(useUi.getState().openViews).toEqual([{ kind: 'plan', viewId: floorViewId(levelId) }]);
  });
});
