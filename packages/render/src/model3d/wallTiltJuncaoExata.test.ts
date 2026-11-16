import { describe, expect, it } from 'vitest';
import { junctionLevel, resolveLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall } from '@hestia/model';
import { wallLayerSolid, type SolidBatch } from './solids.ts';

/** C1: junção em toda a altura (cenários P1/P3 do navegador: wt_conc15, L de 4 m, H=2,8). Pontos dos sólidos da camada de concreto. */
const D = Math.PI / 180;
function solids(tA: number, tB: number, cmp = 4, a1 = { x: 0, y: 0 }) {
  const s = new ProjectStore(createEmptyProject());
  const sg = (id: string, a: { x: number; y: number }, b: { x: number; y: number }, t: number) => s.exec({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_conc15', levelId: 'lv_0', a, b, joinStart: { kind: 'miter', flip: false }, joinEnd: { kind: 'miter', flip: false }, ...(t ? { tilt: t } : {}) }) });
  sg('A', a1, { x: cmp, y: 0 }, tA);
  sg('B', { x: cmp, y: 0 }, { x: cmp, y: cmp }, tB);
  const jl = junctionLevel(s.project, 'lv_0');
  const rl = resolveLevel(s.project, 'lv_0');
  const out: Record<string, SolidBatch> = {};
  for (const id of ['A', 'B']) { const rw = rl.walls[id]!; out[id] = wallLayerSolid(rw, rw.layers.find((l) => l.layerIndex === 2)!, jl); }
  return out;
}
const tri = (b: SolidBatch, i: number): number[][] => [0, 1, 2].map((j) => [0, 1, 2].map((c) => b.positions[b.indices[i + j]! * 3 + c]!));
/** Pontos da malha na cota z (vértices e cruzamentos de aresta com o plano). */
function ptsAt(b: SolidBatch, z: number): number[][] {
  const out: number[][] = [];
  const add = (q: number[]): void => { if (!out.some((o) => Math.hypot(o[0]! - q[0]!, o[1]! - q[1]!) < 1e-9)) out.push(q); };
  for (let i = 0; i < b.indices.length; i += 3) {
    const t = tri(b, i);
    for (let j = 0; j < 3; j++) {
      const p = t[j]!, q = t[(j + 1) % 3]!;
      if (Math.abs(p[2]! - z) < 1e-9) add(p);
      else if ((p[2]! - z) * (q[2]! - z) < 0) { const k = (z - p[2]!) / (q[2]! - p[2]!); add([p[0]! + k * (q[0]! - p[0]!), p[1]! + k * (q[1]! - p[1]!)]); }
    }
  }
  return out;
}

describe('C1 · cantos coincidentes em z=0, meio e topo (1e-6 m)', () => {
  const casos: Array<[number, number]> = [[15, 30], [-15, -30], [15, -30], [20, 0], [-20, 0], [0, 20], [0, -20], [0, 0]];
  for (const [tA, tB] of casos) {
    it(`L ${tA}°/${tB}°`, () => {
      const S = solids(tA, tB);
      for (const z of [0, 1.4, 2.8]) {
        const no = { x: 4 - z * Math.tan(tB * D), y: z * Math.tan(tA * D) };
        const near = (b: SolidBatch): number[][] => ptsAt(b, z).filter((q) => Math.hypot(q[0]! - no.x, q[1]! - no.y) < 0.5);
        const a = near(S.A!), b = near(S.B!);
        expect(a.length).toBeGreaterThanOrEqual(2);
        for (const q of a) expect(Math.min(...b.map((r) => Math.hypot(r[0]! - q[0]!, r[1]! - q[1]!)))).toBeLessThan(1e-6);
        for (const q of b) expect(Math.min(...a.map((r) => Math.hypot(r[0]! - q[0]!, r[1]! - q[1]!)))).toBeLessThan(1e-6);
      }
    });
  }
});

describe('C1 · plano B nunca passa da espessura da parede', () => {
  it('par inviável (curto, -45°/-45°, H=6): a ponta de A não ultrapassa a face externa de B em mais que a espessura', () => {
    const s = new ProjectStore(createEmptyProject());
    for (const [id, a, b] of [['A', { x: 2, y: 0 }, { x: 0, y: 0 }], ['B', { x: 0, y: 0 }, { x: 0, y: 2 }]] as const)
      s.exec({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_conc15', levelId: 'lv_0', height: 6, a, b, tilt: -45 }) });
    const jl = junctionLevel(s.project, 'lv_0');
    const rl = resolveLevel(s.project, 'lv_0');
    const esp = 0.184 / Math.cos(45 * D);
    for (const id of ['A', 'B']) {
      const rw = rl.walls[id]!;
      const b = wallLayerSolid(rw, rw.layers.find((l) => l.layerIndex === 2)!, jl);
      for (const z of [0.01, 3, 5.99]) for (const q of ptsAt(b, z)) {
        expect(Number.isFinite(q[0]! + q[1]!)).toBe(true);
        expect(Math.hypot(q[0]!, q[1]!)).toBeLessThan(2 + 6 + esp + 1); // sem salto fora do envelope inclinado da parede
      }
    }
  });
});
