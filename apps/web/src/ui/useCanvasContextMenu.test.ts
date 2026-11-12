import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall } from '@hestia/model';
import { editor } from '../editor/controller.ts';
import { casador, trocarPerfil } from '../editor/shortcutConfig.ts';
import { useUi } from '../editor/state.ts';
import { executaComandoDoMenu } from './useCanvasContextMenu.ts';

const tecla = (key: string, ctrlKey = false): KeyboardEvent =>
  ({ key, ctrlKey, metaKey: false, shiftKey: false, altKey: false }) as unknown as KeyboardEvent;

const camera = { fit: () => {}, orbit: { zoom: () => {} } };
const centro = { x: 0, y: 0 };

/**
 * Projeto de teste: paredes A1 e A2 (tipo wt_alv14), B1 (tipo wt_ext19); portas D1 e D2 (ot_p80) e D3 (ot_p90);
 * janelas J1 e J2 (ot_j120) e J3 (ot_j60). Tudo no nível lv_0.
 */
function setup(view: 'plan' | '3d', selection: string[]): void {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'A1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'A2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 2 }, b: { x: 4, y: 2 } }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'B1', typeId: 'wt_ext19', levelId: 'lv_0', a: { x: 0, y: 4 }, b: { x: 4, y: 4 } }) });
  const abertura = (id: string, kind: 'door' | 'window', typeId: string, hostId: string, offset: number) =>
    s.exec({ type: 'addOpening', opening: { id, kind, typeId, hostId, offset, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  abertura('D1', 'door', 'ot_p80', 'A1', 0.5);
  abertura('D2', 'door', 'ot_p80', 'A2', 0.5);
  abertura('D3', 'door', 'ot_p90', 'B1', 0.5);
  abertura('J1', 'window', 'ot_j120', 'A1', 2.5);
  abertura('J2', 'window', 'ot_j120', 'A2', 2.5);
  abertura('J3', 'window', 'ot_j60', 'B1', 2.5);
  editor.load(s.project, 'teste.hestia.json');
  trocarPerfil('revit');
  casador.limpar();
  useUi.setState({ view, levelId: 'lv_0', planViewId: 'pv_lv_0', sectionId: null, selection, selectedLevel: null, tool: 'select', typed: '', prompt: null, dialog: null, dialogArg: null, viewTemp: {} });
}

const selecao = (): string[] => [...useUi.getState().selection].sort();

describe('Ctrl+A na 3D continua sem efeito', () => {
  beforeEach(() => setup('3d', ['A1']));

  it('Ctrl+A na 3D não muda a seleção', () => {
    expect(editor.key(tecla('a', true))).toBe(false);
    expect(selecao()).toEqual(['A1']);
  });
});

describe('Selecionar todas as instâncias (mesmo tipo do elemento clicado)', () => {
  it('parede: na 3D seleciona só as paredes do mesmo tipo, não as de tipo diferente', () => {
    setup('3d', ['A1']);
    executaComandoDoMenu('selectAllView', '3d', camera, centro);
    expect(selecao()).toEqual(['A1', 'A2']);
  });

  it('porta: na 3D seleciona só as portas do mesmo tipo', () => {
    setup('3d', ['D1']);
    executaComandoDoMenu('selectAllView', '3d', camera, centro);
    expect(selecao()).toEqual(['D1', 'D2']);
  });

  it('janela: na 3D seleciona só as janelas do mesmo tipo', () => {
    setup('3d', ['J1']);
    executaComandoDoMenu('selectAllView', '3d', camera, centro);
    expect(selecao()).toEqual(['J1', 'J2']);
  });

  it('parede: "Visíveis na vista" na planta pega o mesmo tipo e deixa de fora o oculto na vista', () => {
    setup('plan', ['A2']);
    executaComandoDoMenu('hideElements', 'plan', camera, centro);
    useUi.setState({ selection: ['A1'] });
    executaComandoDoMenu('selectAllVisible', 'plan', camera, centro);
    expect(selecao()).toEqual(['A1']);
  });

  it('parede: na planta o critério é o mesmo', () => {
    setup('plan', ['A1']);
    executaComandoDoMenu('selectAllView', 'plan', camera, centro);
    expect(selecao()).toEqual(['A1', 'A2']);
  });
});
