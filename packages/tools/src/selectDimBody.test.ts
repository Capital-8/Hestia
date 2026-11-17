import { describe, expect, it } from 'vitest';
import { levelDimensions, type Command } from '@hestia/model';
import { dimHitGeometry } from './annotationPick.ts';
import { makeEnv, P, tool } from './testEnv.ts';

/**
 * Arrastar a cota pelo corpo (planta): só com a cota JÁ selecionada. Cota (0,0)-(4,0), afastamento 0,5: a linha de
 * cota fica em y = 0,5 e a normal à esquerda de a→b é +y, então o `signedOffset` de um ponto é o próprio y.
 */
function cena(extra: Record<string, unknown> = {}, selecionada = true) {
  const ctx = makeEnv();
  ctx.store.exec({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'd1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 0.5, ...extra } });
  if (selecionada) ctx.env.setSelection(['d1']);
  const cmds: Command[] = [];
  const exec = ctx.env.exec;
  ctx.env.exec = (c) => { cmds.push(c); exec(c); };
  const t = tool('select', ctx.env);
  const dim = () => levelDimensions(ctx.store.project, 'lv_0')[0]!;
  const textAt = dimHitGeometry(ctx.store.project, dim(), { x: 0, y: 0 }, { x: 4, y: 0 }, 100).textAt;
  return { ctx, t, cmds, dim, textAt };
}
const arrasta = (t: ReturnType<typeof tool>, de: [number, number], para: [number, number]): void => {
  t.down!(P(de[0], de[1]));
  t.drag!(P((de[0] + para[0]) / 2, (de[1] + para[1]) / 2));
  t.drag!(P(para[0], para[1]));
  t.up!(P(para[0], para[1]));
};
const atualizacoes = (cmds: Command[]) => cmds.filter((c) => c.type === 'updateDimension') as Array<Extract<Command, { type: 'updateDimension' }>>;

describe('arrastar cota pelo corpo (planta)', () => {
  it('(a) selecionada: arrasto da linha de cota (0,5) a (0,5)->(0,5;1,2) gera um updateDimension offset 1,2', () => {
    const { t, cmds, dim, textAt } = cena();
    expect(Math.abs(textAt.x - 0.5)).toBeGreaterThan(0.5); // o ponto de partida não é o texto
    arrasta(t, [0.5, 0.5], [0.5, 1.2]);
    const u = atualizacoes(cmds);
    expect(u).toHaveLength(1);
    expect(u[0]!.id).toBe('d1');
    expect(u[0]!.patch.offset).toBeCloseTo(1.2, 9);
    expect(dim().offset).toBeCloseTo(1.2, 9);
    expect(dim().textAt).toBeUndefined();
  });

  it('(a2) selecionada: arrasto pelo meio da linha (2;0,5)->(2;1,2) também dá offset 1,2', () => {
    const { t, cmds, textAt } = cena();
    // O meio da linha (2;0,5) é a alça do afastamento; se o texto estiver ali, a alça do texto é que vence (comportamento antigo).
    if (Math.hypot(textAt.x - 2, textAt.y - 0.5) <= 0.12) return;
    arrasta(t, [2, 0.5], [2, 1.2]);
    expect(atualizacoes(cmds)[0]!.patch.offset).toBeCloseTo(1.2, 9);
  });

  it('(a3) selecionada: arrasto de uma linha de chamada (extensão) muda o afastamento', () => {
    const { t, cmds } = cena();
    // Extensão em x=0, de y=0 até y=0,5 (mais folga): ponto (0; 0,25).
    arrasta(t, [0, 0.25], [0, -0.8]);
    expect(atualizacoes(cmds)[0]!.patch.offset).toBeCloseTo(-0.8, 9);
  });

  it('(b) clique sem mover não gera comando', () => {
    const { t, cmds } = cena();
    t.down!(P(0.5, 0.5));
    t.up!(P(0.5, 0.5));
    expect(cmds).toHaveLength(0);
  });

  it('(b2) tremor de 2 px (menos que a folga de 4 px) sobre o corpo não gera comando', () => {
    const { t, cmds } = cena();
    t.down!(P(0.5, 0.5));
    t.drag!(P(0.5, 0.52));
    t.up!(P(0.5, 0.52));
    expect(cmds).toHaveLength(0);
  });

  it('(c) cota NÃO selecionada: pressionar e arrastar sobre ela não altera o offset', () => {
    const { t, cmds, dim } = cena({}, false);
    arrasta(t, [0.5, 0.5], [0.5, 1.2]);
    expect(atualizacoes(cmds)).toHaveLength(0);
    expect(dim().offset).toBe(0.5);
  });

  it('(d) cota travada (locked) não arrasta pelo corpo', () => {
    const { t, cmds, dim } = cena({ locked: true });
    arrasta(t, [0.5, 0.5], [0.5, 1.2]);
    expect(atualizacoes(cmds)).toHaveLength(0);
    expect(dim().offset).toBe(0.5);
  });

  it('(e) arrasto sobre o texto altera textAt, não o offset', () => {
    const { t, cmds, dim, textAt } = cena();
    arrasta(t, [textAt.x + 0.03, textAt.y], [3, 2]);
    const u = atualizacoes(cmds);
    expect(u).toHaveLength(1);
    expect(u[0]!.patch.offset).toBeUndefined();
    expect(u[0]!.patch.textAt).toEqual({ x: 3, y: 2 });
    expect(dim().offset).toBe(0.5);
  });
});
