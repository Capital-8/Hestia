/**
 * Massa em TODAS as ferramentas de modificação (contrato de famílias e ferramentas, regra 3). Um teste por ferramenta, com a origem, o
 * centro do arranjo, a rotação das seções e o id novo da cópia conferidos, mais desfazer e refazer. Pelo mecanismo genérico (`transform`),
 * sem caso especial: o modelo já leva a massa; aqui se prova que as ferramentas a entregam a ele.
 */
import { describe, expect, it } from 'vitest';
import { massaM1, massaM3 } from '@hestia/engine/src/fixtureMassa.ts';
import { isMass, makeLevel, makeWall, type Id, type Mass, type Project } from '@hestia/model';
import { alignFeaturesAt } from './alignFeatures.ts';
import { clipboardFrom, copyableIds, pasteAlignedCommand } from './clipboard.ts';
import { selectedMovables } from './edit.ts';
import { pasteAlignedToLevelsCommand } from './pasteLevels/command.ts';
import { comandosMoverNoCorte } from './sectionMoverElementos.ts';
import { clickAt, makeEnv, P, tool } from './testEnv.ts';

type Ctx = ReturnType<typeof makeEnv>;

const massas = (p: Project): Mass[] => Object.values(p.elements).filter(isMass);
const get = (ctx: Ctx, id: Id): Mass => ctx.store.project.elements[id] as Mass;
const perto = (a: number, b: number): void => expect(a).toBeCloseTo(b, 9);

/** M1 na origem (10, 0), com arranjo polar de 3 cópias em volta de (12, 0). */
const comArranjo = (): Mass => ({ ...massaM1(), origem: { x: 10, y: 0 }, arranjo: { n: 3, cx: 12, cy: 0, anguloTotal: 2 * Math.PI } });

/** Projeto com a massa `m1` (com arranjo) em (10, 0) e a `m3` (torcida: rotação 0 e π/2) em (0, 20). */
function cenario(): Ctx {
  const ctx = makeEnv();
  ctx.store.exec({ type: 'addMass', mass: comArranjo() });
  ctx.store.exec({ type: 'addMass', mass: { ...massaM3(), origem: { x: 0, y: 20 } } });
  return ctx;
}

describe('Mover e Copiar', () => {
  it('Mover leva a origem e o centro do arranjo; desfazer e refazer', () => {
    const ctx = cenario();
    expect(selectedMovables(ctx.store.project, ['m1'])).toEqual(['m1']);
    ctx.env.setSelection(['m1']);
    const t = tool('move', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 0, 3);
    expect(get(ctx, 'm1').origem).toEqual({ x: 10, y: 3 });
    expect(get(ctx, 'm1').arranjo).toMatchObject({ n: 3, cx: 12, cy: 3 });
    ctx.store.undo();
    expect(get(ctx, 'm1').origem).toEqual({ x: 10, y: 0 });
    expect(get(ctx, 'm1').arranjo).toMatchObject({ cx: 12, cy: 0 });
    ctx.store.redo();
    expect(get(ctx, 'm1').origem).toEqual({ x: 10, y: 3 });
  });

  it('Copiar cria outra massa com id novo, mantém o original e o arranjo (centro deslocado); um passo de desfazer', () => {
    const ctx = cenario();
    ctx.env.setSelection(['m1']);
    const t = tool('copy', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 0, 2);
    t.cancel();
    expect(massas(ctx.store.project)).toHaveLength(3);
    expect(get(ctx, 'm1').origem).toEqual({ x: 10, y: 0 });
    expect(get(ctx, 'm1').arranjo).toMatchObject({ cx: 12, cy: 0 });
    const copia = massas(ctx.store.project).find((m) => m.id !== 'm1' && m.id !== 'm3')!;
    expect(copia.id).toMatch(/^ms/);
    expect(copia.origem).toEqual({ x: 10, y: 2 });
    expect(copia.arranjo).toMatchObject({ n: 3, cx: 12, cy: 2, anguloTotal: 2 * Math.PI });
    expect(copia.secoes).toEqual(get(ctx, 'm1').secoes);
    ctx.store.undo();
    expect(massas(ctx.store.project)).toHaveLength(2);
    ctx.store.redo();
    expect(massas(ctx.store.project)).toHaveLength(3);
  });
});

