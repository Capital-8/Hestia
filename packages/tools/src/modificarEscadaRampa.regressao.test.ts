import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import {
  defaultRampTypeId,
  defaultStairTypeId,
  makeFloor,
  makeRamp,
  makeStair,
  transformRamp,
  transformStair,
  type Ramp,
  type Stair,
  type StairCurve,
  type StairRun,
} from '@hestia/model';
import { applyAlign } from './alignApply.ts';
import { alignFeaturesAt } from './alignFeatures.ts';
import { solveAlign } from './alignSolve.ts';
import { arraySet } from './arrayRadial.ts';
import { ghostBands, selectedMovables } from './edit.ts';
import { pickRampAt } from './rampPick.ts';
import { createStairFromComponents } from './stairCommands.ts';
import { pickStairAt } from './stairPick.ts';
import { pickLinesOf } from './stairPickLines.ts';
import { clickAt, makeEnv, tool } from './testEnv.ts';
import { DEFAULT_SNAP, type SnapOptions } from './types.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });
const near = (a: Vec2, b: Vec2): void => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
};
const ln = (a: Vec2, b: Vec2, sag = 0): StairCurve => ({ a, b, sag });

/** Lance reto válido: limites em y = ±0,5 de x = −0,5 a 5; espelhos em x = 0, 1 e 2. */
function straight(id = 'r1', sagLeft = 0): StairRun {
  return {
    id,
    kind: 'run',
    boundaryLeft: [ln(v(-0.5, 0.5), v(5, 0.5), sagLeft)],
    boundaryRight: [ln(v(-0.5, -0.5), v(5, -0.5))],
    risers: [ln(v(0, -1), v(0, 1)), ln(v(1, -1), v(1, 1)), ln(v(2, -1), v(2, 1))],
    path: [],
  };
}

/** Escada de modelo (sem projeto): mover/girar/espelhar direto por transformStair. */
const stairModel = (extra: Partial<Stair> = {}): Stair => ({
  ...makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', components: [straight()] }),
  order: 0,
  ...extra,
});

/** Rampa de modelo (sem projeto): mover/girar/espelhar direto por transformRamp. */
const rampModel = (extra: Partial<Ramp> = {}): Ramp => ({
  ...makeRamp({ id: 'rp1', typeId: defaultRampTypeId, levelId: 'lv_0', components: [straight('rr1')] }),
  order: 0,
  ...extra,
});

/** Projeto com uma escada criada pela própria ferramenta (um passo de desfazer). */
function ctxComEscada() {
  const ctx = makeEnv();
  const r = createStairFromComponents(ctx.env, [straight()]);
  if (!('id' in r)) throw new Error(r.error);
  return { ...ctx, id: r.id };
}

/** Projeto com a escada e uma rampa reta no mesmo lance (mesmos componentes do croqui). */
function ctxComEscadaERampa() {
  const ctx = makeEnv();
  const r = createStairFromComponents(ctx.env, [straight()]);
  if (!('id' in r)) throw new Error(r.error);
  ctx.store.exec({
    type: 'addRamp',
    ramp: makeRamp({ id: 'rp1', typeId: defaultRampTypeId, levelId: 'lv_0', components: [straight('rr1')] }),
  });
  return { ...ctx, stairId: r.id, rampId: 'rp1' };
}

/** Piso cuja aresta de topo (y = 0,5) coincide com o limite esquerdo do lance da escada. */
function ctxComPisoCoincidente() {
  const ctx = makeEnv();
  ctx.store.exec({
    type: 'addFloor',
    floor: makeFloor({ id: 'f1', typeId: 'ft_ceram', levelId: 'lv_0', boundary: [v(0, 0), v(4, 0), v(4, 0.5), v(0, 0.5)] }),
  });
  const r = createStairFromComponents(ctx.env, [straight()]);
  if (!('id' in r)) throw new Error(r.error);
  return { ...ctx, stairId: r.id };
}

const runOf = (s: Stair | Ramp): StairRun => s.components[0] as StairRun;

