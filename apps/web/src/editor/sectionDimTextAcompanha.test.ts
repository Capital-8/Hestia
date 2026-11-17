import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type SectionAnnotations } from '@hestia/model';
import { sectionDimensionGripCommand } from './sectionHandles.ts';

/**
 * Corte/elevação: arrastar a alça do meio da cota muda o `offset` e, se o texto foi puxado (`textAt`), o texto acompanha
 * pelo mesmo delta ao longo da normal (a normal de a→b é +y quando a→b anda em x). Cota dim1 (0,4)-(2,4), afastamento
 * 0,5, texto em (3; 5). Cota dim2 igual, sem `textAt`.
 */
function projeto() {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, height: 3 }) });
  const annotations: SectionAnnotations = {
    dimensions: [
      { id: 'dim1', a: { x: 0, y: 4 }, b: { x: 2, y: 4 }, offset: 0.5, textAt: { x: 3, y: 5 } },
      { id: 'dim2', a: { x: 0, y: 2 }, b: { x: 2, y: 2 }, offset: 0.5 },
    ],
    texts: [],
    detailLines: [],
    detailRegions: [],
    tags: [],
  };
  store.exec({ type: 'addView', view: { id: 'elev', name: 'Elevação Sul', kind: 'elevation', a: { x: -1, y: -2 }, b: { x: 7, y: -2 }, depth: 20 } });
  store.exec({ type: 'setSectionAnnotations', sectionId: 'elev', annotations });
  return store.project;
}

describe('alça do afastamento no corte: o texto puxado acompanha', () => {
  it('dim1 com textAt (3; 5): offset 0,5 -> 1,2 leva o texto a (3; 5,7), no mesmo comando', () => {
    const p = projeto();
    // Alça do meio da linha (y = 4,5) arrastada até (1; 5,2): offset = (5,2 - 4) = 1,2.
    const cmd = sectionDimensionGripCommand(p, 'elev', { id: 'dim1', kind: 'offset', at: { x: 1, y: 4.5 } }, { x: 1, y: 5.2 });
    expect(cmd).toMatchObject({ type: 'updateDimension', sectionId: 'elev', id: 'dim1' });
    const patch = (cmd as Extract<typeof cmd, { type: 'updateDimension' }>).patch;
    expect(patch.offset).toBeCloseTo(1.2, 9);
    expect(patch.textAt!.x).toBeCloseTo(3, 9);
    expect(patch.textAt!.y).toBeCloseTo(5.7, 9);
  });

  it('dim2 sem textAt: o patch leva só o offset', () => {
    const p = projeto();
    const cmd = sectionDimensionGripCommand(p, 'elev', { id: 'dim2', kind: 'offset', at: { x: 1, y: 2.5 } }, { x: 1, y: 3.2 });
    const patch = (cmd as Extract<typeof cmd, { type: 'updateDimension' }>).patch;
    expect(Object.keys(patch)).toEqual(['offset']);
    expect(patch.offset).toBeCloseTo(1.2, 9);
  });
});
