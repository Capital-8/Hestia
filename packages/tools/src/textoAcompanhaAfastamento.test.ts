import { describe, expect, it } from 'vitest';
import { levelDimensions, type Command } from '@hestia/model';
import { textAtAcompanhando } from './annotationPick.ts';
import { makeEnv, P, tool } from './testEnv.ts';

/**
 * O texto puxado pelo usuário (`textAt`) acompanha o afastamento. Cota a=(0,0) b=(4,0): a normal esquerda de a→b é +y
 * (`leftNormal` = (-d.y, d.x)/|d| = (0, 1)), e `dimensionGeometry` põe a linha de cota em a + n·offset. Logo, ir de
 * offset 1 para 2 sobe o texto 1 m em y.
 */
describe('textAtAcompanhando (helper puro)', () => {
  const A = { x: 0, y: 0 };
  const B = { x: 4, y: 0 };
  const TEXTO = { x: 2.5, y: 1.2 };

  it('offset 1 -> 2 com textAt (2,5; 1,2): o texto sobe 1 e vai para (2,5; 2,2)', () => {
    const t = textAtAcompanhando(A, B, 1, 2, TEXTO)!;
    expect(t.x).toBeCloseTo(2.5, 9);
    expect(t.y).toBeCloseTo(2.2, 9);
  });

  it('offset 1 -> 0,5 desce o texto 0,5 e vai para (2,5; 0,7)', () => {
    const t = textAtAcompanhando(A, B, 1, 0.5, TEXTO)!;
    expect(t.x).toBeCloseTo(2.5, 9);
    expect(t.y).toBeCloseTo(0.7, 9);
  });

  it('offset 1 -> -1 atravessa a linha da cota (lado direito de a→b): delta -2 leva o texto a (2,5; -0,8)', () => {
    const t = textAtAcompanhando(A, B, 1, -1, TEXTO)!;
    expect(t.x).toBeCloseTo(2.5, 9);
    expect(t.y).toBeCloseTo(-0.8, 9);
  });

  it('offset igual => textAt igual (mesmos valores, objeto novo)', () => {
    const t = textAtAcompanhando(A, B, 1, 1, TEXTO);
    expect(t).toEqual({ x: 2.5, y: 1.2 });
    expect(t).not.toBe(TEXTO);
  });

  it('sem textAt => undefined (o texto já segue a linha de cota)', () => {
    expect(textAtAcompanhando(A, B, 1, 2, undefined)).toBeUndefined();
  });

  it('cota degenerada (a = b): normal (0, 1), como em dimensionGeometry; (2; 3) com 0 -> 1 vai para (2; 4)', () => {
    const t = textAtAcompanhando({ x: 1, y: 1 }, { x: 1, y: 1 }, 0, 1, { x: 2, y: 3 })!;
    expect(t.x).toBeCloseTo(2, 9);
    expect(t.y).toBeCloseTo(4, 9);
  });
});

/** Cena: cota (0,0)-(4,0) com afastamento 1 e o texto puxado para (2,5; 1,2), selecionada. */
function cena(extra: Record<string, unknown> = {}) {
  const ctx = makeEnv();
  ctx.store.exec({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'd1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1, ...extra } });
  ctx.env.setSelection(['d1']);
  const cmds: Command[] = [];
  const exec = ctx.env.exec;
  ctx.env.exec = (c) => { cmds.push(c); exec(c); };
  const t = tool('select', ctx.env);
  const dim = () => levelDimensions(ctx.store.project, 'lv_0')[0]!;
  return { ctx, t, cmds, dim };
}

describe('arrastar o afastamento: o texto puxado acompanha (planta)', () => {
  it('com textAt (2,5; 1,2): arrastar a linha de offset 1 para 2 grava offset e textAt (2,5; 2,2) num único comando', () => {
    const { t, cmds, dim } = cena({ textAt: { x: 2.5, y: 1.2 } });
    // Ponto da linha de cota (y = 1) no meio da cota, arrastado até y = 2.
    t.down!(P(2, 1));
    t.drag!(P(2, 1.5));
    t.drag!(P(2, 2));
    t.up!(P(2, 2));
    const upd = cmds.filter((c) => c.type === 'updateDimension') as Array<Extract<Command, { type: 'updateDimension' }>>;
    expect(upd).toHaveLength(1);
    expect(upd[0]!.patch.offset).toBeCloseTo(2, 9);
    expect(upd[0]!.patch.textAt!.x).toBeCloseTo(2.5, 9);
    expect(upd[0]!.patch.textAt!.y).toBeCloseTo(2.2, 9);
    expect(dim().offset).toBeCloseTo(2, 9);
    expect(dim().textAt!.y).toBeCloseTo(2.2, 9);
  });

  it('sem textAt: o patch leva só o offset (o texto já segue a linha)', () => {
    const { t, cmds, dim } = cena();
    t.down!(P(2, 1));
    t.drag!(P(2, 1.5));
    t.drag!(P(2, 2));
    t.up!(P(2, 2));
    const upd = cmds.filter((c) => c.type === 'updateDimension') as Array<Extract<Command, { type: 'updateDimension' }>>;
    expect(upd).toHaveLength(1);
    expect(upd[0]!.patch).toEqual({ offset: expect.any(Number) });
    expect(upd[0]!.patch.textAt).toBeUndefined();
    expect(dim().textAt).toBeUndefined();
  });
});
