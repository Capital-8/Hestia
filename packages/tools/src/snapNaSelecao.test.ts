import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { P, drawWall, makeEnv, tool, walls } from './testEnv.ts';

/**
 * Ferramentas do Modificar com a seleção como alvo de captura.
 *
 * Regra: o ponto de referência (base, centro, eixo) enxerga a própria seleção — é como se pega o canto da parede
 * que vai ser movida, girada ou espelhada. O ponto de destino continua ignorando o que se move, para o fantasma
 * não colar na geometria de origem.
 */

type Ctx = ReturnType<typeof makeEnv>;

/** Parede (0,0)-(6,0) desenhada pela ferramenta e selecionada. */
function cena(): { ctx: Ctx; a: Vec2; b: Vec2 } {
  const ctx = makeEnv();
  drawWall(ctx.env, [0, 0], [6, 0]);
  const w = walls(ctx.store)[0]!;
  ctx.env.setSelection([w.id]);
  return { ctx, a: w.a, b: w.b };
}

const perto = (p: Vec2, dx = 0.02, dy = 0.02) => P(p.x + dx, p.y + dy);

describe('captura na própria seleção', () => {
  it('Mover: o ponto-base pega o canto da parede selecionada', () => {
    const { ctx, a } = cena();
    const t = tool('move', ctx.env);

    t.move(perto(a));

    const inf = t.inference()!;
    expect(inf.kind).toBe('endpoint');
    expect(inf.point.x).toBeCloseTo(a.x, 9);
    expect(inf.point.y).toBeCloseTo(a.y, 9);
  });

  it('Mover: o destino continua ignorando o que se move (não gruda na parede de origem)', () => {
    const { ctx, b } = cena();
    const t = tool('move', ctx.env);
    // Base no vazio, longe da parede: a captura do destino não tem ortho nem alinhamento por perto.
    t.click(P(3, 2));

    t.move(P(b.x - 0.02, b.y + 0.08));

    const inf = t.inference()!;
    expect(inf.kind).not.toBe('endpoint');
    expect(Math.hypot(inf.point.x - b.x, inf.point.y - b.y)).toBeGreaterThan(1e-6);
  });

  it('Rotacionar: o centro pega o canto da parede selecionada', () => {
    const { ctx, b } = cena();
    const t = tool('rotate', ctx.env);

    t.move(perto(b));

    const inf = t.inference()!;
    expect(inf.kind).toBe('endpoint');
    expect(inf.point.x).toBeCloseTo(b.x, 9);
    expect(inf.point.y).toBeCloseTo(b.y, 9);
  });

  it('Espelhar: os dois pontos do eixo pegam cantos da parede selecionada', () => {
    const { ctx, a, b } = cena();
    const t = tool('mirror', ctx.env);

    t.click(perto(a));
    t.move(perto(b, -0.02, 0.02));

    const inf = t.inference()!;
    expect(inf.kind).toBe('endpoint');
    expect(inf.point.x).toBeCloseTo(b.x, 9);
    expect(inf.point.y).toBeCloseTo(b.y, 9);
  });

  it('Matriz: o ponto-base pega o canto da parede selecionada', () => {
    const { ctx, a } = cena();
    const t = tool('array', ctx.env);

    t.move(perto(a));

    const inf = t.inference()!;
    expect(inf.kind).toBe('endpoint');
    expect(inf.point.x).toBeCloseTo(a.x, 9);
    expect(inf.point.y).toBeCloseTo(a.y, 9);
  });
});
