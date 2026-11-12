import { describe, expect, it } from 'vitest';
import {
  projetoComCoberturaDeTeste,
  DEFAULT_AREA_GRAPHICS,
  DEFAULT_VIEW_RANGE,
  floorViewId,
  levelGraphicsOf,
  mainPlanViewOf,
  makeLevel,
  planAnnotationsOf,
  planViewOf,
  planViewRangeOf,
  planViewHiddenOf,
  planViewRef,
  planViewRefOf,
  planViewsOf,
  planViewsOfLevel,
  ProjectStore,
  validateProject,
  resolveFloorProfile,
  resolveViewProfile,
  legacyRoofViewId as roofViewId,
  viewAnnotationsOf,
  viewGraphicsOf,
  viewProfileOf,
  type AreaPlan,
  type Dimension,
  type Project,
  type TextNote,
} from './index.ts';
import { areaPlansOf } from './index.ts';

const dim = (id: string): Dimension => ({ id, a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, offset: 0.8 });
const txt = (id: string): TextNote => ({ id, at: { x: 1, y: 1 }, text: 'Sala', height: 2.5, rotation: 0 });
const area = (id: string, levelId: string, over: Partial<AreaPlan> = {}): AreaPlan => ({
  id, name: `Área ${id}`, levelId, scale: 75, graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault }, showWalls: 'normal' }, tags: [], ...over,
});

/** lv_0 (anotações, graphics, hidden da cobertura, intervalo próprio), lv_1 padrão, lv_2 padrão; três plantas de área. */
function montar(): ProjectStore {
  const s = new ProjectStore(projetoComCoberturaDeTeste());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_2', name: 'Cobertura', elevation: 6 }) });
  s.exec({ type: 'addPlanView', view: { id: roofViewId('lv_2'), kind: 'floor', levelId: 'lv_2', name: 'Cobertura: Cobertura', showRoofOnTop: true } });
  s.exec({ type: 'setLevelViewRange', levelId: 'lv_0', patch: { cut: 1.0, top: 2.0 } });
  s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { scale: 50, overrides: { wall: { halftone: true } } } });
  s.exec({ type: 'setViewHidden', target: { kind: 'plan', viewId: floorViewId('lv_0') }, hidden: { elements: ['w1'], categories: ['door'] } });
  s.exec({ type: 'setViewHidden', target: { kind: 'plan', viewId: roofViewId('lv_0') }, hidden: { categories: ['stair'] } });
  s.exec({ type: 'addDimension', levelId: 'lv_0', dimension: dim('d1') });
  s.exec({ type: 'addText', levelId: 'lv_0', text: txt('t1') });
  s.exec({ type: 'addAreaPlan', plan: area('ap_herda', 'lv_0') });
  s.exec({ type: 'addAreaPlan', plan: area('ap_propria', 'lv_0', { schemeId: 'cs1', hidden: { elements: ['x'] } }) });
  s.exec({ type: 'addDimension', levelId: 'lv_0', planId: 'ap_propria', dimension: dim('d2') });
  s.exec({ type: 'addAreaPlan', plan: area('ap_vazia', 'lv_1') });
  // `{}` = conjunto próprio e vazio (listas ausentes): o comando de adição exige o conjunto completo, então entra por patch.
  s.exec({ type: 'updateAreaPlan', id: 'ap_vazia', patch: { annotations: {} as AreaPlan['annotations'] } });
  return s;
}

describe('ids determinísticos', () => {
  it('piso e o inverso; pvr_ não decodifica mais como tipo', () => {
    expect(floorViewId('lv_0')).toBe('pv_lv_0');
    expect(roofViewId('lv_0')).toBe('pvr_lv_0');
    expect(planViewRef('pv_lv_0')).toEqual({ kind: 'floor', levelId: 'lv_0' });
    expect(planViewRef('pvr_lv_0')).toBeUndefined();
    expect(planViewRef('pvc_x')).toBeUndefined();
    expect(planViewRef('ap1')).toBeUndefined();
    expect(planViewRef('pv_')).toBeUndefined();
    expect(planViewRef(floorViewId('r_x'))).toEqual({ kind: 'floor', levelId: 'r_x' });
  });

  it('planViewRefOf resolve também a planta de área', () => {
    const p = montar().project;
    expect(planViewRefOf(p, 'ap_propria')).toEqual({ kind: 'area', levelId: 'lv_0' });
    expect(planViewRefOf(p, 'pvr_lv_1')).toEqual({ kind: 'floor', levelId: 'lv_1' });
    expect(planViewRefOf(p, 'nada')).toBeUndefined();
  });
});

