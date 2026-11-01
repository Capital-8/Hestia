import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall } from '@hestia/model';
import { editor } from '../editor/controller.ts';
import { casador, trocarPerfil } from '../editor/shortcutConfig.ts';
import { useUi } from '../editor/state.ts';
import { selecionarVisiveis3D } from '../editor/vista3dAoVivo.ts';
import { executaComandoDoMenu } from './useCanvasContextMenu.ts';

// Espiona a seleção por caixa/visíveis: o teste mede só quem a chama, não a câmera.
vi.mock('../editor/vista3dAoVivo.ts', async (orig) => ({
  ...(await orig<typeof import('../editor/vista3dAoVivo.ts')>()),
  selecionarVisiveis3D: vi.fn(() => true),
}));

const tecla = (key: string, ctrlKey = false): KeyboardEvent =>
  ({ key, ctrlKey, metaKey: false, shiftKey: false, altKey: false }) as unknown as KeyboardEvent;

const camera = { fit: () => {}, orbit: { zoom: () => {} } };
const centro = { x: 0, y: 0 };

function setup(view: 'plan' | '3d'): void {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'A', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'B', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 2 }, b: { x: 4, y: 2 } }) });
  editor.load(s.project, 'teste.hestia.json');
  trocarPerfil('revit');
  casador.limpar();
  useUi.setState({ view, planKind: 'floor', levelId: 'lv_0', areaPlanId: null, sectionId: null, selection: ['A'], tool: 'select', typed: '', prompt: null, dialog: null, dialogArg: null, viewTemp: {} });
  vi.mocked(selecionarVisiveis3D).mockClear();
}

describe('Ctrl+A não seleciona os visíveis da 3D', () => {
  beforeEach(() => setup('3d'));

  it('na 3D, Ctrl+A não chama selecionarVisiveis3D nem muda a seleção', () => {
    expect(editor.key(tecla('a', true))).toBe(false);
    expect(selecionarVisiveis3D).not.toHaveBeenCalled();
    expect(useUi.getState().selection).toEqual(['A']);
  });
});

describe('menu "Visíveis na vista"', () => {
  it('na 3D chama selecionarVisiveis3D', () => {
    setup('3d');
    executaComandoDoMenu('selectAllView', '3d', camera, centro);
    expect(selecionarVisiveis3D).toHaveBeenCalledTimes(1);
  });

  it('na planta não chama selecionarVisiveis3D (segue o mesmo tipo do nível)', () => {
    setup('plan');
    executaComandoDoMenu('selectAllView', 'plan', camera, centro);
    expect(selecionarVisiveis3D).not.toHaveBeenCalled();
    expect(useUi.getState().selection.sort()).toEqual(['A', 'B']);
  });
});