describe('seleção de escada e rampa para os comandos de Modificar', () => {
  it('selectedMovables inclui escada e rampa junto do que move/gira/espelha/copia', () => {
    const ctx = ctxComEscadaERampa();
    const p = ctx.store.project;
    // Entrada fora de ordem e id inexistente: a saída segue a ordem fixa dos grupos (escadas antes das rampas).
    expect(selectedMovables(p, [ctx.rampId, 'nao_existe', ctx.stairId])).toEqual([ctx.stairId, ctx.rampId]);
  });

  it('arraySet leva escada e rampa para a Matriz', () => {
    const ctx = ctxComEscadaERampa();
    const set = arraySet(ctx.store.project, [ctx.rampId, ctx.stairId]);
    expect(set.els).toEqual([ctx.stairId, ctx.rampId]);
  });
});

describe('transformStair / transformRamp (modelo)', () => {
  it('transformStair move todos os croquis e o freePath, sem mutar o original', () => {
    const stair = stairModel({
      freePath: [v(0, 0), v(5, 0), v(5, 6)],
      manualLandings: [1],
      components: [straight('r1', 0.2)],
    });
    const moved = transformStair(stair, { kind: 'translate', d: v(2, -1) });
    expect(runOf(moved).boundaryLeft[0]!.a).toEqual(v(1.5, -0.5));
    expect(runOf(moved).boundaryRight[0]!.b).toEqual(v(7, -1.5));
    expect(runOf(moved).risers[0]!.a).toEqual(v(2, -2));
    expect(moved.freePath).toEqual([v(2, -1), v(7, -1), v(7, 5)]);
    expect(moved.manualLandings).toEqual([1]);
    // O original continua no lugar (função pura).
    expect(runOf(stair).boundaryLeft[0]!.a).toEqual(v(-0.5, 0.5));
    expect(stair.freePath).toEqual([v(0, 0), v(5, 0), v(5, 6)]);
  });

  it('transformStair gira o croqui e mantém a flecha dos arcos', () => {
    const stair = stairModel({ components: [straight('r1', 0.2)], freePath: [v(0, 0), v(2, 0)] });
    const rotated = transformStair(stair, { kind: 'rotate', about: v(0, 0), angle: Math.PI / 2 });
    const run = runOf(rotated);
    expect(run.boundaryLeft[0]!.a.x).toBeCloseTo(-0.5, 9);
    expect(run.boundaryLeft[0]!.a.y).toBeCloseTo(-0.5, 9);
    expect(run.boundaryLeft[0]!.b.y).toBeCloseTo(5, 9);
    expect(run.boundaryLeft[0]!.sag).toBeCloseTo(0.2, 9);
    near(rotated.freePath![0]!, v(0, 0));
    near(rotated.freePath![1]!, v(0, 2));
  });

  it('transformStair espelha: troca os limites, nega a flecha e reflete o freePath', () => {
    const stair = stairModel({ components: [straight('r1', 0.2)], freePath: [v(0, 0), v(5, 0), v(5, 6)] });
    const mirrored = transformStair(stair, { kind: 'mirror', a: v(0, 0), b: v(0, 1) });
    const run = runOf(mirrored);
    expect(run.boundaryLeft[0]!.a).toEqual(v(0.5, -0.5));
    expect(run.boundaryRight[0]!.a).toEqual(v(0.5, 0.5));
    expect(run.boundaryRight[0]!.sag).toBeCloseTo(-0.2, 9);
    expect(mirrored.freePath).toEqual([v(0, 0), v(-5, 0), v(-5, 6)]);
  });

  it('transformRamp move, gira e espelha o croqui, preserva o freePath e inverte o giro só no espelho', () => {
    const ramp = rampModel({ turn: 'left', shape: 'free', freePath: [v(0, 0), v(5, 0), v(5, 6)], manualLandings: [1] });
    const moved = transformRamp(ramp, { kind: 'translate', d: v(1, 2) });
    expect(runOf(moved).boundaryLeft[0]!.a).toEqual(v(0.5, 2.5));
    expect(moved.freePath).toEqual([v(1, 2), v(6, 2), v(6, 8)]);
    expect(moved.turn).toBe('left');

    const rotated = transformRamp(ramp, { kind: 'rotate', about: v(0, 0), angle: Math.PI / 2 });
    expect(rotated.turn).toBe('left');
    near(rotated.freePath![0]!, v(0, 0));
    near(rotated.freePath![1]!, v(0, 5));
    near(rotated.freePath![2]!, v(-6, 5));

    const mirrored = transformRamp(ramp, { kind: 'mirror', a: v(0, 0), b: v(0, 1) });
    expect(mirrored.turn).toBe('right');
    expect(mirrored.freePath).toEqual([v(0, 0), v(-5, 0), v(-5, 6)]);
    expect(mirrored.manualLandings).toEqual([1]);
    // A rampa sem freePath continua sem o campo (projetos antigos).
    expect('freePath' in transformRamp(rampModel(), { kind: 'translate', d: v(1, 0) })).toBe(false);
  });
});

