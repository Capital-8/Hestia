import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AREA_GRAPHICS,
  DEFAULT_TAG_FIELDS,
  ProjectStore,
  createEmptyProject,
  emptyTitleBlock,
  makeLevel,
  makePlanView,
  validateProject,
  type PlanView,
  type Project,
} from './index.ts';

const issuesOf = (p: Project, prefix: string) => validateProject(p).filter((i) => i.code.startsWith(prefix));

/** Projeto válido com uma planta adicional gravada direto (sem passar pelo comando, que recusaria o inválido). */
function projeto(plan: Partial<PlanView> | null = {}, extra: PlanView[] = []): Project {
  const p = createEmptyProject();
  p.levels = [...p.levels, makeLevel({ id: 'lv_1', name: 'Pavimento 2', elevation: 3 })];
  p.planViews = [...(plan ? [{ ...makePlanView({ id: 'pv1', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura' }), ...plan }] : []), ...extra];
  return p;
}

describe('validação das plantas adicionais', () => {
  it('projeto sem planViews e planta válida não geram problema de planta', () => {
    expect(issuesOf(createEmptyProject(), 'plan-view')).toEqual([]);
    expect(issuesOf(projeto(), 'plan-view')).toEqual([]);
  });

  it('id duplicado entre plantas adicionais', () => {
    const p = projeto({}, [makePlanView({ id: 'pv1', levelId: 'lv_1', name: 'Outra', discipline: 'hvac' })]);
    const r = issuesOf(p, 'plan-view-id-duplicate');
    expect(r).toHaveLength(2);
    expect(r.every((i) => i.severity === 'error')).toBe(true);
  });

  it('id igual ao de uma planta de área', () => {
    const p = projeto();
    p.areaPlans = [{ id: 'pv1', name: 'Área', levelId: 'lv_0', scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault, fields: [...DEFAULT_TAG_FIELDS] } }, tags: [] }];
    expect(issuesOf(p, 'plan-view-id-duplicate')).toHaveLength(1);
  });

  it.each([
    ['nível inexistente', { levelId: 'nope' }, 'Nível inexistente'],
    ['nome vazio', { name: ' ' }, 'precisa de nome'],
    ['disciplina inválida', { discipline: 'piscina' as never }, 'Disciplina inválida'],
    ['tom inválido', { tones: { estrutura: 'forte' as never } }, 'Tom inválido'],
    ['tom para disciplina inválida', { tones: { piscina: 'normal' } as never }, 'disciplina inválida'],
    ['gráficos inválidos', { graphics: { scale: 0, detail: 'byScale', style: 'hiddenLine', partialStructure: 'entire', overrides: {} } as never }, ''],
    ['ocultação inválida', { hidden: { elements: 'x' } as never }, ''],
  ])('erro: %s', (_nome, patch, trecho) => {
    const r = issuesOf(projeto(patch as Partial<PlanView>), 'plan-view-invalid');
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((i) => i.severity === 'error' && i.elementId === 'pv1')).toBe(true);
    if (trecho) expect(r.some((i) => i.message.includes(trecho))).toBe(true);
  });

  it('etiqueta de elemento que não existe mais nas anotações da planta é aviso', () => {
    const p = projeto({ annotations: { dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [{ id: 'tg1', hostId: 'sumiu', at: { x: 0, y: 0 }, property: 'name' }] } });
    const r = issuesOf(p, 'plan-view-tag-host-missing');
    expect(r).toHaveLength(1);
    expect(r[0]!.severity).toBe('warning');
  });

  describe('prancha com planId', () => {
    const comPrancha = (view: unknown, planViews: PlanView[] | null): Project => {
      const p = projeto(planViews === null ? null : {}, []);
      if (planViews === null) delete p.planViews;
      p.sheets = [{ id: 'sh1', number: 'A-101', name: 'P', size: 'A1', orientation: 'landscape', margin: 10, titleBlock: emptyTitleBlock(), viewports: [{ id: 'v1', view: view as never, at: { x: 20, y: 20 }, size: { w: 100, h: 80 }, scale: 50 }] }];
      return p;
    };

    it('planId válido (mesmo nível) não gera problema', () => {
      const p = comPrancha({ kind: 'plan', levelId: 'lv_0', planId: 'pv1' }, []);
      expect(issuesOf(p, 'sheet')).toEqual([]);
    });

    it('planId inexistente é AVISO (a leitura cai na planta padrão), não erro', () => {
      const r = issuesOf(comPrancha({ kind: 'plan', levelId: 'lv_0', planId: 'pv_x' }, []), 'sheet');
      expect(r).toHaveLength(1);
      expect(r[0]).toMatchObject({ severity: 'warning', code: 'sheet-plan-view-missing', ids: ['sh1', 'v1'] });
    });

    it('planId de outro nível é aviso', () => {
      const r = issuesOf(comPrancha({ kind: 'plan', levelId: 'lv_1', planId: 'pv1' }, []), 'sheet');
      expect(r.map((i) => [i.severity, i.code])).toEqual([['warning', 'sheet-plan-view-missing']]);
    });

    it('nível inexistente continua erro, com ou sem planId', () => {
      const r = issuesOf(comPrancha({ kind: 'plan', levelId: 'nope', planId: 'pv1' }, []), 'sheet');
      expect(r.map((i) => [i.severity, i.code])).toEqual([['error', 'sheet-view-missing']]);
    });

    it('prancha antiga (sem planId) não gera nada', () => {
      expect(issuesOf(comPrancha({ kind: 'plan', levelId: 'lv_0' }, null), 'sheet')).toEqual([]);
    });
  });

  it('uma planta criada por comando passa na validação', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv1', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura', tones: { arquitetura: 'halftone' } }) });
    s.exec({ type: 'setPlanGraphics', planId: 'pv1', patch: { scale: 50 } });
    expect(issuesOf(s.project, 'plan-view')).toEqual([]);
  });
});
