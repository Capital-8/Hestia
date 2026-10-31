import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall } from '@hestia/model';
import { editor } from './controller.ts';
import { clickSelect3d, useUi } from './state.ts';

/** Tecla sem modificadores, como o `KeyboardEvent` que o App entrega ao controlador. */
const tecla = (key: string): KeyboardEvent => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }) as unknown as KeyboardEvent;

describe('seleção na vista de corte (decisão 0016, seção "Seleção em cortes e elevações")', () => {
  beforeEach(() => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    store.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 4, y: 0 }, b: { x: 4, y: 3 } }) });
    store.exec({ type: 'addView', view: { id: 'corte_a', name: 'Corte A', kind: 'section', a: { x: -1, y: 1 }, b: { x: 6, y: 1 }, depth: 8 } });
    editor.load(store.project, 'teste.hestia.json');
    editor.openSection('corte_a');
  });

  it('a vista de corte usa o mesmo caminho de seleção: o clique troca, o Shift acrescenta, o vazio limpa', () => {
    expect(useUi.getState().view).toBe('section');
    clickSelect3d('w1', false);
    expect(useUi.getState().selection).toEqual(['w1']);
    clickSelect3d('w2', true);
    expect(useUi.getState().selection).toEqual(['w1', 'w2']);
    clickSelect3d(null, false);
    expect(useUi.getState().selection).toEqual([]);
  });

  it('Delete na vista de corte exclui a seleção (como na planta e na 3D)', () => {
    clickSelect3d('w1', false);
    expect(editor.key(tecla('Delete'))).toBe(true);
    expect(editor.project.elements.w1).toBeUndefined();
    expect(editor.project.elements.w2).toBeDefined();
    expect(useUi.getState().selection).toEqual([]);
  });

  it('Backspace na vista de corte também exclui; sem seleção, a tecla não é consumida', () => {
    expect(editor.key(tecla('Backspace'))).toBe(false);
    clickSelect3d('w2', false);
    expect(editor.key(tecla('Backspace'))).toBe(true);
    expect(editor.project.elements.w2).toBeUndefined();
  });

  it('Esc na Selecionar limpa a seleção/status e mantém o corte aberto', () => {
    clickSelect3d('w1', false);
    useUi.setState({ status: 'Mensagem qualquer' });
    expect(editor.key(tecla('Escape'))).toBe(true);
    expect(useUi.getState().view).toBe('section');
    expect(useUi.getState().sectionId).toBe('corte_a');
    expect(useUi.getState().selection).toEqual([]);
    expect(useUi.getState().status).toBe('');
  });

  it('Esc com ferramenta ativa cancela a ferramenta e também não fecha o corte', () => {
    editor.setTool('text');
    expect(useUi.getState().tool).toBe('text');
    expect(editor.key(tecla('Escape'))).toBe(true);
    expect(useUi.getState().view).toBe('section');
    expect(useUi.getState().sectionId).toBe('corte_a');
    expect(useUi.getState().tool).toBe('select');
  });
});
