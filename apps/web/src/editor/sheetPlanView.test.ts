import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeLevel, makeWall, sheetOf } from '@hestia/model';
import { draggableViews } from '../ui/sheet/useSheetPrefetch.ts';
import { gruposDeVistas } from './sheetInsertSources.ts';
import { addViewsAction, naturalScaleOf } from './sheetInsert.ts';
import { addSheetAction, pranchaDaPlantaAtual } from './sheetActions.ts';

/*
 * Plantas de disciplina nas listas e nas ações de prancha (decisão 0060 §6, etapa 2.4): "Inserir vistas", o pré-aquecimento
 * da prancha, a escala natural, a inserção e a prancha da planta ativa. Projeto: lv_0 e lv_1; pv1 (Estrutura) em lv_0 e
 * pv2 (Elétrica) em lv_1. Sem plantas de disciplina, tudo sai como antes.
 */

function projeto(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pavimento 2', elevation: 3 }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w_teste', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, height: 3 }) });
  return s;
}

function comPlantas(): ProjectStore {
  const s = projeto();
  s.exec({ type: 'addPlanView', plan: { id: 'pv1', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura' } });
  s.exec({ type: 'setPlanGraphics', planId: 'pv1', patch: { scale: 50 } });
  s.exec({ type: 'addPlanView', plan: { id: 'pv2', levelId: 'lv_1', name: 'Eletrica', discipline: 'eletrico' } });
  return s;
}

describe('lista "Inserir vistas" com plantas de disciplina', () => {
  it('cada nível traz a planta padrão e depois as plantas de disciplina dele', () => {
    const s = comPlantas();
    const plantas = gruposDeVistas(s.project, 'pt').find((g) => g.tipo === 'plan')!.fontes;
    expect(plantas.map((f) => f.key)).toEqual(['plan:lv_0', 'pv:pv1', 'plan:lv_1', 'pv:pv2']);
    expect(plantas.map((f) => f.view)).toEqual([
      { kind: 'plan', levelId: 'lv_0' },
      { kind: 'plan', levelId: 'lv_0', planId: 'pv1' },
      { kind: 'plan', levelId: 'lv_1' },
      { kind: 'plan', levelId: 'lv_1', planId: 'pv2' },
    ]);
    expect(plantas[1]!.label).toBe(`${s.project.levels[0]!.name} · Estrutura`);
  });

  it('sem plantas de disciplina, a lista é uma planta por nível, como antes', () => {
    const plantas = gruposDeVistas(projeto().project, 'pt').find((g) => g.tipo === 'plan')!.fontes;
    expect(plantas.map((f) => f.key)).toEqual(['plan:lv_0', 'plan:lv_1']);
  });
});

describe('pré-aquecimento e escala natural', () => {
  it('a fila do Navegador leva as plantas de disciplina logo depois da padrão do nível', () => {
    const s = comPlantas();
    expect(draggableViews(s.project)).toEqual([
      { kind: 'plan', levelId: 'lv_0' },
      { kind: 'plan', levelId: 'lv_0', planId: 'pv1' },
      { kind: 'plan', levelId: 'lv_1' },
      { kind: 'plan', levelId: 'lv_1', planId: 'pv2' },
    ]);
    expect(draggableViews(projeto().project)).toEqual([{ kind: 'plan', levelId: 'lv_0' }, { kind: 'plan', levelId: 'lv_1' }]);
  });

  it('a escala natural é a da própria planta de disciplina; planId que não resolve cai na padrão do nível', () => {
    const s = comPlantas();
    expect(naturalScaleOf(s.project, { kind: 'plan', levelId: 'lv_0', planId: 'pv1' })).toBe(50);
    expect(naturalScaleOf(s.project, { kind: 'plan', levelId: 'lv_0' })).toBe(100);
    expect(naturalScaleOf(s.project, { kind: 'plan', levelId: 'lv_0', planId: 'pv_gone' })).toBe(100);
  });
});

describe('inserção e prancha da planta ativa', () => {
  it('inserir a planta de disciplina grava a vista com o planId e a escala pedida', () => {
    const s = comPlantas();
    const sheetId = addSheetAction(s);
    addViewsAction(s, sheetId, [{ view: { kind: 'plan', levelId: 'lv_0', planId: 'pv1' }, scale: 50 }]);
    const vp = sheetOf(s.project, sheetId)!.viewports[0]!;
    expect(vp.view).toEqual({ kind: 'plan', levelId: 'lv_0', planId: 'pv1' });
    expect(vp.scale).toBe(50);
  });

  it('inserir planId que não existe é recusado antes de gravar qualquer vista', () => {
    const s = comPlantas();
    const sheetId = addSheetAction(s);
    expect(() => addViewsAction(s, sheetId, [{ view: { kind: 'plan', levelId: 'lv_0', planId: 'pv_gone' }, scale: 100 }])).toThrow('Planta inexistente');
    expect(sheetOf(s.project, sheetId)!.viewports).toEqual([]);
  });

  it('prancha da planta ativa: a de disciplina leva o planId; um id que não resolve vira a planta padrão', () => {
    const s = comPlantas();
    const id1 = pranchaDaPlantaAtual(s, 'lv_0', 'pv1');
    expect(sheetOf(s.project, id1)!.viewports[0]!.view).toEqual({ kind: 'plan', levelId: 'lv_0', planId: 'pv1' });
    const id2 = pranchaDaPlantaAtual(s, 'lv_0', 'pv_gone');
    expect(sheetOf(s.project, id2)!.viewports[0]!.view).toEqual({ kind: 'plan', levelId: 'lv_0' });
    const id3 = pranchaDaPlantaAtual(s, 'lv_0');
    expect(sheetOf(s.project, id3)!.viewports[0]!.view).toEqual({ kind: 'plan', levelId: 'lv_0' });
  });
});
