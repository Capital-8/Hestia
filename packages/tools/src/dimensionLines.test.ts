import { describe, expect, it } from 'vitest';
import { dimensionPoints, dimensionValue, levelDimensions, type Project } from '@hestia/model';
import { drivenEditCommands } from './dims/driven.ts';
import { eqChainCommands } from './dims/constraints.ts';
import { chooseRefs } from './dimensionTool.ts';
import { clickAt, drawWall, makeEnv, tool, walls } from './testEnv.ts';

const dims = (s: { project: Project }) => levelDimensions(s.project, 'lv_0');
const HALF = 0.092;

describe('cota por linha de parede (como o Revit)', () => {
  it('clicar nas faces de duas paredes paralelas grava refs de LINHA e mede a perpendicular', () => {
    const ctx = makeEnv();
    drawWall(ctx.env, [0, 0], [4, 0]);
    drawWall(ctx.env, [0, 3], [4, 3]);
    const t = tool('dimension', ctx.env);
    clickAt(t, 1.3, HALF + 0.001); // face de cima da parede de baixo, longe de qualquer ponta
    clickAt(t, 2.6, 3 - HALF); // face de baixo da parede de cima, em outro x
    clickAt(t, 5, 1.5);
    const [d] = dims(ctx.store);
    expect(d).toBeDefined();
    expect((d!.refs!.a as { feature: string }).feature).toBe('wall-line');
    expect((d!.refs!.b as { feature: string }).feature).toBe('wall-line');
    expect(dimensionValue(ctx.store.project, d!)).toBeCloseTo(3 - 2 * HALF, 3);
  });

  it('a cota acompanha a parede quando ela se move (referência de linha, não coordenada)', () => {
    const ctx = makeEnv();
    drawWall(ctx.env, [0, 0], [4, 0]);
    drawWall(ctx.env, [0, 3], [4, 3]);
    const t = tool('dimension', ctx.env);
    clickAt(t, 1.3, HALF + 0.001);
    clickAt(t, 2.6, 3 - HALF);
    clickAt(t, 5, 1.5);
    const upper = walls(ctx.store).find((w) => w.a.y === 3)!;
    ctx.store.exec({ type: 'setWallEnds', id: upper.id, a: { x: 0, y: 4 }, b: { x: 4, y: 4 } });
    expect(dimensionValue(ctx.store.project, dims(ctx.store)[0]!)).toBeCloseTo(4 - 2 * HALF, 3);
  });

  it('editar o valor da cota de linhas move a parede', () => {
    const ctx = makeEnv();
    drawWall(ctx.env, [0, 0], [4, 0]);
    drawWall(ctx.env, [0, 3], [4, 3]);
    const t = tool('dimension', ctx.env);
    clickAt(t, 1.3, HALF + 0.001);
    clickAt(t, 2.6, 3 - HALF);
    clickAt(t, 5, 1.5);
    const r = drivenEditCommands(ctx.store.project, dims(ctx.store)[0]!, 3);
    expect(r.ok).toBe(true);
    if (r.ok) for (const c of r.commands) ctx.store.exec(c as never);
    expect(dimensionValue(ctx.store.project, dims(ctx.store)[0]!)).toBeCloseTo(3, 3);
  });

  it('no canto, a cota horizontal prende a linha da parede vertical (não o ponto solto)', () => {
    const ctx = makeEnv();
    ctx.options.dimensionMode = 'horizontal';
    drawWall(ctx.env, [0, 0], [0, 4]);
    drawWall(ctx.env, [0, 0], [4, 0]);
    const t = tool('dimension', ctx.env);
    clickAt(t, -HALF, 2); // na face esquerda da parede vertical
    clickAt(t, 4, 0);
    clickAt(t, 2, -1);
    const [d] = dims(ctx.store);
    expect((d!.refs!.a as { feature: string }).feature).toBe('wall-line');
    const before = dimensionValue(ctx.store.project, d!);
    const v = walls(ctx.store).find((w) => w.a.x === 0 && w.b.x === 0)!;
    ctx.store.exec({ type: 'setWallEnds', id: v.id, a: { x: -1, y: 0 }, b: { x: -1, y: 4 } });
    expect(dimensionValue(ctx.store.project, dims(ctx.store)[0]!)).toBeCloseTo(before + 1, 3);
  });

  it('Tab alterna a linha sob o cursor', () => {
    const ctx = makeEnv();
    drawWall(ctx.env, [0, 0], [4, 0]);
    const t = tool('dimension', ctx.env);
    t.move({ raw: { x: 1.3, y: 0.0 }, shift: false, ctrl: false, alt: false });
    const first = JSON.stringify(t.preview());
    t.tab();
    expect(JSON.stringify(t.preview())).not.toBe(first);
  });

  it('chooseRefs: linha perpendicular à medida vence o ponto; esquadria vence a linha', () => {
    const line = { ref: { elementId: 'w', feature: 'wall-line' as const, line: 'face-hi' as const }, point: { x: 0, y: 0 }, normal: { x: 1, y: 0 }, distance: 0 };
    const pt = { ref: { elementId: 'w', feature: 'wall-axis-a' as const }, point: { x: 0, y: 0 } };
    expect(chooseRefs({ points: [pt], lines: [line] }, undefined, 'horizontal').ra).toEqual(line.ref);
    expect(chooseRefs({ points: [pt], lines: [line] }, undefined, 'vertical').ra).toEqual(pt.ref);
    const op = { ref: { elementId: 'o', feature: 'opening-edge-a' as const }, point: { x: 0, y: 0 } };
    expect(chooseRefs({ points: [op], lines: [line] }, undefined, 'horizontal').ra).toEqual(op.ref);
  });

  it('parede inteira: pontas + faces da parede que cruza viram uma sequência de cotas associativas', () => {
    const ctx = makeEnv();
    ctx.options.dimensionPick = 'wall';
    drawWall(ctx.env, [0, 0], [6, 0]);
    drawWall(ctx.env, [3, -2], [3, 2]);
    const t = tool('dimension', ctx.env);
    clickAt(t, 1, 0); // sobre a parede horizontal
    clickAt(t, 1, -1); // lado da linha de cota
    const created = dims(ctx.store);
    expect(created).toHaveLength(3);
    expect(created.some((d) => (d.refs?.a as { feature?: string } | undefined)?.feature === 'wall-line' || (d.refs?.b as { feature?: string } | undefined)?.feature === 'wall-line')).toBe(true);
    const total = created.reduce((acc, d) => acc + dimensionValue(ctx.store.project, d), 0);
    expect(total).toBeGreaterThan(5.5);
    expect(dimensionPoints(ctx.store.project, created[0]!).a.x).toBeLessThan(0.2);
  });
});

