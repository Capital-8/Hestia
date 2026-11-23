import { afterEach, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, ladosPadrao, makeColumn, makeLot, makePlanView, makeTerrain, makeWall, type Id, type Project } from '@hestia/model';
import { SelectTool } from '@hestia/tools/src/selectTool.ts';
import { P, makeEnv } from '@hestia/tools/src/testEnv.ts';
import { podeSelecionar } from '@hestia/tools/src/visibilidade.ts';
import { editor } from './controller.ts';
import { useUi } from './state.ts';
import { visibilityOf } from './viewVisibility.ts';

/*
 * Edição por disciplina (plano de UX de 2026-11-23): o normal de outra disciplina continua desenhado e capturável, mas
 * fica travado até “Editar outras disciplinas”. Terreno e lote são de Arquitetura. Valores literais.
 */

afterEach(() =>
  useUi.setState({
    view: 'plan', planKind: 'floor', levelId: 'lv_0', areaPlanId: null, planViewId: null, sectionId: null,
    minhaDisciplina: null, liberarEdicao: false, viewTemp: {}, selection: [], hover: null, subElemento: null, status: '',
  }),
);

/** Projeto mínimo: parede arquitetura, pilar estrutura, terreno e lote (Arquitetura), todos no lv_0. */
function projeto(): Project {
  const inicial = structuredClone(createEmptyProject());
  // Planta de Estrutura que pinta Arquitetura de normal: o bloqueio é o único motivo para a parede não selecionar.
  inicial.planViews = [makePlanView({ id: 'pv_est', levelId: 'lv_0', name: 'Estrutura', discipline: 'estrutura', tones: { arquitetura: 'normal' } })];
  const store = new ProjectStore(inicial);
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w_arq', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  store.exec({ type: 'addColumn', column: makeColumn({ id: 'col_est', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 6, y: 0 } }) });
  store.exec({ type: 'addTerrain', terrain: makeTerrain({ id: 'tn_sit', levelId: 'lv_0', pontos: [20, 0, 1, 28, 0, 1, 28, 8, 1, 20, 8, 1] }) });
  store.exec({ type: 'addLot', lot: makeLot({ id: 'lt_sit', levelId: 'lv_0', contorno: [{ x: 40, y: 0 }, { x: 48, y: 0 }, { x: 48, y: 8 }, { x: 40, y: 8 }], lados: ladosPadrao(4) }) });
  return store.project;
}

const vista = (planViewId: string | null, liberarEdicao = false) => ({
  ...useUi.getState(),
  view: 'plan' as const,
  planKind: 'floor' as const,
  levelId: 'lv_0',
  areaPlanId: null,
  planViewId,
  sectionId: null,
  minhaDisciplina: null,
  liberarEdicao,
  viewTemp: {},
});

/** Um clique da ferramenta Selecionar com os conjuntos da vista (o mesmo caminho do app). */
function clicar(p: Project, vis: ReturnType<typeof visibilityOf>, x: number, y: number): Id[] {
  const ctx = makeEnv(new ProjectStore(p), { blockedIds: vis.bloqueados, hiddenIds: vis.hidden, halftoneIds: vis.halftone });
  const select = new SelectTool(ctx.env);
  select.start();
  select.down(P(x, y));
  select.up(P(x, y));
  return ctx.sel();
}

describe('bloqueados na planta por disciplina', () => {
  it('em Estrutura a parede, o terreno e o lote ficam bloqueados; o pilar não', () => {
    const p = projeto();
    const vis = visibilityOf(p, vista('pv_est'));
    expect(vis.bloqueados.has('w_arq')).toBe(true);
    expect(vis.bloqueados.has('tn_sit')).toBe(true);
    expect(vis.bloqueados.has('lt_sit')).toBe(true);
    expect(vis.bloqueados.has('col_est')).toBe(false);
  });

  it('em Arquitetura o pilar fica bloqueado; parede, terreno e lote não', () => {
    const p = projeto();
    const vis = visibilityOf(p, vista(null));
    expect(vis.bloqueados.has('col_est')).toBe(true);
    expect(vis.bloqueados.has('w_arq')).toBe(false);
    expect(vis.bloqueados.has('tn_sit')).toBe(false);
    expect(vis.bloqueados.has('lt_sit')).toBe(false);
  });

  it('clicar num bloqueado não seleciona: parede, terreno e lote em Estrutura; o pilar sim', () => {
    const p = projeto();
    const vis = visibilityOf(p, vista('pv_est'));
    expect(clicar(p, vis, 2, 0)).toEqual([]);
    expect(clicar(p, vis, 20, 4)).toEqual([]);
    expect(clicar(p, vis, 40, 4)).toEqual([]);
    expect(clicar(p, vis, 6, 0)).toEqual(['col_est']);
  });

  it('em Arquitetura, terreno e lote selecionam', () => {
    const p = projeto();
    const vis = visibilityOf(p, vista(null));
    expect(clicar(p, vis, 20, 4)).toEqual(['tn_sit']);
    expect(clicar(p, vis, 40, 4)).toEqual(['lt_sit']);
  });

  it('com “Editar outras disciplinas” a parede em Estrutura seleciona', () => {
    const p = projeto();
    const vis = visibilityOf(p, vista('pv_est', true));
    expect(vis.bloqueados.size).toBe(0);
    expect(clicar(p, vis, 2, 0)).toEqual(['w_arq']);
  });
});

