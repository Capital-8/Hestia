import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AREA_GRAPHICS,
  ProjectStore,
  createEmptyProject,
  floorViewId,
  makeWall,
  roofViewId,
  viewAnnotationsOf,
  type AreaPlan,
  type Command,
  type Id,
} from '@hestia/model';
import { annotationAt, annotationIdsInBox, anotacoesSelecionaveis } from './annotationPick.ts';
import { P, clickAt, makeEnv, tool } from './testEnv.ts';

const LV0 = 'lv_0';
const MPP = 0.01;

const area = (id: string): AreaPlan => ({
  id,
  name: `Área ${id}`,
  levelId: LV0,
  scale: 50,
  graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault } },
  tags: [],
});

/** Projeto com uma parede (hospedeira das etiquetas) e duas plantas de área do mesmo nível. */
function montar() {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w0', typeId: 'wt_alv14', levelId: LV0, a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, locationLine: 'finishInterior' }) });
  store.exec({ type: 'addAreaPlan', plan: area('ap1') });
  store.exec({ type: 'addAreaPlan', plan: area('ap2') });
  return makeEnv(store);
}

type Ctx = ReturnType<typeof montar>;

/** Cria uma cota, um texto, uma linha de detalhe e uma etiqueta pelas ferramentas, na vista que o ambiente informa. */
function criarTudo(ctx: Ctx, dx = 0, dy = 0): void {
  const dim = tool('dimension', ctx.env);
  clickAt(dim, dx, dy);
  clickAt(dim, dx + 4, dy);
  clickAt(dim, dx + 2, dy + 1);
  const text = tool('text', ctx.env);
  clickAt(text, dx + 1, dy + 3);
  expect(text.type('Nota')).toBe(true);
  const line = tool('detailLine', ctx.env);
  clickAt(line, dx, dy + 5);
  clickAt(line, dx + 4, dy + 5);
  ctx.env.setSelection(['w0']);
  clickAt(tool('tag', ctx.env), dx + 2, dy - 2);
  ctx.env.setSelection([]);
}

const contagem = (ctx: Ctx, viewId: Id) => {
  const a = viewAnnotationsOf(ctx.store.project, viewId);
  return { dimensions: a.dimensions.length, texts: a.texts.length, detailLines: a.detailLines.length, tags: a.tags.length };
};
const VAZIA = { dimensions: 0, texts: 0, detailLines: 0, tags: 0 };
const CHEIA = { dimensions: 1, texts: 1, detailLines: 1, tags: 1 };

describe('ferramentas gravam na vista ativa (env.viewId)', () => {
  it('cobertura: cota, texto, linha de detalhe e etiqueta ficam em pvr_ e não aparecem no piso', () => {
    const ctx = montar();
    ctx.setViewId(roofViewId(LV0));
    criarTudo(ctx);
    expect(contagem(ctx, roofViewId(LV0))).toEqual(CHEIA);
    expect(contagem(ctx, floorViewId(LV0))).toEqual(VAZIA);
    expect(contagem(ctx, 'ap1')).toEqual(VAZIA);
    expect(contagem(ctx, 'ap2')).toEqual(VAZIA);
  });

  it('piso: continua gravando em pv_ e a cobertura fica vazia', () => {
    const ctx = montar();
    ctx.setViewId(floorViewId(LV0));
    criarTudo(ctx);
    expect(contagem(ctx, floorViewId(LV0))).toEqual(CHEIA);
    expect(contagem(ctx, roofViewId(LV0))).toEqual(VAZIA);
  });

  it('duas plantas de área do mesmo nível: cada uma guarda só as suas', () => {
    const ctx = montar();
    ctx.setViewId('ap1');
    criarTudo(ctx);
    ctx.setViewId('ap2');
    criarTudo(ctx, 10, 0);
    expect(contagem(ctx, 'ap1')).toEqual(CHEIA);
    expect(contagem(ctx, 'ap2')).toEqual(CHEIA);
    expect(contagem(ctx, floorViewId(LV0))).toEqual(VAZIA);
    expect(contagem(ctx, roofViewId(LV0))).toEqual(VAZIA);
    // A posição de cada conjunto é a que foi clicada nela.
    expect(viewAnnotationsOf(ctx.store.project, 'ap1').texts[0]!.at.x).toBeLessThan(5);
    expect(viewAnnotationsOf(ctx.store.project, 'ap2').texts[0]!.at.x).toBeGreaterThan(5);
  });

  it('os comandos de criação levam o viewId exato', () => {
    const ctx = montar();
    const cmds: Command[] = [];
    const exec = ctx.env.exec;
    ctx.env.exec = (c) => { cmds.push(c); exec(c); };
    ctx.setViewId(roofViewId(LV0));
    criarTudo(ctx);
    const doTipo = (t: string) => cmds.filter((c) => c.type === t);
    for (const tipo of ['addDimension', 'addText', 'addDetailLine', 'addTag']) {
      expect(doTipo(tipo), tipo).toHaveLength(1);
      expect(doTipo(tipo)[0], tipo).toMatchObject({ levelId: LV0, viewId: roofViewId(LV0) });
    }
  });
});

