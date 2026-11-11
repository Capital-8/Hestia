import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AREA_GRAPHICS, ProjectStore, annotationHostsInView, annotationIdsOnHiddenHosts, annotationIdsWithHiddenHostInView, createEmptyProject,
  dimensionRefIds, floorViewId, hiddenByUserIdsInView, hiddenByUserInView, hiddenIdsInView, makeWall, planViewsOfLevel, roofViewId,
  visibleInView, withAreaPlansOfTest, withViewPatchOfTest, type AreaPlan, type Dimension, type ElementTag, type Project,
} from './index.ts';

/** Etapa 7 da regra 4.5: a cota some com o elemento que referencia; a etiqueta, com o hospedeiro. */

const LV0 = 'lv_0';
const PISO = floorViewId(LV0);
const COBERTURA = roofViewId(LV0);

const dim = (id: string, over: Partial<Dimension> = {}): Dimension => ({ id, a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1, mode: 'aligned', ...over });
const tag = (id: string, hostId: string): ElementTag => ({ id, hostId, at: { x: 1, y: 1 }, property: 'type' });

/** w1, w2 e uma porta d1 em w1; cotas: livre, presa a w1, presa a w1 e w2, presa à porta; etiquetas de w1 e de w2. */
function base(): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: LV0, a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: LV0, a: { x: 0, y: 3 }, b: { x: 4, y: 3 } }) });
  s.exec({ type: 'addOpening', opening: { id: 'dr1', kind: 'door', typeId: 'ot_p80', hostId: 'w1', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  s.exec({ type: 'addDimension', levelId: LV0, dimension: dim('livre') });
  s.exec({ type: 'addDimension', levelId: LV0, dimension: dim('d_w1', { refs: { a: { wallId: 'w1', end: 'a' } } }) });
  s.exec({ type: 'addDimension', levelId: LV0, dimension: dim('d_w1_w2', { refs: { a: { elementId: 'w1', feature: 'wall-axis-a' }, b: { elementId: 'w2', feature: 'wall-axis-b' } } }) });
  s.exec({ type: 'addDimension', levelId: LV0, dimension: dim('d_porta', { refs: { a: { elementId: 'dr1', feature: 'opening-center' } } }) });
  s.exec({ type: 'addTag', levelId: LV0, item: tag('tg_w1', 'w1') });
  s.exec({ type: 'addTag', levelId: LV0, item: tag('tg_w2', 'w2') });
  return s.project;
}

const ocultar = (p: Project, viewId: string, elements: string[]): Project => withViewPatchOfTest(p, viewId, { hidden: { elements } });

describe('dimensionRefIds', () => {
  it('junta as duas pontas, da forma antiga e da feição de elemento, sem repetir', () => {
    expect(dimensionRefIds(dim('x'))).toEqual([]);
    expect(dimensionRefIds(dim('x', { refs: { a: { wallId: 'w1', end: 'a' }, b: { elementId: 'w1', feature: 'wall-axis-b' } } }))).toEqual(['w1']);
    expect(dimensionRefIds(dim('x', { refs: { a: { elementId: 'dr1', feature: 'opening-center' }, b: { wallId: 'w2', end: 'b' } } }))).toEqual(['dr1', 'w2']);
  });

  it('cota angular: parede e linha de detalhe das chaves do Alinhar; grade e separador não contam', () => {
    const angular = (refA: string, refB: string): Dimension['angular'] => ({
      refA, refB, center: { x: 0, y: 0 }, from: { x: 1, y: 0 }, to: { x: 0, y: 1 }, radius: 1, side: 'minor', value: Math.PI / 2,
    });
    expect(dimensionRefIds(dim('a', { angular: angular('w1:face:hi', 'dl1:detalhe') }))).toEqual(['w1', 'dl1']);
    expect(dimensionRefIds(dim('a', { angular: angular('w1:nucleo:a', 'g1:grade:0') }))).toEqual(['w1']);
    expect(dimensionRefIds(dim('a', { angular: angular('s1:separador', 'w2:eixo') }))).toEqual(['w2']);
  });
});

describe('etapa 7: cota some quando um elemento referenciado está oculto', () => {
  it('sem nada oculto tudo aparece', () => {
    const p = base();
    for (const id of ['livre', 'd_w1', 'd_w1_w2', 'd_porta', 'tg_w1', 'tg_w2']) expect(visibleInView(p, PISO, id)).toBe(true);
  });

  it('Hide in View da parede: some a cota presa a ela (forma antiga ou feição), em qualquer ponta', () => {
    const p = ocultar(base(), PISO, ['w1']);
    expect(visibleInView(p, PISO, 'd_w1')).toBe(false);
    expect(visibleInView(p, PISO, 'd_w1_w2')).toBe(false);
    expect(visibleInView(p, PISO, 'livre')).toBe(true);
    // A cota da porta referencia a porta, não a parede dela: a visibilidade da porta é a dela.
    expect(visibleInView(p, PISO, 'd_porta')).toBe(true);
  });

  it('ocultar só a segunda ponta também esconde a cota', () => {
    const p = ocultar(base(), PISO, ['w2']);
    expect(visibleInView(p, PISO, 'd_w1_w2')).toBe(false);
    expect(visibleInView(p, PISO, 'd_w1')).toBe(true);
  });

  it('esquadria oculta esconde a cota presa a ela', () => {
    const p = ocultar(base(), PISO, ['dr1']);
    expect(visibleInView(p, PISO, 'd_porta')).toBe(false);
    expect(visibleInView(p, PISO, 'd_w1')).toBe(true);
  });

  it('categoria oculta (hidden.categories) esconde a cota presa a um elemento dela', () => {
    const p = withViewPatchOfTest(base(), PISO, { hidden: { categories: ['wall'] } });
    expect(visibleInView(p, PISO, 'd_w1')).toBe(false);
    expect(visibleInView(p, PISO, 'd_porta')).toBe(true);
    expect(visibleInView(p, PISO, 'livre')).toBe(true);
  });

  it('elemento fora do alcance da vista esconde a cota presa a ele', () => {
    const p = base();
    const sessao = { outOfRange: new Set(['w1']) };
    expect(visibleInView(p, PISO, 'd_w1', sessao)).toBe(false);
    expect(visibleInView(p, PISO, 'd_w1_w2', sessao)).toBe(false);
    expect(visibleInView(p, PISO, 'd_porta', sessao)).toBe(true);
  });

  it('ocultar temporário esconde a cota; revelar a mostra de novo, mas não o que está fora do alcance', () => {
    const p = base();
    const temporario = { temporary: { hidden: { elements: ['w1'] } } };
    expect(visibleInView(p, PISO, 'd_w1', temporario)).toBe(false);
    expect(visibleInView(p, PISO, 'd_w1', { ...temporario, revealing: true })).toBe(true);
    expect(visibleInView(p, PISO, 'd_w1', { revealing: true, outOfRange: new Set(['w1']) })).toBe(false);
    const oculto = ocultar(p, PISO, ['w1']);
    expect(visibleInView(oculto, PISO, 'd_w1', { revealing: true })).toBe(true);
  });

  it('isolar só a cota (sem a parede) esconde a cota; isolar a cota e a parede mantém as duas', () => {
    const p = base();
    expect(visibleInView(p, PISO, 'd_w1', { temporary: { isolated: { elements: ['d_w1'] } } })).toBe(false);
    expect(visibleInView(p, PISO, 'd_w1', { temporary: { isolated: { elements: ['d_w1', 'w1'] } } })).toBe(true);
  });

  it('cota cujo elemento não existe mais continua a aparecer (guarda a geometria gravada)', () => {
    const p = withViewPatchOfTest(base(), PISO, { annotations: { dimensions: [dim('orfa', { refs: { a: { elementId: 'sumiu', feature: 'wall-axis-a' } } })] } });
    expect(visibleInView(p, PISO, 'orfa')).toBe(true);
  });

  it('as cotas da outra vista do mesmo nível não mudam (vista própria, ocultos próprios)', () => {
    let p = base();
    const area: AreaPlan = { id: 'ap1', name: 'A', levelId: LV0, scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS, showWalls: 'light' }, tags: [], annotations: { dimensions: [dim('a_w1', { refs: { a: { wallId: 'w1', end: 'a' } } })], texts: [], detailLines: [], detailRegions: [], tags: [tag('a_tg', 'w1')] } };
    p = withAreaPlansOfTest(p, [area]);
    p = ocultar(p, PISO, ['w1']);
    expect(visibleInView(p, PISO, 'd_w1')).toBe(false);
    expect(visibleInView(p, 'ap1', 'a_w1')).toBe(true);
    expect(visibleInView(p, 'ap1', 'a_tg')).toBe(true);
    p = ocultar(p, 'ap1', ['w1']);
    expect(visibleInView(p, 'ap1', 'a_w1')).toBe(false);
    expect(visibleInView(p, 'ap1', 'a_tg')).toBe(false);
    // A cobertura do mesmo nível segue com as suas anotações e os seus ocultos.
    expect(visibleInView(p, COBERTURA, 'w1')).toBe(true);
  });
});

describe('etapa 7: etiqueta some quando o hospedeiro está oculto', () => {
  it('Hide in View, categoria, alcance e ocultar temporário do hospedeiro', () => {
    const p = base();
    expect(visibleInView(ocultar(p, PISO, ['w1']), PISO, 'tg_w1')).toBe(false);
    expect(visibleInView(ocultar(p, PISO, ['w1']), PISO, 'tg_w2')).toBe(true);
    expect(visibleInView(withViewPatchOfTest(p, PISO, { hidden: { categories: ['wall'] } }), PISO, 'tg_w2')).toBe(false);
    expect(visibleInView(p, PISO, 'tg_w1', { outOfRange: new Set(['w1']) })).toBe(false);
    expect(visibleInView(p, PISO, 'tg_w1', { temporary: { hidden: { elements: ['w1'] } } })).toBe(false);
    expect(visibleInView(p, PISO, 'tg_w1', { temporary: { hidden: { elements: ['w1'] } }, revealing: true })).toBe(true);
  });

  it('etiqueta de esquadria segue a esquadria, não a parede dela', () => {
    const s = new ProjectStore(base());
    s.exec({ type: 'addTag', levelId: LV0, item: tag('tg_dr1', 'dr1') });
    const p = s.project;
    expect(visibleInView(ocultar(p, PISO, ['dr1']), PISO, 'tg_dr1')).toBe(false);
    expect(visibleInView(ocultar(p, PISO, ['w1']), PISO, 'tg_dr1')).toBe(true);
  });
});

describe('etapa 7: cota angular', () => {
  const angular = (refA: string, refB: string): Dimension => dim('ang', { angular: { refA, refB, center: { x: 0, y: 0 }, from: { x: 1, y: 0 }, to: { x: 0, y: 1 }, radius: 1, side: 'minor', value: Math.PI / 2 } });

  it('some com a parede de qualquer referência e com a linha de detalhe oculta', () => {
    let p = base();
    p = withViewPatchOfTest(p, PISO, { annotations: { dimensions: [angular('w1:face:hi', 'dl1:detalhe')], detailLines: [{ id: 'dl1', a: { x: 0, y: 0 }, b: { x: 0, y: 3 } }] } });
    expect(visibleInView(p, PISO, 'ang')).toBe(true);
    expect(visibleInView(ocultar(p, PISO, ['w1']), PISO, 'ang')).toBe(false);
    expect(visibleInView(ocultar(p, PISO, ['dl1']), PISO, 'ang')).toBe(false);
    expect(visibleInView(ocultar(p, PISO, ['w2']), PISO, 'ang')).toBe(true);
  });
});

describe('etapa 7 nas listas de ocultos', () => {
  it('hiddenByUserInView e hiddenByUserIdsInView incluem a cota e a etiqueta (o que "revelar" mostra de novo)', () => {
    const p = ocultar(base(), PISO, ['w1']);
    expect(hiddenByUserInView(p, PISO, 'd_w1')).toBe(true);
    expect(hiddenByUserInView(p, PISO, 'tg_w1')).toBe(true);
    expect(hiddenByUserInView(p, PISO, 'livre')).toBe(false);
    expect([...hiddenByUserIdsInView(p, PISO)].sort()).toEqual(['d_w1', 'd_w1_w2', 'tg_w1', 'w1']);
  });

  it('hiddenIdsInView também inclui o que depende de elemento fora do alcance', () => {
    const p = base();
    const fora = hiddenIdsInView(p, PISO, ['w1', 'd_w1', 'tg_w1', 'livre'], { outOfRange: new Set(['w1']) });
    expect([...fora].sort()).toEqual(['d_w1', 'tg_w1', 'w1']);
  });

  it('annotationIdsWithHiddenHostInView: só as anotações presas, sem os próprios elementos (DXF)', () => {
    const p = ocultar(base(), PISO, ['w1']);
    expect([...annotationIdsWithHiddenHostInView(p, PISO)].sort()).toEqual(['d_w1', 'd_w1_w2', 'tg_w1']);
    expect([...annotationIdsWithHiddenHostInView(base(), PISO)]).toEqual([]);
    expect([...annotationIdsWithHiddenHostInView(base(), PISO, { outOfRange: new Set(['dr1']) })]).toEqual(['d_porta']);
  });

  it('annotationIdsOnHiddenHosts: sobre um conjunto de ocultos já resolvido, em todas as vistas dadas', () => {
    const p = base();
    const vistas = planViewsOfLevel(p, LV0);
    expect(annotationIdsOnHiddenHosts(vistas, new Set()).length).toBe(0);
    expect(annotationIdsOnHiddenHosts(vistas, new Set(['w2'])).sort()).toEqual(['d_w1_w2', 'tg_w2']);
    expect(annotationHostsInView(p, PISO, 'd_w1_w2')).toEqual(['w1', 'w2']);
    expect(annotationHostsInView(p, PISO, 'livre')).toEqual([]);
    expect(annotationHostsInView(p, PISO, 'inexistente')).toEqual([]);
  });
});
