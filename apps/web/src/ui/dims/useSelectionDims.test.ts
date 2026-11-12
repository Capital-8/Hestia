import { describe, expect, it } from 'vitest';
import { DEFAULT_AREA_GRAPHICS, ProjectStore, createEmptyProject, floorViewId, makeWall, roofViewId, withAreaPlansOfTest, withViewPatchOfTest, type AreaPlan } from '@hestia/model';
import { hiddenInActiveView } from '../../editor/viewVisibility.ts';
import { useUi } from '../../editor/state.ts';

/**
 * `useDimContext` calcula `hidden` com `hiddenInActiveView` a partir de `view`, `planViewId`, `levelId` e
 * `viewTemp`; estes testes fixam por que cada um deles tem de estar nas dependências do hook: piso, cobertura e planta de
 * área do mesmo nível têm ocultos diferentes.
 */

const AREA: AreaPlan = { id: 'ap1', name: 'A', levelId: 'lv_0', scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS }, tags: [] };

function projeto() {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  let p = withAreaPlansOfTest(s.project, [AREA]);
  p = withViewPatchOfTest(p, floorViewId('lv_0'), { hidden: { elements: ['w1'] } });
  return p;
}

const estado = (over: Partial<ReturnType<typeof useUi.getState>>): ReturnType<typeof useUi.getState> => ({ ...useUi.getState(), view: 'plan', levelId: 'lv_0', viewTemp: {}, ...over });

describe('o que a vista ativa oculta depende de qual vista do nível está ativa', () => {
  const p = projeto();

  it('piso oculta a parede; a planta de área e a cobertura do mesmo nível não', () => {
    expect(hiddenInActiveView(p, estado({ planViewId: floorViewId('lv_0') })).has('w1')).toBe(true);
    expect(hiddenInActiveView(p, estado({ planViewId: 'ap1' })).has('w1')).toBe(false);
    expect(hiddenInActiveView(p, estado({ planViewId: roofViewId('lv_0') })).has('w1')).toBe(false);
  });
});
