import { describe, expect, it } from 'vitest';
import { annotationIdsIn, annotationIdsInView, annotationMoveCommands, annotationRemovals, makeLevel, makePlanView, planAnnotationsOf, planViewById, levelDimensions, type Id, type ProjectStore } from '@hestia/model';
import { annotationAt, viewAnnotationsOf } from './annotationPick.ts';
import { viewPlanId } from './base.ts';
import { SelectTool } from './selectTool.ts';
import { clickAt, drawWall, makeEnv, P, tool } from './testEnv.ts';
import { comNiveis, idDe, idsDoNivel, normCriacao, normSelecao, normSnap } from './testMatriz.ts';
import type { ToolEnv } from './types.ts';

/*
 * Plantas de disciplina nas ferramentas (decisão 0060, etapa 2.3A).
 * Oráculo 2: o mesmo cenário na planta padrão e numa PlanView 'arquitetura' neutra (sem gráficos, sem ocultação, sem
 * tons) dá resultados IGUAIS, exceto o dono das anotações (que passa a ser a própria planta). Mais: isolamento das
 * anotações entre plantas e Mover/Copiar na planta de disciplina. Valores de referência LITERAIS (geometria comum de
 * `testMatriz.ts`: retângulo 6 m x 4 m e pilar em (2, 2)).
 */

/** Projeto de um nível com a geometria comum e duas plantas de disciplina adicionais (pvA neutra de arquitetura e pvB). */
function projeto() {
  const { store } = comNiveis(1);
  store.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pvA', levelId: 'lv_0', name: 'Arquitetura A', discipline: 'arquitetura' }) });
  store.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pvB', levelId: 'lv_0', name: 'Arquitetura B', discipline: 'arquitetura' }) });
  return store;
}

/** Ambiente na planta padrão (sem `planViewId`) ou na planta `planViewId`. */
const ambiente = (store: ProjectStore, planViewId?: Id) => makeEnv(store, { levelId: 'lv_0', ...(planViewId ? { planViewId } : {}) });

function snapEm(env: ToolEnv, x: number, y: number) {
  const t = tool('wall', env);
  t.move(P(x, y));
  return normSnap(t.inference());
}

/** Roda os gestos da matriz (snap, criação, seleção por clique e por caixa) e devolve o resultado normalizado. */
function rodar(planViewId?: Id) {
  const snaps = [[6, 0], [3, 0], [6, 2], [2.5, 1.2], [3, 2]].map(([x, y]) => snapEm(ambiente(projeto(), planViewId).env, x!, y!));
  const criar = (gesto: (e: ToolEnv) => void) => {
    const ctx = ambiente(projeto(), planViewId);
    const antes = idsDoNivel(ctx.store, 'lv_0');
    gesto(ctx.env);
    return normCriacao(ctx.store, idsDoNivel(ctx.store, 'lv_0').filter((id) => !antes.includes(id)));
  };
  const parede = criar((e) => drawWall(e, [10, 0], [14, 0]));
  const pilar = criar((e) => clickAt(tool('column', e), 12, 3));
  const selecionar = (gesto: (s: SelectTool) => void) => {
    const ctx = ambiente(projeto(), planViewId);
    const sel = new SelectTool(ctx.env);
    sel.start();
    gesto(sel);
    return normSelecao(ctx.sel());
  };
  const clique = selecionar((s) => { s.down(P(3, 0)); s.up(P(3, 0)); });
  const cliquePilar = selecionar((s) => { s.down(P(2, 2)); s.up(P(2, 2)); });
  const caixa = selecionar((s) => { s.down(P(-1, -1)); s.drag(P(7, 5)); s.up(P(7, 5)); });
  const caixaPilar = selecionar((s) => { s.down(P(1, 1)); s.drag(P(3, 3)); s.up(P(3, 3)); });
  return { snaps, parede, pilar, clique, cliquePilar, caixa, caixaPilar };
}

