import { describe, expect, it } from 'vitest';
import { computeSection, junctionLevel, resolveLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Project } from '@hestia/model';
import { wallLayerSolid } from './solids.ts';
import { chavesDeNivel } from './chaveNivel3d.ts';

/** Etapa B · defeito 2: mudar o tilt de uma parede isolada (sem tocar em mais nada) atualiza sólido, planta, corte e chave do nível. */
const camada = (thick: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: thick, wraps: false });
function store(): ProjectStore {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada(0.2)] };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'A', typeId: 'wt_t', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  return s;
}
const topoY = (p: Project): number => {
  const rw = resolveLevel(p, 'lv_0').walls.A!;
  const b = wallLayerSolid(rw, rw.layers[0]!, junctionLevel(p, 'lv_0'));
  let max = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (let k = 0; k < b.positions.length / 3; k++) {
    if (Math.abs(b.positions[k * 3 + 2]! - 3) < 1e-6) { ymin = Math.min(ymin, b.positions[k * 3 + 1]!); ymax = Math.max(ymax, b.positions[k * 3 + 1]!); }
    max = Math.max(max, b.positions[k * 3 + 2]!);
  }
  return (ymin + ymax) / 2;
};
const secTopoX = (p: Project): number => {
  const r = computeSection(p, { a: { x: 2, y: -3 }, b: { x: 2, y: 3 }, depth: 3 });
  const v = r.cut.flatMap((c) => c.polygons.flat(2)).filter((q) => Math.abs(q.y - 3) < 1e-6).map((q) => q.x);
  return (Math.min(...v) + Math.max(...v)) / 2;
};

describe('Etapa B · tilt isolado atualiza tudo', () => {
  it('20° e volta a 0°', () => {
    const s = store();
    const d = 3 * Math.tan((20 * Math.PI) / 180);
    const p0 = s.project;
    const k0 = [...chavesDeNivel(p0, 'm', undefined).values()].join();
    const base = topoY(p0), baseSec = secTopoX(p0);
    expect(resolveLevel(p0, 'lv_0').walls.A!.tiltPlan).toBeUndefined();
    s.exec({ type: 'setWallTilt', ids: ['A'], tilt: 20 });
    const p1 = s.project;
    expect([...chavesDeNivel(p1, 'm', undefined).values()].join()).not.toBe(k0);
    const tp = resolveLevel(p1, 'lv_0').walls.A!.tiltPlan!;
    expect(tp).toBeDefined();
    expect(Math.abs(topoY(p1) - base)).toBeCloseTo(d, 4);
    expect(Math.abs(secTopoX(p1) - baseSec)).toBeCloseTo(d, 4);
    s.exec({ type: 'setWallTilt', ids: ['A'], tilt: 0 });
    const p2 = s.project;
    expect(resolveLevel(p2, 'lv_0').walls.A!.tiltPlan).toBeUndefined();
    expect(topoY(p2)).toBeCloseTo(base, 6);
    expect(secTopoX(p2)).toBeCloseTo(baseSec, 6);
  });
});
