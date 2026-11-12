import { describe, expect, it } from 'vitest';
import { floorViewId, DEFAULT_VIEW_GRAPHICS, createEmptyProject, emptyTitleBlock, makeWall, patchFloorOfTest, type Project, type Sheet, type Wall } from '@hestia/model';
import { buildSheetDrawList } from './build.ts';

/*
 * A prancha não usa as linhas finas da tela (decisão 0015): a planta do nível com `thinLines: true` sai igual à sem o
 * modo, com os pesos reais (parede cortada, peso 5 = 0,5 mm de papel em 1:100).
 */

const sheet: Sheet = {
  id: 'sh1',
  number: 'A-101',
  name: 'Planta',
  size: 'A3',
  orientation: 'landscape',
  margin: 10,
  titleBlock: { ...emptyTitleBlock(), project: 'Casa', client: 'Cliente', author: 'Autor', date: '2026-10-22', revision: 'R0' },
  viewports: [
    {
      id: 'v1',
      view: { kind: 'plan', viewId: floorViewId('lv_0') },
      at: { x: 20, y: 20 },
      size: { w: 200, h: 150 },
      scale: 100,
    },
  ],
};

function projectWith(thinLines: boolean): Project {
  const p = createEmptyProject();
  const w = makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
  p.elements[w.id] = { ...w, order: 1 } as Wall;
  p.nextOrder = 2;
  patchFloorOfTest(p, 'lv_0', { graphics: { ...DEFAULT_VIEW_GRAPHICS, thinLines } });
  p.sheets = [sheet];
  return p;
}

describe('linhas finas e a prancha (decisão 0015)', () => {
  it('a planta na prancha é igual com ou sem as linhas finas do nível', () => {
    expect(buildSheetDrawList(projectWith(true), 'sh1')).toEqual(buildSheetDrawList(projectWith(false), 'sh1'));
  });

  it('a parede cortada na prancha mantém o peso real: 0,5 mm de papel em 1:100', () => {
    const list = buildSheetDrawList(projectWith(true), 'sh1')!;
    const widths = list.groups.flatMap((g) => g.paths.map((x) => x.widthMm));
    expect(widths.some((w) => Math.abs(w - 0.5) < 1e-9)).toBe(true);
  });
});
