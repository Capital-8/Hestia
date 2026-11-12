import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall } from '@hestia/model';
import { editor } from './controller.ts';
import { casador, trocarPerfil } from './shortcutConfig.ts';
import { useUi } from './state.ts';

/** Tecla como o `KeyboardEvent` que o App entrega ao controlador. */
const tecla = (key: string, mods: { ctrlKey?: boolean } = {}): KeyboardEvent =>
  ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods }) as unknown as KeyboardEvent;

/** Projeto de um nível com uma parede, já carregado no editor, com a parede selecionada. */
function setup(): void {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'A', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  editor.load(s.project, 'teste.hestia.json');
  trocarPerfil('revit');
  casador.limpar();
  useUi.setState({ view: 'plan', levelId: 'lv_0', planViewId: 'pv_lv_0', selection: ['A'], tool: 'select', typed: '', prompt: null, dialog: null, dialogArg: null });
}

describe('Ctrl+X recorta e Ctrl+V inicia o Colar com prévia', () => {
  beforeEach(setup);

  it('Ctrl+X copia e apaga a parede; Ctrl+V entra na ferramenta Colar', () => {
    expect(editor.key(tecla('x', { ctrlKey: true }))).toBe(true);
    expect(editor.project.elements['A']).toBeUndefined();
    expect(useUi.getState().selection).toEqual([]);
    expect(editor.key(tecla('v', { ctrlKey: true }))).toBe(true);
    expect(editor.activeTool.id).toBe('paste');
    expect(useUi.getState().tool).toBe('paste');
  });
});

describe('atalho de duas letras de Criar semelhante', () => {
  beforeEach(setup);

  it('C, S ativa a ferramenta Parede com o tipo da parede selecionada', () => {
    editor.setTool('select');
    expect(editor.key(tecla('C'))).toBe(true);
    expect(editor.key(tecla('S'))).toBe(true);
    expect(editor.activeTool.id).toBe('wall');
    expect(useUi.getState().options.wallTypeId).toBe('wt_alv14');
  });
});
