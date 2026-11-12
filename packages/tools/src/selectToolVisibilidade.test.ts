import { describe, expect, it } from 'vitest';
import { DEFAULT_AREA_GRAPHICS, ProjectStore, createEmptyProject, floorViewId, makeWall, withAreaPlansOfTest, withViewPatchOfTest, type AreaPlan, type Dimension, type Project } from '@hestia/model';
import { makeEnv, P } from './testEnv.ts';
import { SelectTool } from './selectTool.ts';

/*
 * Regra 4.5 na seleção: o que a vista não mostra (alcance, perfil, categoria, Hide in View, temporário) não é alvo.
 * Duas vistas do mesmo nível com ocultos diferentes não interferem uma na outra.
 */

const dim: Dimension = { id: 'd1', a: { x: 0, y: 5 }, b: { x: 4, y: 5 }, offset: 0.5, mode: 'aligned' };

function projeto(): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 3 }, b: { x: 4, y: 3 } }) });
  s.exec({ type: 'addDimension', levelId: 'lv_0', dimension: dim });
  return s.project;
}

/** Clica em `at` com a ferramenta Selecionar sobre `p` e devolve a seleção. */
function clicar(p: Project, at: { x: number; y: number }, extra: { viewId?: string; hiddenInView?: () => ReadonlySet<string>; revealing?: boolean } = {}): string[] {
  const ctx = makeEnv(new ProjectStore(p));
  const env = { ...ctx.env, project: () => p, viewId: extra.viewId, ...(extra.hiddenInView ? { hiddenInView: extra.hiddenInView } : {}), ...(extra.revealing ? { revealingHidden: () => true } : {}) };
  const t = new SelectTool(env);
  t.start();
  t.move(P(at.x, at.y));
  t.down?.(P(at.x, at.y));
  t.up?.(P(at.x, at.y));
  return [...env.selection()];
}

describe('seleção e a regra única de visibilidade', () => {
  it('visível: a parede é selecionada', () => {
    expect(clicar(projeto(), { x: 2, y: 0 })).toEqual(['w1']);
  });

  it('etapa 5: parede em hidden.elements não é selecionável; a outra continua', () => {
    const p = withViewPatchOfTest(projeto(), floorViewId('lv_0'), { hidden: { elements: ['w1'] } });
    expect(clicar(p, { x: 2, y: 0 })).toEqual([]);
    expect(clicar(p, { x: 2, y: 3 })).toEqual(['w2']);
  });

  it('etapa 3: categoria oculta (hidden.categories) não é selecionável, nem a anotação', () => {
    const p = withViewPatchOfTest(projeto(), floorViewId('lv_0'), { hidden: { categories: ['wall', 'annotation'] } });
    expect(clicar(p, { x: 2, y: 0 })).toEqual([]);
    expect(clicar(p, { x: 2, y: 5.5 })).toEqual([]);
    expect(clicar(projeto(), { x: 2, y: 5.5 })).toEqual(['d1']);
  });

  it('etapa 1 e 6: o que o ambiente informa em hiddenInView (alcance, temporário) não é selecionável', () => {
    expect(clicar(projeto(), { x: 2, y: 0 }, { hiddenInView: () => new Set(['w1']) })).toEqual([]);
  });

  it('modo revelar: o que o usuário oculta volta a ser selecionável (Reexibir tem alvo)', () => {
    const p = withViewPatchOfTest(projeto(), floorViewId('lv_0'), { hidden: { elements: ['w1'] } });
    expect(clicar(p, { x: 2, y: 0 })).toEqual([]);
    expect(clicar(p, { x: 2, y: 0 }, { revealing: true })).toEqual(['w1']);
  });

  it('duas vistas do mesmo nível: o oculto de uma não afeta a outra', () => {
    const plano: AreaPlan = { id: 'ap1', name: 'A', levelId: 'lv_0', scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS, showWalls: 'normal' }, tags: [] };
    let p = withAreaPlansOfTest(projeto(), [plano]);
    p = withViewPatchOfTest(p, floorViewId('lv_0'), { hidden: { elements: ['w1'] } });
    // Piso: w1 oculta. Área: w1 visível (a ocultação é da vista do piso).
    expect(clicar(p, { x: 2, y: 0 })).toEqual([]);
    // Na planta de área o modelo é só leitura, mas continua sendo o alvo do clique de seleção.
    expect(clicar(p, { x: 2, y: 0 }, { viewId: 'ap1' })).toEqual(['w1']);
  });
});
