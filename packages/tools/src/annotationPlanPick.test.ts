import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AREA_GRAPHICS,
  ProjectStore,
  createEmptyProject,
  levelDimensions,
  levelTexts,
  makeRoom,
  planAnnotationsOf,
  type AreaPlan,
  type Command,
} from '@hestia/model';
import { annotationAt, annotationIdsInBox, dimGripAt, dimHitGeometry, dimTextGripAt, textGripAt, anotacoesSelecionaveis } from './annotationPick.ts';
import { P, clickAt, makeEnv, tool } from './testEnv.ts';
import { areaPlansOf } from '@hestia/model';

const LV0 = 'lv_0';
const MPP = 0.01;

const plan = (id: string): AreaPlan => ({
  id,
  name: `Planta de área ${id}`,
  levelId: LV0,
  scale: 50,
  graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault } },
  tags: [],
});

/** Ambiente com a planta de área ap1 aberta na vista. */
function withAreaPlan() {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addAreaPlan', plan: plan('ap1') });
  const ctx = makeEnv(store);
  ctx.setAreaPlanId('ap1');
  return ctx;
}

const annotationsOf = (s: ProjectStore) => planAnnotationsOf(areaPlansOf(s.project).find((p) => p.id === 'ap1')!);

/** Grava as anotações da planta pelas ferramentas e devolve o id de cada uma. */
function criaAnotacoes(ctx: ReturnType<typeof withAreaPlan>) {
  const dim = tool('dimension', ctx.env);
  clickAt(dim, 0, 0);
  clickAt(dim, 4, 0);
  clickAt(dim, 2, 1);
  const text = tool('text', ctx.env);
  clickAt(text, 1, 2);
  expect(text.type('Sala')).toBe(true);
  const a = annotationsOf(ctx.store);
  return { dimId: a.dimensions[0]!.id, textId: a.texts[0]!.id, text: a.texts[0]! };
}

/** Registra os comandos emitidos pela ferramenta (sem deixar de aplicá-los). */
function gravaComandos(env: { exec: (c: Command) => void }): Command[] {
  const cmds: Command[] = [];
  const exec = env.exec;
  env.exec = (c) => { cmds.push(c); exec(c); };
  return cmds;
}

