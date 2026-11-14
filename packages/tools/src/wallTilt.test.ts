import { describe, expect, it } from 'vitest';
import { clickAt, makeEnv, tool, walls } from './testEnv.ts';
import type { ToolOptions } from './types.ts';

/** Ferramenta Parede com a forma e a inclinação da opção (a inclinação é a opção `wallTilt` da barra/Propriedades). */
const setup = (shape: ToolOptions['wallShape'], extra: Partial<ToolOptions> = {}) => {
  const ctx = makeEnv();
  Object.assign(ctx.options, { wallShape: shape, ...extra });
  return { ...ctx, t: tool('wall', ctx.env) };
};

describe('wallTool: inclinação da opção ao desenhar (F2.10)', () => {
  it('parede reta nasce com a inclinação da opção', () => {
    const c = setup('line', { wallTilt: 15 });
    clickAt(c.t, 0, 0);
    clickAt(c.t, 4, 0);
    expect(walls(c.store).map((w) => w.tilt)).toEqual([15]);
  });

  it('sem a opção (ou 0) a parede segue vertical: o campo tilt não é gravado', () => {
    const c = setup('line');
    clickAt(c.t, 0, 0);
    clickAt(c.t, 4, 0);
    expect(walls(c.store)[0]!.tilt).toBeUndefined();
    const z = setup('line', { wallTilt: 0 });
    clickAt(z.t, 0, 0);
    clickAt(z.t, 4, 0);
    expect(walls(z.store)[0]!.tilt).toBeUndefined();
  });

  it('polígono: as 6 paredes da forma levam a inclinação (negativa também) e saem num desfazer', () => {
    const c = setup('polygon', { wallPolygonSides: 6, wallTilt: -20 });
    clickAt(c.t, 0, 0);
    clickAt(c.t, 3, 0);
    const ws = walls(c.store);
    expect(ws).toHaveLength(6);
    expect(ws.every((w) => w.tilt === -20)).toBe(true);
    c.store.undo();
    expect(walls(c.store)).toHaveLength(0);
  });

  it('cadeia inclinada: todas as paredes da cadeia saem num só desfazer', () => {
    const c = setup('line', { wallTilt: 10 });
    clickAt(c.t, 0, 0);
    clickAt(c.t, 4, 0);
    clickAt(c.t, 4, 3);
    clickAt(c.t, 0, 3);
    expect(walls(c.store)).toHaveLength(3);
    expect(walls(c.store).every((w) => w.tilt === 10)).toBe(true);
    c.store.undo();
    expect(walls(c.store)).toHaveLength(0);
  });

  it('cadeia reta (sem inclinação) é um só desfazer (F2.11); uma nova cadeia é outro desfazer', () => {
    const c = setup('line');
    clickAt(c.t, 0, 0);
    clickAt(c.t, 4, 0);
    clickAt(c.t, 4, 3);
    clickAt(c.t, 0, 3);
    expect(walls(c.store)).toHaveLength(3);
    c.t.cancel();
    clickAt(c.t, 10, 10);
    clickAt(c.t, 14, 10);
    expect(walls(c.store)).toHaveLength(4);
    c.store.undo();
    expect(walls(c.store)).toHaveLength(3);
    c.store.undo();
    expect(walls(c.store)).toHaveLength(0);
  });

  it('recusa: arco de 3 pontos que se fecha para o centro com -60° não cria a parede; o lado oposto (+60°) cria', () => {
    const recusado = setup('arc', { wallTilt: -60 });
    clickAt(recusado.t, 0, 0);
    clickAt(recusado.t, 4, 0);
    clickAt(recusado.t, 2, 1);
    expect(walls(recusado.store)).toHaveLength(0);
    const aceito = setup('arc', { wallTilt: 60 });
    clickAt(aceito.t, 0, 0);
    clickAt(aceito.t, 4, 0);
    clickAt(aceito.t, 2, 1);
    expect(walls(aceito.store).map((w) => w.tilt)).toEqual([60]);
  });
});
