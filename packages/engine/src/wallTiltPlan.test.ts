import { describe, expect, it } from 'vitest';
import { multiArea } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Project, type Wall } from '@hestia/model';
import { resolveLevelTs } from './resolve.ts';

/** F2.5 · planta da parede inclinada: hachura no plano de corte deslocada por d(zCorte), projeção de base e topo. */

const camada = (thick: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: thick, wraps: false });
type P = { x: number; y: number };
interface W { id: string; a: P; b: P; tilt?: number; sag?: number }

function build(walls: W[]): Project {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada(0.2)] };
  const s = new ProjectStore(base);
  const j = { kind: 'miter' as const, flip: false };
  for (const w of walls) {
    s.exec({ type: 'addWall', wall: makeWall({ id: w.id, typeId: 'wt_t', levelId: 'lv_0', height: 3, a: w.a, b: w.b, ...(w.tilt ? { tilt: w.tilt } : {}), ...(w.sag ? { sag: w.sag } : {}), joinStart: j, joinEnd: j }) as Wall });
  }
  return s.project;
}
const ys = (m: { x: number; y: number }[][][]): [number, number] => {
  const v = m.flat(2).map((q) => q.y);
  return [Math.min(...v), Math.max(...v)];
};
const xs = (m: { x: number; y: number }[][][]): [number, number] => {
  const v = m.flat(2).map((q) => q.x);
  return [Math.min(...v), Math.max(...v)];
};

describe('F2.5 · planta inclinada', () => {
  it('reta 15° (corte 1,20): hachura deslocada 0,3215 m para a esquerda, largura 0,2071', () => {
    const r = resolveLevelTs(build([{ id: 'A', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, tilt: 15 }]), 'lv_0', new Map());
    const rw = r.walls.A!;
    const [y0, y1] = ys(rw.layers[0]!.cut);
    expect(y0).toBeCloseTo(0.3215390 - 0.1035276, 4); // 0,2180
    expect(y1).toBeCloseTo(0.3215390 + 0.1035276, 4); // 0,4251
    expect((y0 + y1) / 2).toBeCloseTo(0.3215, 4);
    expect(multiArea(r.clusters[0]!.silhouette)).toBeCloseTo(4 * 0.2070552, 4); // 0,8282
    expect(rw.tiltPlan!.z).toBeCloseTo(1.2, 9);
    const [b0, b1] = ys(rw.tiltPlan!.base);
    expect(b0).toBeCloseTo(-0.1035276, 4);
    expect(b1).toBeCloseTo(0.1035276, 4);
    const [t0, t1] = ys(rw.tiltPlan!.top);
    expect(t0).toBeCloseTo(0.8038476 - 0.1035276, 4); // 0,7003
    expect(t1).toBeCloseTo(0.8038476 + 0.1035276, 4); // 0,9074
  });

  it('tilt negativo desloca para a direita; corte a 0,5 m (cutZ) desloca 0,5·tan(-15°)', () => {
    const r = resolveLevelTs(build([{ id: 'A', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, tilt: -15 }]), 'lv_0', new Map(), { cutZ: 0.5 });
    const [y0, y1] = ys(r.walls.A!.layers[0]!.cut);
    expect((y0 + y1) / 2).toBeCloseTo(-0.1339746, 4);
    expect(y1 - y0).toBeCloseTo(0.2070552, 4);
  });

  it('tilt=0: nenhum campo novo e mesmos polígonos (igualdade) da parede sem o campo', () => {
    const a = resolveLevelTs(build([{ id: 'A', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }]), 'lv_0', new Map());
    const b = resolveLevelTs(build([{ id: 'A', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, tilt: 0 }]), 'lv_0', new Map());
    expect(b).toEqual(a);
    expect(a.walls.A!.tiltPlan).toBeUndefined();
    expect(ys(a.walls.A!.layers[0]!.cut)).toEqual([-0.1, 0.1]);
    expect(xs(a.walls.A!.layers[0]!.cut)).toEqual([0, 4]);
  });

  it('canto 15°/15°: a região usa o polígono por nível da F2.4 (canto em z=1,2 e topo em z=3)', () => {
    const p = build([
      { id: 'A', a: { x: 4, y: 0 }, b: { x: 0, y: 0 }, tilt: 15 },
      { id: 'B', a: { x: 0, y: 0 }, b: { x: 0, y: 4 }, tilt: 15 },
    ]);
    const r = resolveLevelTs(p, 'lv_0', new Map());
    // canto externo (linha de face de fora) em z: (-z·tan15 - 0,1035; idem); na face externa de A (lado direito, -y) em z=1,2
    const [x0] = xs(r.clusters[0]!.silhouette);
    const [y0] = ys(r.clusters[0]!.silhouette);
    expect(x0).toBeCloseTo(-0.3215390 - 0.1035276, 4);
    expect(y0).toBeCloseTo(-0.3215390 - 0.1035276, 4);
    // topo (z=3): canto externo em -0,8038 - 0,1035
    const top = r.walls.A!.tiltPlan!.top;
    expect(Math.min(...top.flat(2).map((q) => q.y))).toBeCloseTo(-0.8038476 - 0.1035276, 4);
  });

  it('arco 15°: raio do corte em z=1,2 muda por d(z) em torno do mesmo centro (R=5, afastando)', () => {
    // corda 5√2, sag>0: centro à direita; tilt>0 afasta do centro: R_z = R + 1,2·tan15°
    const c = 5 * Math.SQRT2;
    const sag = 5 - 5 * Math.cos(Math.PI / 4);
    const r = resolveLevelTs(build([{ id: 'A', a: { x: 0, y: 0 }, b: { x: c, y: 0 }, sag, tilt: 15 }]), 'lv_0', new Map());
    const cen = { x: c / 2, y: -5 * Math.cos(Math.PI / 4) }; // centro à direita de a→b (y<0)
    const rho = r.walls.A!.layers[0]!.cut.flat(2).map((q) => Math.hypot(q.x - cen.x, q.y - cen.y));
    expect(Math.min(...rho)).toBeCloseTo(5 + 0.3215390 - 0.1035276, 3);
    expect(Math.max(...rho)).toBeCloseTo(5 + 0.3215390 + 0.1035276, 3);
    const rhoTop = r.walls.A!.tiltPlan!.top.flat(2).map((q) => Math.hypot(q.x - cen.x, q.y - cen.y));
    expect(Math.max(...rhoTop)).toBeCloseTo(5 + 0.8038476 + 0.1035276, 3);
  });

  it('arco com tilt negativo aproxima do centro', () => {
    const c = 5 * Math.SQRT2;
    const sag = 5 - 5 * Math.cos(Math.PI / 4);
    const r = resolveLevelTs(build([{ id: 'A', a: { x: 0, y: 0 }, b: { x: c, y: 0 }, sag, tilt: -15 }]), 'lv_0', new Map());
    const cen = { x: c / 2, y: -5 * Math.cos(Math.PI / 4) };
    const rho = r.walls.A!.layers[0]!.cut.flat(2).map((q) => Math.hypot(q.x - cen.x, q.y - cen.y));
    expect(Math.min(...rho)).toBeCloseTo(5 - 0.3215390 - 0.1035276, 3);
    expect(Math.max(...rho)).toBeCloseTo(5 - 0.3215390 + 0.1035276, 3);
  });
});
