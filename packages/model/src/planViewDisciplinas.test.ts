import { describe, expect, it } from 'vitest';
import {
  ProjectStore,
  createEmptyProject,
  emptyTitleBlock,
  labelOf,
  makeLevel,
  makePlanView,
  migrateProject,
  planOf,
  planTonesOf,
  planViewById,
  planViewsOf,
  planViewForDiscipline,
  type Discipline,
  type Sheet,
} from './index.ts';
import type { Lang } from './i18n.ts';

/*
 * Plantas por disciplina na criação, duplicação, renomeação e exclusão (decisão 0060 §12, etapa 3.3).
 * Valores de referência LITERAIS: nomes padrão, predefinidos de tom e conteúdo das anotações.
 */

function projeto(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_2', name: 'Pavimento 3', elevation: 6 }) });
  return s;
}

function criar(s: ProjectStore, levelId: string, discipline: Discipline, lang: Lang = 'pt'): string {
  const plan = planViewForDiscipline(s.project, levelId, discipline, { lang });
  s.exec({ type: 'addPlanView', plan });
  return plan.id;
}

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

const vazio = { dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] };

describe('criar planta por disciplina (addPlanView com predefinido)', () => {
  it('grava disciplina, anotações vazias, sem tons (usa o predefinido) e nome "<Nível> - <Disciplina>"', () => {
    const s = projeto();
    const est = criar(s, 'lv_0', 'estrutura');
    expect(planViewById(s.project, est)).toEqual({ id: est, levelId: 'lv_0', discipline: 'estrutura', name: 'Térreo - Estrutura', annotations: vazio });
    expect(planTonesOf(planViewById(s.project, est))).toEqual({ arquitetura: 'halftone', estrutura: 'normal', hidrossanitario: 'hidden', eletrico: 'hidden', hvac: 'hidden' });

    const hid = criar(s, 'lv_0', 'hidrossanitario');
    expect(planViewById(s.project, hid)!.name).toBe('Térreo - Hidrossanitário');
    expect(planTonesOf(planViewById(s.project, hid))).toEqual({ arquitetura: 'halftone', estrutura: 'halftone', hidrossanitario: 'normal', eletrico: 'hidden', hvac: 'hidden' });

    const ele = criar(s, 'lv_2', 'eletrico');
    expect(planViewById(s.project, ele)!.name).toBe('Pavimento 3 - Elétrico');
    const arqEn = criar(s, 'lv_0', 'arquitetura', 'en');
    expect(planViewById(s.project, arqEn)!.name).toBe('Térreo - Architecture');

    // Cada criação é um passo de desfazer: o Ctrl+Z tira só a última planta.
    expect(planViewsOf(s.project)).toHaveLength(4);
    s.undo();
    expect(planViewsOf(s.project).map((v) => v.id)).not.toContain(arqEn);
  });

  it('o nome padrão é único por nível: a segunda planta da mesma disciplina recebe sufixo numérico', () => {
    const s = projeto();
    const pv1 = criar(s, 'lv_0', 'estrutura');
    const pv2 = criar(s, 'lv_0', 'estrutura');
    const pv3 = criar(s, 'lv_0', 'estrutura');
    expect([pv1, pv2, pv3].map((id) => planViewById(s.project, id)!.name)).toEqual(['Térreo - Estrutura', 'Térreo - Estrutura (2)', 'Térreo - Estrutura (3)']);
    // O mesmo nome em outro nível é permitido e independente.
    const outro = criar(s, 'lv_2', 'estrutura');
    expect(planViewById(s.project, outro)!.name).toBe('Pavimento 3 - Estrutura');
  });

  it('duas disciplinas no mesmo nível convivem e cada uma tem os próprios gráficos', () => {
    const s = projeto();
    const est = criar(s, 'lv_0', 'estrutura');
    const ele = criar(s, 'lv_0', 'eletrico');
    expect(planOf(s.project, 'lv_0', est).discipline).toBe('estrutura');
    expect(planOf(s.project, 'lv_0', ele).discipline).toBe('eletrico');
    s.exec({ type: 'setPlanGraphics', planId: est, patch: { scale: 25 } });
    expect(planOf(s.project, 'lv_0', est).graphics.scale).toBe(25);
    expect(planOf(s.project, 'lv_0', ele).graphics.scale).toBe(100);
    expect(planOf(s.project, 'lv_0').graphics.scale).toBe(100);
  });
});

