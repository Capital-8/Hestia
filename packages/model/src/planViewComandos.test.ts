import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AREA_GRAPHICS,
  DEFAULT_TAG_FIELDS,
  ProjectStore,
  createEmptyProject,
  emptyTitleBlock,
  labelOf,
  makeLevel,
  makePlanView,
  makeWall,
  planGraphicsOf,
  planOf,
  type AreaPlan,
  type Sheet,
} from './index.ts';

const sheet = (viewports: Sheet['viewports']): Sheet => ({
  id: 'sh1',
  number: 'A-101',
  name: 'Plantas',
  size: 'A1',
  orientation: 'landscape',
  margin: 10,
  titleBlock: emptyTitleBlock(),
  viewports,
});

function projeto(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pavimento 2', elevation: 3 }) });
  return s;
}

const estrutura = () => makePlanView({ id: 'pv1', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura' });

describe('comandos de planta adicional (PlanView)', () => {
  it('addPlanView grava só o que foi dado e o desfazer remove a coleção inteira', () => {
    const s = projeto();
    const antes = JSON.stringify(s.project);
    s.exec({ type: 'addPlanView', plan: estrutura() });
    expect(s.project.planViews).toEqual([{ id: 'pv1', levelId: 'lv_0', discipline: 'estrutura', name: 'Estrutura' }]);
    s.undo();
    expect(JSON.stringify(s.project)).toBe(antes);
    s.redo();
    expect(s.project.planViews).toHaveLength(1);
  });

  it('addPlanView normaliza: nome sem espaços nas pontas, ocultação sem repetição, tons vazios saem', () => {
    const s = projeto();
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv1', levelId: 'lv_0', name: '  Elétrico  ', discipline: 'eletrico', tones: {}, hidden: { elements: ['a', 'a'], categories: [] } }) });
    expect(s.project.planViews![0]).toEqual({ id: 'pv1', levelId: 'lv_0', discipline: 'eletrico', name: 'Elétrico', hidden: { elements: ['a'] } });
  });

  it('addPlanView recusa nível inexistente, nome vazio, disciplina inválida, tom inválido e gráficos inválidos', () => {
    const s = projeto();
    expect(() => s.exec({ type: 'addPlanView', plan: makePlanView({ levelId: 'nope', name: 'X' }) })).toThrow('Nível inexistente');
    expect(() => s.exec({ type: 'addPlanView', plan: makePlanView({ levelId: 'lv_0', name: '   ' }) })).toThrow('nome');
    expect(() => s.exec({ type: 'addPlanView', plan: { ...estrutura(), discipline: 'piscina' as never } })).toThrow('Disciplina inválida');
    expect(() => s.exec({ type: 'addPlanView', plan: { ...estrutura(), tones: { estrutura: 'forte' as never } } })).toThrow('Tom inválido');
    expect(() => s.exec({ type: 'addPlanView', plan: { ...estrutura(), tones: { piscina: 'normal' } as never } })).toThrow('disciplina inválida');
    expect(() => s.exec({ type: 'addPlanView', plan: { ...estrutura(), graphics: { ...planGraphicsOf(s.project, 'lv_0'), scale: 0 } } })).toThrow();
    expect(s.project.planViews).toBeUndefined();
  });

  it('addPlanView recusa id repetido e id de planta de área', () => {
    const s = projeto();
    s.exec({ type: 'addPlanView', plan: estrutura() });
    expect(() => s.exec({ type: 'addPlanView', plan: estrutura() })).toThrow('Já existe planta com este id');
    const area: AreaPlan = { id: 'ap1', name: 'Área', levelId: 'lv_0', scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault, fields: [...DEFAULT_TAG_FIELDS] } }, tags: [] };
    s.exec({ type: 'addAreaPlan', plan: area });
    expect(() => s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'ap1', levelId: 'lv_0', name: 'Colide' }) })).toThrow('Já existe planta com este id');
  });

  it('várias plantas da mesma disciplina no mesmo nível são permitidas', () => {
    const s = projeto();
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv1', levelId: 'lv_0', name: 'Estrutura — fôrmas', discipline: 'estrutura' }) });
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv2', levelId: 'lv_0', name: 'Estrutura — armação', discipline: 'estrutura' }) });
    expect(s.project.planViews!.map((v) => v.id)).toEqual(['pv1', 'pv2']);
  });

  it('renomear (updatePlanView só com name) tem rótulo próprio e desfaz', () => {
    const s = projeto();
    s.exec({ type: 'addPlanView', plan: estrutura() });
    const cmd = { type: 'updatePlanView', id: 'pv1', patch: { name: 'Fôrmas' } } as const;
    expect(labelOf(cmd)).toBe('Renomear planta');
    s.exec(cmd);
    expect(s.project.planViews![0]!.name).toBe('Fôrmas');
    expect(() => s.exec({ type: 'updatePlanView', id: 'pv1', patch: { name: ' ' } })).toThrow('nome');
    expect(s.project.planViews![0]!.name).toBe('Fôrmas');
    s.undo();
    expect(s.project.planViews![0]!.name).toBe('Estrutura');
  });

  it('updatePlanView altera disciplina, tons e ocultação; undefined remove o campo; id e nível não mudam', () => {
    const s = projeto();
    s.exec({ type: 'addPlanView', plan: estrutura() });
    s.exec({ type: 'updatePlanView', id: 'pv1', patch: { discipline: 'hvac', tones: { arquitetura: 'hidden' }, hidden: { categories: ['wall'] } } });
    expect(s.project.planViews![0]).toEqual({ id: 'pv1', levelId: 'lv_0', discipline: 'hvac', name: 'Estrutura', tones: { arquitetura: 'hidden' }, hidden: { categories: ['wall'] } });
    expect(labelOf({ type: 'updatePlanView', id: 'pv1', patch: { discipline: 'hvac' } })).toBe('Alterar planta');
    s.exec({ type: 'updatePlanView', id: 'pv1', patch: { tones: undefined, hidden: undefined } });
    expect(s.project.planViews![0]).toEqual({ id: 'pv1', levelId: 'lv_0', discipline: 'hvac', name: 'Estrutura' });
    expect(() => s.exec({ type: 'updatePlanView', id: 'pv_x', patch: { name: 'a' } })).toThrow('Planta inexistente');
    expect(() => s.exec({ type: 'updatePlanView', id: 'pv1', patch: { discipline: 'x' as never } })).toThrow('Disciplina inválida');
  });

  it('setPlanGraphics mescla sobre o padrão e grava o objeto completo; resetPlanGraphics apaga; ambos desfazem', () => {
    const s = projeto();
    s.exec({ type: 'addPlanView', plan: estrutura() });
    s.exec({ type: 'setPlanGraphics', planId: 'pv1', patch: { scale: 50, overrides: { slab: { halftone: true } } } });
    const g = s.project.planViews![0]!.graphics!;
    expect(g.scale).toBe(50);
    expect(g.detail).toBe('byScale');
    expect(g.overrides.slab).toEqual({ visible: true, transparency: 0, halftone: true });
    expect(Object.keys(g.overrides)).toHaveLength(23);
    s.exec({ type: 'setPlanGraphics', planId: 'pv1', patch: { detail: 'fine' } });
    expect(s.project.planViews![0]!.graphics).toMatchObject({ scale: 50, detail: 'fine' });
    s.exec({ type: 'resetPlanGraphics', planId: 'pv1' });
    expect(s.project.planViews![0]!.graphics).toBeUndefined();
    s.undo();
    expect(s.project.planViews![0]!.graphics).toMatchObject({ scale: 50, detail: 'fine' });
    s.undo();
    expect(s.project.planViews![0]!.graphics).toMatchObject({ scale: 50, detail: 'byScale' });
    expect(labelOf({ type: 'setPlanGraphics', planId: 'pv1', patch: {} })).toBe('Alterar gráficos da planta');
    expect(labelOf({ type: 'resetPlanGraphics', planId: 'pv1' })).toBe('Restaurar gráficos da planta');
  });

  it('setPlanGraphics recusa patch inválido e planta inexistente sem alterar o projeto', () => {
    const s = projeto();
    s.exec({ type: 'addPlanView', plan: estrutura() });
    const antes = JSON.stringify(s.project);
    expect(() => s.exec({ type: 'setPlanGraphics', planId: 'pv1', patch: { scale: -5 } })).toThrow();
    expect(() => s.exec({ type: 'setPlanGraphics', planId: 'pv_x', patch: { scale: 50 } })).toThrow('Planta inexistente');
    expect(() => s.exec({ type: 'resetPlanGraphics', planId: 'pv_x' })).toThrow('Planta inexistente');
    expect(JSON.stringify(s.project)).toBe(antes);
  });

  it('setLevelGraphics e resetLevelGraphics continuam atuando só no nível', () => {
    const s = projeto();
    s.exec({ type: 'addPlanView', plan: estrutura() });
    s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { scale: 20 } });
    expect(s.project.levels.find((l) => l.id === 'lv_0')!.graphics!.scale).toBe(20);
    expect(s.project.planViews![0]!.graphics).toBeUndefined();
    expect(planOf(s.project, 'lv_0', 'pv1').graphics.scale).toBe(100);
  });

  it('removePlanView remove a planta e os viewports órfãos, e UM desfazer restaura tudo', () => {
    const s = projeto();
    s.exec({ type: 'addPlanView', plan: estrutura() });
    s.exec({
      type: 'addSheet',
      sheet: sheet([
        { id: 'vp_pv', view: { kind: 'plan', levelId: 'lv_0', planId: 'pv1' }, at: { x: 20, y: 20 }, size: { w: 100, h: 80 }, scale: 50 },
        { id: 'vp_padrao', view: { kind: 'plan', levelId: 'lv_0' }, at: { x: 140, y: 20 }, size: { w: 100, h: 80 }, scale: 50 },
      ]),
    });
    const antes = JSON.parse(JSON.stringify(s.project));
    s.exec({ type: 'removePlanView', id: 'pv1' });
    expect(s.project.planViews).toBeUndefined();
    expect(s.project.sheets![0]!.viewports.map((v) => v.id)).toEqual(['vp_padrao']);
    expect(() => s.exec({ type: 'removePlanView', id: 'pv1' })).toThrow('Planta inexistente');
    s.undo();
    expect(JSON.parse(JSON.stringify(s.project))).toEqual(antes);
    expect(labelOf({ type: 'removePlanView', id: 'pv1' })).toBe('Excluir planta');
  });

  it('removePlanView mantém as outras plantas', () => {
    const s = projeto();
    s.exec({ type: 'addPlanView', plan: estrutura() });
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv2', levelId: 'lv_1', name: 'HVAC', discipline: 'hvac' }) });
    s.exec({ type: 'removePlanView', id: 'pv1' });
    expect(s.project.planViews!.map((v) => v.id)).toEqual(['pv2']);
  });

  it('addViewport recusa planId inexistente ou de outro nível', () => {
    const s = projeto();
    s.exec({ type: 'addPlanView', plan: estrutura() });
    s.exec({ type: 'addSheet', sheet: sheet([]) });
    const vp = (id: string, levelId: string, planId: string) => ({ id, view: { kind: 'plan' as const, levelId, planId }, at: { x: 20, y: 20 }, size: { w: 100, h: 80 }, scale: 50 });
    expect(() => s.exec({ type: 'addViewport', sheetId: 'sh1', viewport: vp('v1', 'lv_0', 'pv_x') })).toThrow('Planta inexistente');
    expect(() => s.exec({ type: 'addViewport', sheetId: 'sh1', viewport: vp('v2', 'lv_1', 'pv1') })).toThrow('Planta inexistente');
    s.exec({ type: 'addViewport', sheetId: 'sh1', viewport: vp('v3', 'lv_0', 'pv1') });
    expect(s.project.sheets![0]!.viewports.map((v) => v.id)).toEqual(['v3']);
  });

  it('deleteLevel remove as plantas adicionais do nível e os viewports delas; um desfazer restaura', () => {
    const s = projeto();
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv1', levelId: 'lv_1', name: 'Estrutura', discipline: 'estrutura' }) });
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv0', levelId: 'lv_0', name: 'HVAC', discipline: 'hvac' }) });
    s.exec({
      type: 'addSheet',
      sheet: sheet([
        { id: 'v1', view: { kind: 'plan', levelId: 'lv_1', planId: 'pv1' }, at: { x: 20, y: 20 }, size: { w: 100, h: 80 }, scale: 50 },
        { id: 'v0', view: { kind: 'plan', levelId: 'lv_0', planId: 'pv0' }, at: { x: 140, y: 20 }, size: { w: 100, h: 80 }, scale: 50 },
      ]),
    });
    const antes = JSON.parse(JSON.stringify(s.project));
    s.exec({ type: 'deleteLevel', id: 'lv_1' });
    expect(s.project.planViews!.map((v) => v.id)).toEqual(['pv0']);
    expect(s.project.sheets![0]!.viewports.map((v) => v.id)).toEqual(['v0']);
    s.undo();
    expect(JSON.parse(JSON.stringify(s.project))).toEqual(antes);
  });

  it('deleteLevel da última planta adicional remove o campo planViews', () => {
    const s = projeto();
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv1', levelId: 'lv_1', name: 'Estrutura', discipline: 'estrutura' }) });
    s.exec({ type: 'deleteLevel', id: 'lv_1' });
    expect('planViews' in s.project).toBe(false);
  });

  it('excluir elemento com etiqueta nas anotações da planta adicional limpa a etiqueta órfã', () => {
    const s = projeto();
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    s.exec({
      type: 'addPlanView',
      plan: makePlanView({
        id: 'pv1', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura',
        annotations: { dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [{ id: 'tg1', hostId: 'w1', at: { x: 1, y: 1 }, property: 'name' }] },
      }),
    });
    s.exec({ type: 'deleteElements', ids: ['w1'] });
    expect(s.project.planViews![0]!.annotations!.tags).toEqual([]);
  });
});
