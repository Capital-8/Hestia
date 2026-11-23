import { afterEach, describe, expect, it } from 'vitest';
import { buildTemplate, makePlanView, type Project } from '@hestia/model';
import { editor } from './controller.ts';
import { useUi } from './state.ts';
import { visibilityOf } from './viewVisibility.ts';

/**
 * Apresentação por categoria no `visibilityOf` (plano de UX de 2026-11-23): a planta, o 3D e o corte recebem a
 * apresentação (tom + clareamento + opacidade) da disciplina de trabalho. Valores literais da tabela.
 */

afterEach(() => useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', areaPlanId: null, planViewId: null, sectionId: null, viewTemp: {}, selection: [], subElemento: null, minhaDisciplina: null }));

const REFERENCIA = { tone: 'halftone', clareamento: 0.2, opacidade: 0.5 };
const NORMAL = { tone: 'normal', clareamento: 0, opacidade: 1 };

const comEstrutura = (p: Project): Project => {
  p.planViews = [makePlanView({ id: 'pv_est', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura' })];
  return p;
};

describe('visibilityOf: apresentações da disciplina na planta', () => {
  it('planta de Estrutura: parede (Arquitetura) com clareamento 0,2/opacidade 0,5 e pilar normal', () => {
    const p = comEstrutura(structuredClone(buildTemplate('house2')));
    useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', planViewId: 'pv_est' });
    const vis = visibilityOf(p, useUi.getState());
    expect(vis.apresentacoes.wall).toEqual(REFERENCIA);
    expect(vis.apresentacoes.column).toEqual(NORMAL);
    expect(vis.apresentacoes.plumbingFixture).toEqual({ tone: 'hidden', clareamento: 0, opacidade: 1 });
  });

  it('o desvio de tom da própria planta chega à apresentação (normal com clareamento 0,3/opacidade 0,7)', () => {
    const p = structuredClone(buildTemplate('house2'));
    p.planViews = [makePlanView({ id: 'pv_est', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura', tones: { arquitetura: { tone: 'normal', clareamento: 0.3, opacidade: 0.7 } } })];
    useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', planViewId: 'pv_est' });
    expect(visibilityOf(p, useUi.getState()).apresentacoes.wall).toEqual({ tone: 'normal', clareamento: 0.3, opacidade: 0.7 });
  });
});

describe('visibilityOf: apresentações no 3D', () => {
  it('a minha disciplina vence e a parede fica com a referência de Estrutura', () => {
    editor.newProject('house2');
    useUi.setState({ view: '3d', minhaDisciplina: 'estrutura' });
    const vis = visibilityOf(editor.project, useUi.getState());
    expect(vis.apresentacoes.wall).toEqual(REFERENCIA);
    expect(vis.apresentacoes.column).toEqual(NORMAL);
    expect(vis.toneCategories.wall).toBe('halftone');
  });

  it('sem disciplina de trabalho (3D ausente = todas), nenhuma categoria vira referência', () => {
    editor.newProject('house2');
    useUi.setState({ view: '3d', minhaDisciplina: null });
    const vis = visibilityOf(editor.project, useUi.getState());
    expect(vis.apresentacoes).toEqual({});
    expect(vis.toneCategories).toEqual({});
  });
});

describe('visibilityOf: apresentações no corte', () => {
  it('a minha disciplina vence e a parede fica com a referência de Estrutura', () => {
    editor.newProject('house2');
    useUi.setState({ view: 'section', sectionId: 'sec1', minhaDisciplina: 'estrutura' });
    const vis = visibilityOf(editor.project, useUi.getState());
    expect(vis.apresentacoes.wall).toEqual(REFERENCIA);
    expect(vis.apresentacoes.column).toEqual(NORMAL);
  });

  it('sem minha disciplina, o corte usa a disciplina padrão (Arquitetura)', () => {
    editor.newProject('house2');
    useUi.setState({ view: 'section', sectionId: 'sec1', minhaDisciplina: null });
    const vis = visibilityOf(editor.project, useUi.getState());
    expect(vis.apresentacoes.wall).toEqual(NORMAL);
    expect(vis.apresentacoes.column).toEqual(NORMAL);
    expect(vis.apresentacoes.plumbingFixture).toEqual({ tone: 'halftone', clareamento: 0.5, opacidade: 1 });
  });
});
