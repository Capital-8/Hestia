import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall } from '@hestia/model';
import { editor } from './controller.ts';
import { resolveText } from './i18n.ts';
import { casador, trocarPerfil } from './shortcutConfig.ts';
import { useUi } from './state.ts';

/** Tecla como o `KeyboardEvent` que o App entrega ao controlador. */
const tecla = (key: string): KeyboardEvent =>
  ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }) as unknown as KeyboardEvent;

function setup(): void {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'A', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addView', view: { id: 'sec1', name: 'Corte', kind: 'section', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, depth: 3 } });
  editor.load(s.project, 'teste.hestia.json');
  trocarPerfil('revit');
  casador.limpar();
  useUi.setState({ view: '3d', planKind: 'floor', levelId: 'lv_0', planViewId: 'pv_lv_0', sectionId: null, selection: ['A'], tool: 'select', typed: '', prompt: null, dialog: null, dialogArg: null, viewTemp: {} });
}

const atalho = (...keys: string[]): void => { for (const k of keys) editor.key(tecla(k)); };

describe('atalhos de visibilidade no 3D e no corte', () => {
  beforeEach(setup);

  it('HH oculta temporariamente e HR restaura no 3D', () => {
    atalho('H', 'H');
    expect(useUi.getState().viewTemp['3d']?.hidden?.elements).toEqual(['A']);
    expect(resolveText(useUi.getState().status, 'pt')).toContain('Oculto temporariamente');
    atalho('H', 'R');
    expect(useUi.getState().viewTemp['3d']?.hidden).toBeUndefined();
    expect(resolveText(useUi.getState().status, 'pt')).toContain('restaurado');
  });

  it('EH oculta na vista 3D e EU reexibe; RH liga o Reveal', () => {
    atalho('E', 'H');
    expect(editor.project.view3d?.hidden?.elements).toEqual(['A']);
    atalho('R', 'H');
    expect(useUi.getState().viewTemp['3d']?.reveal).toBe(true);
    atalho('E', 'U');
    expect(editor.project.view3d?.hidden?.elements).toBeUndefined();
    expect(useUi.getState().viewTemp['3d']?.reveal).toBe(true);
  });

  it('HH/HR também valem no corte, sem trocar de ferramenta', () => {
    useUi.setState({ view: 'section', sectionId: 'sec1', selection: ['A'] });
    atalho('H', 'H');
    expect(useUi.getState().viewTemp['section:sec1']?.hidden?.elements).toEqual(['A']);
    expect(useUi.getState().tool).toBe('select');
    atalho('H', 'R');
    expect(useUi.getState().viewTemp['section:sec1']?.hidden).toBeUndefined();
  });
});
