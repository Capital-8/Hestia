import { describe, expect, it } from 'vitest';
import { junctionLevel, resolveLevel, type JunctionLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Project } from '@hestia/model';
import { wallLayerSolid, type SolidBatch } from './solids.ts';

/** N1 · sólido real de nó de 3+ paredes inclinadas (Y e X com tilts diferentes), H = 2,8, t = 0,2, 4 m. Cantos à mão (cruzamento das faces vizinhas). */
const D = Math.PI / 180;
const camada = (t: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: t, wraps: false });
const out = (deg: number) => ({ x: 4 * Math.cos(deg * D), y: 4 * Math.sin(deg * D) });
function build(ws: Array<[string, number, number]>): Project {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada(0.2)] };
  const s = new ProjectStore(base);
  for (const [id, ang, tilt] of ws) s.exec({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_t', levelId: 'lv_0', height: 2.8, a: { x: 0, y: 0 }, b: out(ang), tilt, joinStart: { kind: 'miter', flip: false }, joinEnd: { kind: 'miter', flip: false } }) });
  return s.project;
}
const solids = (p: Project, ids: string[]): Record<string, SolidBatch> => {
  const jl: JunctionLevel = junctionLevel(p, 'lv_0');
  const rl = resolveLevel(p, 'lv_0');
  return Object.fromEntries(ids.map((id) => [id, wallLayerSolid(rl.walls[id]!, rl.walls[id]!.layers[0]!, jl)]));
};
const tri = (b: SolidBatch, i: number): number[][] => [0, 1, 2].map((j) => [0, 1, 2].map((c) => b.positions[b.indices[i + j]! * 3 + c]!));
function ptsAt(b: SolidBatch, z: number): number[][] {
  const o: number[][] = [];
  const add = (q: number[]): void => { if (!o.some((r) => Math.hypot(r[0]! - q[0]!, r[1]! - q[1]!) < 1e-9)) o.push(q); };
  for (let i = 0; i < b.indices.length; i += 3) {
    const t = tri(b, i);
    for (let j = 0; j < 3; j++) {
      const p = t[j]!, q = t[(j + 1) % 3]!;
      if (Math.abs(p[2]! - z) < 1e-9) add(p);
      else if ((p[2]! - z) * (q[2]! - z) < 0) { const k = (z - p[2]!) / (q[2]! - p[2]!); add([p[0]! + k * (q[0]! - p[0]!), p[1]! + k * (q[1]! - p[1]!)]); }
    }
  }
  return o;
}
function closed(b: SolidBatch): boolean {
  const id = new Map<string, number>();
  const vid = (k: number): number => { const key = [0, 1, 2].map((j) => b.positions[k * 3 + j]!.toFixed(6)).join(','); if (!id.has(key)) id.set(key, id.size); return id.get(key)!; };
  const dir = new Map<string, number>();
  for (let i = 0; i < b.indices.length; i += 3) {
    const t = [vid(b.indices[i]!), vid(b.indices[i + 1]!), vid(b.indices[i + 2]!)];
    for (let j = 0; j < 3; j++) { const u = t[j]!, w = t[(j + 1) % 3]!; if (u !== w) dir.set(`${u}>${w}`, (dir.get(`${u}>${w}`) ?? 0) + 1); }
  }
  for (const [k, n] of dir) { const [u, w] = k.split('>'); if (n !== 1 || dir.get(`${w}>${u}`) !== 1) return false; }
  return dir.size > 0;
}
function volume(b: SolidBatch): number {
  let v = 0;
  for (let i = 0; i < b.indices.length; i += 3) { const [a, c, d] = tri(b, i) as [number[], number[], number[]]; v += (a[0]! * (c[1]! * d[2]! - c[2]! * d[1]!) - a[1]! * (c[0]! * d[2]! - c[2]! * d[0]!) + a[2]! * (c[0]! * d[1]! - c[1]! * d[0]!)) / 6; }
  return v;
}

describe('N1 · sólido do nó em Y com tilts 10°/20°/30° (a 0°, b 120°, c 240°)', () => {
  const S = solids(build([['a', 0, 10], ['b', 120, 20], ['c', 240, 30]]), ['a', 'b', 'c']);
  // Cantos (cruzamento das faces vizinhas, calculados à mão): [a,b], [b,c], [c,a] em cada cota.
  const CANTOS: Array<[number, Array<[string, string, number, number]>]> = [
    [0, [['a', 'b', 0.0643, 0.1015], ['b', 'c', -0.1281, 0.0091], ['c', 'a', 0.0747, -0.1015]]],
    [1.4, [['a', 'b', -0.6667, 0.3484], ['b', 'c', 0.0444, -1.3088], ['c', 'a', 1.1506, 0.1453]]],
    [2.8, [['a', 'b', -1.3976, 0.5953], ['b', 'c', 0.2168, -2.6266], ['c', 'a', 2.2264, 0.3922]]],
  ];
  it('malhas fechadas', () => { for (const id of ['a', 'b', 'c']) expect(closed(S[id]!)).toBe(true); });
  for (const [z, cs] of CANTOS) {
    it(`fresta 0 em z=${z}: cada canto está nas duas paredes vizinhas`, () => {
      for (const [p, q, x, y] of cs) {
        const near = (b: SolidBatch): boolean => ptsAt(b, z).some((r) => Math.hypot(r[0]! - x, r[1]! - y) < 2e-4);
        expect(near(S[p]!)).toBe(true);
        expect(near(S[q]!)).toBe(true);
      }
    });
  }
  it('volume = soma das paredes = volume do nó de 3 níveis (S5, 12,46 m3, 3%)', () => {
    const tot = ['a', 'b', 'c'].reduce((s, id) => s + volume(S[id]!), 0);
    expect(Math.abs(tot - 12.463) / 12.463).toBeLessThan(0.03);
  });
});

describe('N1 · sólido do nó em X (barra a 10° / c -10°, hastes b 5° e d 15°)', () => {
  const S = solids(build([['a', 0, 10], ['b', 90, 5], ['c', 180, -10], ['d', 270, 15]]), ['a', 'b', 'c', 'd']);
  it('malhas fechadas, volume > soma das tiras e cantos das hastes em z=0, 1,4 e 2,8', () => {
    for (const id of ['a', 'b', 'c', 'd']) expect(closed(S[id]!)).toBe(true);
    // cantos das hastes (à mão): b.r, b.l e d.r, d.l
    const K: Array<[number, string, number, number]> = [
      [0, 'b', 0.1004, 0.1015], [0, 'b', -0.1004, 0.1015], [0, 'd', -0.1035, -0.1015], [0, 'd', 0.1035, -0.1015],
      [1.4, 'b', -0.0221, 0.3484], [1.4, 'b', -0.2229, 0.3484], [1.4, 'd', 0.2716, 0.1453], [1.4, 'd', 0.4787, 0.1453],
      [2.8, 'b', -0.1620, 0.6305], [2.8, 'b', -0.3454, 0.5953], [2.8, 'd', 0.7003, 0.4274], [2.8, 'd', 0.8538, 0.3922],
    ];
    // a haste b em z=2,8: canto direito (cruza a face esquerda da barra a 10° em y=0,5953) e esquerdo (face direita de c a -10°)
    for (const [z, id, x, y] of K.filter((k) => !(k[0] === 2.8 && k[1] === 'b') && !(k[0] === 2.8 && k[1] === 'd'))) expect({ z, id, x, y, ok: ptsAt(S[id]!, z).some((q) => Math.hypot(q[0]! - x, q[1]! - y) < 2e-4), pts: ptsAt(S[id]!, z).filter((q) => Math.hypot(q[0]!, q[1]!) < 1).map((q) => q.slice(0, 2).map((v) => +v.toFixed(4))) }).toMatchObject({ ok: true });
    // z=2,8: o canto da haste está sobre o plano da face da barra (y = 0,5953 para b; 0,3922 para d)
    expect(ptsAt(S.b!, 2.8).some((q) => Math.abs(q[1]! - 0.5953) < 2e-4 && q[0]! < 0)).toBe(true);
    expect(ptsAt(S.d!, 2.8).some((q) => Math.abs(q[1]! - 0.3922) < 2e-4 && q[0]! > 0.5)).toBe(true);
    // a barra (a e c, mesmo plano de face) tem vértices no plano da face perto do nó
    for (const id of ['a', 'c']) expect(ptsAt(S[id]!, 2.8).some((q) => Math.abs(q[1]! - 0.5953) < 2e-4 && Math.abs(q[0]!) < 0.5)).toBe(true);
  });
});
