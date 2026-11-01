import { describe, expect, it } from 'vitest';
import { makeFloor, type Floor, type Wall } from '@hestia/model';
import { OUTLINE_LOCKED_MSG } from './outlineEdit.ts';
import { clickAt, drawWall, makeEnv, tool, walls } from './testEnv.ts';

/** Retângulo 4 × 3 (contorno anti-horário): aresta 0 é a de baixo (y = 0), aresta 2 a de cima (y = 3). */
const OUTER = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];

function floorCtx(linked = false) {
  const ctx = makeEnv();
  ctx.store.exec({
    type: 'addFloor',
    floor: makeFloor({
      id: 'f',
      typeId: 'ft_ceram',
      levelId: 'lv_0',
      boundary: OUTER,
      ...(linked ? { outlineSource: { mode: 'walls-finish', seed: { x: 2, y: 1.5 }, linked: true } } : {}),
    }),
  });
  const msgs: string[] = [];
  ctx.env.say = (m: string) => msgs.push(m);
  return { ...ctx, msgs };
}

const floorOf = (ctx: ReturnType<typeof floorCtx>): Floor => ctx.store.project.elements['f'] as Floor;

describe('deslocar aresta de piso (Deslocar)', () => {
  it('a aresta de baixo deslocada 0,5 m para fora (y negativo) vai para y = -0,5', () => {
    const ctx = floorCtx();
    ctx.options.offsetDistance = 0.5;
    ctx.options.offsetCopy = false;
    const off = tool('offset', ctx.env);
    // Cursor logo abaixo da aresta (y < 0): fica do lado de fora, a direita de 0→4.
    clickAt(off, 2, -0.02);
    const b = floorOf(ctx).boundary;
    expect(b[0]!.y).toBeCloseTo(-0.5);
    expect(b[1]!.y).toBeCloseTo(-0.5);
    expect(b[0]!.x).toBeCloseTo(0);
    expect(b[1]!.x).toBeCloseTo(4);
    // A aresta de cima não muda.
    expect(b[2]!.y).toBeCloseTo(3);
    expect(b[3]!.y).toBeCloseTo(3);
  });

  it('cursor do lado de dentro (y positivo) desloca para dentro', () => {
    const ctx = floorCtx();
    ctx.options.offsetDistance = 0.5;
    ctx.options.offsetCopy = false;
    const off = tool('offset', ctx.env);
    clickAt(off, 2, 0.02);
    expect(floorOf(ctx).boundary[0]!.y).toBeCloseTo(0.5);
  });

  it('com a opção Copiar ligada avisa e não grava', () => {
    const ctx = floorCtx();
    ctx.options.offsetCopy = true;
    const off = tool('offset', ctx.env);
    clickAt(off, 2, -0.02);
    expect(ctx.msgs).toContain('Deslocar aresta com cópia: não permitido. A cópia sobreporia a linha ou deixaria o croqui aberto (como no Revit).');
    expect(floorOf(ctx).boundary[0]!.y).toBeCloseTo(0);
  });

  it('aresta vinculada às paredes fica travada: nada gravado e mensagem de contorno travado', () => {
    const ctx = floorCtx(true);
    ctx.options.offsetCopy = false;
    const off = tool('offset', ctx.env);
    clickAt(off, 2, -0.02);
    expect(ctx.msgs).toContain(OUTLINE_LOCKED_MSG);
    expect(floorOf(ctx).boundary).toEqual(OUTER);
  });
});

describe('mover aresta de piso (Mover sem seleção)', () => {
  it('clique base e destino na aresta do topo desloca os dois vértices em (0, 1)', () => {
    const ctx = floorCtx();
    const m = tool('move', ctx.env);
    clickAt(m, 2, 3); // base: aresta de cima
    clickAt(m, 2, 4); // destino: 1 m acima
    const b = floorOf(ctx).boundary;
    expect(b[2]!.x).toBeCloseTo(4);
    expect(b[2]!.y).toBeCloseTo(4);
    expect(b[3]!.x).toBeCloseTo(0);
    expect(b[3]!.y).toBeCloseTo(4);
    expect(b[0]).toEqual(OUTER[0]);
    expect(b[1]).toEqual(OUTER[1]);
  });

  it('aresta vinculada travada: nada gravado e mensagem de contorno travado', () => {
    const ctx = floorCtx(true);
    const m = tool('move', ctx.env);
    clickAt(m, 2, 3);
    clickAt(m, 2, 4);
    expect(ctx.msgs).toContain(OUTLINE_LOCKED_MSG);
    expect(floorOf(ctx).boundary).toEqual(OUTER);
  });

  it('Copiar aresta avisa e não grava', () => {
    const ctx = floorCtx();
    const c = tool('copy', ctx.env);
    clickAt(c, 2, 3);
    clickAt(c, 2, 4);
    expect(ctx.msgs).toContain('Copiar aresta: não permitido. A cópia sobreporia a linha ou deixaria o croqui aberto (como no Revit).');
    expect(floorOf(ctx).boundary).toEqual(OUTER);
  });
});

describe('regressão: parede continua deslocando', () => {
  it('deslocar uma parede sem aresta por perto move a parede (não copia) pela distância', () => {
    const ctx = makeEnv();
    drawWall(ctx.env, [0, 0], [4, 0]);
    ctx.options.offsetCopy = false;
    ctx.options.offsetDistance = 1;
    const off = tool('offset', ctx.env);
    // Cursor na faixa da parede: a tolerância do Deslocar é de cursor (5 px), não de metros.
    clickAt(off, 2, 0.02);
    const ws = walls(ctx.store);
    expect(ws).toHaveLength(1);
    const w = ws[0] as Wall;
    expect(Math.abs(w.a.y)).toBeCloseTo(1);
    expect(Math.abs(w.b.y)).toBeCloseTo(1);
  });
});