describe('oráculo 2: planta padrão x planta de disciplina neutra (mesmo cenário, mesmo resultado)', () => {
  const padrao = rodar();
  const disciplina = rodar('pvA');

  it('a planta padrão dá os literais da matriz (o oráculo não é vazio)', () => {
    expect(padrao.snaps[1]).toEqual({ tipo: 'midpoint', ponto: { x: 3, y: 0 }, id: 'sul', chave: 'midpoint:sul' });
    expect(padrao.snaps[3]).toEqual({ tipo: 'none', ponto: { x: 2.5, y: 1.2 }, id: null, chave: 'none:-' });
    expect(padrao.parede).toEqual({ kinds: ['parede'], pontos: [[{ x: 10, y: 0 }, { x: 14, y: 0 }]], levelId: 'lv_0' });
    expect(padrao.pilar).toEqual({ kinds: ['pilar'], pontos: [[{ x: 12, y: 3 }]], levelId: 'lv_0' });
    expect(padrao.clique).toEqual(['sul']);
    expect(padrao.cliquePilar).toEqual(['pilar']);
    expect(padrao.caixa).toEqual(['leste', 'norte', 'oeste', 'pilar', 'sul']);
    expect(padrao.caixaPilar).toEqual(['pilar']);
  });

  it('captura: extremidade, ponto médio, vazio e alinhamento iguais nas duas plantas', () => {
    expect(disciplina.snaps).toEqual(padrao.snaps);
  });

  it('criação: parede e pilar nascem no mesmo nível, com a mesma geometria', () => {
    expect(disciplina.parede).toEqual(padrao.parede);
    expect(disciplina.pilar).toEqual(padrao.pilar);
  });

  it('seleção por clique e por caixa: a planta de disciplina NÃO é somente leitura e seleciona o mesmo conjunto', () => {
    expect(disciplina.clique).toEqual(padrao.clique);
    expect(disciplina.cliquePilar).toEqual(padrao.cliquePilar);
    expect(disciplina.caixa).toEqual(padrao.caixa);
    expect(disciplina.caixaPilar).toEqual(padrao.caixaPilar);
  });

  it('cota por três cliques: mesmos pontos, valor e afastamento; só o dono muda (nível x planta)', () => {
    const cota = (planViewId?: Id) => {
      const ctx = ambiente(projeto(), planViewId);
      const t = tool('dimension', ctx.env);
      clickAt(t, 0, 0);
      clickAt(t, 6, 0);
      clickAt(t, 3, 1);
      return ctx.store.project;
    };
    const p0 = cota();
    const pA = cota('pvA');
    const dPadrao = levelDimensions(p0, 'lv_0');
    expect(dPadrao).toHaveLength(1);
    expect(planViewById(p0, 'pvA')!.annotations).toBeUndefined();
    const dDisc = planAnnotationsOf(planViewById(pA, 'pvA')!).dimensions;
    expect(dDisc).toHaveLength(1);
    expect(levelDimensions(pA, 'lv_0')).toHaveLength(0); // não vaza para a planta padrão
    expect(planViewById(pA, 'pvB')!.annotations).toBeUndefined(); // nem para a outra planta
    const norm = (d: (typeof dPadrao)[number]) => ({ a: d.a, b: d.b, offset: d.offset, refs: d.refs });
    expect(norm(dDisc[0]!)).toEqual(norm(dPadrao[0]!));
    expect(dDisc[0]!.a).toEqual({ x: 0, y: 0 });
    expect(dDisc[0]!.b).toEqual({ x: 6, y: 0 });
    expect(dDisc[0]!.offset).toBeCloseTo(1, 9);
  });
});

describe('viewPlanId: planta dona das anotações', () => {
  it('planta de disciplina, planta de área ou nenhuma (planta padrão)', () => {
    const store = projeto();
    expect(viewPlanId(ambiente(store).env)).toBeUndefined();
    expect(viewPlanId(ambiente(store, 'pvA').env)).toBe('pvA');
    const area = ambiente(store);
    area.setAreaPlanId('ap1');
    expect(viewPlanId(area.env)).toBe('ap1');
  });
});