describe('Girar e Espelhar', () => {
  it('Girar 90 graus em torno da origem: soma o ângulo a todas as rotações e gira a origem e o centro do arranjo', () => {
    const ctx = cenario();
    ctx.env.setSelection(['m3', 'm1']);
    const t = tool('rotate', ctx.env);
    clickAt(t, 0, 0);
    expect(t.type('90')).toBe(true);
    const m1 = get(ctx, 'm1');
    perto(m1.origem.x, 0);
    perto(m1.origem.y, 10);
    perto(m1.arranjo!.cx, 0);
    perto(m1.arranjo!.cy, 12);
    for (const s of m1.secoes) perto(s.rotacao, Math.PI / 2);
    const m3 = get(ctx, 'm3');
    perto(m3.origem.x, -20);
    perto(m3.origem.y, 0);
    expect(m3.secoes.map((s) => s.rotacao)).toEqual([expect.closeTo(Math.PI / 2, 9), expect.closeTo(Math.PI, 9)]);
    ctx.store.undo();
    expect(get(ctx, 'm1').origem).toEqual({ x: 10, y: 0 });
    expect(get(ctx, 'm3').secoes.map((s) => s.rotacao)).toEqual([0, Math.PI / 2]);
    ctx.store.redo();
    perto(get(ctx, 'm1').origem.y, 10);
  });

  it('Espelhar em torno de uma reta horizontal: reflete a origem e o centro do arranjo, inverte o sinal das rotações e do ângulo total', () => {
    const ctx = cenario();
    ctx.env.setSelection(['m3', 'm1']);
    ctx.options.mirrorCopy = false;
    const t = tool('mirror', ctx.env);
    clickAt(t, 0, 1);
    clickAt(t, 4, 1);
    const m1 = get(ctx, 'm1');
    perto(m1.origem.x, 10);
    perto(m1.origem.y, 2);
    perto(m1.arranjo!.cy, 2);
    perto(m1.arranjo!.anguloTotal, -2 * Math.PI);
    const m3 = get(ctx, 'm3');
    perto(m3.origem.y, -18);
    perto(m3.secoes[0]!.rotacao, 0);
    perto(m3.secoes[1]!.rotacao, -Math.PI / 2);
    ctx.store.undo();
    expect(get(ctx, 'm3').origem).toEqual({ x: 0, y: 20 });
    expect(get(ctx, 'm3').secoes[1]!.rotacao).toBeCloseTo(Math.PI / 2, 9);
    ctx.store.redo();
    perto(get(ctx, 'm3').origem.y, -18);
  });
});

describe('Matriz', () => {
  it('Matriz linear cria N-1 cópias com ids novos em um passo de desfazer', () => {
    const ctx = cenario();
    ctx.env.setSelection(['m3']);
    const a = tool('array', ctx.env);
    clickAt(a, 0, 0);
    a.move(P(0, 5));
    expect(a.type('3')).toBe(true);
    const ms = massas(ctx.store.project);
    expect(ms).toHaveLength(4);
    expect(new Set(ms.map((m) => m.id)).size).toBe(4);
    const ys = ms.filter((m) => m.id.startsWith('ms')).map((m) => m.origem.y).sort((x, y) => x - y);
    // 3 itens (opção padrão `arrayCount`), com o espaçamento digitado (3 m) na direção do cursor (+y): a original em y = 20 e as cópias em 23 e 26.
    expect(ys).toEqual([23, 26]);
    ctx.store.undo();
    expect(massas(ctx.store.project)).toHaveLength(2);
    ctx.store.redo();
    expect(massas(ctx.store.project)).toHaveLength(4);
  });
});

describe('Alinhar', () => {
  it('a aresta do anel da massa é feição alinhável (transladar) e o Alinhar leva a massa até a parede de referência; desfaz e refaz', () => {
    const ctx = makeEnv();
    ctx.store.exec({ type: 'addMass', mass: massaM1() });
    ctx.store.exec({ type: 'addWall', wall: makeWall({ id: 'w_ref', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: -8, y: 5 }, b: { x: 8, y: 5 }, locationLine: 'wallCenter' }) });
    const f = alignFeaturesAt({ project: ctx.store.project, levelId: 'lv_0', at: { x: 2, y: 3 }, metersPerPixel: 0.01 }).find((x) => x.kind === 'arestaMassa');
    expect(f).toBeDefined();
    expect(f!.ownerId).toBe('m1');
    expect(f!.move).toMatchObject({ policy: 'transladar', id: 'm1' });
    ctx.options.alignPrefer = 'eixos';
    const t = tool('align', ctx.env);
    clickAt(t, 3, 5); // referência: eixo da parede (y = 5)
    clickAt(t, 2, 3); // a aresta de cima da massa (y = 3)
    expect(get(ctx, 'm1').origem.x).toBeCloseTo(0, 9);
    expect(get(ctx, 'm1').origem.y).toBeCloseTo(2, 9);
    ctx.store.undo();
    expect(get(ctx, 'm1').origem).toEqual({ x: 0, y: 0 });
    ctx.store.redo();
    expect(get(ctx, 'm1').origem.y).toBeCloseTo(2, 9);
  });
});

describe('Apagar', () => {
  it('apagar a massa e desfazer/refazer', () => {
    const ctx = cenario();
    ctx.store.exec({ type: 'deleteElements', ids: ['m1'] });
    expect(ctx.store.project.elements['m1']).toBeUndefined();
    expect(ctx.store.project.elements['m3']).toBeDefined();
    ctx.store.undo();
    expect(get(ctx, 'm1').arranjo).toMatchObject({ n: 3, cx: 12 });
    ctx.store.redo();
    expect(ctx.store.project.elements['m1']).toBeUndefined();
  });
});

