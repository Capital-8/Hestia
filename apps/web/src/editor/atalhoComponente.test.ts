import { beforeEach, describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO, ProjectStore, createEmptyProject } from '@hestia/model';
import { editor } from './controller.ts';
import { casador, trocarPerfil } from './shortcutConfig.ts';
import { useUi } from './state.ts';

const tecla = (key: string, shiftKey = false): KeyboardEvent =>
  ({ key, ctrlKey: false, metaKey: false, shiftKey, altKey: false }) as unknown as KeyboardEvent;

describe('teclas da ferramenta Componente chegam à ferramenta', () => {
  beforeEach(() => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'upsertFamily', family: structuredClone(FAMILIA_ARMARIO) });
    editor.load(s.project, 'teste.hestia.json');
    trocarPerfil('revit');
    casador.limpar();
    useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', areaPlanId: null, selection: [], tool: 'select', typed: '', prompt: null, dialog: null, dialogArg: null });
    useUi.setState((u) => ({ options: { ...u.options, componentFamilyId: FAMILIA_ARMARIO.id, componentTypeId: null } }));
    editor.setTool('component');
  });

  const colocar = (): { rotation: number; mirrored: boolean } => {
    const info = { raw: { x: 3, y: 3 }, shift: false, ctrl: false, alt: false };
    editor.pointer('move', info);
    editor.pointer('click', info);
    const c = Object.values(editor.project.elements).find((e) => e.kind === 'component');
    if (!c || c.kind !== 'component') throw new Error('nada inserido');
    return { rotation: c.rotation, mirrored: c.mirrored };
  };

  it('R gira 90° antes de inserir', () => {
    expect(editor.key(tecla('r'))).toBe(true);
    expect(colocar().rotation).toBeCloseTo(Math.PI / 2, 9);
  });

  it('M espelha antes de inserir', () => {
    expect(editor.key(tecla('m'))).toBe(true);
    expect(colocar().mirrored).toBe(true);
  });

  it('Shift+R gira no sentido contrário', () => {
    expect(editor.key(tecla('R', true))).toBe(true);
    const r = colocar().rotation;
    expect(Math.cos(r)).toBeCloseTo(0, 9);
    expect(Math.sin(r)).toBeCloseTo(-1, 9);
  });

  it('a tecla R fora da ferramenta Componente continua iniciando atalhos (RO...)', () => {
    editor.setTool('select');
    expect(editor.key(tecla('r'))).toBe(true);
  });
});