describe('isolamento de anotação entre plantas (lacuna 4 do mapa 03)', () => {
  /** Nível com uma cota de nível (dN), uma cota na pvA (dA) e um texto na pvB (tB). */
  function comAnotacoes() {
    const store = projeto();
    store.exec({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'dN', a: { x: 0, y: -2 }, b: { x: 6, y: -2 }, offset: 0.5 } });
    store.exec({ type: 'addDimension', levelId: 'lv_0', planId: 'pvA', dimension: { id: 'dA', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, offset: 1 } });
    store.exec({ type: 'addText', levelId: 'lv_0', planId: 'pvB', text: { id: 'tB', at: { x: 3, y: 6 }, text: 'NOTA B', height: 3, rotation: 0 } });
    return store;
  }

  it('cada planta lista só as próprias anotações; a padrão lista só as do nível', () => {
    const p = comAnotacoes().project;
    expect(annotationIdsInView(p, 'lv_0')).toEqual(['dN']);
    expect(annotationIdsInView(p, 'lv_0', 'pvA')).toEqual(['dA']);
    expect(annotationIdsInView(p, 'lv_0', 'pvB')).toEqual(['tB']);
    expect(viewAnnotationsOf(p, 'lv_0').dimensions.map((d) => d.id)).toEqual(['dN']);
    expect(viewAnnotationsOf(p, 'lv_0', 'pvA').dimensions.map((d) => d.id)).toEqual(['dA']);
    expect(viewAnnotationsOf(p, 'lv_0', 'pvA').texts).toEqual([]);
    expect(viewAnnotationsOf(p, 'lv_0', 'pvB').dimensions).toEqual([]);
    expect(viewAnnotationsOf(p, 'lv_0', 'pvB').texts.map((t) => t.id)).toEqual(['tB']);
  });

  it('a seleção por clique só acha a cota da própria planta (a da vizinha e a do nível não existem ali)', () => {
    const p = comAnotacoes().project;
    // dA: a linha de cota está em y = 1 (offset 1 sobre y = 0), no meio do vão: (3, 1).
    expect(annotationAt(p, 'lv_0', { x: 3, y: 1 }, 0.01, 'pvA')?.id).toBe('dA');
    expect(annotationAt(p, 'lv_0', { x: 3, y: 1 }, 0.01, 'pvB')).toBeNull();
    expect(annotationAt(p, 'lv_0', { x: 3, y: 1 }, 0.01)).toBeNull();
    // dN: a linha de cota está em y = -2 + 0,5 = -1,5.
    expect(annotationAt(p, 'lv_0', { x: 3, y: -1.5 }, 0.01)?.id).toBe('dN');
    expect(annotationAt(p, 'lv_0', { x: 3, y: -1.5 }, 0.01, 'pvA')).toBeNull();
  });

  it('a ferramenta Selecionar na pvA clica na cota dA e não clica na tB (da pvB)', () => {
    const store = comAnotacoes();
    const a = ambiente(store, 'pvA');
    const sa = new SelectTool(a.env);
    sa.start();
    sa.down(P(3, 1));
    sa.up(P(3, 1));
    expect(a.sel()).toEqual(['dA']);
    const b = ambiente(store, 'pvB');
    const sb = new SelectTool(b.env);
    sb.start();
    sb.down(P(3, 1));
    sb.up(P(3, 1));
    expect(b.sel()).toEqual([]);
  });

  it('excluir na pvA só remove a anotação da pvA, e só se o id é dela', () => {
    const p = comAnotacoes().project;
    expect(annotationRemovals(p, 'lv_0', ['dA', 'tB', 'dN'], 'pvA')).toEqual([{ type: 'removeDimension', levelId: 'lv_0', planId: 'pvA', id: 'dA' }]);
    expect(annotationRemovals(p, 'lv_0', ['dA', 'tB', 'dN'])).toEqual([{ type: 'removeDimension', levelId: 'lv_0', id: 'dN' }]);
  });

  it('planta de OUTRO nível ou inexistente cai no nível (nunca grava na planta errada)', () => {
    const p = comAnotacoes().project;
    expect(annotationIdsInView(p, 'lv_0', 'pv-inexistente')).toEqual(['dN']);
    expect(annotationIdsInView({ ...p, levels: [...p.levels, makeLevel({ id: 'lv_x', name: 'Outro nível', elevation: 9 })] }, 'lv_x', 'pvA')).toEqual([]);
  });
});

