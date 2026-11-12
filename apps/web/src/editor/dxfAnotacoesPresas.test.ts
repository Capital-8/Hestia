import { describe, expect, it } from 'vitest';
import { DEFAULT_AREA_GRAPHICS, ProjectStore, createEmptyProject, floorViewId, makeWall, withViewPatchOfTest, type Dimension, type Project } from '@hestia/model';
import { areaPlanDxf, planDxf } from './dxfExport.ts';

/** Etapa 7 no DXF: a cota e a etiqueta cujo elemento está oculto na vista não saem (planta de piso e planta de área). */

const LV = 'lv_0';
const dim = (id: string, text: string, over: Partial<Dimension> = {}): Dimension => ({ id, a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, offset: 1, mode: 'aligned', text, ...over });

function cena(): Project {
  const s = new ProjectStore(createEmptyProject());
  const c = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }];
  c.forEach((a, i) => s.exec({ type: 'addWall', wall: { ...makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: LV, a, b: c[(i + 1) % 4]! }), mark: `MK${i}` } }));
  s.exec({ type: 'addDimension', levelId: LV, dimension: dim('d_w1', 'COTA_W1', { refs: { a: { wallId: 'w1', end: 'a' } } }) });
  s.exec({ type: 'addDimension', levelId: LV, dimension: dim('d_livre', 'COTA_LIVRE') });
  s.exec({ type: 'addTag', levelId: LV, item: { id: 'tg_w1', hostId: 'w1', at: { x: 3, y: 5 }, property: 'mark' } });
  s.exec({ type: 'addTag', levelId: LV, item: { id: 'tg_w2', hostId: 'w2', at: { x: 3, y: 6 }, property: 'mark' } });
  return s.project;
}

const tem = (dxf: string, ...textos: string[]): boolean[] => textos.map((t) => dxf.includes(t));

describe('DXF da planta de piso', () => {
  it('sem ocultos saem as cotas e as etiquetas', () => {
    expect(tem(planDxf(cena(), LV), 'COTA_W1', 'COTA_LIVRE', 'MK1', 'MK2')).toEqual([true, true, true, true]);
  });

  it('parede em hidden.elements da vista: some a cota presa e a etiqueta dela', () => {
    const p = withViewPatchOfTest(cena(), floorViewId(LV), { hidden: { elements: ['w1'] } });
    const dxf = planDxf(p, LV);
    expect(tem(dxf, 'COTA_W1', 'MK1')).toEqual([false, false]);
    expect(tem(dxf, 'COTA_LIVRE', 'MK2')).toEqual([true, true]);
  });
});

describe('DXF da planta de área', () => {
  function comArea(): Project {
    const s = new ProjectStore(cena());
    s.exec({ type: 'addAreaPlan', plan: { id: 'ap1', name: 'A', levelId: LV, scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault } }, tags: [] } });
    return s.project;
  }

  it('a vista de área nasce com cópia das cotas do nível: sem ocultos saem', () => {
    expect(tem(areaPlanDxf(comArea(), 'ap1'), 'COTA_W1', 'COTA_LIVRE')).toEqual([true, true]);
  });

  it('parede oculta na área: some a cota da área presa a ela; a oculta só no piso não muda a área', () => {
    const base = comArea();
    const naArea = withViewPatchOfTest(base, 'ap1', { hidden: { elements: ['w1'] } });
    expect(tem(areaPlanDxf(naArea, 'ap1'), 'COTA_W1', 'COTA_LIVRE')).toEqual([false, true]);
    const soNoPiso = withViewPatchOfTest(base, floorViewId(LV), { hidden: { elements: ['w1'] } });
    expect(tem(areaPlanDxf(soNoPiso, 'ap1'), 'COTA_W1', 'COTA_LIVRE')).toEqual([true, true]);
  });
});
