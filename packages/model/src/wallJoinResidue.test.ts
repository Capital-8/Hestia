import { describe, expect, it } from 'vitest';
import { ProjectStore } from './history.ts';
import { createEmptyProject } from './defaults.ts';
import { makeWall } from './wall.ts';
import type { Wall } from './types.ts';

const MITER = { kind: 'miter', flip: false } as const;
const BUTT = { kind: 'butt', flip: false } as const;

/** A: (0,0)-(3,0); B: (3,0)-(3,3); canto em esquadria nas duas pontas que se tocam em (3,0). Espessura do tipo 0,14 m, tolerância 0,02 m. */
function canto(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'A', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'B', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 3, y: 0 }, b: { x: 3, y: 3 } }) });
  s.exec({ type: 'setJoin', ends: [{ wallId: 'A', end: 'b' }, { wallId: 'B', end: 'a' }], config: MITER });
  return s;
}
const w = (s: ProjectStore, id: string): Wall => s.project.elements[id] as Wall;

describe('resíduo de junção ao mover pontas', () => {
  it('ponta que perde o parceiro volta a butt nas duas paredes', () => {
    const s = canto();
    expect(w(s, 'A').joinEnd.kind).toBe('miter');
    s.exec({ type: 'setWallEnds', id: 'B', a: { x: 3, y: 1 } }); // B passa a ir de (3,1) a (3,3): longe de (3,0)
    expect(w(s, 'A').joinEnd).toEqual(BUTT);
    expect(w(s, 'B').joinStart).toEqual(BUTT);
  });

  it('canto arrastado junto (lote com as duas pontas) mantém a esquadria', () => {
    const s = canto();
    s.exec({ type: 'batch', commands: [{ type: 'setWallEnds', id: 'A', b: { x: 4, y: 0 } }, { type: 'setWallEnds', id: 'B', a: { x: 4, y: 0 } }] });
    expect(w(s, 'A').joinEnd).toEqual(MITER);
    expect(w(s, 'B').joinStart).toEqual(MITER);
  });

  it('desfazer restaura a esquadria no mesmo passo', () => {
    const s = canto();
    s.exec({ type: 'setWallEnds', id: 'B', a: { x: 3, y: 1 } });
    s.undo();
    expect(w(s, 'A').joinEnd).toEqual(MITER);
    expect(w(s, 'B').joinStart).toEqual(MITER);
    expect(w(s, 'B').a).toEqual({ x: 3, y: 0 });
  });

  it('mover só uma parede por updateElements solta a ponta do vizinho (A vai para y = 5)', () => {
    const s = canto();
    s.exec({ type: 'updateElements', ids: ['A'], patch: { a: { x: 0, y: 5 }, b: { x: 3, y: 5 } } });
    expect(w(s, 'A').joinEnd).toEqual(BUTT);
    expect(w(s, 'B').joinStart).toEqual(BUTT);
  });

  it('mexer em outra propriedade não altera a junção', () => {
    const s = canto();
    s.exec({ type: 'updateElements', ids: ['A'], patch: { height: 2.5 } });
    expect(w(s, 'A').joinEnd).toEqual(MITER);
  });
});

describe('resíduo de junção entre níveis', () => {
  /** W1 (lv_0, z 0 até `h1`) de (0,0) a (5,0); W2 (lv_1 em z 3, altura 3: faixa 3..6) de (5,0) a (5,5); esquadria nas duas pontas em (5,0). */
  function entreNiveis(h1: number, baseOffset2 = 0): ProjectStore {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'W1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 5, y: 0 }, height: h1 }) });
    s.exec({ type: 'addWall', wall: makeWall({ id: 'W2', typeId: 'wt_alv14', levelId: 'lv_1', a: { x: 5, y: 0 }, b: { x: 5, y: 5 }, height: 3, baseOffset: baseOffset2 }) });
    s.exec({ type: 'setJoin', ends: [{ wallId: 'W1', end: 'b' }, { wallId: 'W2', end: 'a' }], config: MITER });
    return s;
  }

  it('faixas 3..6 (W2) e 0..9 (W1) se sobrepõem: mover 0,05 mantém a junção; mover 1 m zera', () => {
    const s = entreNiveis(9);
    expect(w(s, 'W2').joinStart).toEqual(MITER);
    s.exec({ type: 'setWallEnds', id: 'W2', a: { x: 5, y: 0.05 } });
    expect(w(s, 'W2').joinStart).toEqual(MITER);
    expect(w(s, 'W1').joinEnd).toEqual(MITER);
    s.exec({ type: 'setWallEnds', id: 'W2', a: { x: 5, y: 1 } });
    expect(w(s, 'W2').joinStart).toEqual(BUTT);
    expect(w(s, 'W1').joinEnd).toEqual(BUTT);
  });

  it('faixas 6..9 (W2) e 0..3 (W1) não se sobrepõem: mesmo perto, a junção zera', () => {
    const s = entreNiveis(3, 3);
    s.exec({ type: 'setWallEnds', id: 'W2', a: { x: 5, y: 0.05 } });
    expect(w(s, 'W2').joinStart).toEqual(BUTT);
  });
});