describe('leitura direta de Project.planViews', () => {
  const p = montar().project;

  it('cada nível gera o piso (a cobertura migrada é planta de piso comum), e cada planta de área gera a sua vista', () => {
    expect(planViewsOf(p).map((v) => [v.id, v.kind])).toEqual([
      ['pv_lv_0', 'floor'], ['pv_lv_1', 'floor'], ['pv_lv_2', 'floor'], ['pvr_lv_0', 'floor'], ['pvr_lv_1', 'floor'], ['pvr_lv_2', 'floor'],
      ['ap_herda', 'area'], ['ap_propria', 'area'], ['ap_vazia', 'area'],
    ]);
    expect(planViewsOfLevel(p, 'lv_0').map((v) => v.id)).toEqual(['pv_lv_0', 'pvr_lv_0', 'ap_herda', 'ap_propria']);
    expect(planViewsOfLevel(p, 'lv_0', 'area').map((v) => v.id)).toEqual(['ap_herda', 'ap_propria']);
    expect(planViewsOfLevel(p, 'inexistente')).toEqual([]);
  });

  it('piso: intervalo, gráficos, ocultos e anotações do nível', () => {
    const l = p.levels.find((x) => x.id === 'lv_0')!;
    const f = p.planViews.find((x) => x.id === 'pv_lv_0')!;
    expect(planViewOf(p, f.id)).toBe(f);
    expect(f.name).toBe(l.name);
    expect(planViewRangeOf(p, f.id)).toBe(f.viewRange);
    expect(planViewRangeOf(p, f.id).cut).toBe(1.0);
    expect(viewGraphicsOf(p, f.id)).toEqual(levelGraphicsOf(p, 'lv_0'));
    expect(planViewHiddenOf(p, f.id)).toBe(f.hidden);
    expect(planViewHiddenOf(p, f.id)).toEqual({ elements: ['w1'], categories: ['door'] });
    const a = viewAnnotationsOf(p, f.id);
    expect(a).toBe(f.annotations);
    expect(a.dimensions.map((d) => d.id)).toEqual(['d1']);
    expect(a.texts.map((t) => t.id)).toEqual(['t1']);
    expect(a.detailLines).toEqual([]);
    expect(a.tags).toEqual([]);
  });

  it('nível sem nada salvo: padrão e listas vazias', () => {
    const f = planViewOf(p, 'pv_lv_2')!;
    expect(viewGraphicsOf(p, f.id)).toEqual(levelGraphicsOf(p, 'lv_2'));
    expect(planViewHiddenOf(p, f.id)).toEqual({});
    expect(viewAnnotationsOf(p, f.id)).toEqual({ dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] });
  });

  it('cobertura migrada: ocultos próprios; gráficos propagados do nível; faixa propagada pelo comando antigo; anotações próprias (vazias aqui)', () => {
    expect(planViewHiddenOf(p, 'pvr_lv_0')).toEqual({ categories: ['stair'] });
    expect(planViewHiddenOf(p, 'pvr_lv_0')).not.toEqual(planViewHiddenOf(p, 'pv_lv_0'));
    expect(viewGraphicsOf(p, 'pvr_lv_0')).toEqual(levelGraphicsOf(p, 'lv_0'));
    expect(planViewRangeOf(p, 'pvr_lv_0')).toEqual(planViewRangeOf(p, 'pv_lv_0'));
    // Esquema 24: a cobertura não repete as anotações do piso.
    expect(viewAnnotationsOf(p, 'pvr_lv_0')).toEqual({ dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] });
    expect(viewAnnotationsOf(p, 'pvr_lv_0')).not.toBe(viewAnnotationsOf(p, 'pv_lv_0'));
  });

  it('área criada sem anotações recebe CÓPIAS das do nível (ids com sufixo); com próprias usa as dela; com {} é próprio e vazio', () => {
    expect(viewAnnotationsOf(p, 'ap_herda')).not.toBe(viewAnnotationsOf(p, 'pv_lv_0'));
    expect(viewAnnotationsOf(p, 'ap_herda').dimensions.map((d) => d.id)).toEqual(['d1__ap_herda']);
    expect(viewAnnotationsOf(p, 'ap_herda').texts.map((d) => d.id)).toEqual(['t1__ap_herda']);
    const propria = areaPlansOf(p).find((a) => a.id === 'ap_propria')!;
    expect(viewAnnotationsOf(p, 'ap_propria')).toEqual(planAnnotationsOf(propria));
    expect(viewAnnotationsOf(p, 'ap_propria').dimensions.map((d) => d.id)).toEqual(['d1__ap_propria', 'd2']);
    expect(viewAnnotationsOf(p, 'ap_vazia')).toEqual({ dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] });
  });

  it('área: campos próprios, ocultos da planta e intervalo/gráficos do nível', () => {
    const ap = areaPlansOf(p).find((a) => a.id === 'ap_propria')!;
    const v = planViewOf(p, 'ap_propria')!;
    expect(v.levelId).toBe('lv_0');
    expect(v.name).toBe(ap.name);
    expect(v.area).toEqual({ schemeId: 'cs1', scale: 75, graphics: ap.graphics, tags: ap.tags, legend: undefined, table: undefined });
    expect(planViewHiddenOf(p, v.id)).toEqual(ap.hidden);
    expect(planViewRangeOf(p, v.id)).toEqual(planViewRangeOf(p, 'pv_lv_0'));
    expect(viewGraphicsOf(p, v.id)).toEqual(levelGraphicsOf(p, 'lv_0'));
    expect(planViewRangeOf(p, 'ap_vazia')).toEqual(planViewRangeOf(p, 'pv_lv_1'));
  });

  it('perfis: piso, área (resolveViewProfile) e cobertura (piso, lacuna documentada)', () => {
    const ap = areaPlansOf(p).find((a) => a.id === 'ap_propria')!;
    expect(viewProfileOf(p, 'pv_lv_0')).toEqual(resolveFloorProfile());
    expect(viewProfileOf(p, 'pvr_lv_0')).toEqual(resolveFloorProfile());
    expect(viewProfileOf(p, 'ap_propria')).toEqual(resolveViewProfile(ap));
    expect(viewProfileOf(p, 'ap_propria').layers.walls).toBe('normal');
  });

  it('id inexistente não lança e devolve o padrão', () => {
    expect(planViewOf(p, 'nada')).toBeUndefined();
    expect(planViewRangeOf(p, 'nada')).toEqual(DEFAULT_VIEW_RANGE);
    expect(planViewHiddenOf(p, 'nada')).toEqual({});
    expect(viewAnnotationsOf(p, 'nada').dimensions).toEqual([]);
    expect(viewGraphicsOf(p, 'nada')).toEqual(levelGraphicsOf({ planViews: [] }, ''));
    expect(viewProfileOf(p, 'nada')).toEqual(resolveFloorProfile());
  });

  it('vista de nível inexistente é apontada pela validação', () => {
    const q = structuredClone(p);
    q.planViews.push({ ...structuredClone(q.planViews.find((v) => v.id === 'ap_herda')!), id: 'orfa', levelId: 'lv_x' });
    expect(validateProject(q).some((i) => i.code === 'plan-view-level-missing')).toBe(true);
  });

  it('mainPlanViewOf: devolve a principal e lança erro claro para nível inexistente', () => {
    expect(mainPlanViewOf(p, 'lv_1', 'floor')).toBe(planViewOf(p, 'pv_lv_1'));
    expect(() => mainPlanViewOf(p, 'lv_x', 'floor')).toThrow(/lv_x/);
  });

  it('projeto sem planViews (campo ausente): nenhuma vista, sem lançar', () => {
    const q = { ...p, planViews: undefined as unknown as Project['planViews'] };
    expect(planViewsOf(q)).toEqual([]);
    expect(planViewOf(q, 'pv_lv_0')).toBeUndefined();
  });
});

