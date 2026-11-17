import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { computeSection, openingTiltGeom } from '@hestia/engine';
import { createEmptyProject, makeWall, openingPlaneOf, ProjectStore, type Layer, type Opening, type Wall } from '@hestia/model';
import { LIGHT } from '../plan/types.ts';
import { buildSectionDrawList, type SectionInput } from './build.ts';
import { vistaInclinada } from './referencialInclinadoVista.ts';

/** P1 · porta e janela seguem a parede inclinada; peças da esquadria nas vistas no referencial inclinado (θ = 15°, t = 0,2). */
const v = (x: number, y: number): Vec2 => ({ x, y });
const camada: Layer = { function: 'structure', materialId: 'mat_concreto', thickness: 0.2, wraps: false };
const TH = (15 * Math.PI) / 180;

function projeto(kind: 'window' | 'door', tilt: number | undefined, plano?: 'vertical' | 'inclinado') {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada] };
  base.openingTypes.ot_w = { ...base.openingTypes.ot_j120!, id: 'ot_w', width: 1.2, height: 1.0, sill: 1.0 };
  base.openingTypes.ot_d = { ...base.openingTypes.ot_p80!, id: 'ot_d', width: 0.9, height: 2.1, sill: 0 };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'A', typeId: 'wt_t', levelId: 'lv_0', height: 3, a: v(0, 0), b: v(6, 0), ...(tilt ? { tilt } : {}) }) as Wall });
  const o = { id: 'o', kind, typeId: kind === 'window' ? 'ot_w' : 'ot_d', hostId: 'A', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '', ...(plano ? { plano } : {}) } as Opening;
  s.exec({ type: 'addOpening', opening: o });
  return s.project;
}
const entrada = (project: ReturnType<typeof projeto>, a: Vec2, b: Vec2): SectionInput => ({ project, section: computeSection(project, { a, b, depth: 4 }), viewport: { cx: 3, cy: 1.5, zoom: 60, width: 800, height: 600 }, theme: LIGHT, dark: false, showGrid: false });
const elev = (p: ReturnType<typeof projeto>) => entrada(p, v(0, -2), v(6, -2));
const transv = (p: ReturnType<typeof projeto>) => entrada(p, v(3, -1.5), v(3, 1.5));

describe('P1 · valores literais da F2.8/S4 (θ = 15°, t = 0,2)', () => {
  it('padrão: porta e janela inclinadas numa parede inclinada', () => {
    expect(openingPlaneOf({ kind: 'door' })).toBe('inclinado');
    expect(openingPlaneOf({ kind: 'window' })).toBe('inclinado');
    expect(openingPlaneOf({ kind: 'door', plano: 'vertical' })).toBe('vertical');
  });
  it('janela 1,2×1,0 peitoril 1,0 inclinada: topo 1,9659 e caixilho 0,3974 (nível do projeto)', () => {
    const o = computeSection(projeto('window', 15), { a: v(0, -2), b: v(6, -2), depth: 4 }).openings[0]!;
    expect(o.z0).toBeCloseTo(1.0, 6);
    expect(o.z1).toBeCloseTo(1.9659, 4);
    expect(o.tiltFrame).toMatchObject({ plane: 'inclinado', sill: 1 });
    // centro do caixilho (s = 0, z = h/2 = 0,5): (1,0 + 0,5·cos15°)·tan15° = 0,3974
    expect(vistaInclinada(o.tiltFrame, 0).transversal(0, 0.5).u).toBeCloseTo(0.3974, 4);
  });
  it('porta 0,9×2,1 peitoril 0 inclinada (padrão): topo 2,0284 e caixilho 0,2718; recuo ≥ 0', () => {
    const o = computeSection(projeto('door', 15), { a: v(0, -2), b: v(6, -2), depth: 4 }).openings[0]!;
    expect(o.z0).toBeCloseTo(0, 6);
    expect(o.z1).toBeCloseTo(2.0284, 4);
    expect(o.tiltFrame!.plane).toBe('inclinado');
    expect(vistaInclinada(o.tiltFrame, 0).transversal(0, 1.05).u).toBeCloseTo(0.2718, 4);
    const g = openingTiltGeom({ plane: 'inclinado', theta: TH, t: 0.2, w: 0.9, h: 2.1, s: 0 });
    expect(g.frameShift).toBeCloseTo(0.2718, 4);
    expect(Math.min(...Object.values(g.reveal))).toBeGreaterThanOrEqual(0);
  });
  it('porta com plano vertical explícito: a prumo (topo 2,1), profundidade 0,7697, recuo ≥ 0', () => {
    const o = computeSection(projeto('door', 15, 'vertical'), { a: v(0, -2), b: v(6, -2), depth: 4 }).openings[0]!;
    expect(o.z1).toBeCloseTo(2.1, 6);
    expect(o.tiltFrame!.plane).toBe('vertical');
    const g = openingTiltGeom({ plane: 'vertical', theta: TH, t: 0.2, w: 0.9, h: 2.1, s: 0 });
    expect(g.horizontalDepth).toBeCloseTo(0.7697, 4);
    expect(Math.min(...Object.values(g.reveal))).toBeGreaterThanOrEqual(0);
  });
});

describe('P1 · peças da esquadria nas vistas', () => {
  const ys = (d: ReturnType<typeof buildSectionDrawList>): number[] => d.fills.filter((f) => f.polygons.flat(2).every((q) => q.y < 2.5)).flatMap((f) => f.polygons.flat(2).map((q) => q.y));
  it('elevação: porta inclinada ocupa h·cosθ (2,0284); vertical ocupa h (2,1)', () => {
    expect(Math.max(...ys(buildSectionDrawList(elev(projeto('door', 15)))))).toBeCloseTo(2.0284, 3);
    expect(Math.max(...ys(buildSectionDrawList(elev(projeto('door', 15, 'vertical')))))).toBeCloseTo(2.1, 3);
  });
  it('parede vertical: desenho idêntico com plano inclinado ou vertical (elevação e corte)', () => {
    for (const f of [elev, transv]) {
      const a = buildSectionDrawList(f(projeto('door', undefined)));
      const b = buildSectionDrawList(f(projeto('door', undefined, 'vertical')));
      expect(JSON.stringify(a.fills)).toBe(JSON.stringify(b.fills));
      expect(JSON.stringify(a.strokes)).toBe(JSON.stringify(b.strokes));
    }
  });
  it('corte transversal: a esquadria inclinada desloca-se ao longo de n e difere da vertical', () => {
    const a = buildSectionDrawList(transv(projeto('door', 15)));
    const b = buildSectionDrawList(transv(projeto('door', 15, 'vertical')));
    expect(JSON.stringify(a.fills)).not.toBe(JSON.stringify(b.fills));
  });
});
