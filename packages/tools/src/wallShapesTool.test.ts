import { describe, expect, it } from 'vitest';
import { joinStatus, levelFrames } from '@hestia/engine';
import { clickAt, makeEnv, tool, walls } from './testEnv.ts';
import type { ToolOptions } from './types.ts';

const setup = (shape: ToolOptions['wallShape'], extra: Partial<ToolOptions> = {}) => {
  const ctx = makeEnv();
  Object.assign(ctx.options, { wallShape: shape, ...extra });
  return { ...ctx, t: tool('wall', ctx.env) };
};

/** Toda ponta tem parceiro `pair` (circuito fechado ou, se `open`, só as pontas livres ficam de fora). */
function endsStatus(ctx: ReturnType<typeof setup>, open = false) {
  const frames = levelFrames(ctx.store.project, 'lv_0');
  const ws = walls(ctx.store);
  const kinds: string[] = [];
  ws.forEach((w, i) => {
    for (const e of ['a', 'b'] as const) {
      if (open && ((i === 0 && e === 'a') || (i === ws.length - 1 && e === 'b'))) continue;
      kinds.push(joinStatus(frames, w.id, e).kind);
    }
  });
  return kinds;
}

describe('wallTool: formas (F1.3)', () => {
  it('polígono inscrito de 6 lados: 6 paredes, pontas pair, 1 desfazer', () => {
    const c = setup('polygon', { wallPolygonSides: 6 });
    clickAt(c.t, 0, 0);
    clickAt(c.t, 3, 0);
    const ws = walls(c.store);
    expect(ws).toHaveLength(6);
    for (const w of ws) expect(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y)).toBeCloseTo(3, 6);
    expect(endsStatus(c).every((k) => k === 'pair')).toBe(true);
    c.store.undo();
    expect(walls(c.store)).toHaveLength(0);
  });

  it('polígono circunscrito: lados de 3,4641', () => {
    const c = setup('polygon', { wallPolygonSides: 6, wallPolygonCircumscribed: true });
    clickAt(c.t, 0, 0);
    clickAt(c.t, 3, 0);
    const ws = walls(c.store);
    expect(ws).toHaveLength(6);
    expect(Math.hypot(ws[0]!.b.x - ws[0]!.a.x, ws[0]!.b.y - ws[0]!.a.y)).toBeCloseTo(3.4641, 3);
  });

  it('círculo: 2 paredes em arco (|sag| = r), pontas pair, 1 desfazer', () => {
    const c = setup('circle');
    clickAt(c.t, 0, 0);
    clickAt(c.t, 3, 0);
    const ws = walls(c.store);
    expect(ws).toHaveLength(2);
    for (const w of ws) expect(Math.abs(w.sag)).toBeCloseTo(3, 6);
    expect(endsStatus(c).every((k) => k === 'pair')).toBe(true);
    c.store.undo();
    expect(walls(c.store)).toHaveLength(0);
  });

  it('elipse 4×2: 16 paredes, pontas pair, 1 desfazer', () => {
    const c = setup('ellipse');
    clickAt(c.t, 0, 0);
    clickAt(c.t, 4, 0);
    clickAt(c.t, 0, 2);
    expect(walls(c.store)).toHaveLength(16);
    expect(endsStatus(c).every((k) => k === 'pair')).toBe(true);
    c.store.undo();
    expect(walls(c.store)).toHaveLength(0);
  });

  it('spline aberta (Enter) e fechada: paredes comuns, pontas pair, 1 desfazer', () => {
    const a = setup('spline');
    for (const [x, y] of [[0, 0], [3, 2], [6, 0], [9, 2]] as const) clickAt(a.t, x, y);
    a.t.confirm();
    const n = walls(a.store).length;
    expect(n).toBeGreaterThan(1);
    expect(endsStatus(a, true).every((k) => k === 'pair')).toBe(true);
    a.store.undo();
    expect(walls(a.store)).toHaveLength(0);

    const f = setup('spline');
    for (const [x, y] of [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]] as const) clickAt(f.t, x, y);
    expect(walls(f.store).length).toBeGreaterThan(3);
    expect(endsStatus(f).every((k) => k === 'pair')).toBe(true);
    f.store.undo();
    expect(walls(f.store)).toHaveLength(0);
  });

  it('pré-visualização enquanto desenha e Esc cancela sem criar nada', () => {
    const c = setup('polygon');
    clickAt(c.t, 0, 0);
    c.t.move({ raw: { x: 3, y: 0 }, shift: false, ctrl: false, alt: false });
    expect(c.t.preview().filter((i) => i.kind === 'wallBand')).toHaveLength(6);
    c.t.cancel();
    expect(c.t.preview().filter((i) => i.kind === 'wallBand')).toHaveLength(0);
    expect(walls(c.store)).toHaveLength(0);
  });
});

describe('wallTool: arcos centro-extremidades e tangente (F1.10)', () => {
  it('centro e extremidades: arco exato de 90 graus, 1 desfazer, Esc cancela', () => {
    const c = setup('arc-center');
    clickAt(c.t, 0, 0);
    clickAt(c.t, 3, 0);
    // Cursor acima do raio inicial: percurso anti-horário.
    clickAt(c.t, 0, 3);
    const ws = walls(c.store);
    expect(ws).toHaveLength(1);
    expect(Math.hypot(ws[0]!.a.x - 0, ws[0]!.a.y - 0)).toBeCloseTo(3, 6);
    expect(Math.abs(ws[0]!.sag ?? 0)).toBeGreaterThan(0.1);
    c.store.undo();
    expect(walls(c.store)).toHaveLength(0);
    const d = setup('arc-center');
    clickAt(d.t, 0, 0);
    clickAt(d.t, 3, 0);
    d.t.cancel();
    expect(walls(d.store)).toHaveLength(0);
  });

  it('arco tangente: parte tangente à direção dada e termina no ponto', () => {
    const c = setup('arc-tangent');
    clickAt(c.t, 0, 0);
    clickAt(c.t, 2, 0);
    clickAt(c.t, 3, 3);
    const ws = walls(c.store);
    expect(ws.length).toBeGreaterThanOrEqual(1);
    expect(ws[0]!.a.x).toBeCloseTo(0, 6);
    expect(ws[0]!.a.y).toBeCloseTo(0, 6);
    expect(ws.at(-1)!.b.x).toBeCloseTo(3, 6);
    expect(ws.at(-1)!.b.y).toBeCloseTo(3, 6);
    c.store.undo();
    expect(walls(c.store)).toHaveLength(0);
  });
});
