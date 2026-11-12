import { describe, expect, it } from 'vitest';
import {
  ProjectStore,
  createEmptyProject,
  floorViewId,
  planViewOf,
  projetoComCoberturaDeTeste,
  legacyRoofViewId,
  userViewId,
  USER_VIEW_PREFIX,
  validateProject,
  type Command,
  type Project,
} from './index.ts';

const LV0 = 'lv_0';
const upd = (viewId: string, patch: Extract<Command, { type: 'updatePlanView' }>['patch']): Command => ({ type: 'updatePlanView', viewId, patch });
const codigos = (p: Project): string[] => validateProject(p).filter((i) => i.code.startsWith('plan-view')).map((i) => i.code);
const snap = (s: ProjectStore): unknown => JSON.parse(JSON.stringify(s.project));

describe('showRoofOnTop: validação', () => {
  it('projeto novo e projeto com cobertura migrada não têm problema de vista', () => {
    expect(codigos(createEmptyProject())).toEqual([]);
    expect(codigos(projetoComCoberturaDeTeste())).toEqual([]);
  });

  it('só o piso principal é exigido por nível (sem cobertura também vale)', () => {
    const p = createEmptyProject();
    expect(p.planViews.every((v) => v.id.startsWith('pv_'))).toBe(true);
    p.planViews = p.planViews.filter((v) => v.id !== floorViewId(LV0));
    expect(codigos(p)).toContain('plan-view-main-missing');
  });

  it('recusa showRoofOnTop em planta de área e de forro', () => {
    const p = projetoComCoberturaDeTeste();
    p.planViews.push({ id: 'pvc_forro', name: 'Forro', levelId: LV0, kind: 'ceiling', viewRange: { top: 2.3, cut: 2.3, bottom: 0, depth: 0, direction: 'up' }, annotations: { dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] }, showRoofOnTop: true });
    expect(codigos(p)).toContain('plan-view-roof-on-top-kind');
  });

  it('recusa showRoofOnTop com a faixa de vista para cima', () => {
    const p = projetoComCoberturaDeTeste();
    const v = planViewOf(p, legacyRoofViewId(LV0))!;
    v.viewRange = { ...v.viewRange, direction: 'up' };
    expect(codigos(p)).toContain('plan-view-roof-on-top-up');
  });
});

describe('showRoofOnTop: comandos', () => {
  it('addPlanView grava a flag em planta de piso e ela vira undo/redo', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addPlanView', view: { id: userViewId('cob1'), kind: 'floor', levelId: LV0, name: 'Cobertura', showRoofOnTop: true } });
    expect(planViewOf(s.project, 'pvc_cob1')!.showRoofOnTop).toBe(true);
    s.exec({ type: 'addPlanView', view: { id: userViewId('cob2'), kind: 'floor', levelId: LV0, name: 'Sem flag', showRoofOnTop: false } });
    expect('showRoofOnTop' in planViewOf(s.project, 'pvc_cob2')!).toBe(false);
    s.undo();
    s.undo();
    expect(planViewOf(s.project, 'pvc_cob1')).toBeUndefined();
  });

  it('addPlanView recusa a flag em área, forro e com faixa para cima, sem alterar o projeto', () => {
    const s = new ProjectStore(createEmptyProject());
    const antes = snap(s);
    expect(() => s.exec({ type: 'addPlanView', view: { id: 'pvc_a', kind: 'ceiling', levelId: LV0, name: 'F', showRoofOnTop: true } })).toThrow();
    expect(() => s.exec({ type: 'addPlanView', view: { id: 'pvc_b', kind: 'floor', levelId: LV0, name: 'X', showRoofOnTop: true, viewRange: { top: 2.3, cut: 2.3, bottom: 0, depth: 0, direction: 'up' } } })).toThrow();
    expect(snap(s)).toEqual(antes);
  });

  it('updatePlanView liga e desliga a flag (false apaga o campo)', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec(upd(floorViewId(LV0), { showRoofOnTop: true }));
    expect(planViewOf(s.project, floorViewId(LV0))!.showRoofOnTop).toBe(true);
    s.exec(upd(floorViewId(LV0), { showRoofOnTop: false }));
    expect('showRoofOnTop' in planViewOf(s.project, floorViewId(LV0))!).toBe(false);
  });

  it('updatePlanView recusa a flag em forro e a faixa para cima com a flag ligada', () => {
    const s = new ProjectStore(projetoComCoberturaDeTeste());
    s.exec({ type: 'addPlanView', view: { id: 'pvc_forro', kind: 'ceiling', levelId: LV0, name: 'Forro' } });
    const antes = snap(s);
    expect(() => s.exec(upd('pvc_forro', { showRoofOnTop: true }))).toThrow();
    expect(() => s.exec(upd(legacyRoofViewId(LV0), { viewRange: { direction: 'up', top: 2.3, cut: 2.3, bottom: 0, depth: 0 } }))).toThrow();
    expect(snap(s)).toEqual(antes);
  });

  it('faixa de vista na cobertura migrada é editável (e fica gravada mesmo com a flag ligada)', () => {
    const s = new ProjectStore(projetoComCoberturaDeTeste());
    s.exec(upd(legacyRoofViewId(LV0), { viewRange: { cut: 1.0 } }));
    expect(planViewOf(s.project, legacyRoofViewId(LV0))!.viewRange.cut).toBe(1.0);
    expect(planViewOf(s.project, legacyRoofViewId(LV0))!.showRoofOnTop).toBe(true);
  });

  it('a cobertura migrada pode ser apagada; o piso principal não', () => {
    const s = new ProjectStore(projetoComCoberturaDeTeste());
    s.exec({ type: 'removePlanView', viewId: legacyRoofViewId(LV0) });
    expect(planViewOf(s.project, legacyRoofViewId(LV0))).toBeUndefined();
    expect(() => s.exec({ type: 'removePlanView', viewId: floorViewId(LV0) })).toThrow();
  });
});

describe('id de vista criada pelo usuário', () => {
  it('userViewId usa pvc_ e nunca começa com pv_', () => {
    expect(USER_VIEW_PREFIX).toBe('pvc_');
    for (const x of ['abc', '_x', 'lv_0', '']) {
      expect(userViewId(x).startsWith('pvc_')).toBe(true);
      expect(userViewId(x).startsWith('pv_')).toBe(false);
    }
  });

  it('addPlanView recusa id que começa com pv_ (confundiria com o piso principal) e aceita pvc_', () => {
    const s = new ProjectStore(createEmptyProject());
    expect(() => s.exec({ type: 'addPlanView', view: { id: 'pv_novo', kind: 'floor', levelId: LV0, name: 'X' } })).toThrow();
    s.exec({ type: 'addPlanView', view: { id: userViewId('novo'), kind: 'floor', levelId: LV0, name: 'X' } });
    expect(planViewOf(s.project, 'pvc_novo')).toBeDefined();
  });
});