describe('Copiar/Colar e Colar por níveis', () => {
  it('Colar no mesmo nível: id novo, mesmas seções e arranjo; desfazer e refazer', () => {
    const ctx = cenario();
    expect(copyableIds(ctx.store.project, ['m1'])).toEqual(['m1']);
    const clip = clipboardFrom(ctx.store.project, ['m1'])!;
    expect(clip.masses).toHaveLength(1);
    const r = pasteAlignedCommand(ctx.store.project, clip, 'lv_0')!;
    expect(r.massIds).toHaveLength(1);
    expect(r.massIds[0]).not.toBe('m1');
    ctx.store.exec(r.command);
    const nova = get(ctx, r.massIds[0]!);
    expect(nova.origem).toEqual({ x: 10, y: 0 });
    expect(nova.arranjo).toEqual(get(ctx, 'm1').arranjo);
    expect(nova.secoes).toEqual(get(ctx, 'm1').secoes);
    expect(massas(ctx.store.project)).toHaveLength(3);
    ctx.store.undo();
    expect(massas(ctx.store.project)).toHaveLength(2);
    ctx.store.redo();
    expect(massas(ctx.store.project)).toHaveLength(3);
  });

  it('Colar por níveis: uma massa por nível de destino, com `levelId` do destino, `baseOffset` e arranjo mantidos; um passo de desfazer', () => {
    const ctx = cenario();
    ctx.store.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pav 1', elevation: 3 }) });
    ctx.store.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_2', name: 'Pav 2', elevation: 6 }) });
    ctx.store.exec({ type: 'updateMass', id: 'm1', patch: { baseOffset: 0.5 } });
    const clip = clipboardFrom(ctx.store.project, ['m1'])!;
    const r = pasteAlignedToLevelsCommand(ctx.store.project, clip, ['lv_1', 'lv_2'])!;
    const a = r.byLevel['lv_1']!.masses;
    const b = r.byLevel['lv_2']!.masses;
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]).not.toBe(b[0]);
    ctx.store.exec(r.command);
    for (const [id, lv] of [[a[0]!, 'lv_1'], [b[0]!, 'lv_2']] as const) {
      const m = get(ctx, id);
      expect(m.levelId).toBe(lv);
      expect(m.baseOffset).toBe(0.5);
      expect(m.arranjo).toMatchObject({ n: 3, cx: 12, cy: 0 });
      expect(m.origem).toEqual({ x: 10, y: 0 });
    }
    expect(massas(ctx.store.project)).toHaveLength(4);
    ctx.store.undo();
    expect(massas(ctx.store.project)).toHaveLength(2);
    ctx.store.redo();
    expect(massas(ctx.store.project)).toHaveLength(4);
  });
});

describe('Mover e Copiar no corte e na elevação', () => {
  const u = { x: 1, y: 0 };

  it('horizontal vira `transform` de translação em planta (origem e centro do arranjo); vertical muda `baseOffset`; um passo de desfazer', () => {
    const ctx = cenario();
    const r = comandosMoverNoCorte(ctx.store.project, ['m1'], u, 2, 1.5);
    expect(r.commands.map((c) => c.type)).toEqual(['transform', 'updateMass']);
    ctx.store.transaction('mover no corte', () => r.commands.forEach((c) => ctx.store.exec(c)));
    const m = get(ctx, 'm1');
    expect(m.origem).toEqual({ x: 12, y: 0 });
    expect(m.arranjo).toMatchObject({ cx: 14, cy: 0 });
    expect(m.baseOffset).toBe(1.5);
    ctx.store.undo();
    expect(get(ctx, 'm1').origem).toEqual({ x: 10, y: 0 });
    expect(get(ctx, 'm1').baseOffset).toBe(0);
    ctx.store.redo();
    expect(get(ctx, 'm1').baseOffset).toBe(1.5);
  });

  it('só horizontal não toca `baseOffset`; só vertical não move a origem', () => {
    const ctx = cenario();
    expect(comandosMoverNoCorte(ctx.store.project, ['m1'], u, 2, 0).commands.map((c) => c.type)).toEqual(['transform']);
    const v = comandosMoverNoCorte(ctx.store.project, ['m1'], u, 0, 2);
    expect(v.commands.map((c) => c.type)).toEqual(['updateMass']);
    expect(v.commands[0]).toMatchObject({ type: 'updateMass', id: 'm1', patch: { baseOffset: 2 } });
  });

  it('Copiar no corte: cópia com id novo leva os dois deslocamentos e o original fica', () => {
    const ctx = cenario();
    const r = comandosMoverNoCorte(ctx.store.project, ['m1'], u, 2, 1, true);
    expect(r.copias).toHaveLength(1);
    ctx.store.transaction('copiar no corte', () => r.commands.forEach((c) => ctx.store.exec(c)));
    expect(massas(ctx.store.project)).toHaveLength(3);
    const copia = get(ctx, r.copias[0]!);
    expect(copia.id).not.toBe('m1');
    expect(copia.origem).toEqual({ x: 12, y: 0 });
    expect(copia.baseOffset).toBe(1);
    expect(get(ctx, 'm1').origem).toEqual({ x: 10, y: 0 });
    expect(get(ctx, 'm1').baseOffset).toBe(0);
    ctx.store.undo();
    expect(massas(ctx.store.project)).toHaveLength(2);
  });
});
