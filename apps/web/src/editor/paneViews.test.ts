import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, makePlanView, type Project } from '@hestia/model';
import { useI18n } from './i18n.ts';
import { listPaneViews, viewsForPreset } from './paneViews.ts';

function projeto(): Project {
  const p = createEmptyProject();
  return {
    ...p,
    levels: [
      { id: 'lv_0', name: 'Térreo', elevation: 0 },
      { id: 'lv_1', name: 'Superior', elevation: 3 },
    ],
    views: [
      { id: 'c1', name: 'Corte A', kind: 'section', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, depth: 3 },
      { id: 'e1', name: 'Fachada Sul', kind: 'elevation', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, depth: 3 },
    ],
    areaPlans: [{ id: 'ap1', name: 'Áreas do térreo', levelId: 'lv_0' }],
    sheets: [{ id: 'sh1', number: 'A-101', name: 'Planta baixa' }],
  } as unknown as Project;
}

describe('listPaneViews', () => {
  beforeEach(() => useI18n.setState({ lang: 'pt' }));

  it('agrupa todas as vistas do projeto, com rótulos', () => {
    const g = listPaneViews(projeto(), 'pt');
    expect(g.map((x) => [x.id, x.label])).toEqual([
      ['floor', 'Plantas de piso'],
      ['roof', 'Plantas de cobertura'],
      ['area', 'Plantas de área'],
      ['3d', 'Modelo 3D'],
      ['section', 'Cortes'],
      ['elevation', 'Elevações'],
      ['sheet', 'Pranchas'],
    ]);
    expect(g[0]?.options.map((o) => [o.key, o.label])).toEqual([['plan:lv_0', 'Térreo'], ['plan:lv_1', 'Superior']]);
    expect(g[1]?.options.map((o) => [o.key, o.label])).toEqual([['roof:lv_0', 'Planta de cobertura: Térreo'], ['roof:lv_1', 'Planta de cobertura: Superior']]);
    expect(g[2]?.options.map((o) => [o.key, o.label])).toEqual([['area:ap1', 'Áreas do térreo']]);
    expect(g[3]?.options.map((o) => o.key)).toEqual(['3d']);
    expect(g[4]?.options.map((o) => [o.key, o.label])).toEqual([['section:c1', 'Corte A']]);
    expect(g[5]?.options.map((o) => [o.key, o.label])).toEqual([['section:e1', 'Fachada Sul']]);
    expect(g[6]?.options.map((o) => [o.key, o.label])).toEqual([['sheet:sh1', 'A-101 Planta baixa']]);
    expect(g[4]?.options[0]?.view).toEqual({ kind: 'section', viewId: 'c1' });
  });

  it('lista as plantas de disciplina de cada nível, logo depois da planta padrão dele', () => {
    const p = {
      ...projeto(),
      planViews: [
        makePlanView({ id: 'pv_e', levelId: 'lv_0', name: 'Térreo - Estrutura', discipline: 'estrutura' }),
        makePlanView({ id: 'pv_h', levelId: 'lv_1', name: 'Superior - Hidrossanitário', discipline: 'hidrossanitario' }),
      ],
    } as unknown as Project;
    expect(listPaneViews(p, 'pt')[0]?.options.map((o) => [o.key, o.label])).toEqual([
      ['plan:lv_0', 'Térreo'],
      ['pv:pv_e', 'Térreo - Estrutura · Estrutura'],
      ['plan:lv_1', 'Superior'],
      ['pv:pv_h', 'Superior - Hidrossanitário · Hidrossanitário'],
    ]);
  });

  it('omite grupos vazios', () => {
    const p = { ...projeto(), views: [], areaPlans: [], sheets: [] } as unknown as Project;
    expect(listPaneViews(p, 'pt').map((x) => x.id)).toEqual(['floor', 'roof', '3d']);
  });
});

describe('viewsForPreset', () => {
  beforeEach(() => useI18n.setState({ lang: 'pt' }));
  const L0 = { kind: 'plan', levelId: 'lv_0' } as const;
  const L1 = { kind: 'plan', levelId: 'lv_1' } as const;

  it('ativa, 3D, primeiro corte, outra planta', () => {
    expect(viewsForPreset(projeto(), L0, [L0])).toEqual([L0, { kind: '3d' }, { kind: 'section', viewId: 'c1' }, L1]);
  });

  it('3D ativo: 3D não se repete; completa com abertas existentes e depois a ativa', () => {
    const r = viewsForPreset(projeto(), { kind: '3d' }, [{ kind: 'sheet', sheetId: 'sh1' }, { kind: 'plan', levelId: 'zz' }]);
    expect(r).toEqual([{ kind: '3d' }, { kind: 'section', viewId: 'c1' }, L0, { kind: 'sheet', sheetId: 'sh1' }]);
  });

  it('projeto simples: completa repetindo a ativa até 4', () => {
    const p = { ...projeto(), views: [], levels: [{ id: 'lv_0', name: 'Térreo', elevation: 0 }] } as unknown as Project;
    expect(viewsForPreset(p, L0, [])).toEqual([L0, { kind: '3d' }, L0, L0]);
  });
});