describe('fantasmas de mover/girar/espelhar', () => {
  it('ghostBands gera a prévia tracejada da escada', () => {
    const ctx = ctxComEscadaERampa();
    const items = ghostBands(ctx.store.project, [ctx.stairId], { kind: 'translate', d: v(1, 0) });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.kind !== 'line' || i.dashed === true)).toBe(true);
  });

  it('ghostBands gera a prévia tracejada da rampa', () => {
    const ctx = ctxComEscadaERampa();
    const items = ghostBands(ctx.store.project, [ctx.rampId], { kind: 'translate', d: v(1, 0) });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.kind !== 'line' || i.dashed === true)).toBe(true);
  });
});

describe('Alinhar: aresta de escada move a escada inteira', () => {
  it('alignFeaturesAt reconhece a aresta da escada e alignSolve/alignApply transladam só a escada', () => {
    const ctx = ctxComEscada();
    const p = ctx.store.project;
    const features = alignFeaturesAt({ project: p, levelId: 'lv_0', at: v(2, 0.5), metersPerPixel: 0.01 });
    const aresta = features.find((f) => f.kind === 'arestaEscada' && f.ownerId === ctx.id);
    expect(aresta).toBeDefined();
    expect(aresta!.move).toEqual({ policy: 'transladar', target: 'escada', id: ctx.id });

    // Referência paralela 0,5 m acima: a escada inteira sobe 0,5 m.
    const sol = solveAlign({ p: v(0, 1), d: v(1, 0) }, aresta!, p);
    expect(sol.kind).toBe('transladar');
    if (sol.kind !== 'transladar') throw new Error('esperava uma translação');
    expect(sol.target).toBe('escada');
    expect(sol.d.x).toBeCloseTo(0, 9);
    expect(sol.d.y).toBeCloseTo(0.5, 9);

    let applied = false;
    ctx.env.transaction('Alinhar', () => {
      applied = applyAlign(ctx.env, sol);
    });
    expect(applied).toBe(true);
    const run = runOf(ctx.store.project.elements[ctx.id] as Stair);
    expect(run.boundaryLeft[0]!.a.y).toBeCloseTo(1, 9);
    expect(run.boundaryRight[0]!.a.y).toBeCloseTo(0, 9);
    expect(run.risers[0]!.a.y).toBeCloseTo(-0.5, 9);
  });
});

