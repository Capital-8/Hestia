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
