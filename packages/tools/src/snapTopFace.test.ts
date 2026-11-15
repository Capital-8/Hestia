import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Project, type Wall } from '@hestia/model';
import { wallTopFaces } from '@hestia/engine';
import type { SectionResult } from '@hestia/engine';
import { infer, type InferContext } from './infer.ts';
import { sectionInferContext } from './sectionContext.ts';
import { DEFAULT_SNAP } from './types.ts';

/**
 * Captura da face superior da parede (T-C). Parede reta L=4, t=0,2, H=3; valores de referência calculados à mão
 * (tan15° = 0,2679491924; 1/cos15° = 1,0352761804): topo da face externa a y=0,9073752 e da interna a 0,7003200 em 15°.
 * Escala: 1 px = 0,005 m, tolerância de captura 0,05 m.
 */
const MPP = 0.005;
const camada = (thick: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: thick, wraps: false });

function build(walls: Array<{ id: string; a: { x: number; y: number }; b: { x: number; y: number }; tilt?: number; sag?: number }>): Project {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada(0.2)] };
  const s = new ProjectStore(base);
  for (const w of walls) {
    const j = { kind: 'miter' as const, flip: false };
    s.exec({ type: 'addWall', wall: makeWall({ id: w.id, typeId: 'wt_t', levelId: 'lv_0', height: 3, a: w.a, b: w.b, ...(w.tilt ? { tilt: w.tilt } : {}), ...(w.sag ? { sag: w.sag } : {}), joinStart: j, joinEnd: j }) as Wall });
  }
  return s.project;
}
const reta = (tilt = 0): Project => build([{ id: 'w', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, tilt }]);
const at = (p: Project, x: number, y: number, extra: Partial<InferContext> = {}) => infer({ x, y }, { project: p, levelId: 'lv_0', mpp: MPP, gridStep: 0.1, ...extra });
const kindsAround = (p: Project, x: number, y: number, extra: Partial<InferContext> = {}): string[] => {
  const out: string[] = [];
  for (let c = 0; c < 8; c++) out.push(at(p, x, y, { ...extra, cycle: c }).kind);
  return out;
};

describe('face superior em planta: parede vertical', () => {
  it('ferramenta de topo: o canto superior funde com o da base (rotulo Face superior, z = 3, uma vez só)', () => {
    const r = at(reta(), 0.01, 0.1, { topFaceTool: true });
    expect(r.kind).toBe('topFace');
    expect(r.point.x).toBeCloseTo(0, 9);
    expect(r.point.y).toBeCloseTo(0.1, 9);
    expect(r.z).toBe(3);
    // Sem duplicar: a lista do ciclo (Tab) é cíclica; as entradas distintas por (tipo, ponto) têm um único topFace neste canto.
    const seen = new Set<string>();
    for (let c = 0; c < 20; c++) {
      const q = at(reta(), 0.01, 0.1, { topFaceTool: true, cycle: c });
      seen.add(`${q.kind}|${q.point.x.toFixed(6)}|${q.point.y.toFixed(6)}`);
    }
    expect([...seen].filter((k) => k === 'topFace|0.000000|0.100000')).toHaveLength(1);
  });
  it('ferramenta comum: nada de face superior (a base vale); o canto continua sendo face, sem z', () => {
    const r = at(reta(), 0.01, 0.1);
    expect(r.kind).toBe('face');
    expect(r.z).toBeUndefined();
    expect(kindsAround(reta(), 0.01, 0.1)).not.toContain('topFace');
  });
  it('ferramenta de topo: ponto sobre a aresta superior (meio da face externa) e z = 3', () => {
    const r = at(reta(), 2, 0.103, { topFaceTool: true });
    expect(r.kind).toBe('topFace');
    expect(r.point.y).toBeCloseTo(0.1, 9);
    expect(r.z).toBe(3);
  });
  it('opção topFaces desligada: nunca captura o topo', () => {
    const r = at(reta(), 0.01, 0.1, { topFaceTool: true, snap: { ...DEFAULT_SNAP, topFaces: false } });
    expect(r.kind).not.toBe('topFace');
  });
});

