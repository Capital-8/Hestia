import { describe, expect, it } from 'vitest';
import { slabRiseAt } from '@hestia/engine';
import { type Slab } from '@hestia/model';
import { defaultUnits } from '@hestia/model';
import { fmtPercent, slopeError, slopeFrom, slopePreview } from './slabSlope.ts';
import { commitPerimeter } from './perimeterCommit.ts';
import { addSegs, newDraft } from './perimeterSession.ts';
import { clickAt, makeEnv, P, tool } from './testEnv.ts';

/** Laje retangular 4 × 3 criada pelo modo de perímetro (esboço de quatro lados) e selecionada. */
function withSlab() {
  const ctx = makeEnv();
  const msgs: string[] = [];
  ctx.env.say = (m: string) => msgs.push(m);
  const r = commitPerimeter(ctx.store.project, addSegs(newDraft('slab'), [
    { a: { x: 0, y: 0 }, b: { x: 4, y: 0 } },
    { a: { x: 4, y: 0 }, b: { x: 4, y: 3 } },
    { a: { x: 4, y: 3 }, b: { x: 0, y: 3 } },
    { a: { x: 0, y: 3 }, b: { x: 0, y: 0 } },
  ]), { typeId: 'ls_mac12', levelId: 'lv_0' });
  if (!r.ok) throw new Error(r.message);
  for (const c of r.commands) ctx.store.exec(c);
  const s = ctx.store.project.elements[r.id] as Slab;
  ctx.env.setSelection([s.id]);
  return { ...ctx, msgs, slab: () => ctx.store.project.elements[s.id] as Slab };
}

describe('inclinação: funções puras (A5, G1)', () => {
  it('rótulo do percentual usa vírgula e uma casa', () => {
    expect(fmtPercent(defaultUnits(), 5)).toBe('5,0%');
    expect(fmtPercent(defaultUnits(), 2.25)).toBe('2,3%');
  });

  it('erro para percentual não finito ou acima de 100 %', () => {
    expect(slopeError(Number.NaN)).not.toBeNull();
    expect(slopeError(150)).not.toBeNull();
    expect(slopeError(-100)).toBeNull();
    expect(slopeError(2)).toBeNull();
  });

  it('inclinação por dois pontos normaliza a direção e recusa pontos coincidentes', () => {
    const s = slopeFrom({ x: 0, y: 0 }, { x: 3, y: 4 }, 5);
    expect(s?.origin).toEqual({ x: 0, y: 0 });
    expect(s?.dir.x).toBeCloseTo(0.6);
    expect(s?.dir.y).toBeCloseTo(0.8);
    expect(slopeFrom({ x: 1, y: 1 }, { x: 1, y: 1 }, 5)).toBeNull();
  });

  it('prévia: seta tracejada com o rótulo do percentual', () => {
    const items = slopePreview({ origin: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, percent: 5 }, 2);
    expect(items[0]).toMatchObject({ kind: 'line', dashed: true });
    expect(items.some((i) => i.kind === 'label' && i.text === '5,0%')).toBe(true);
  });

  it('cota da face superior cresce com a distância da origem ao longo da direção (engine)', () => {
    const slope = { origin: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, percent: 5 };
    expect(slabRiseAt(slope, { x: 4, y: 9 })).toBeCloseTo(0.2);
    expect(slabRiseAt(null, { x: 4, y: 9 })).toBe(0);
  });
});

describe('ferramenta Definir inclinação (A5, A6)', () => {
  it('dois cliques definem origem e direção; o percentual vem da barra e é aplicado com Enter', () => {
    const ctx = withSlab();
    ctx.options.slabSlopePercent = 2;
    const t = tool('slope', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 4, 0);
    expect(t.inputPrompt()).toBe('Percentual (%)');
    t.confirm();
    const s = ctx.slab();
    expect(s.slope?.percent).toBe(2);
    expect(s.slope?.origin).toEqual({ x: 0, y: 0 });
    expect(s.slope?.dir.x).toBeCloseTo(1);
    expect(s.slope?.dir.y).toBeCloseTo(0);
  });

  it('percentual digitado depois dos cliques substitui o da barra', () => {
    const ctx = withSlab();
    const t = tool('slope', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 0, 3);
    expect(t.type('2,5')).toBe(true);
    expect(ctx.slab().slope?.percent).toBeCloseTo(2.5);
    expect(ctx.slab().slope?.dir.y).toBeCloseTo(1);
  });

  it('texto que não é número não aplica nada', () => {
    const ctx = withSlab();
    const t = tool('slope', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 4, 0);
    expect(t.type('abc')).toBe(false);
    expect(ctx.slab().slope).toBeNull();
    expect(ctx.msgs.some((m) => m.startsWith('Valor inválido'))).toBe(true);
  });

  it('percentual acima do limite é recusado', () => {
    const ctx = withSlab();
    const t = tool('slope', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 4, 0);
    expect(t.type('150')).toBe(false);
    expect(ctx.slab().slope).toBeNull();
  });

  it('segundo clique no mesmo ponto da origem não define direção', () => {
    const ctx = withSlab();
    const t = tool('slope', ctx.env);
    clickAt(t, 1, 1);
    clickAt(t, 1, 1);
    expect(t.inputPrompt()).not.toBe('Percentual (%)');
    expect(ctx.msgs).toContain('Direção inválida: clique em outro ponto.');
  });

  it('sem laje selecionada a ferramenta não grava nada', () => {
    const ctx = withSlab();
    ctx.env.setSelection([]);
    const t = tool('slope', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 4, 0);
    expect(ctx.slab().slope).toBeNull();
    expect(ctx.msgs).toContain('Selecione uma laje primeiro.');
  });

  it('Esc cancela a etapa em andamento antes de sair da ferramenta', () => {
    const ctx = withSlab();
    const t = tool('slope', ctx.env);
    clickAt(t, 0, 0);
    clickAt(t, 4, 0);
    t.cancel();
    expect(t.inputPrompt()).toBeNull();
    expect(ctx.done()).toBe(0);
    t.cancel();
    expect(ctx.done()).toBe(1);
  });

  it('o campo de movimento do cursor entra como prévia e não altera a laje', () => {
    const ctx = withSlab();
    const t = tool('slope', ctx.env);
    t.move(P(0, 0));
    clickAt(t, 0, 0);
    t.move(P(4, 1));
    expect(t.preview().some((i) => i.kind === 'line')).toBe(true);
    expect(ctx.slab().slope).toBeNull();
  });
});
