import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { createEmptyProject, isRoom, makeRoom, makeWall, ProjectStore, type Room } from '@hestia/model';
import { editor } from './controller.ts';
import { DEFAULT_OPTIONS, useUi } from './state.ts';

const ring = (pts: Array<[number, number]>): Vec2[] => pts.map(([x, y]) => ({ x, y }));

const info = (x: number, y: number): { raw: Vec2; shift: boolean; ctrl: boolean; alt: boolean } => ({
  raw: { x, y }, shift: false, ctrl: false, alt: false,
});

/** Clique de mouse como a tela envia: down, up e click (o `selectTool` decide no down e confirma no up). */
const cliqueMouse = (x: number, y: number): void => {
  const p = info(x, y);
  editor.pointer('down', p);
  editor.pointer('up', p);
  editor.pointer('click', p);
};

const tecla = (k: string): boolean => editor.key({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false } as KeyboardEvent);

/** Projeto de teste: sala retangular com o rótulo no centro (2; 2,5). */
function projeto(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  const pts = ring([[0, 0], [0, 5], [4, 5], [4, 0]]);
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length]!;
    s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: 'lv_0', a, b, locationLine: 'finishInterior' }) });
  });
  s.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: 'lv_0', name: 'Sala', number: '101', point: { x: 2, y: 2.5 } }) });
  return s;
}

/** Abre a planta de piso no controlador, com a ferramenta Selecionar. */
function iniciarPlanta(): void {
  editor.load(projeto().project, 'teste.hestia.json');
  useUi.setState({ view: 'plan', levelId: 'lv_0', planKind: 'floor', planViewId: 'pv_lv_0', selection: [], hover: null, options: DEFAULT_OPTIONS });
  editor.setTool('select');
}

const sala = (): Room => {
  const r = editor.project.elements.r1;
  if (!isRoom(r)) throw new Error('ambiente r1 ausente');
  return r;
};

/**
 * Arrasta o rótulo do ambiente para fora do lugar e solta: o gesto termina com `up` sem `click` (a tela só emite o
 * `click` quando não houve arrasto). É o cenário que deixa `suppressNextClick` armado.
 */
function arrastarRotulo(): void {
  editor.pointer('down', info(2, 2.5));
  editor.pointer('drag', info(2.6, 2.5));
  editor.pointer('up', info(2.6, 2.5));
}

describe('arraste do rótulo de ambiente não deixa estado preso', () => {
  beforeEach(() => { useUi.setState({ options: DEFAULT_OPTIONS }); });

  it('o clique suprimido não sobrevive à troca de ferramenta', () => {
    iniciarPlanta();
    arrastarRotulo();
    expect(useUi.getState().tagDrag).toBeNull();

    // A troca de ferramenta (e a volta para Selecionar) zera a supressão: o clique chega à ferramenta e seleciona.
    editor.setTool('wall');
    editor.setTool('select');
    const clique = vi.spyOn(editor.activeTool, 'click');
    cliqueMouse(0, 2.5);
    expect(clique).toHaveBeenCalled();
    expect(useUi.getState().selection).toEqual(['w0']);
  });

  it('o arraste ainda suprime o clique imediatamente seguinte (semântica do rótulo preservada)', () => {
    iniciarPlanta();
    arrastarRotulo();
    expect(useUi.getState().tagDrag).toBeNull();

    // O gesto de arrasto não emite `click`; o próximo `click` da tela é o do gesto antigo e continua engolido.
    const clique = vi.spyOn(editor.activeTool, 'click');
    editor.pointer('click', info(0, 2.5));
    expect(clique).not.toHaveBeenCalled();
  });

  it('trocar de ferramenta no meio do arraste descarta o rótulo e não grava setRoomLabel', () => {
    iniciarPlanta();
    editor.pointer('down', info(2, 2.5));
    editor.pointer('drag', info(2.6, 2.5));
    expect(useUi.getState().tagDrag).not.toBeNull();

    editor.setTool('select');
    expect(useUi.getState().tagDrag).toBeNull();
    const versao = editor.store.version;
    editor.pointer('up', info(2.6, 2.5));
    expect(editor.store.version).toBe(versao);
    expect(sala().labelPosition).toBeUndefined();

    // Um arrasto seguinte vindo da parede é seleção de janela, não o rótulo antigo.
    editor.pointer('down', info(0, 2.5));
    editor.pointer('drag', info(3.5, 3.5));
    editor.pointer('up', info(3.5, 3.5));
    expect(sala().labelPosition).toBeUndefined();
  });

  it('load descarta o arraste do projeto anterior, mesmo com o mesmo id de ambiente', () => {
    iniciarPlanta();
    editor.pointer('down', info(2, 2.5));
    editor.pointer('drag', info(2.6, 2.5));
    expect(useUi.getState().tagDrag).not.toBeNull();

    // Projeto novo reusa `lv_0` e `r1`: o arraste residual moveria o rótulo do projeto NOVO.
    editor.load(projeto().project, 'novo.hestia.json');
    expect(useUi.getState().tagDrag).toBeNull();
    expect(sala().labelPosition).toBeUndefined();

    editor.pointer('down', info(0, 2.5));
    editor.pointer('drag', info(3.5, 3.5));
    editor.pointer('up', info(3.5, 3.5));
    expect(sala().labelPosition).toBeUndefined();
    expect(editor.store.undoLabel).not.toBe('Mover rótulo');
  });

  it('Esc no meio do arraste também descarta o rótulo', () => {
    iniciarPlanta();
    editor.pointer('down', info(2, 2.5));
    editor.pointer('drag', info(2.6, 2.5));
    const versao = editor.store.version;
    expect(tecla('Escape')).toBe(true);
    expect(useUi.getState().tagDrag).toBeNull();
    editor.pointer('up', info(2.6, 2.5));
    expect(editor.store.version).toBe(versao);
  });
});