describe('seleção por vista', () => {
  it('na cobertura acha só as anotações da cobertura; no piso, só as do piso (mesmo lugar)', () => {
    const ctx = montar();
    ctx.setViewId(floorViewId(LV0));
    criarTudo(ctx);
    ctx.setViewId(roofViewId(LV0));
    criarTudo(ctx);
    const p = ctx.store.project;
    const noPiso = viewAnnotationsOf(p, floorViewId(LV0));
    const naCobertura = viewAnnotationsOf(p, roofViewId(LV0));

    expect(annotationAt(p, LV0, { x: 2, y: 1 }, MPP, roofViewId(LV0))?.id).toBe(naCobertura.dimensions[0]!.id);
    expect(annotationAt(p, LV0, { x: 2, y: 1 }, MPP, floorViewId(LV0))?.id).toBe(noPiso.dimensions[0]!.id);
    expect(annotationAt(p, LV0, { x: 2, y: 1 }, MPP)?.id).toBe(noPiso.dimensions[0]!.id);

    const caixa = annotationIdsInBox(p, LV0, { x: -1, y: -3 }, { x: 6, y: 7 }, MPP, roofViewId(LV0));
    expect(caixa).toHaveLength(4);
    for (const id of [...naCobertura.dimensions, ...naCobertura.texts, ...naCobertura.detailLines, ...naCobertura.tags].map((x) => x.id)) expect(caixa).toContain(id);
    expect(anotacoesSelecionaveis(p, LV0, roofViewId(LV0)).dimensions).toEqual(naCobertura.dimensions);
  });

  it('o Selecionar clica a cota da cobertura e a edição (alça) grava na cobertura, sem tocar o piso', () => {
    const ctx = montar();
    ctx.setViewId(floorViewId(LV0));
    criarTudo(ctx);
    ctx.setViewId(roofViewId(LV0));
    criarTudo(ctx);
    const p0 = ctx.store.project;
    const cobertura = viewAnnotationsOf(p0, roofViewId(LV0)).dimensions[0]!;
    const pisoOffset = viewAnnotationsOf(p0, floorViewId(LV0)).dimensions[0]!.offset;

    const sel = tool('select', ctx.env);
    sel.move(P(2, 1));
    sel.down!(P(2, 1));
    sel.up!(P(2, 1));
    expect(ctx.sel()).toEqual([cobertura.id]);
    sel.move(P(2, 1));
    sel.down!(P(2, 1));
    sel.drag!(P(2, -1.5));
    sel.up!(P(2, -1.5));

    const p = ctx.store.project;
    expect(viewAnnotationsOf(p, roofViewId(LV0)).dimensions[0]!.offset).toBeCloseTo(-1.5, 9);
    expect(viewAnnotationsOf(p, floorViewId(LV0)).dimensions[0]!.offset).toBe(pisoOffset);
  });

  it('duas plantas de área do mesmo nível não enxergam as anotações uma da outra', () => {
    const ctx = montar();
    ctx.setViewId('ap1');
    criarTudo(ctx);
    ctx.setViewId('ap2');
    criarTudo(ctx);
    const p = ctx.store.project;
    const a1 = viewAnnotationsOf(p, 'ap1').dimensions[0]!;
    const a2 = viewAnnotationsOf(p, 'ap2').dimensions[0]!;
    expect(annotationAt(p, LV0, { x: 2, y: 1 }, MPP, 'ap1')?.id).toBe(a1.id);
    expect(annotationAt(p, LV0, { x: 2, y: 1 }, MPP, 'ap2')?.id).toBe(a2.id);
    expect(annotationIdsInBox(p, LV0, { x: -1, y: -3 }, { x: 6, y: 7 }, MPP, 'ap1')).not.toContain(a2.id);
  });
});

describe('mover e copiar anotações na vista ativa', () => {
  const moverTudo = (ctx: Ctx, copiar: boolean): void => {
    const p = ctx.store.project;
    const a = viewAnnotationsOf(p, roofViewId(LV0));
    ctx.env.setSelection([...a.dimensions, ...a.texts, ...a.detailLines, ...a.tags].map((x) => x.id));
    const t = tool(copiar ? 'copy' : 'move', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 1, 1);
  };

  it('Mover na cobertura desloca as da cobertura e deixa as do piso', () => {
    const ctx = montar();
    ctx.setViewId(floorViewId(LV0));
    criarTudo(ctx);
    ctx.setViewId(roofViewId(LV0));
    criarTudo(ctx);
    const antesPiso = JSON.stringify(viewAnnotationsOf(ctx.store.project, floorViewId(LV0)));
    const antesCob = viewAnnotationsOf(ctx.store.project, roofViewId(LV0)).texts[0]!.at;
    moverTudo(ctx, false);
    const p = ctx.store.project;
    const depois = viewAnnotationsOf(p, roofViewId(LV0)).texts[0]!.at;
    expect(depois.x).toBeCloseTo(antesCob.x + 1, 9);
    expect(depois.y).toBeCloseTo(antesCob.y + 1, 9);
    expect(JSON.stringify(viewAnnotationsOf(p, floorViewId(LV0)))).toBe(antesPiso);
  });

  it('Copiar na cobertura cria as cópias na cobertura e nenhuma no piso', () => {
    const ctx = montar();
    ctx.setViewId(floorViewId(LV0));
    criarTudo(ctx);
    ctx.setViewId(roofViewId(LV0));
    criarTudo(ctx);
    moverTudo(ctx, true);
    expect(contagem(ctx, roofViewId(LV0))).toEqual({ dimensions: 2, texts: 2, detailLines: 2, tags: 2 });
    expect(contagem(ctx, floorViewId(LV0))).toEqual(CHEIA);
  });
});
