import { describe, expect, it } from 'vitest';
import type { SketchSeg, Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Wall } from '@hestia/model';
import { PerimeterTool } from './perimeterTool.ts';
import { perimeterFromBox } from './sketchByPerimeter.ts';
import { faceAt, faceSegments } from './sketchPickFace.ts';
import type { SketchCtx } from './sketchPickFaceGeom.ts';
import { clickAt, makeEnv, P } from './testEnv.ts';

/**
 * T-E: contorno de telhado/forro no TOPO da parede. Retângulo 6 x 4 (sentido horário: a face externa fica à esquerda de
 * a→b), parede t = 0,2, H = 3. Literais à mão (tan15° = 0,2679491924; 1/cos15° = 1,0352761804):
 * base: faces externas a 0,1 m do eixo; topo a 15° para fora: 0,8038476 + 0,2/2·... = 0,9073752 m do eixo.
 */
const EXT_TOP = 0.9073751953;
const camada = (thick: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: thick, wraps: false });
const RECT: Vec2[] = [{ x: 0, y: 0 }, { x: 0, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 0 }];

function build(tilt: number) {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada(0.2)] };
  const store = new ProjectStore(base);
  const j = { kind: 'miter' as const, flip: false };
  RECT.forEach((a, i) => store.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_t', levelId: 'lv_0', height: 3, a, b: RECT[(i + 1) % 4]!, ...(tilt ? { tilt } : {}), joinStart: j, joinEnd: j }) as Wall }));
  return store;
}
const ctxOf = (s: ProjectStore): SketchCtx => ({ project: () => s.project, levelId: () => 'lv_0' });
const bbox = (segs: SketchSeg[]) => {
  const xs = segs.flatMap((g) => [g.a.x, g.b.x]);
  const ys = segs.flatMap((g) => [g.a.y, g.b.y]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};
const BOX = [{ x: -3, y: -3 }, { x: 9, y: 7 }] as const;

describe('T-E: por perímetro no topo', () => {
  it('tilt 15 para fora: topo gera o retângulo de -0,9073752 a 6,9073752; a base, de -0,1 a 6,1', () => {
    const ctx = ctxOf(build(15));
    const top = bbox(perimeterFromBox(ctx, BOX[0], BOX[1], { top: true }).segs);
    expect(top.x0).toBeCloseTo(-EXT_TOP, 6);
    expect(top.x1).toBeCloseTo(6 + EXT_TOP, 6);
    expect(top.y0).toBeCloseTo(-EXT_TOP, 6);
    expect(top.y1).toBeCloseTo(4 + EXT_TOP, 6);
    const base = bbox(perimeterFromBox(ctx, BOX[0], BOX[1]).segs);
    expect(base.x0).toBeCloseTo(-0.1, 6);
    expect(base.y1).toBeCloseTo(4.1, 6);
    expect(perimeterFromBox(ctx, BOX[0], BOX[1], { top: true }).segs).toHaveLength(4);
  });
  it('parede vertical: topo e base geram o mesmo contorno', () => {
    const ctx = ctxOf(build(0));
    const a = perimeterFromBox(ctx, BOX[0], BOX[1], { top: true }).segs.map(({ id: _i, ...g }) => g);
    const b = perimeterFromBox(ctx, BOX[0], BOX[1]).segs.map(({ id: _i, ...g }) => g);
    expect(a).toEqual(b);
    expect(bbox(b.map((g) => ({ id: 'x', ...g }))).x1).toBeCloseTo(6.1, 6);
  });
});

describe('T-E: escolher face no topo', () => {
  it('telhado: a face externa clicada é a do topo (y = -0,9073752); Tab alterna para a da base (y = -0,1)', () => {
    const s = build(15);
    const ctx = ctxOf(s);
    const p = { x: 3, y: -0.95 };
    const c0 = faceAt(ctx, p, 0.5, 0, { topDefault: true })!;
    expect(c0.kind).toBe('topFace');
    expect(c0.which).toBe('extTop');
    expect(c0.label).toMatch(/Face superior/);
    expect(c0.seg.a.y).toBeCloseTo(-EXT_TOP, 6);
    expect(c0.seg.b.y).toBeCloseTo(-EXT_TOP, 6);
    const c1 = faceAt(ctx, p, 0.5, 1, { topDefault: true })!;
    expect(c1.which).toBe('ext');
    expect(c1.seg.a.y).toBeCloseTo(-0.1, 6);
    expect(faceSegments(ctx, 'w3', 'extTop')[0]!.a.y).toBeCloseTo(-EXT_TOP, 6);
  });
  it('piso e laje: a face da base vem primeiro', () => {
    const ctx = ctxOf(build(15));
    const c = faceAt(ctx, { x: 3, y: -0.15 }, 0.5, 0, { topDefault: false })!;
    expect(c.which).toBe('ext');
    expect(c.seg.a.y).toBeCloseTo(-0.1, 6);
  });
  it('parede vertical: sem variante de topo, nenhum candidato extra', () => {
    const ctx = ctxOf(build(0));
    const c = faceAt(ctx, { x: 3, y: -0.1 }, 0.05, 0, { topDefault: true })!;
    expect(c.kind).toBe('face');
    expect(faceSegments(ctx, 'w3', 'extTop')).toEqual([]);
  });
});

describe('T-E: ferramenta Perímetro (telhado, piso, Tab e desfazer)', () => {
  function tool(target: 'roof' | 'floor', tilt: number) {
    const e = makeEnv(build(tilt));
    const t = new PerimeterTool(e.env, target);
    t.start();
    return t;
  }
  const drag = (t: PerimeterTool, tab = false) => {
    t.setShape('byPerimeter');
    if (tab) t.tab();
    t.down(P(-3, -3));
    t.drag(P(9, 7));
    t.up(P(9, 7));
  };
  it('telhado: topo; Tab troca para a base; piso: base; desfazer remove', () => {
    const roof = tool('roof', 15);
    drag(roof);
    expect(bbox(roof.draft().segs).x0).toBeCloseTo(-EXT_TOP, 6);
    roof.undoDraft();
    expect(roof.draft().segs).toHaveLength(0);
    drag(roof, true);
    expect(bbox(roof.draft().segs).x0).toBeCloseTo(-0.1, 6);

    const floor = tool('floor', 15);
    drag(floor);
    expect(bbox(floor.draft().segs).x0).toBeCloseTo(-0.1, 6);
    floor.undoDraft();
    drag(floor, true);
    expect(bbox(floor.draft().segs).x0).toBeCloseTo(-EXT_TOP, 6);
  });
  it('escolher face (telhado): clique entra com a linha do topo; Tab troca para a base', () => {
    const roof = tool('roof', 15);
    roof.setShape('pickFace');
    clickAt(roof, 3, -0.95);
    expect(roof.draft().segs[0]!.a.y).toBeCloseTo(-EXT_TOP, 6);
    roof.undoDraft();
    roof.tab();
    clickAt(roof, 3, -0.95);
    expect(roof.draft().segs[0]!.a.y).toBeCloseTo(-0.1, 6);
  });
});
