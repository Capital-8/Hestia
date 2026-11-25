import { describe, expect, it } from 'vitest';
import { pointInMulti } from '@hestia/geom';
import { resolveLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, type Project } from '@hestia/model';
import { buildPlanDrawList, type PlanInput } from './build.ts';
import { hexToRgb } from './color.ts';
import { defaultPaint, surfaceColor } from './style.ts';
import { LIGHT, type FillOp } from './types.ts';
import type { Viewport } from '../viewport.ts';

const VIEWPORT: Viewport = { cx: 1.5, cy: 0, zoom: 100, width: 800, height: 600 };
const PAPER = '#ffffff';

const paint = (over: Partial<ReturnType<typeof defaultPaint>> = {}): ReturnType<typeof defaultPaint> => ({ ...defaultPaint('wall', 100), ...over });

function parede(estiloPrancha?: boolean): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, height: 2.8 }) });
  s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { style: 'hiddenLine', detail: 'medium', ...(estiloPrancha === undefined ? {} : { estiloPrancha }) } });
  return s.project;
}

function draw(p: Project) {
  const input: PlanInput = {
    project: p,
    levelId: 'lv_0',
    resolved: resolveLevel(p, 'lv_0', new Map()),
    below: null,
    viewport: VIEWPORT,
    theme: LIGHT,
    dark: false,
    selection: [],
    hover: null,
    preview: [],
    inference: null,
    showGrid: false,
  };
  return buildPlanDrawList(input);
}

const superficie = (dl: ReturnType<typeof draw>, x: number, y: number): FillOp | undefined =>
  dl.fills.find((f) => !f.contour && pointInMulti({ x, y }, f.polygons));

describe('surfaceColor no estilo de prancha', () => {
  it('linha oculta com prancha: devolve o papel, seja qual for a cor do material e o tom', () => {
    const pt = paint({ visual: 'hiddenLine', prancha: true });
    expect(surfaceColor('#336699', PAPER, 0.58, pt)).toBe(PAPER);
    expect(surfaceColor('#ff0000', PAPER, 0, pt)).toBe(PAPER);
    expect(surfaceColor('#000000', PAPER, 1, pt)).toBe(PAPER);
  });

  it('prancha desligada: mesmo valor misturado de antes', () => {
    const pt = paint({ visual: 'hiddenLine', prancha: false });
    expect(surfaceColor('#336699', PAPER, 0.58, pt)).toBe('#a9bfd4');
    expect(surfaceColor('#336699', PAPER, 0.58, paint({ visual: 'wireframe', prancha: true }))).toBe('#a9bfd4');
  });

  it('sombreado: a cor do material, não o papel, mesmo com prancha ligada', () => {
    const pt = paint({ visual: 'shaded', prancha: true });
    expect(surfaceColor('#336699', PAPER, 0.58, pt)).toBe('#336699');
  });
});

describe('planta em estilo de prancha (linha oculta)', () => {
  it('superfícies no papel e hachura cinza neutra', () => {
    const dl = draw(parede(true));
    const fill = superficie(dl, 1.5, 0)!;
    expect(fill.color).toBe(PAPER);
    for (const f of dl.fills.filter((x) => !x.contour)) expect(f.color).toBe(PAPER);
    const comHachura = dl.fills.filter((f) => !f.contour && f.hatch);
    expect(comHachura.length).toBeGreaterThan(0);
    for (const f of comHachura) {
      expect(f.hatch!.color).toBe('#454649');
      const [r, g, b] = hexToRgb(f.hatch!.color);
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(8);
    }
  });

  it('o campo antigo é ignorado: com ou sem ele, a linha oculta dá papel e hachura cinza', () => {
    for (const p of [parede(), parede(false), parede(true)]) {
      const dl = draw(p);
      expect(superficie(dl, 1.5, 0)!.color).toBe(PAPER);
      const comHachura = dl.fills.filter((f) => !f.contour && f.hatch);
      expect(comHachura.length).toBeGreaterThan(0);
      for (const f of comHachura) expect(f.hatch!.color).toBe('#454649');
    }
  });

  it('sombreado mantém as cores de material (o papel não entra)', () => {
    const s = new ProjectStore(parede());
    s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { style: 'shaded' } });
    const dl = draw(s.project);
    expect(superficie(dl, 1.5, 0)!.color).toBe('#c0693f');
    const comHachura = dl.fills.filter((f) => !f.contour && f.hatch);
    expect(comHachura.length).toBeGreaterThan(0);
    expect(comHachura[0]!.hatch!.color).toBe('#6a3a23');
  });
});
