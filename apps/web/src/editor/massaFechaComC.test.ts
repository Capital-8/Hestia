import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, isMass, ProjectStore } from '@hestia/model';
import { editor } from './controller.ts';
import { useUi } from './state.ts';

const tecla = (key: string): KeyboardEvent => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }) as unknown as KeyboardEvent;
const clique = (x: number, y: number): void => editor.activeTool.click({ point: { x, y }, raw: { x, y }, screen: { x: 0, y: 0 }, button: 0, shift: false, ctrl: false, alt: false } as never);

describe('tecla C fecha o perfil livre da massa (a letra não entrava no campo numérico)', () => {
  beforeEach(() => {
    editor.load(new ProjectStore(createEmptyProject()).project, 'teste.hestia.json');
    useUi.setState({ view: 'plan', dialog: null, typed: '', prompt: null, options: { ...useUi.getState().options, mass: { modo: 'extrusao', perfil: 'livre', altura: 9, lados: 6, galeria: false } } });
    editor.setTool('mass');
  });

  it('com 3 pontos, C cria a massa livre de 3 vértices', () => {
    clique(0, 0);
    clique(4, 0);
    clique(2, 3);
    expect(editor.key(tecla('c'))).toBe(true);
    const massas = Object.values(editor.project.elements).filter(isMass);
    expect(massas).toHaveLength(1);
    const perfil = massas[0]!.secoes[0]!.perfil;
    expect(perfil.forma).toBe('livre');
    expect(perfil.forma === 'livre' && perfil.pontos.length).toBe(3);
  });

  it('com 2 pontos, C não fecha nada (nenhuma massa)', () => {
    clique(0, 0);
    clique(4, 0);
    editor.key(tecla('c'));
    expect(Object.values(editor.project.elements).filter(isMass)).toHaveLength(0);
  });
});