describe('bloqueados no 3D e no corte', () => {
  it('3D com a minha disciplina Arquitetura bloqueia o pilar (normal) e não a parede', () => {
    const p = projeto();
    useUi.setState({ view: '3d', minhaDisciplina: 'arquitetura' });
    const vis = visibilityOf(p, useUi.getState());
    expect(vis.bloqueados.has('col_est')).toBe(true);
    expect(vis.bloqueados.has('w_arq')).toBe(false);
    expect(podeSelecionar({ hiddenInView: () => vis.hidden, halftoneInView: () => vis.halftone, bloqueados: () => vis.bloqueados }, 'col_est', 'clique')).toBe(false);
    expect(podeSelecionar({ hiddenInView: () => vis.hidden, halftoneInView: () => vis.halftone, bloqueados: () => vis.bloqueados }, 'w_arq', 'clique')).toBe(true);
  });

  it('o corte aplica a mesma regra do 3D', () => {
    const p = projeto();
    useUi.setState({ view: 'section', sectionId: 'sec1', minhaDisciplina: 'arquitetura' });
    const vis = visibilityOf(p, useUi.getState());
    expect(vis.bloqueados.has('col_est')).toBe(true);
    expect(vis.bloqueados.has('w_arq')).toBe(false);
  });

  it('3D sem disciplina (todas) não bloqueia ninguém', () => {
    const p = projeto();
    useUi.setState({ view: '3d', minhaDisciplina: null });
    expect(visibilityOf(p, useUi.getState()).bloqueados.size).toBe(0);
  });

  it('o clique 3D/corte bloqueado avisa a disciplina e não entra na seleção', () => {
    editor.newProject('house2');
    editor.store.exec({ type: 'addColumn', column: makeColumn({ id: 'col_est_teste', typeId: 'ct_conc_20x40', levelId: 'lv_0', at: { x: 30, y: 30 } }) });
    const parede = Object.values(editor.project.elements).find((e) => e.kind === 'wall')!;
    useUi.setState({ view: '3d', minhaDisciplina: 'arquitetura', selection: [] });

    editor.selecionarNaVista('col_est_teste', false);
    expect(useUi.getState().selection).toEqual([]);
    expect(useUi.getState().status).toBe('Pertence a Estrutura; troque a disciplina da vista ou libere a edição.');

    editor.selecionarNaVista(parede.id, false);
    expect(useUi.getState().selection).toEqual([parede.id]);

    useUi.setState({ view: 'section', sectionId: 'sec1', minhaDisciplina: 'arquitetura', selection: [] });
    editor.selecionarNaVista('col_est_teste', false);
    expect(useUi.getState().selection).toEqual([]);
    expect(useUi.getState().status).toBe('Pertence a Estrutura; troque a disciplina da vista ou libere a edição.');
  });
});

describe('bloqueados não escondem nem mudam o desenho', () => {
  it('liberar a edição não altera hidden, halftone nem a apresentação da vista', () => {
    const p = projeto();
    const semLiberar = visibilityOf(p, vista('pv_est'));
    const comLiberar = visibilityOf(p, vista('pv_est', true));
    expect(semLiberar.hidden.has('w_arq')).toBe(false);
    expect(comLiberar.hidden).toEqual(semLiberar.hidden);
    expect(comLiberar.halftone).toEqual(semLiberar.halftone);
    expect(comLiberar.apresentacoes).toEqual(semLiberar.apresentacoes);
    expect(semLiberar.bloqueados.has('w_arq')).toBe(true);
    expect(comLiberar.bloqueados.has('w_arq')).toBe(false);
  });
});
