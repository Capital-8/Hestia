import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeFloor, makeSlab, makeWall, type Floor, type Layer, type OutlineSource, type Project, type Slab, type Wall } from '@hestia/model';
import { resolveBoundary } from './outlineBound.ts';
import { resolveFloorsTs } from './floors.ts';
import { resolveSlabs } from './slabs.ts';
import { projetoTemContornoNoTopo } from './outlineBound.ts';
import { wallTopFacesCached } from './wallTopFaces.ts';

/**
 * T-F: contorno vinculado de piso/laje segue a BASE ou o TOPO da parede. Retângulo 6 x 4 (horário: face externa à esquerda
 * de a->b), t = 0,2, H = 3, tilt 15 para fora. Literais à mão (tan15° = 0,2679491924; 1/cos15° = 1,0352761804):
 * base: faces externa -0,1 / 6,1 e interna 0,1 / 5,9; topo: externa -0,9073752 / 6,9073752, interna -0,7003200 / 6,7003200.
 */
const EXT_TOP = 0.9073751953;
const INT_TOP = 0.7003199593;
const camada = (thick: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: thick, wraps: false });
const RECT = [{ x: 0, y: 0 }, { x: 0, y: 4 }, { x: 6, y: 4 }, { x: 6, y: 0 }];

function build(tilt: number): ProjectStore {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada(0.2)] };
  const store = new ProjectStore(base);
  const j = { kind: 'miter' as const, flip: false };
  RECT.forEach((a, i) => store.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_t', levelId: 'lv_0', height: 3, a, b: RECT[(i + 1) % 4]!, ...(tilt ? { tilt } : {}), joinStart: j, joinEnd: j }) as Wall }));
  return store;
}
const typeFloor = (p: Project) => Object.keys(p.floorTypes)[0]!;
const typeSlab = (p: Project) => Object.keys(p.slabTypes)[0]!;
const floorWith = (s: ProjectStore, src: OutlineSource): Floor => {
  const f = makeFloor({ id: 'f1', levelId: 'lv_0', typeId: typeFloor(s.project), boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], outlineSource: src });
  s.exec({ type: 'addFloor', floor: f });
  return s.project.elements.f1 as Floor;
};
const box = (r: { x: number; y: number }[]) => ({
  x0: Math.min(...r.map((v) => v.x)),
  x1: Math.max(...r.map((v) => v.x)),
  y0: Math.min(...r.map((v) => v.y)),
  y1: Math.max(...r.map((v) => v.y)),
});
const SEED = { x: 3, y: 2 };
const perim = (reference?: 'base' | 'top', extend?: 'core'): OutlineSource => ({ mode: 'perimeter', linked: true, seed: { x: 3, y: -0.05 }, ...(reference ? { reference } : {}), ...(extend ? { extend } : {}) });