describe('pegar escada e rampa: ponto e linhas', () => {
  it('pickStairAt seleciona dentro do lance e ignora fora', () => {
    const ctx = ctxComEscada();
    expect(pickStairAt(ctx.store.project, 'lv_0', v(2, 0), 0.01)).toBe(ctx.id);
    expect(pickStairAt(ctx.store.project, 'lv_0', v(20, 20), 0.01)).toBeNull();
  });

  it('pickRampAt seleciona dentro do lance e ignora fora', () => {
    const ctx = ctxComEscadaERampa();
    expect(pickRampAt(ctx.store.project, 'lv_0', v(2, 0), 0.01)).toBe(ctx.rampId);
    expect(pickRampAt(ctx.store.project, 'lv_0', v(20, 20), 0.01)).toBeNull();
  });

  it('pickLinesOf lista limites, espelhos e caminhada da escada', () => {
    const ctx = ctxComEscada();
    const snap: SnapOptions = { ...DEFAULT_SNAP, axis: true, faces: false, core: false };
    const lines = pickLinesOf(ctx.store.project, 'lv_0', snap).filter((l) => l.owner === ctx.id);
    // Um limite esquerdo, um direito e três espelhos (sem caminhada no lance de teste).
    expect(lines).toHaveLength(5);
    expect(lines.map((l) => l.group).sort()).toEqual([
      `stair:${ctx.id}:0:L`,
      `stair:${ctx.id}:0:R`,
      `stair:${ctx.id}:0:r0`,
      `stair:${ctx.id}:0:r1`,
      `stair:${ctx.id}:0:r2`,
    ]);
    expect(lines.every((l) => l.curve.sag === 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Comportamentos que as frentes A/B/C ainda vão entregar. NÃO apagar: a fase final habilita e roda.
// ---------------------------------------------------------------------------------------------------------------

describe.skip('snap global de escada e rampa (habilitar após as frentes A/B/C)', () => {
  it('pickLinesOf lista as linhas da rampa, não só as da escada', () => {
    const ctx = ctxComEscadaERampa();
    const snap: SnapOptions = { ...DEFAULT_SNAP, axis: true, faces: false, core: false };
    const lines = pickLinesOf(ctx.store.project, 'lv_0', snap);
    expect(lines.some((l) => l.owner === ctx.stairId)).toBe(true);
    expect(lines.some((l) => l.owner === ctx.rampId)).toBe(true);
  });

  it('alignFeaturesAt reconhece a aresta da rampa como feição alinhável', () => {
    const ctx = ctxComEscadaERampa();
    const features = alignFeaturesAt({ project: ctx.store.project, levelId: 'lv_0', at: v(2, 0.5), metersPerPixel: 0.01 });
    expect(features.some((f) => f.ownerId === ctx.rampId)).toBe(true);
  });
});

describe.skip('guardas de aresta em Aparar/Dividir/Deslocar (habilitar após as frentes A/B/C)', () => {
  it('Deslocar na aresta da escada desloca a escada e não o piso coincidente embaixo', () => {
    const ctx = ctxComPisoCoincidente();
    const piso = ctx.store.project.elements['f1']!;
    const antes = JSON.parse(JSON.stringify(piso)) as typeof piso;
    ctx.options.offsetDistance = 0.3;
    ctx.options.offsetCopy = false;
    const off = tool('offset', ctx.env);
    clickAt(off, 2, 0.52);
    // A guarda deve impedir que a aresta do piso (embaixo da escada) seja a atingida.
    expect(ctx.store.project.elements['f1']).toEqual(antes);
    // E o Deslocar deve ter agido na aresta da escada.
    const run = runOf(ctx.store.project.elements[ctx.stairId] as Stair);
    expect(run.boundaryLeft[0]!.a.y).not.toBeCloseTo(0.5, 9);
  });

  it('Dividir na aresta da escada não parte o piso coincidente embaixo', () => {
    const ctx = ctxComPisoCoincidente();
    const piso = ctx.store.project.elements['f1']!;
    const antes = JSON.parse(JSON.stringify(piso)) as typeof piso;
    const split = tool('split', ctx.env);
    clickAt(split, 2, 0.52);
    expect(ctx.store.project.elements['f1']).toEqual(antes);
    expect(ctx.store.project.elements[ctx.stairId]).toBeDefined();
  });
});

describe.skip('ids remapeados na cópia de escada e rampa (habilitar após as frentes A/B/C)', () => {
  it('copiar uma escada remapeia também os ids dos componentes do croqui', () => {
    const ctx = ctxComEscada();
    ctx.store.exec({
      type: 'transform',
      ids: [ctx.id],
      transform: { kind: 'translate', d: v(1, 0) },
      copy: { idMap: { [ctx.id]: 'st_copy' } },
    });
    const original = runOf(ctx.store.project.elements[ctx.id] as Stair);
    const copia = runOf(ctx.store.project.elements['st_copy'] as Stair);
    expect(copia.id).not.toBe(original.id);
  });
});
