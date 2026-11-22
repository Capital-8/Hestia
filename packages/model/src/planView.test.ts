import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW_GRAPHICS,
  ProjectStore,
  createEmptyProject,
  levelGraphicsOf,
  makeLevel,
  makePlanView,
  planGraphicsOf,
  planHiddenOf,
  planOf,
  roofHiddenOf,
  type Project,
} from './index.ts';

/** Projeto com dois níveis (lv_0 e lv_1), `Level.graphics` só em lv_0 e `Level.hidden`/`roofHidden` só em lv_1. */
function projeto(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pavimento 2', elevation: 3 }) });
  s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { scale: 50, detail: 'fine', overrides: { slab: { halftone: true, transparency: 0.25 } } } });
  s.exec({ type: 'setViewHidden', target: { kind: 'plan', levelId: 'lv_1' }, hidden: { elements: ['m0'], categories: ['slab'] } });
  s.exec({ type: 'setViewHidden', target: { kind: 'roof', levelId: 'lv_1' }, hidden: { categories: ['roof'] } });
  return s;
}

const CATEGORIAS = ['wall', 'door', 'window', 'floor', 'slab', 'roof', 'stair', 'railing', 'site', 'lot', 'mass', 'room', 'annotation', 'generic', 'column', 'beam', 'footing', 'ceiling', 'ramp', 'component', 'plumbingFixture', 'electricalFixture', 'mechanicalEquipment'] as const;

describe('resolvedor de plantas · planta padrão (sem planViews)', () => {
  it('levelGraphicsOf continua devolvendo o padrão do Hestia para nível sem gráficos (valores literais)', () => {
    const g = levelGraphicsOf(projeto().project, 'lv_1');
    expect(g.scale).toBe(100);
    expect(g.detail).toBe('byScale');
    expect(g.style).toBe('hiddenLine');
    expect(g.partialStructure).toBe('entire');
    expect(g.thinLines).toBe(true);
    expect(Object.keys(g.overrides).sort()).toEqual([...CATEGORIAS].sort());
    for (const c of CATEGORIAS) expect(g.overrides[c]).toEqual({ visible: true, transparency: 0, halftone: false });
    expect(g).toEqual(DEFAULT_VIEW_GRAPHICS);
  });

  it('levelGraphicsOf continua mesclando Level.graphics (escala 50, laje meio-tom com 25% de transparência)', () => {
    const g = levelGraphicsOf(projeto().project, 'lv_0');
    expect(g.scale).toBe(50);
    expect(g.detail).toBe('fine');
    expect(g.style).toBe('hiddenLine');
    expect(g.overrides.slab).toEqual({ visible: true, transparency: 0.25, halftone: true });
    expect(g.overrides.wall).toEqual({ visible: true, transparency: 0, halftone: false });
  });

  it('nível inexistente cai no padrão, como antes', () => {
    expect(levelGraphicsOf(projeto().project, 'nao_existe')).toEqual(DEFAULT_VIEW_GRAPHICS);
    expect(planGraphicsOf(projeto().project, 'nao_existe', 'pv_x')).toEqual(DEFAULT_VIEW_GRAPHICS);
  });

  it('planGraphicsOf sem planId, com id desconhecido e levelGraphicsOf dão o mesmo resultado', () => {
    const p = projeto().project;
    for (const lv of ['lv_0', 'lv_1']) {
      const base = levelGraphicsOf(p, lv);
      expect(planGraphicsOf(p, lv)).toEqual(base);
      expect(planGraphicsOf(p, lv, 'pv_inexistente')).toEqual(base);
    }
  });

  it('planHiddenOf lê Level.hidden na planta padrão; sem ocultação devolve {}', () => {
    const p = projeto().project;
    expect(planHiddenOf(p, 'lv_1')).toEqual({ elements: ['m0'], categories: ['slab'] });
    expect(planHiddenOf(p, 'lv_0')).toEqual({});
    expect(planHiddenOf(p, 'nao_existe')).toEqual({});
  });

  it('roofHiddenOf lê Level.roofHidden e não se mistura com a planta de piso', () => {
    const p = projeto().project;
    expect(roofHiddenOf(p, 'lv_1')).toEqual({ categories: ['roof'] });
    expect(roofHiddenOf(p, 'lv_0')).toEqual({});
    expect(planHiddenOf(p, 'lv_1').categories).toEqual(['slab']);
  });

  it('planOf sem planId descreve a planta padrão do nível', () => {
    const p = projeto().project;
    const r = planOf(p, 'lv_1');
    expect(r.isDefault).toBe(true);
    expect(r.planId).toBeUndefined();
    expect(r.discipline).toBe('arquitetura');
    expect(r.name).toBe('Pavimento 2');
    expect(r.tones).toEqual({});
    expect(r.hidden).toEqual({ elements: ['m0'], categories: ['slab'] });
    expect(r.graphics).toEqual(DEFAULT_VIEW_GRAPHICS);
    expect(planOf(p, 'nao_existe').name).toBe('');
  });
});

