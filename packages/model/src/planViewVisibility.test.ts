import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AREA_GRAPHICS, ProjectStore, createEmptyProject, floorViewId, hiddenByUserInView, hiddenIdsInView, makeWall, resolveViewGraphics, legacyRoofViewId as roofViewId,
  visibleInView, withAreaPlansOfTest, withViewPatchOfTest, type AreaPlan, type Dimension, type Project,
} from './index.ts';

const LV0 = 'lv_0';
const PISO = floorViewId(LV0);
const dim = (id: string): Dimension => ({ id, a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1, mode: 'aligned' });

function base(): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: LV0, a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: LV0, a: { x: 0, y: 3 }, b: { x: 4, y: 3 } }) });
  s.exec({ type: 'addDimension', levelId: LV0, dimension: dim('d1') });
  return s.project;
}

const comOcultos = (p: Project, viewId: string, hidden: { elements?: string[]; categories?: Array<'wall' | 'annotation'> }): Project => withViewPatchOfTest(p, viewId, { hidden });

describe('visibleInView: etapas da regra 4.5', () => {
  it('sem nada oculto tudo aparece', () => {
    const p = base();
    expect(visibleInView(p, PISO, 'w1')).toBe(true);
    expect(visibleInView(p, PISO, 'd1')).toBe(true);
  });

  it('etapa 1: fora do alcance some', () => {
    const p = base();
    expect(visibleInView(p, PISO, 'w1', { outOfRange: new Set(['w1']) })).toBe(false);
    expect(visibleInView(p, PISO, 'w2', { outOfRange: new Set(['w1']) })).toBe(true);
  });

  it('etapa 2: a camada do perfil da planta de área desliga paredes e cotas', () => {
    let p = base();
    const plano: AreaPlan = { id: 'ap1', name: 'A', levelId: LV0, scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS, showWalls: 'hidden', showDimensions: false }, tags: [] };
    p = withAreaPlansOfTest(p, [plano]);
    expect(visibleInView(p, 'ap1', 'w1')).toBe(false);
    // O mesmo elemento continua visível na planta de piso do nível (a regra é por vista).
    expect(visibleInView(p, PISO, 'w1')).toBe(true);
  });

  it('etapa 3: substituição de visibilidade da categoria nos gráficos e hidden.categories', () => {
    let p = base();
    const g = resolveViewGraphics(undefined);
    p = withViewPatchOfTest(p, PISO, { graphics: { ...g, overrides: { ...g.overrides, wall: { ...g.overrides.wall, visible: false } } } });
    expect(visibleInView(p, PISO, 'w1')).toBe(false);
    expect(visibleInView(p, PISO, 'd1')).toBe(true);
    p = comOcultos(base(), PISO, { categories: ['annotation'] });
    expect(visibleInView(p, PISO, 'd1')).toBe(false);
    expect(visibleInView(p, PISO, 'w1')).toBe(true);
  });

  it('etapa 5: elemento em hidden.elements some, só ele', () => {
    const p = comOcultos(base(), PISO, { elements: ['w1'] });
    expect(visibleInView(p, PISO, 'w1')).toBe(false);
    expect(visibleInView(p, PISO, 'w2')).toBe(true);
  });

  it('etapa 6: temporário esconde e isolar manda sobre o oculto permanente', () => {
    const p = comOcultos(base(), PISO, { elements: ['w1'] });
    expect(visibleInView(p, PISO, 'w2', { temporary: { hidden: { elements: ['w2'] } } })).toBe(false);
    expect(visibleInView(p, PISO, 'w1', { temporary: { isolated: { elements: ['w1'] } } })).toBe(true);
    expect(visibleInView(p, PISO, 'w2', { temporary: { isolated: { elements: ['w1'] } } })).toBe(false);
  });

  it('etapa 6: isolar categoria sem nenhum elemento na vista não isola (nada é escondido)', () => {
    const p = base();
    expect(visibleInView(p, PISO, 'w1', { temporary: { isolated: { categories: ['roof'] } } })).toBe(true);
    expect(visibleInView(p, PISO, 'w1', { temporary: { isolated: { categories: ['annotation'] } } })).toBe(false);
    expect(visibleInView(p, PISO, 'd1', { temporary: { isolated: { categories: ['annotation'] } } })).toBe(true);
  });

  it('revelar mostra o que o usuário oculta, mas não o fora do alcance', () => {
    const p = comOcultos(base(), PISO, { elements: ['w1'] });
    expect(visibleInView(p, PISO, 'w1', { revealing: true })).toBe(true);
    expect(visibleInView(p, PISO, 'w1', { revealing: true, outOfRange: new Set(['w1']) })).toBe(false);
    expect(hiddenByUserInView(p, PISO, 'w1')).toBe(true);
  });

  it('hiddenIdsInView devolve só os ocultos', () => {
    const p = comOcultos(base(), PISO, { elements: ['w1'] });
    expect([...hiddenIdsInView(p, PISO, ['w1', 'w2', 'd1'])]).toEqual(['w1']);
  });
});

describe('duas vistas do mesmo nível não interferem', () => {
  it('ocultos de uma vista não afetam a outra', () => {
    let p = base();
    const plano: AreaPlan = { id: 'ap1', name: 'A', levelId: LV0, scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS, showWalls: 'light' }, tags: [] };
    p = withAreaPlansOfTest(p, [plano]);
    p = comOcultos(p, PISO, { elements: ['w1'] });
    p = withViewPatchOfTest(p, 'ap1', { hidden: { elements: ['w2'] } });
    expect(visibleInView(p, PISO, 'w1')).toBe(false);
    expect(visibleInView(p, PISO, 'w2')).toBe(true);
    expect(visibleInView(p, 'ap1', 'w1')).toBe(true);
    expect(visibleInView(p, 'ap1', 'w2')).toBe(false);
    // A cobertura do mesmo nível também é independente.
    expect(visibleInView(p, roofViewId(LV0), 'w1')).toBe(true);
    expect(visibleInView(p, roofViewId(LV0), 'w2')).toBe(true);
  });
});
