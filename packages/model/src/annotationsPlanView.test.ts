import { describe, expect, it } from 'vitest';
import {
  ProjectStore,
  annotationIdsInView,
  createEmptyProject,
  makeLevel,
  makePlanView,
  planAnnotationsOf,
  planViewById,
  levelDimensions,
  type Command,
} from './index.ts';

/*
 * Anotações roteadas para a planta de disciplina (decisão 0060 §5): o `planId` do comando agora resolve também em
 * `Project.planViews`, com a mesma validação de nível das plantas de área. Planta de disciplina é DONA das suas anotações.
 */

function projeto(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pavimento 2', elevation: 3 }) });
  s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pv1', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura' }) });
  return s;
}

const cota = (id: string) => ({ id, a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, offset: 1 });

describe('comandos de anotação com planId de planta de disciplina', () => {
  it('addDimension e addText gravam em PlanView.annotations, nunca no nível, e o desfazer desfaz', () => {
    const s = projeto();
    s.exec({ type: 'addDimension', levelId: 'lv_0', planId: 'pv1', dimension: cota('d1') });
    s.exec({ type: 'addText', levelId: 'lv_0', planId: 'pv1', text: { id: 't1', at: { x: 1, y: 1 }, text: 'x', height: 3, rotation: 0 } });
    const a = planAnnotationsOf(planViewById(s.project, 'pv1')!);
    expect(a.dimensions.map((d) => d.id)).toEqual(['d1']);
    expect(a.texts.map((t) => t.id)).toEqual(['t1']);
    expect(levelDimensions(s.project, 'lv_0')).toEqual([]);
    expect(annotationIdsInView(s.project, 'lv_0')).toEqual([]);
    expect(annotationIdsInView(s.project, 'lv_0', 'pv1')).toEqual(['d1', 't1']);
    s.undo();
    s.undo();
    expect(planViewById(s.project, 'pv1')!.annotations?.dimensions ?? []).toEqual([]);
  });

  it('update e remove acham a anotação na planta; id do nível não existe ali', () => {
    const s = projeto();
    s.exec({ type: 'addDimension', levelId: 'lv_0', dimension: cota('dN') });
    s.exec({ type: 'addDimension', levelId: 'lv_0', planId: 'pv1', dimension: cota('d1') });
    s.exec({ type: 'updateDimension', levelId: 'lv_0', planId: 'pv1', id: 'd1', patch: { offset: 2 } });
    expect(planAnnotationsOf(planViewById(s.project, 'pv1')!).dimensions[0]!.offset).toBe(2);
    expect(levelDimensions(s.project, 'lv_0')[0]!.offset).toBe(1);
    expect(() => s.exec({ type: 'updateDimension', levelId: 'lv_0', planId: 'pv1', id: 'dN', patch: { offset: 5 } })).toThrow();
    s.exec({ type: 'removeDimension', levelId: 'lv_0', planId: 'pv1', id: 'd1' });
    expect(planAnnotationsOf(planViewById(s.project, 'pv1')!).dimensions).toEqual([]);
    expect(levelDimensions(s.project, 'lv_0')).toHaveLength(1);
  });

  it('planta de OUTRO nível ou inexistente recusa o comando e o projeto não muda', () => {
    const s = projeto();
    const antes = JSON.stringify(s.project);
    const outroNivel: Command = { type: 'addDimension', levelId: 'lv_1', planId: 'pv1', dimension: cota('d1') };
    expect(() => s.exec(outroNivel)).toThrow();
    expect(() => s.exec({ type: 'addDimension', levelId: 'lv_0', planId: 'nao-existe', dimension: cota('d1') })).toThrow();
    expect(JSON.stringify(s.project)).toBe(antes);
  });
});