describe('resolvedor de plantas · planta adicional', () => {
  function comPlanta(): ProjectStore {
    const s = projeto();
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv1', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura', tones: { arquitetura: 'halftone' } }) });
    s.exec({ type: 'setPlanGraphics', planId: 'pv1', patch: { scale: 25, overrides: { wall: { transparency: 0.5 } } } });
    s.exec({ type: 'updatePlanView', id: 'pv1', patch: { hidden: { elements: ['p1'] } } });
    return s;
  }

  it('planGraphicsOf e planHiddenOf leem a PlanView, e a planta padrão do mesmo nível não muda', () => {
    const p = comPlanta().project;
    const g = planGraphicsOf(p, 'lv_0', 'pv1');
    expect(g.scale).toBe(25);
    expect(g.detail).toBe('byScale');
    expect(g.overrides.wall).toEqual({ visible: true, transparency: 0.5, halftone: false });
    expect(g.overrides.slab).toEqual({ visible: true, transparency: 0, halftone: false });
    expect(planHiddenOf(p, 'lv_0', 'pv1')).toEqual({ elements: ['p1'] });
    // Planta padrão do mesmo nível: intacta (escala 50, laje meio-tom, nada oculto).
    expect(planGraphicsOf(p, 'lv_0').scale).toBe(50);
    expect(planGraphicsOf(p, 'lv_0').overrides.slab).toEqual({ visible: true, transparency: 0.25, halftone: true });
    expect(planHiddenOf(p, 'lv_0')).toEqual({});
    expect(levelGraphicsOf(p, 'lv_0').scale).toBe(50);
  });

  it('planOf devolve disciplina, nome, desvios de tom e isDefault falso', () => {
    const r = planOf(comPlanta().project, 'lv_0', 'pv1');
    expect(r).toMatchObject({ levelId: 'lv_0', planId: 'pv1', discipline: 'estrutura', name: 'Estrutura', isDefault: false, tones: { arquitetura: 'halftone' } });
    expect(r.graphics.scale).toBe(25);
  });

  it('planta sem graphics gravados usa o padrão do Hestia, não o Level.graphics do nível', () => {
    const s = projeto();
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv2', levelId: 'lv_0', name: 'Hidráulica', discipline: 'hidrossanitario' }) });
    expect(planGraphicsOf(s.project, 'lv_0', 'pv2')).toEqual(DEFAULT_VIEW_GRAPHICS);
  });

  it('id de OUTRO nível cai na planta padrão do nível pedido (nunca lança)', () => {
    const p = comPlanta().project;
    expect(planGraphicsOf(p, 'lv_1', 'pv1')).toEqual(planGraphicsOf(p, 'lv_1'));
    expect(planHiddenOf(p, 'lv_1', 'pv1')).toEqual({ elements: ['m0'], categories: ['slab'] });
    const r = planOf(p, 'lv_1', 'pv1');
    expect(r.isDefault).toBe(true);
    expect(r.planId).toBeUndefined();
  });

  it('id desconhecido cai na planta padrão', () => {
    const p = comPlanta().project;
    expect(planOf(p, 'lv_0', 'pv_nao_existe').isDefault).toBe(true);
    expect(planGraphicsOf(p, 'lv_0', 'pv_nao_existe').scale).toBe(50);
  });
});

describe('invariância do nível: arquivo sem planViews é idêntico', () => {
  it('criar e remover planta adicional devolve o projeto byte a byte (sem o campo planViews)', () => {
    const s = projeto();
    const antes = JSON.stringify(s.project);
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv1', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura' }) });
    expect(JSON.stringify(s.project)).not.toBe(antes);
    s.exec({ type: 'removePlanView', id: 'pv1' });
    expect(JSON.stringify(s.project)).toBe(antes);
    expect('planViews' in s.project).toBe(false);
  });

  it('as plantas adicionais não alteram Level.graphics nem Level.hidden de nenhum nível', () => {
    const s = projeto();
    const antes = JSON.stringify(s.project.levels);
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv1', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura' }) });
    s.exec({ type: 'setPlanGraphics', planId: 'pv1', patch: { scale: 20, detail: 'coarse' } });
    s.exec({ type: 'updatePlanView', id: 'pv1', patch: { hidden: { categories: ['wall'] } } });
    s.exec({ type: 'resetPlanGraphics', planId: 'pv1' });
    expect(JSON.stringify(s.project.levels)).toBe(antes);
  });

  it('projeto sem planViews: o campo não existe e o resolvedor aceita Pick<levels> puro', () => {
    const p: Project = createEmptyProject();
    expect('planViews' in p).toBe(false);
    expect(planGraphicsOf({ levels: p.levels }, p.levels[0]!.id)).toEqual(DEFAULT_VIEW_GRAPHICS);
  });
});