describe('seleção de anotações na planta de área', () => {
  it('cota e texto de plan.annotations são achados com planId e não sem', () => {
    const ctx = withAreaPlan();
    const { dimId, textId, text } = criaAnotacoes(ctx);
    const p = ctx.store.project;

    expect(annotationAt(p, LV0, { x: 2, y: 1 }, MPP, 'ap1')).toEqual({ id: dimId, kind: 'dimension' });
    expect(annotationAt(p, LV0, text.at, MPP, 'ap1')).toEqual({ id: textId, kind: 'text' });
    // Sem planId a leitura é a do nível, que está sem anotações.
    expect(annotationAt(p, LV0, { x: 2, y: 1 }, MPP)).toBeNull();
    expect(annotationAt(p, LV0, text.at, MPP)).toBeNull();
  });

  it('janela de seleção pega cota e texto da planta de área', () => {
    const ctx = withAreaPlan();
    const { dimId, textId } = criaAnotacoes(ctx);
    const p = ctx.store.project;
    expect(annotationIdsInBox(p, LV0, { x: -1, y: -1 }, { x: 6, y: 3 }, MPP, 'ap1')).toEqual(expect.arrayContaining([dimId, textId]));
    expect(annotationIdsInBox(p, LV0, { x: -1, y: -1 }, { x: 6, y: 3 }, MPP)).toEqual([]);
  });

  it('textGripAt acha a alça (âncora) só do texto selecionado da planta', () => {
    const ctx = withAreaPlan();
    const { textId, text } = criaAnotacoes(ctx);
    const p = ctx.store.project;
    const perto = { x: text.at.x + 0.02, y: text.at.y };

    expect(textGripAt(p, LV0, [textId], perto, MPP, 'ap1')).toBe(textId);
    // Longe da âncora não é alça; sem planId o texto da planta não é encontrado.
    expect(textGripAt(p, LV0, [textId], { x: text.at.x + 1, y: text.at.y }, MPP, 'ap1')).toBeNull();
    expect(textGripAt(p, LV0, [textId], text.at, MPP)).toBeNull();
    expect(textGripAt(p, LV0, [], text.at, MPP, 'ap1')).toBeNull();
  });

  it('arrastar a âncora move o texto da planta e emite updateText com planId', () => {
    const ctx = withAreaPlan();
    const { textId, text } = criaAnotacoes(ctx);
    const cmds = gravaComandos(ctx.env);
    const sel = tool('select', ctx.env);
    sel.move(P(text.at.x, text.at.y));
    sel.down!(P(text.at.x, text.at.y));
    sel.up!(P(text.at.x, text.at.y));
    expect(ctx.sel()).toEqual([textId]);

    const dest = { x: text.at.x + 1.5, y: text.at.y + 0.75 };
    sel.move(P(text.at.x, text.at.y));
    sel.down!(P(text.at.x, text.at.y));
    sel.drag!(P(dest.x, dest.y));
    sel.up!(P(dest.x, dest.y));

    expect(cmds).toContainEqual({ type: 'updateText', levelId: LV0, planId: 'ap1', id: textId, patch: { at: dest } });
    expect(annotationsOf(ctx.store).texts[0]!.at).toEqual(dest);
    expect(levelTexts(ctx.store.project, LV0)).toHaveLength(0);
  });

  it('arrastar a alça da cota da planta emite updateDimension com planId', () => {
    const ctx = withAreaPlan();
    const { dimId } = criaAnotacoes(ctx);
    const cmds = gravaComandos(ctx.env);
    const sel = tool('select', ctx.env);
    sel.move(P(2, 1));
    sel.down!(P(2, 1));
    sel.up!(P(2, 1));
    expect(ctx.sel()).toEqual([dimId]);
    // A alça fica no meio da linha de cota (2, 1).
    expect(dimGripAt(ctx.store.project, LV0, [dimId], { x: 2, y: 1 }, MPP, 'ap1')).toBe(dimId);

    sel.move(P(2, 1));
    sel.down!(P(2, 1));
    sel.drag!(P(2, -1.5));
    sel.up!(P(2, -1.5));

    expect(cmds.some((c) => c.type === 'updateDimension' && c.planId === 'ap1' && c.id === dimId)).toBe(true);
    expect(annotationsOf(ctx.store).dimensions[0]!.offset).toBeCloseTo(-1.5, 9);
    expect(levelDimensions(ctx.store.project, LV0)).toHaveLength(0);
  });

  it('a alça do texto da cota da planta também responde com planId', () => {
    const ctx = withAreaPlan();
    const { dimId } = criaAnotacoes(ctx);
    // O texto fica na posição desenhada (mesma geometria do render: estilo e escala da planta de área).
    const aberta = anotacoesSelecionaveis(ctx.store.project, LV0, 'ap1');
    const dim = aberta.dimensions[0]!;
    const texto = dimHitGeometry(ctx.store.project, dim, dim.a, dim.b, aberta.scale).textAt;
    expect(dimTextGripAt(ctx.store.project, LV0, [dimId], texto, MPP, 'ap1')).toBe(dimId);
    expect(dimTextGripAt(ctx.store.project, LV0, [dimId], texto, MPP)).toBeNull();
  });
  it('na planta de área, o texto sobre o ambiente é selecionável (anotação antes do modelo)', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: LV0, name: 'Sala', number: '101', point: { x: 2, y: 1.5 } }) });
    store.exec({ type: 'addAreaPlan', plan: plan('ap1') });
    const ctx = makeEnv(store);
    ctx.setAreaPlanId('ap1');

    const text = tool('text', ctx.env);
    clickAt(text, 2, 1.5);
    expect(text.type('Sala')).toBe(true);
    const t = annotationsOf(ctx.store).texts[0]!;

    const sel = tool('select', ctx.env);
    sel.move(P(t.at.x, t.at.y));
    sel.down!(P(t.at.x, t.at.y));
    sel.up!(P(t.at.x, t.at.y));
    expect(ctx.sel()).toEqual([t.id]);
  });
});

describe('sem planta de área, a seleção continua no nível', () => {
  it('annotationAt e textGripAt leem o nível; mover texto não manda planId', () => {
    const ctx = makeEnv();
    const text = tool('text', ctx.env);
    clickAt(text, 1, 2);
    expect(text.type('Sala')).toBe(true);
    const t = levelTexts(ctx.store.project, LV0)[0]!;
    expect(annotationAt(ctx.store.project, LV0, t.at, MPP)).toEqual({ id: t.id, kind: 'text' });
    expect(textGripAt(ctx.store.project, LV0, [t.id], t.at, MPP)).toBe(t.id);

    const cmds = gravaComandos(ctx.env);
    const sel = tool('select', ctx.env);
    sel.move(P(t.at.x, t.at.y));
    sel.down!(P(t.at.x, t.at.y));
    sel.up!(P(t.at.x, t.at.y));
    const dest = { x: t.at.x + 1, y: t.at.y + 0.5 };
    sel.move(P(t.at.x, t.at.y));
    sel.down!(P(t.at.x, t.at.y));
    sel.drag!(P(dest.x, dest.y));
    sel.up!(P(dest.x, dest.y));

    const movido = cmds.find((c) => c.type === 'updateText');
    expect(movido).toEqual({ type: 'updateText', levelId: LV0, id: t.id, patch: { at: dest } });
    expect(levelTexts(ctx.store.project, LV0)[0]!.at).toEqual(dest);
  });

  it('a alça da cota do nível continua funcionando sem planId', () => {
    const ctx = makeEnv();
    const t = tool('dimension', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 4, 0);
    clickAt(t, 2, 1);
    const id = levelDimensions(ctx.store.project, LV0)[0]!.id;
    const sel = tool('select', ctx.env);
    sel.move(P(2, 1));
    sel.down!(P(2, 1));
    sel.up!(P(2, 1));
    expect(ctx.sel()).toEqual([id]);
    sel.move(P(2, 1));
    sel.down!(P(2, 1));
    sel.drag!(P(2, -1.5));
    sel.up!(P(2, -1.5));
    expect(levelDimensions(ctx.store.project, LV0)[0]!.offset).toBeCloseTo(-1.5, 9);
  });
});