describe('estabilidade de referência', () => {
  it('leituras seguidas devolvem o mesmo array e os mesmos objetos', () => {
    const p = montar().project;
    const a = planViewsOf(p);
    const b = planViewsOf(p);
    expect(b).toBe(a);
    a.forEach((v, i) => expect(b[i]).toBe(v));
    expect(planViewOf(p, 'ap_propria')).toBe(planViewOf(p, 'ap_propria'));
    expect(planViewsOfLevel(p, 'lv_0')).toBe(planViewsOfLevel(p, 'lv_0'));
    expect(viewGraphicsOf(p, 'pv_lv_0')).toBe(viewGraphicsOf(p, 'pv_lv_0'));
    expect(viewProfileOf(p, 'ap_propria')).toBe(viewProfileOf(p, 'ap_propria'));
  });

  it('comando que altera só um nível preserva as vistas dos outros níveis e das plantas de área não afetadas', () => {
    const s = montar();
    const antes = s.project;
    const va = planViewsOf(antes);
    s.exec({ type: 'addDimension', levelId: 'lv_1', dimension: dim('d9') });
    const depois = s.project;
    expect(depois).not.toBe(antes);
    const vb = planViewsOf(depois);
    const mesmo = (id: string): boolean => va.find((v) => v.id === id) === vb.find((v) => v.id === id);
    // Só a planta de piso de lv_1 recebeu a cota; as demais vistas continuam o mesmo objeto (inclusive a cobertura e a área do nível).
    expect(mesmo('pv_lv_1')).toBe(false);
    for (const id of ['pvr_lv_1', 'ap_vazia', 'pv_lv_0', 'pvr_lv_0', 'pv_lv_2', 'pvr_lv_2', 'ap_herda', 'ap_propria']) expect(mesmo(id), id).toBe(true);
    expect(viewAnnotationsOf(depois, 'pv_lv_1').dimensions.map((d) => d.id)).toEqual(['d9']);
  });

  it('a vista de área NÃO muda quando se anota o piso do nível dela (não há herança)', () => {
    const s = montar();
    const antes = planViewOf(s.project, 'ap_herda')!;
    s.exec({ type: 'addDimension', levelId: 'lv_0', dimension: dim('d7') });
    const depois = planViewOf(s.project, 'ap_herda')!;
    expect(depois).toBe(antes);
    expect(depois.annotations.dimensions.map((d) => d.id)).toEqual(['d1__ap_herda']);
  });

  it('dentro de um lote (rascunho do immer) as leituras veem as mudanças do próprio lote', () => {
    const s = montar();
    s.exec({ type: 'batch', commands: [
      { type: 'addDimension', levelId: 'lv_1', viewId: 'pvr_lv_1', dimension: dim('dr1') },
      { type: 'addDimension', levelId: 'lv_1', viewId: 'pvr_lv_1', dimension: dim('dr2') },
    ] });
    expect(viewAnnotationsOf(s.project, 'pvr_lv_1').dimensions.map((d) => d.id)).toEqual(['dr1', 'dr2']);
  });

  it('a vista de área invalida quando só o AreaPlan muda, e os níveis não', () => {
    const s = montar();
    const antes = planViewsOf(s.project);
    s.exec({ type: 'addDimension', levelId: 'lv_0', planId: 'ap_propria', dimension: dim('d8') });
    const depois = planViewsOf(s.project);
    expect(planViewOf(s.project, 'ap_propria')).not.toBe(antes.find((v) => v.id === 'ap_propria'));
    for (const id of ['pv_lv_0', 'pvr_lv_0', 'ap_herda', 'ap_vazia']) expect(depois.find((v) => v.id === id)).toBe(antes.find((v) => v.id === id));
  });
});
