import { describe, expect, it } from 'vitest';
import { defaultStairTypeId, makeStair, type StairCurve, type StairRun } from '@hestia/model';
import { SelectTool } from './selectTool.ts';
import { P, makeEnv, tool } from './testEnv.ts';
import type { ToolId } from './registry.ts';

const ln = (ax: number, ay: number, bx: number, by: number): StairCurve => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sag: 0 });

const run: StairRun = {
  id: 'r1',
  kind: 'run',
  boundaryLeft: [ln(0, 0, 0, 4)],
  boundaryRight: [ln(1, 0, 1, 4)],
  risers: [ln(0, 0, 1, 0), ln(0, 2, 1, 2), ln(0, 4, 1, 4)],
  path: [],
};

function ctxWithSelectedStair() {
  const ctx = makeEnv();
  ctx.store.exec({ type: 'addStair', stair: makeStair({ id: 'st', typeId: defaultStairTypeId, levelId: 'lv_0', components: [run] }) });
  ctx.env.setSelection(['st']);
  return ctx;
}

const ids: ToolId[] = ['move', 'copy', 'rotate', 'mirror', 'array'];

describe('snap nos vértices do próprio elemento selecionado (escada)', () => {
  for (const id of ids) {
    it(`${id}: o vértice da escada selecionada captura como endpoint`, () => {
      const ctx = ctxWithSelectedStair();
      const t = tool(id, ctx.env);
      t.move(P(0, 0));
      expect(t.inference()?.kind).toBe('endpoint');
      expect(t.inference()?.hostId).toBe('st');
    });
  }

  it('Mover: o destino também captura um vértice da própria escada', () => {
    const ctx = ctxWithSelectedStair();
    const t = tool('move', ctx.env);
    t.click(P(0, 0)); // ponto-base
    t.move(P(1, 2));
    expect(t.inference()?.kind).toBe('endpoint');
    expect(t.inference()?.hostId).toBe('st');
  });

  it('Selecionar + arrastar: o vértice da escada também captura', () => {
    const ctx = ctxWithSelectedStair();
    const t = new SelectTool(ctx.env);
    t.start();
    t.down(P(0.5, 2));
    t.drag(P(0, 0));
    expect(t.inference()?.kind).toBe('endpoint');
    expect(t.inference()?.hostId).toBe('st');
  });
});
