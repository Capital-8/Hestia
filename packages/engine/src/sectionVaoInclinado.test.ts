import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Project, type Wall } from '@hestia/model';
import { computeSection, openingTiltGeom } from './index.ts';

/** Etapa W · vão na seção/elevação de parede inclinada: h·cosθ e deslocamento do caixilho (F2.8). */
const camada: Layer = { function: 'structure', materialId: 'mat_concreto', thickness: 0.2, wraps: false };
function build(tilt: number | undefined, kind: 'window' | 'door', plano?: 'inclinado' | 'vertical'): Project {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada] };
  base.openingTypes.ot_w = { ...base.openingTypes.ot_j120!, id: 'ot_w', width: 1.2, height: 1.0, sill: 1.0 };
  base.openingTypes.ot_d = { ...base.openingTypes.ot_p80!, id: 'ot_d', width: 0.9, height: 2.1, sill: 0 };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'A', typeId: 'wt_t', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, ...(tilt ? { tilt } : {}) }) as Wall });
  s.exec({ type: 'addOpening', opening: { id: 'o', kind, typeId: kind === 'window' ? 'ot_w' : 'ot_d', hostId: 'A', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '', ...(plano ? { plano } : {}) } as never });
  return s.project;
}
const longi = { a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, depth: 2 };

describe('Etapa W · vão inclinado no corte', () => {
  it('janela inclinada 15°: topo do vão z = 1,9659; deslocamento 0,3974', () => {
    const g = openingTiltGeom({ plane: 'inclinado', theta: (15 * Math.PI) / 180, t: 0.2, w: 1.2, h: 1.0, s: 1.0 });
    expect(g.frameShift).toBeCloseTo(0.3974, 4);
    const r = computeSection(build(15, 'window'), longi);
    expect(r.openings[0]!.z1).toBeCloseTo(1.9659, 4);
    expect(r.openings[0]!.z0).toBeCloseTo(1.0, 6);
  });
  it('porta com plano vertical explícito em parede a 15°: topo a prumo e profundidade 0,7697', () => {
    const g = openingTiltGeom({ plane: 'vertical', theta: (15 * Math.PI) / 180, t: 0.2, w: 0.9, h: 2.1, s: 0 });
    expect(g.horizontalDepth).toBeCloseTo(0.7697, 4);
    const r = computeSection(build(15, 'door', 'vertical'), longi);
    expect(r.openings[0]!.z1).toBeCloseTo(2.1, 6);
  });
  it('parede vertical: janela igual ao de sempre (z1 = peitoril + h)', () => {
    const r = computeSection(build(undefined, 'window'), longi);
    expect(r.openings[0]!.z1).toBeCloseTo(2.0, 9);
    const r2 = computeSection(build(15, 'window', 'vertical'), longi);
    expect(r2.openings[0]!.z1).toBeCloseTo(2.0, 9);
  });
});
