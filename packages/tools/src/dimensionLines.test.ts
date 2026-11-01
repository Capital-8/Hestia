import { describe, expect, it } from 'vitest';
import { dimensionPoints, dimensionValue, levelDimensions, type Project } from '@hestia/model';
import { drivenEditCommands } from './dims/driven.ts';
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