describe('duplicar planta (duplicatePlanView)', () => {
  function comOrigem(): ProjectStore {
    const s = projeto();
    s.exec({
      type: 'addPlanView',
      plan: makePlanView({
        id: 'pv1', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura',
        tones: { arquitetura: 'normal' }, hidden: { elements: ['w1'] },
        annotations: { dimensions: [{ id: 'd1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 0.5 }], texts: [], detailLines: [], detailRegions: [], tags: [] },
      }),
    });
    s.exec({ type: 'setPlanGraphics', planId: 'pv1', patch: { scale: 50 } });
    return s;
  }

  it('sem anotações: copia gráficos, ocultação e tons, nome único, num único passo de desfazer', () => {
    const s = comOrigem();
    s.exec({ type: 'duplicatePlanView', id: 'pv1', newPlanId: 'pv2' });
    const pv2 = planViewById(s.project, 'pv2')!;
    expect(pv2).toMatchObject({ id: 'pv2', levelId: 'lv_0', discipline: 'estrutura', name: 'Estrutura (2)', tones: { arquitetura: 'normal' }, hidden: { elements: ['w1'] } });
    expect(pv2.annotations).toEqual(vazio);
    expect(planOf(s.project, 'lv_0', 'pv2').graphics.scale).toBe(50);
    expect(labelOf({ type: 'duplicatePlanView', id: 'pv1' })).toBe('Duplicar planta');
    s.undo();
    expect(planViewsOf(s.project).map((v) => v.id)).toEqual(['pv1']);
  });

  it('com anotações: copia o conteúdo com ids novos, sem compartilhar objetos com a origem', () => {
    const s = comOrigem();
    s.exec({ type: 'duplicatePlanView', id: 'pv1', newPlanId: 'pv2' });
    s.exec({ type: 'duplicatePlanView', id: 'pv1', newPlanId: 'pv3', withAnnotations: true });
    const dims = planViewById(s.project, 'pv3')!.annotations!.dimensions;
    expect(dims).toHaveLength(1);
    expect(dims[0]!.id).not.toBe('d1');
    expect(dims[0]).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 0.5 });
    expect(planViewById(s.project, 'pv1')!.annotations!.dimensions[0]!.id).toBe('d1');
    expect(planViewById(s.project, 'pv2')!.annotations).toEqual(vazio);
    expect(planViewById(s.project, 'pv3')!.name).toBe('Estrutura (3)');
  });
});

describe('renomear e excluir planta', () => {
  it('renomear mantém o nome único no nível e desfaz num passo', () => {
    const s = projeto();
    const pv1 = criar(s, 'lv_0', 'estrutura');
    const pv2 = criar(s, 'lv_0', 'eletrico');
    s.exec({ type: 'updatePlanView', id: pv1, patch: { name: 'Fôrmas' } });
    expect(planViewById(s.project, pv1)!.name).toBe('Fôrmas');
    expect(labelOf({ type: 'updatePlanView', id: pv1, patch: { name: 'Fôrmas' } })).toBe('Renomear planta');
    s.exec({ type: 'updatePlanView', id: pv2, patch: { name: 'Fôrmas' } });
    expect(planViewById(s.project, pv2)!.name).toBe('Fôrmas (2)');
    s.undo();
    expect(planViewById(s.project, pv2)!.name).toBe('Térreo - Elétrico');
    s.undo();
    expect(planViewById(s.project, pv1)!.name).toBe('Térreo - Estrutura');
  });

  it('excluir remove os viewports de prancha que a referenciam e UM desfazer restaura tudo', () => {
    const s = projeto();
    const pv1 = criar(s, 'lv_0', 'estrutura');
    s.exec({
      type: 'addSheet',
      sheet: sheet([
        { id: 'vp_est', view: { kind: 'plan', levelId: 'lv_0', planId: pv1 }, at: { x: 20, y: 20 }, size: { w: 100, h: 80 }, scale: 50 },
        { id: 'vp_padrao', view: { kind: 'plan', levelId: 'lv_0' }, at: { x: 140, y: 20 }, size: { w: 100, h: 80 }, scale: 50 },
      ]),
    });
    const antes = JSON.parse(JSON.stringify(s.project));
    s.exec({ type: 'removePlanView', id: pv1 });
    expect(planViewById(s.project, pv1)).toBeUndefined();
    expect(s.project.sheets![0]!.viewports.map((v) => v.id)).toEqual(['vp_padrao']);
    expect(labelOf({ type: 'removePlanView', id: pv1 })).toBe('Excluir planta');
    s.undo();
    expect(JSON.parse(JSON.stringify(s.project))).toEqual(antes);
  });
});

describe('ida e volta de arquivo salvo e reaberto', () => {
  it('serializar → abrir → serializar é idêntico, com plantas de disciplinas diferentes, cópia com anotações e prancha', () => {
    const s = projeto();
    const est = criar(s, 'lv_0', 'estrutura');
    const ele = criar(s, 'lv_0', 'eletrico');
    s.exec({ type: 'addDimension', levelId: 'lv_0', planId: est, dimension: { id: 'd1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 0.5 } });
    s.exec({ type: 'duplicatePlanView', id: est, newPlanId: 'pv_copia', withAnnotations: true });
    s.exec({ type: 'updatePlanView', id: ele, patch: { name: 'Tomadas' } });
    s.exec({
      type: 'addSheet',
      sheet: sheet([{ id: 'vp_est', view: { kind: 'plan', levelId: 'lv_0', planId: est }, at: { x: 20, y: 20 }, size: { w: 100, h: 80 }, scale: 50 }]),
    });

    const texto = JSON.stringify(s.project);
    const volta = migrateProject(JSON.parse(texto));
    expect(JSON.stringify(volta)).toBe(texto);
    expect(planViewsOf(volta).map((v) => v.name)).toEqual(['Térreo - Estrutura', 'Tomadas', 'Térreo - Estrutura (2)']);
    expect(planViewById(volta, 'pv_copia')!.annotations!.dimensions.map((d) => d.id)).not.toContain('d1');
    expect(volta.sheets![0]!.viewports[0]!.view).toEqual({ kind: 'plan', levelId: 'lv_0', planId: est });
  });
});