describe('face superior em planta: parede inclinada', () => {
  it('tilt 15: face externa do topo a y=0,9073752 e z=3 (mesmo sem ferramenta de topo, pois difere da base)', () => {
    for (const tool of [false, true]) {
      const r = at(reta(15), 0.01, 0.9074, { topFaceTool: tool });
      expect(r.kind).toBe('topFace');
      expect(r.point.x).toBeCloseTo(0, 9);
      expect(r.point.y).toBeCloseTo(0.9073751953, 9);
      expect(r.z).toBe(3);
    }
  });
  it('tilt 15: face interna do topo a y=0,7003200', () => {
    const r = at(reta(15), 3.99, 0.7003, { topFaceTool: true });
    expect(r.kind).toBe('topFace');
    expect(r.point.x).toBeCloseTo(4, 9);
    expect(r.point.y).toBeCloseTo(0.7003199593, 9);
    expect(r.z).toBe(3);
  });
  it('tilt 15: no meio da aresta superior externa, ponto médio com z = 3', () => {
    const r = at(reta(15), 2.01, 0.9074, { topFaceTool: true });
    expect(r.kind).toBe('topFace');
    expect(r.point.x).toBeCloseTo(2, 9);
    expect(r.point.y).toBeCloseTo(0.9073751953, 9);
    expect(r.z).toBe(3);
  });
  it('tilt -15: topo da face externa a y=-0,7003200 e da interna a -0,9073752', () => {
    const a = at(reta(-15), 0.01, -0.7003, { topFaceTool: true });
    expect(a.kind).toBe('topFace');
    expect(a.point.y).toBeCloseTo(-0.7003199593, 9);
    expect(a.z).toBe(3);
    const b = at(reta(-15), 0.01, -0.9074);
    expect(b.kind).toBe('topFace');
    expect(b.point.y).toBeCloseTo(-0.9073751953, 9);
  });
  it('a captura da base continua valendo na parede inclinada (face de base em y=0,1)', () => {
    const r = at(reta(15), 0.01, 0.1);
    expect(r.kind).toBe('face');
    expect(r.point.y).toBeCloseTo(0.1, 9);
  });
  it('arco inclinado: o canto superior fica longe da base e leva z = 3', () => {
    const p = build([{ id: 'w', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, tilt: 15, sag: 1 }]);
    const tf = wallTopFaces(p, 'lv_0')[0]!;
    const c = tf.exterior[0]!;
    const r = at(p, c.x + 0.01, c.y, { topFaceTool: true });
    expect(r.kind).toBe('topFace');
    expect(r.point.x).toBeCloseTo(c.x, 9);
    expect(r.point.y).toBeCloseTo(c.y, 9);
    expect(r.z).toBe(3);
    // O topo está deslocado ~0,8 m da base: nenhum canto de base por perto.
    expect(Math.hypot(c.x - 0, c.y - 0.1)).toBeGreaterThan(0.5);
  });
});

describe('face superior: desempenho', () => {
  it('100 paredes inclinadas: consulta com cache fica em poucos ms (limite folgado: 25 ms em média)', () => {
    const walls = Array.from({ length: 100 }, (_, i) => ({ id: `w${i}`, a: { x: (i % 10) * 6, y: Math.floor(i / 10) * 4 }, b: { x: (i % 10) * 6 + 4, y: Math.floor(i / 10) * 4 }, tilt: 15 }));
    const p = build(walls);
    at(p, 0.01, 0.9074, { topFaceTool: true });
    const t0 = performance.now();
    const N = 100;
    for (let i = 0; i < N; i++) at(p, (i % 10) * 6 + 2, Math.floor((i % 100) / 10) * 4 + 0.9074, { topFaceTool: true });
    expect((performance.now() - t0) / N).toBeLessThan(25);
  });
});

describe('face superior no corte/elevação', () => {
  const ring = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const section: SectionResult = {
    length: 4, zMin: 0, zMax: 3, cut: [{ materialId: 'm1', polygons: [[ring(0, 0, 4, 3)]], sources: [{ wallId: 'w1' }] }],
    silhouette: [], beyond: [], openings: [], membranes: [], levels: [],
  };
  const ctx = (extra: Partial<InferContext> = {}): InferContext => sectionInferContext(section, createEmptyProject(), 'lv_0', MPP, 0.1, {}, extra);
  it('aresta superior em z = 3 é Face superior (meio da parede)', () => {
    const r = infer({ x: 1, y: 3.02 }, ctx());
    expect(r.kind).toBe('topFace');
    expect(r.point.x).toBeCloseTo(1, 9);
    expect(r.point.y).toBeCloseTo(3, 9);
  });
  it('canto superior: Face superior com a ferramenta de topo, ponta comum nas demais', () => {
    const a = infer({ x: 3.99, y: 3.01 }, ctx({ topFaceTool: true }));
    expect(a.kind).toBe('topFace');
    expect(a.point).toEqual({ x: 4, y: 3 });
    expect(infer({ x: 3.99, y: 3.01 }, ctx()).kind).toBe('endpoint');
  });
  it('aresta lateral da parede não vira face superior', () => {
    const r = infer({ x: 0.01, y: 1.5 }, ctx());
    expect(r.kind).not.toBe('topFace');
  });
});