describe('T-F: contorno vinculado no topo da parede', () => {
  it('perímetro base: -0,1 a 6,1 (e ausente = base, idêntico)', () => {
    const s = build(15);
    const a = box(resolveBoundary(s.project, 'lv_0', floorWith(s, perim('base'))).polygon![0]!);
    expect(a.x0).toBeCloseTo(-0.1, 6);
    expect(a.x1).toBeCloseTo(6.1, 6);
    expect(a.y1).toBeCloseTo(4.1, 6);
    const s2 = build(15);
    const b = resolveBoundary(s2.project, 'lv_0', floorWith(s2, perim())).polygon![0]!;
    expect(box(b)).toEqual(a);
  });

  it('perímetro topo, tilt 15: -0,9073752 a 6,9073752 em x e y de -0,9073752 a 4,9073752', () => {
    const s = build(15);
    const r = resolveBoundary(s.project, 'lv_0', floorWith(s, perim('top')));
    expect(r.problem).toBeNull();
    const t = box(r.polygon![0]!);
    expect(t.x0).toBeCloseTo(-EXT_TOP, 6);
    expect(t.x1).toBeCloseTo(6 + EXT_TOP, 6);
    expect(t.y0).toBeCloseTo(-EXT_TOP, 6);
    expect(t.y1).toBeCloseTo(4 + EXT_TOP, 6);
  });

  it('perímetro topo no núcleo: parede de uma camada estrutural = mesmo contorno', () => {
    const s = build(15);
    const t = box(resolveBoundary(s.project, 'lv_0', floorWith(s, perim('top', 'core'))).polygon![0]!);
    expect(t.x0).toBeCloseTo(-EXT_TOP, 6);
    expect(t.x1).toBeCloseTo(6 + EXT_TOP, 6);
  });

  it('walls-finish topo: ambiente interno pela face interna do topo (-0,7003200 a 6,7003200)', () => {
    const s = build(15);
    const src: OutlineSource = { mode: 'walls-finish', linked: true, seed: SEED, reference: 'top' };
    const t = box(resolveBoundary(s.project, 'lv_0', floorWith(s, src)).polygon![0]!);
    expect(t.x0).toBeCloseTo(-INT_TOP, 6);
    expect(t.x1).toBeCloseTo(6 + INT_TOP, 6);
    expect(t.y1).toBeCloseTo(4 + INT_TOP, 6);
  });

  it('walls-core topo e walls-finish base', () => {
    const s = build(15);
    const core = box(resolveBoundary(s.project, 'lv_0', floorWith(s, { mode: 'walls-core', linked: true, seed: SEED, reference: 'top' })).polygon![0]!);
    expect(core.x0).toBeCloseTo(-INT_TOP, 6);
    expect(core.x1).toBeCloseTo(6 + INT_TOP, 6);
    const s2 = build(15);
    const base = box(resolveBoundary(s2.project, 'lv_0', floorWith(s2, { mode: 'walls-finish', linked: true, seed: SEED, reference: 'base' })).polygon![0]!);
    expect(base.x0).toBeCloseTo(0.1, 6);
    expect(base.x1).toBeCloseTo(5.9, 6);
  });

  it('parede vertical: topo == base (idêntico)', () => {
    for (const mode of ['perimeter', 'walls-finish', 'walls-core'] as const) {
      const s = build(0);
      const mk = (ref: 'base' | 'top'): OutlineSource => ({ mode, linked: true, seed: mode === 'perimeter' ? { x: 3, y: -0.05 } : SEED, reference: ref });
      const base = resolveBoundary(s.project, 'lv_0', floorWith(s, mk('base'))).polygon;
      const s2 = build(0);
      const top = resolveBoundary(s2.project, 'lv_0', floorWith(s2, mk('top'))).polygon;
      expect(top).toEqual(base);
    }
  });

  it('alterar a inclinação re-deriva o contorno (acompanha) e desfazer volta', () => {
    const s = build(15);
    const f = floorWith(s, perim('top'));
    const x1 = (): number => box(resolveBoundary(s.project, 'lv_0', s.project.elements.f1 as Floor).polygon![0]!).x1;
    expect(x1()).toBeCloseTo(6 + EXT_TOP, 6);
    s.exec({ type: 'updateElements', ids: ['w0', 'w1', 'w2', 'w3'], patch: { tilt: 0 } });
    expect(x1()).toBeCloseTo(6.1, 6);
    s.undo();
    expect(x1()).toBeCloseTo(6 + EXT_TOP, 6);
    expect(f.outlineSource?.reference).toBe('top');
  });

  it('resolveFloors e resolveSlabs usam o contorno do topo', () => {
    const s = build(15);
    floorWith(s, perim('top'));
    const fl = resolveFloorsTs(s.project, 'lv_0')[0]!;
    expect(box(fl.polygon[0]![0]!).x1).toBeCloseTo(6 + EXT_TOP, 6);
    s.exec({ type: 'addSlab', slab: makeSlab({ id: 's1', levelId: 'lv_0', typeId: typeSlab(s.project), boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], outlineSource: perim('top') }) });
    expect(box(resolveSlabs(s.project, 'lv_0')[0]!.polygon[0]![0]!).x0).toBeCloseTo(-EXT_TOP, 6);
    expect((s.project.elements.s1 as Slab).outlineSource?.reference).toBe('top');
  });

  it('guarda E5: o despacho cai para o TS quando há contorno vinculado no topo', () => {
    const s = build(0);
    floorWith(s, perim('base'));
    expect(projetoTemContornoNoTopo(s.project)).toBe(false);
    const s2 = build(0);
    floorWith(s2, perim('top'));
    expect(projetoTemContornoNoTopo(s2.project)).toBe(true);
  });

  it('topo reutiliza wallTopFacesCached (mesmas faces)', () => {
    const s = build(15);
    expect(wallTopFacesCached(s.project, 'lv_0')).toBe(wallTopFacesCached(s.project, 'lv_0'));
  });
});
