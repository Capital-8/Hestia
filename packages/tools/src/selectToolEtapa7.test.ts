import { describe, expect, it } from 'vitest';
import { DEFAULT_AREA_GRAPHICS, ProjectStore, createEmptyProject, floorViewId, makeWall, withAreaPlansOfTest, withViewPatchOfTest, type AreaPlan, type Dimension, type Project } from '@hestia/model';
import { makeEnv, P } from './testEnv.ts';
import { SelectTool } from './selectTool.ts';
import { annotationIdsInBox, anotacoesSelecionaveis } from './annotationPick.ts';

/*
 * Etapa 7 da regra 4.5 na seleção: a cota presa a elemento oculto e a etiqueta do hospedeiro oculto não são alvo de
 * clique nem de janela. A que não depende de nada continua selecionável, e o modo revelar as devolve.
 */

const LV = 'lv_0';
const dimPresa: Dimension = { id: 'd_w1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 0.5, mode: 'aligned', refs: { a: { wallId: 'w1', end: 'a' }, b: { wallId: 'w1', end: 'b' } } };
const dimLivre: Dimension = { id: 'd_livre', a: { x: 0, y: 6 }, b: { x: 4, y: 6 }, offset: 0.5, mode: 'aligned' };

function projeto(): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: LV, a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: LV, a: { x: 0, y: 3 }, b: { x: 4, y: 3 } }) });
  s.exec({ type: 'addDimension', levelId: LV, dimension: dimPresa });
  s.exec({ type: 'addDimension', levelId: LV, dimension: dimLivre });
  s.exec({ type: 'addTag', levelId: LV, item: { id: 'tg_w1', hostId: 'w1', at: { x: 2, y: -2 }, property: 'type' } });
  s.exec({ type: 'addTag', levelId: LV, item: { id: 'tg_w2', hostId: 'w2', at: { x: 2, y: 8 }, property: 'type' } });
  return s.project;
}

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

const naCotaPresa = { x: 2, y: 0.5 };
const naCotaLivre = { x: 2, y: 6.5 };
const naEtiquetaW1 = { x: 2, y: -2 };
const naEtiquetaW2 = { x: 2, y: 8 };

describe('seleção por clique: a cota presa e a etiqueta do hospedeiro oculto não são alvo', () => {
  it('sem ocultos são selecionáveis', () => {
    expect(clicar(projeto(), naCotaPresa)).toEqual(['d_w1']);
    expect(clicar(projeto(), naEtiquetaW1)).toEqual(['tg_w1']);
  });

  it('Hide in View da parede: a cota e a etiqueta dela somem da seleção; as demais ficam', () => {
    const p = withViewPatchOfTest(projeto(), floorViewId(LV), { hidden: { elements: ['w1'] } });
    expect(clicar(p, naCotaPresa)).toEqual([]);
    expect(clicar(p, naEtiquetaW1)).toEqual([]);
    expect(clicar(p, naCotaLivre)).toEqual(['d_livre']);
    expect(clicar(p, naEtiquetaW2)).toEqual(['tg_w2']);
  });

  it('categoria "parede" oculta: some a cota presa a parede e a etiqueta de parede', () => {
    const p = withViewPatchOfTest(projeto(), floorViewId(LV), { hidden: { categories: ['wall'] } });
    expect(clicar(p, naCotaPresa)).toEqual([]);
    expect(clicar(p, naEtiquetaW2)).toEqual([]);
    expect(clicar(p, naCotaLivre)).toEqual(['d_livre']);
  });

  it('o que o ambiente informa em hiddenInView (alcance, temporário): a cota e a etiqueta do elemento somem', () => {
    const fora = (): ReadonlySet<string> => new Set(['w1']);
    expect(clicar(projeto(), naCotaPresa, { hiddenInView: fora })).toEqual([]);
    expect(clicar(projeto(), naEtiquetaW1, { hiddenInView: fora })).toEqual([]);
    expect(clicar(projeto(), naEtiquetaW2, { hiddenInView: fora })).toEqual(['tg_w2']);
  });

  it('modo revelar: o que o usuário oculta volta, com a cota e a etiqueta', () => {
    const p = withViewPatchOfTest(projeto(), floorViewId(LV), { hidden: { elements: ['w1'] } });
    expect(clicar(p, naCotaPresa, { revealing: true })).toEqual(['d_w1']);
    expect(clicar(p, naEtiquetaW1, { revealing: true })).toEqual(['tg_w1']);
  });
});

describe('seleção por janela e lista de anotações', () => {
  it('anotacoesSelecionaveis e annotationIdsInBox deixam de fora o que depende do oculto', () => {
    const p = withViewPatchOfTest(projeto(), floorViewId(LV), { hidden: { elements: ['w1'] } });
    const a = anotacoesSelecionaveis(p, LV);
    expect(a.dimensions.map((d) => d.id)).toEqual(['d_livre']);
    expect(a.tags.map((t) => t.id)).toEqual(['tg_w2']);
    const caixa = annotationIdsInBox(p, LV, { x: -3, y: -3 }, { x: 8, y: 10 }, 0.01);
    expect(caixa.sort()).toEqual(['d_livre', 'tg_w2']);
    const cheia = annotationIdsInBox(projeto(), LV, { x: -3, y: -3 }, { x: 8, y: 10 }, 0.01);
    expect(cheia.sort()).toEqual(['d_livre', 'd_w1', 'tg_w1', 'tg_w2']);
  });

  it('vistas do mesmo nível são independentes: o oculto do piso não esconde a cota da planta de área', () => {
    const plano: AreaPlan = {
      id: 'ap1', name: 'A', levelId: LV, scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS, showWalls: 'normal' }, tags: [],
      annotations: { dimensions: [{ ...dimPresa, id: 'a_w1' }], texts: [], detailLines: [], detailRegions: [], tags: [] },
    };
    let p = withAreaPlansOfTest(projeto(), [plano]);
    p = withViewPatchOfTest(p, floorViewId(LV), { hidden: { elements: ['w1'] } });
    expect(anotacoesSelecionaveis(p, LV).dimensions.map((d) => d.id)).toEqual(['d_livre']);
    expect(anotacoesSelecionaveis(p, LV, 'ap1').dimensions.map((d) => d.id)).toEqual(['a_w1']);
    expect(clicar(p, naCotaPresa, { viewId: 'ap1' })).toEqual(['a_w1']);
    p = withViewPatchOfTest(p, 'ap1', { hidden: { elements: ['w1'] } });
    expect(anotacoesSelecionaveis(p, LV, 'ap1').dimensions).toEqual([]);
  });
});