describe('restrições de cota (trava, EQ, órfã)', () => {
  const setup = () => {
    const ctx = makeEnv();
    drawWall(ctx.env, [0, 0], [4, 0]);
    drawWall(ctx.env, [0, 3], [4, 3]);
    const t = tool('dimension', ctx.env);
    clickAt(t, 1.3, HALF + 0.001);
    clickAt(t, 2.6, 3 - HALF);
    clickAt(t, 5, 1.5);
    const lower = walls(ctx.store).find((w) => w.a.y === 0)!;
    const upper = walls(ctx.store).find((w) => w.a.y === 3)!;
    return { ctx, lower, upper, dim: () => dims(ctx.store)[0]! };
  };

  it('cota travada: mover uma parede arrasta a outra e mantém o valor', () => {
    const { ctx, lower, upper, dim } = setup();
    const v = dimensionValue(ctx.store.project, dim());
    ctx.store.exec({ type: 'updateDimension', levelId: 'lv_0', id: dim().id, patch: { locked: true, lockedValue: v } });
    ctx.store.exec({ type: 'setWallEnds', id: lower.id, a: { x: 0, y: -1 }, b: { x: 4, y: -1 } });
    expect(dimensionValue(ctx.store.project, dim())).toBeCloseTo(v, 3);
    const up = ctx.store.project.elements[upper.id] as { a: { y: number } };
    expect(up.a.y).toBeCloseTo(2, 3);
    ctx.store.undo();
    expect((ctx.store.project.elements[upper.id] as { a: { y: number } }).a.y).toBeCloseTo(3, 3);
  });

  it('cota destravada não restringe', () => {
    const { ctx, lower, upper } = setup();
    ctx.store.exec({ type: 'setWallEnds', id: lower.id, a: { x: 0, y: -1 }, b: { x: 4, y: -1 } });
    expect((ctx.store.project.elements[upper.id] as { a: { y: number } }).a.y).toBeCloseTo(3, 3);
  });

  it('apagar a parede referenciada remove a cota órfã (e desfaz junto)', () => {
    const { ctx, lower, dim } = setup();
    expect(dims(ctx.store)).toHaveLength(1);
    ctx.store.exec({ type: 'deleteElements', ids: [lower.id] });
    expect(dims(ctx.store)).toHaveLength(0);
    ctx.store.undo();
    expect(dims(ctx.store)).toHaveLength(1);
    expect(dim()).toBeDefined();
  });
});

describe('EQ de cadeia', () => {
  it('liga o EQ, redistribui o do meio e mantém iguais ao mover a ponta', () => {
    const ctx = makeEnv();
    ctx.options.dimensionString = 'continuous';
    ctx.options.dimensionMode = 'horizontal';
    for (const x of [0, 3, 10]) drawWall(ctx.env, [x, 0], [x, 4]);
    const t = tool('dimension', ctx.env);
    clickAt(t, 0, 2.2); // eixo da parede x=0
    clickAt(t, 3, 2.2);
    clickAt(t, 10, 2.2);
    t.confirm();
    clickAt(t, 5, -1);
    const created = dims(ctx.store);
    expect(created).toHaveLength(2);
    const chainId = created[0]!.chainId!;
    expect(chainId).toBeTruthy();
    const eq = eqChainCommands(ctx.store.project, chainId, true);
    ctx.store.transaction('EQ', () => { for (const c of eq) ctx.store.exec(c); });
    const vals = () => dims(ctx.store).map((d) => dimensionValue(ctx.store.project, d));
    const [a, b] = vals();
    expect(Math.abs(a! - b!)).toBeLessThan(0.002);
    const last = walls(ctx.store).find((w) => w.a.x === 10)!;
    ctx.store.exec({ type: 'setWallEnds', id: last.id, a: { x: 13, y: 0 }, b: { x: 13, y: 4 } });
    const [a2, b2] = vals();
    expect(Math.abs(a2! - b2!)).toBeLessThan(0.002);
    expect(a2! + b2!).toBeGreaterThan(a! + b! + 2.9);
  });
});
