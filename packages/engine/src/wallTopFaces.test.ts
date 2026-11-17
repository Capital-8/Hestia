import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Project, type Wall } from '@hestia/model';
import { wallTopFaces, wallTopFacesCached } from './wallTopFaces.ts';

/** Topo da parede (T-A): valores de referência calculados à mão (tan15° = 0,2679491924; 1/cos15° = 1,0352761804). */
const camada = (thick: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: thick, wraps: false });
type P = { x: number; y: number };
interface W { id: string; a: P; b: P; tilt?: number; sag?: number; extra?: Partial<Wall> }

function build(walls: W[], height = 3): Project {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada(0.2)] };
  const s = new ProjectStore(base);
  for (const w of walls) {
    const j = { kind: 'miter' as const, flip: false };
    s.exec({ type: 'addWall', wall: makeWall({ id: w.id, typeId: 'wt_t', levelId: 'lv_0', height, a: w.a, b: w.b, ...(w.tilt ? { tilt: w.tilt } : {}), ...(w.sag ? { sag: w.sag } : {}), joinStart: j, joinEnd: j, ...w.extra }) as Wall });
  }
  return s.project;
}
const reta = (tilt = 0, extra: Partial<Wall> = {}): Project => build([{ id: 'w', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, tilt, extra }]);
const get = (p: Project) => wallTopFaces(p, 'lv_0').find((w) => w.wallId === 'w')!;

describe('wallTopFaces · reta L=4, t=0,2, H=3', () => {
  it('vertical: topo coincide com a base em planta; z = 3', () => {
    const t = get(reta());
    expect(t.baseZ).toBe(0);
    expect(t.topZ).toBe(3);
    expect(t.exterior).toHaveLength(2);
    expect(t.exterior[0]!.x).toBeCloseTo(0, 9);
    expect(t.exterior[1]!.x).toBeCloseTo(4, 9);
    for (const q of t.exterior) { expect(q.y).toBeCloseTo(0.1, 9); expect(q.z).toBe(3); }
    for (const q of t.interior) { expect(q.y).toBeCloseTo(-0.1, 9); expect(q.z).toBe(3); }
    for (const q of t.axis) expect(q.y).toBeCloseTo(0, 9);
    expect(t.corners).toHaveLength(4);
  });
  it('tilt 15: eixo deslocado 0,8038476 e faces 0,9073752 / 0,7003200 (t/cosθ); x das pontas intacto', () => {
    const t = get(reta(15));
    for (const q of t.axis) expect(q.y).toBeCloseTo(0.8038475773, 9);
    for (const q of t.exterior) { expect(q.y).toBeCloseTo(0.9073751953, 9); expect(q.z).toBe(3); }
    for (const q of t.interior) expect(q.y).toBeCloseTo(0.7003199593, 9);
    expect(t.exterior[1]!.x).toBeCloseTo(4, 9);
    expect(t.tilt).toBe(15);
  });
  it('tilt -15: deslocamento -0,8038476', () => {
    const t = get(reta(-15));
    for (const q of t.axis) expect(q.y).toBeCloseTo(-0.8038475773, 9);
    for (const q of t.exterior) expect(q.y).toBeCloseTo(-0.7003199593, 9);
    for (const q of t.interior) expect(q.y).toBeCloseTo(-0.9073751953, 9);
  });
  it('núcleo: parede de uma camada estrutural coincide com as faces', () => {
    const t = get(reta(15));
    expect(t.coreExterior[0]!.y).toBeCloseTo(0.9073751953, 9);
    expect(t.coreInterior[0]!.y).toBeCloseTo(0.7003199593, 9);
  });
  it('cota: nível + offset (baseOffset 0,5, height 2) = z 2,5', () => {
    const t = get(reta(0, { baseOffset: 0.5, height: 2 }));
    expect(t.baseZ).toBeCloseTo(0.5, 9);
    expect(t.topZ).toBeCloseTo(2.5, 9);
    for (const q of t.exterior) expect(q.z).toBeCloseTo(2.5, 9);
  });
  it('perfil de topo: um ponto por quebra, z real em cada um e deslocamento por h', () => {
    const p = reta(0, { topProfile: [{ t: 0, h: 2 }, { t: 2, h: 2 }, { t: 2, h: 3 }, { t: 4, h: 3 }] });
    const t = get(p);
    expect(t.exterior.map((q) => q.z)).toEqual([2, 2, 3, 3]);
    expect(t.exterior.map((q) => q.x.toFixed(6))).toEqual(['0.000000', '2.000000', '2.000000', '4.000000']);
    expect(t.topZ).toBe(3);
  });
  it('cache por projeto devolve o mesmo resultado', () => {
    const p = reta();
    expect(wallTopFacesCached(p, 'lv_0')).toBe(wallTopFacesCached(p, 'lv_0'));
  });
});

describe('wallTopFaces · arco', () => {
  it('vertical: pontas na base e z = 3; tilt 15 afasta do centro as amostras por R·tanθ·H a partir do eixo', () => {
    // corda 4, sag 1: R = (4/4... ) = (c²/4 + s²)/(2s) = (4+1)/2 = 2,5; sag>0: centro à direita (y<0)
    const v = build([{ id: 'w', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, sag: 1 }]);
    const tv = get(v);
    expect(tv.exterior.length).toBeGreaterThan(8);
    expect(tv.exterior[0]!.z).toBe(3);
    const c = { x: 2, y: -1.5 };
    const rEnd = (q: { x: number; y: number }) => Math.hypot(q.x - c.x, q.y - c.y);
    for (const q of tv.axis) expect(rEnd(q)).toBeCloseTo(2.5, 6);
    const ti = get(build([{ id: 'w', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, sag: 1, tilt: 15 }]));
    // raio do eixo no topo: R + H·tanθ = 2,5 + 0,8038475773 (topo afasta do centro)
    for (const q of ti.axis) expect(rEnd(q)).toBeCloseTo(3.3038475773, 6);
    // face externa (esquerda de a→b, lado oposto ao centro): R + 0,1/cosθ ... + H·tanθ
    for (const q of ti.exterior.slice(1, -1)) expect(rEnd(q)).toBeCloseTo(2.5 + 0.8038475773 + 0.1 * 1.0352761804, 6);
  });
});

describe('wallTopFaces · canto inclinado (junção)', () => {
  it('L 15°/15°: canto superior vem do anel da junção (-0,7003; -0,7003) e (-0,9074; -0,9074)', () => {
    const p = build([
      { id: 'A', a: { x: 4, y: 0 }, b: { x: 0, y: 0 }, tilt: 15 },
      { id: 'B', a: { x: 0, y: 0 }, b: { x: 0, y: 4 }, tilt: 15 },
    ]);
    const a = wallTopFaces(p, 'lv_0').find((w) => w.wallId === 'A')!;
    const bEnd = [a.exterior[1]!, a.interior[1]!];
    const ys = bEnd.map((q) => q.y).sort((u, v) => u - v);
    expect(ys[0]).toBeCloseTo(-0.9073751953, 6);
    expect(ys[1]).toBeCloseTo(-0.7003199593, 6);
    for (const q of bEnd) expect(q.x).toBeCloseTo(q.y, 6);
  });
});