describe('Mover e Copiar na planta de disciplina (anotação na PLANTA, nunca no nível)', () => {
  function cenario() {
    const store = projeto();
    store.exec({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'dN', a: { x: 0, y: -2 }, b: { x: 6, y: -2 }, offset: 0.5 } });
    store.exec({ type: 'addDimension', levelId: 'lv_0', planId: 'pvA', dimension: { id: 'dA', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, offset: 1 } });
    store.exec({ type: 'addText', levelId: 'lv_0', planId: 'pvA', text: { id: 'tA', at: { x: 3, y: 6 }, text: 'NOTA A', height: 3, rotation: 0 } });
    return ambiente(store, 'pvA');
  }

  it('comandos: planId da planta nos dois gestos; a cota do nível fica fora do conjunto', () => {
    const p = cenario().store.project;
    expect(annotationIdsIn(p, 'lv_0', ['dA', 'tA', 'dN'], 'pvA')).toEqual(['dA', 'tA']);
    const mover = annotationMoveCommands(p, 'lv_0', ['dA', 'tA', 'dN'], { x: 0, y: 1 }, false, 'pvA');
    expect(mover.map((c) => [c.type, 'planId' in c ? c.planId : null, 'id' in c ? c.id : null])).toEqual([['updateDimension', 'pvA', 'dA'], ['updateText', 'pvA', 'tA']]);
    const copiar = annotationMoveCommands(p, 'lv_0', ['dA', 'tA', 'dN'], { x: 0, y: 1 }, true, 'pvA');
    expect(copiar.map((c) => [c.type, 'planId' in c ? c.planId : null])).toEqual([['addDimension', 'pvA'], ['addText', 'pvA']]);
  });

  it('Mover com só a cota e o texto da planta selecionados move os dois na planta; o nível fica intacto', () => {
    const ctx = cenario();
    ctx.env.setSelection(['dA', 'tA', 'dN']); // dN é do nível: não entra
    const m = tool('move', ctx.env);
    clickAt(m, 0, 0);
    clickAt(m, 0, 1); // deslocamento (0, 1)
    const p = ctx.store.project;
    const a = planAnnotationsOf(planViewById(p, 'pvA')!);
    expect(a.dimensions[0]).toMatchObject({ id: 'dA', a: { x: 0, y: 1 }, b: { x: 6, y: 1 } });
    expect(a.texts[0]).toMatchObject({ id: 'tA', at: { x: 3, y: 7 } });
    expect(levelDimensions(p, 'lv_0')[0]).toMatchObject({ id: 'dN', a: { x: 0, y: -2 }, b: { x: 6, y: -2 } });
  });

  it('Copiar com parede e a cota da planta copia a parede e a cota NA planta (nada vira anotação do nível)', () => {
    const ctx = cenario();
    ctx.env.setSelection([idDe('sul', 'lv_0'), 'dA']);
    const c = tool('copy', ctx.env);
    clickAt(c, 0, 0);
    clickAt(c, 0, 1);
    c.cancel();
    const p = ctx.store.project;
    const a = planAnnotationsOf(planViewById(p, 'pvA')!);
    expect(a.dimensions).toHaveLength(2);
    expect(a.dimensions.find((d) => d.id !== 'dA')).toMatchObject({ a: { x: 0, y: 1 }, b: { x: 6, y: 1 } });
    expect(levelDimensions(p, 'lv_0')).toHaveLength(1); // só a dN
    expect(planViewById(p, 'pvB')!.annotations).toBeUndefined();
  });
});

describe('escala de papel da seta norte (annotationExtraTools): padrão 1:100, antes 1:50', () => {
  /** Raio do círculo da prévia (distância do centro ao primeiro ponto): 6 mm de papel na escala da vista. */
  function raio(ctx: ReturnType<typeof ambiente>): number {
    const t = tool('northArrow', ctx.env);
    t.move(P(10, 10));
    const items = t.preview();
    const label = items.find((i) => i.kind === 'label')!;
    const linha = items.find((i) => i.kind === 'line')!;
    if (label.kind !== 'label' || linha.kind !== 'line') throw new Error('prévia inesperada');
    return linha.a.x - label.at.x;
  }

  it('sem gráficos gravados: escala 100 (a do Hestia), raio de 6 mm = 0,6 m', () => {
    expect(raio(ambiente(projeto()))).toBeCloseTo(0.6, 9);
  });

  it('com a escala do nível gravada em 50: raio 0,3 m', () => {
    const store = projeto();
    store.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { scale: 50 } });
    expect(raio(ambiente(store))).toBeCloseTo(0.3, 9);
  });

  it('na planta de disciplina vale a escala DELA (200), não a do nível: raio 1,2 m', () => {
    const store = projeto();
    store.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { scale: 50 } });
    store.exec({ type: 'setPlanGraphics', planId: 'pvA', patch: { scale: 200 } });
    expect(raio(ambiente(store, 'pvA'))).toBeCloseTo(1.2, 9);
    expect(raio(ambiente(store))).toBeCloseTo(0.3, 9);
  });
});
