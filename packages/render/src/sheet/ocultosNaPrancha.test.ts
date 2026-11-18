import { describe, expect, it } from 'vitest';
import { DEFAULT_AREA_GRAPHICS, createEmptyProject, emptyTitleBlock, makeWall, patchFloorOfTest, withAreaPlansOfTest, withViewPatchOfTest, floorViewId, type AreaPlan, type Project, type Sheet, type Wall } from '@hestia/model';
import { buildSheetDrawList } from './build.ts';

/*
 * Regra 4.5 na prancha: a vista aparece como ela é, com o Hide in View e a categoria oculta permanentes (etapas 3 e 5).
 * Duas vistas do mesmo nível com ocultos diferentes não interferem uma na outra.
 */

const viewport = (id: string, view: Sheet['viewports'][number]['view'], x: number): Sheet['viewports'][number] => ({ id, view, at: { x, y: 20 }, size: { w: 200, h: 150 }, scale: 100 });

function projeto(): Project {
  const p = createEmptyProject();
  for (const [id, y] of [['w1', 0], ['w2', 3]] as const) {
    const w = makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y }, b: { x: 4, y } });
    p.elements[id] = { ...w, order: 1 } as Wall;
  }
  p.nextOrder = 3;
  return p;
}

const folha = (viewports: Sheet['viewports']): Sheet => ({
  id: 'sh1', number: 'A-101', name: 'Planta', size: 'A3', orientation: 'landscape', margin: 10,
  titleBlock: { ...emptyTitleBlock(), project: 'Casa', client: 'Cliente', author: 'Autor', date: '2026-10-22', revision: 'R0' },
  viewports,
});

const tracos = (p: Project): number => buildSheetDrawList(p, 'sh1')!.groups.reduce((n, g) => n + g.paths.length, 0);

describe('ocultos permanentes na prancha', () => {
  it('elemento em hidden.elements e categoria em hidden.categories não saem na planta da prancha', () => {
    const base = projeto();
    base.sheets = [folha([viewport('v1', { kind: 'plan', levelId: 'lv_0' }, 20)])];
    const cheio = tracos(base);
    const comElemento = projeto();
    comElemento.sheets = base.sheets;
    patchFloorOfTest(comElemento, 'lv_0', { hidden: { elements: ['w2'] } });
    expect(tracos(comElemento)).toBeLessThan(cheio);
    const comCategoria = projeto();
    comCategoria.sheets = base.sheets;
    patchFloorOfTest(comCategoria, 'lv_0', { hidden: { categories: ['wall'] } });
    expect(tracos(comCategoria)).toBeLessThan(tracos(comElemento));
  });

  it('ocultos da planta de piso não mudam a planta de área do mesmo nível, e vice-versa', () => {
    const plano: AreaPlan = { id: 'ap1', name: 'A', levelId: 'lv_0', scale: 100, graphics: { ...DEFAULT_AREA_GRAPHICS, showWalls: 'normal' }, tags: [] };
    const vp = [viewport('v1', { kind: 'plan', viewId: 'ap1' }, 20)];
    const montar = (hiddenPiso: string[] | undefined, hiddenArea: string[] | undefined): Project => {
      let p = withAreaPlansOfTest(projeto(), [plano]);
      p.sheets = [folha(vp)];
      if (hiddenPiso) p = withViewPatchOfTest(p, floorViewId('lv_0'), { hidden: { elements: hiddenPiso } });
      if (hiddenArea) p = withViewPatchOfTest(p, 'ap1', { hidden: { elements: hiddenArea } });
      return p;
    };
    const semNada = tracos(montar(undefined, undefined));
    expect(tracos(montar(['w1'], undefined))).toBe(semNada);
    expect(tracos(montar(undefined, ['w1']))).toBeLessThan(semNada);
  });
});
